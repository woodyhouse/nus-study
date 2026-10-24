// Vendored from nus-canvas-mobile/src/sourcePdfs.ts by scripts/vendor-core.mjs. Do not edit here.
import type {Event,Snapshot,SourceDocument} from './domain.ts';
import {recordOf} from './records.ts';
export type SourcePdf={documentId:string;title:string;page:number|null;hash:string|null;locked:boolean};
export type SelectedPdf=SourcePdf&{accountKey:string|null};
const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[\s_\-–—]/g,'');
export function canvasSourceUrl(value:string){if(!value.trim())return '';try{const url=new URL(value,'https://canvas.nus.edu.sg');return url.origin==='https://canvas.nus.edu.sg'&&!url.username&&!url.password?url.origin+url.pathname:'';}catch{return '';}}
export function sourceFileId(value:string){return canvasSourceUrl(value).match(/\/(?:courses\/\d+\/)?files\/(\d+)(?:\/download)?$/)?.[1]||null;}
export function attachSourceFileLinks(event:Event,html:unknown):Event{
  if(typeof html!=='string')return event;
  const record=recordOf(event),seen=new Set(record.sources.map(s=>s.documentId));
  for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const url=canvasSourceUrl(match[1].replace(/&amp;/g,'&')),id=sourceFileId(url);if(!id||seen.has('file-'+id))continue;
    const title=match[2].replace(/<[^>]+>/g,'').trim()||'Canvas 附件';seen.add('file-'+id);
    record.sources.push({id:'attachment-'+id,kind:/\.pdf\b/i.test(title)?'pdf':'canvas-api',title,url,documentId:'file-'+id,page:null,quote:'',hash:null});
  }
  return {...event,record};
}
export function resolveSourcePdfs(event:Event,documents:SourceDocument[]):SourcePdf[]{
  const record=recordOf(event),files=documents.filter(d=>d.course===event.course&&d.kind==='pdf'),found=new Map<string,SourcePdf>();
  const put=(doc:SourceDocument,page:number|null=null,hash:string|null=null)=>{const previous=found.get(doc.id);found.set(doc.id,{documentId:doc.id,title:doc.title,page:previous?.page??page,hash:previous?.hash??hash,locked:doc.status==='locked'});};
  for(const source of record.sources){const id=source.documentId||(sourceFileId(source.url)?'file-'+sourceFileId(source.url):null),doc=files.find(d=>d.id===id);if(doc)put(doc,source.page,source.hash);}
  const direct=files.find(d=>d.id===event.id);if(direct)put(direct);
  // Match full source filenames, never infer a PDF from an assessment title.
  const note=normalize(record.sources.map(s=>s.title+' '+s.quote).join('\n')+'\n'+event.detail);
  for(const doc of files){const name=normalize(doc.title),index=note.indexOf(name);if(!/\.pdf$/i.test(doc.title)||index<0||files.filter(d=>normalize(d.title)===name).length!==1)continue;
    let page:RegExpMatchArray|null=null,cursor=index;while(cursor>=0&&!page){page=note.slice(cursor+name.length).match(/^[，,、：:()（）]*(?:第(\d+)页|p\.?(\d+)|page(\d+))/i);cursor=note.indexOf(name,cursor+name.length);}
    put(doc,page?Number(page[1]||page[2]||page[3]):null);
  }
  return [...found.values()];
}
export function sourcePdfDocument(selected:SelectedPdf,snapshot:Snapshot){
  if(selected.accountKey!==(snapshot.accountKey||null))throw new Error('账号已变化，请重新选择文件。');
  const doc=snapshot.documents?.find(d=>d.id===selected.documentId&&d.kind==='pdf');
  if(!doc||doc.status==='locked')throw new Error('此文件已不可访问，请重新同步来源。');
  return doc;
}
