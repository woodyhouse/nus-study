// Text from Word (.docx) and PowerPoint (.pptx) files: a minimal ZIP reader plus
// the OOXML text runs. No macros, no external tools, bounded output.
import {inflateRawSync} from 'node:zlib';

const MAX_ENTRY=40*1024*1024,MAX_CHARS=3_000_000;

function entries(zip:Uint8Array):Map<string,()=>Buffer>{
  const view=Buffer.from(zip.buffer,zip.byteOffset,zip.byteLength),out=new Map<string,()=>Buffer>();
  let end=-1;
  for(let i=view.length-22;i>=Math.max(0,view.length-65557);i--)if(view.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Not a ZIP-based Office file.');
  let at=view.readUInt32LE(end+16);
  for(let n=view.readUInt16LE(end+10);n>0;n--){
    if(view.readUInt32LE(at)!==0x02014b50)throw new Error('Damaged Office file.');
    const method=view.readUInt16LE(at+10),size=view.readUInt32LE(at+20),length=view.readUInt32LE(at+24);
    const nameLength=view.readUInt16LE(at+28),skip=nameLength+view.readUInt16LE(at+30)+view.readUInt16LE(at+32),local=view.readUInt32LE(at+42);
    const name=view.toString('utf8',at+46,at+46+nameLength);
    out.set(name,()=>{
      if(length>MAX_ENTRY)throw new Error('Office file part is too large.');
      const start=local+30+view.readUInt16LE(local+26)+view.readUInt16LE(local+28),data=view.subarray(start,start+size);
      if(method===0)return Buffer.from(data);
      if(method===8)return inflateRawSync(data,{maxOutputLength:MAX_ENTRY});
      throw new Error('Unsupported compression in Office file.');
    });
    at+=46+skip;
  }
  return out;
}

const decode=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[e.toLowerCase()]);
// Paragraphs become lines; runs inside a paragraph are joined as written.
function paragraphs(xml:string,p:string,t:string){
  return [...xml.matchAll(new RegExp(`<${p}[\\s>][\\s\\S]*?</${p}>`,'g'))].map(m=>
    [...m[0].matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>|<(?:w:tab|a:tab)\\b[^>]*/>|<(?:w:br|a:br)\\b[^>]*/>`,'g'))]
      .map(r=>r[1]!==undefined?decode(r[1]):r[0].includes('tab')?'\t':'\n').join('')).filter(l=>l.trim()||l.includes('\f')).join('\n');
}

export function officeText(bytes:Uint8Array,title:string):{format:'pptx'|'docx';pages:{page:number;text:string}[]}{
  const zip=entries(bytes);let total=0;
  const bounded=(text:string)=>{total+=text.length;if(total>MAX_CHARS)throw new Error('More than 3M characters of text.');return text;};
  if(/\.pptx$/i.test(title)){
    const slides=[...zip.keys()].map(k=>k.match(/^ppt\/slides\/slide(\d+)\.xml$/)).filter(m=>!!m).map(m=>Number(m![1])).sort((a,b)=>a-b);
    if(!slides.length)throw new Error('No slides found.');
    // Page = slide position in the file, which is how students refer to it.
    return {format:'pptx',pages:slides.map((n,i)=>({page:i+1,text:bounded(paragraphs(zip.get(`ppt/slides/slide${n}.xml`)!().toString('utf8'),'a:p','a:t'))}))};
  }
  if(/\.docx$/i.test(title)){
    const doc=zip.get('word/document.xml');
    if(!doc)throw new Error('No document body found.');
    // Explicit page breaks split pages; otherwise the whole file is page 1.
    const xml=doc().toString('utf8').replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/g,'<w:t>\f</w:t>');
    return {format:'docx',pages:bounded(paragraphs(xml,'w:p','w:t')).split('\f').map((text,i)=>({page:i+1,text:text.trim()}))};
  }
  throw new Error('Only .docx and .pptx are read.');
}
export const isOffice=(title:string)=>/\.(docx|pptx)$/i.test(title);
