// Per-page text from PDF bytes with pdf.js (v6 never evals; no font loading).
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PAGES=500,MAX_CHARS=1_000_000;

export async function extractText(bytes:Uint8Array):Promise<{pages:{page:number;text:string}[];ocrRequiredPages:number[]}>{
  const task=getDocument({data:bytes,disableFontFace:true,useSystemFonts:false,verbosity:0});
  try{
    const pdf=await task.promise;
    if(pdf.numPages>MAX_PAGES)throw new Error(`More than ${MAX_PAGES} pages.`);
    const pages:{page:number;text:string}[]=[],ocrRequiredPages:number[]=[];let total=0;
    for(let n=1;n<=pdf.numPages;n++){
      const content=await (await pdf.getPage(n)).getTextContent();
      const text=content.items.map((i:any)=>(i.str??'')+(i.hasEOL?'\n':' ')).join('').replace(/[ \t]+\n/g,'\n').trim();
      total+=text.length;
      if(total>MAX_CHARS)throw new Error('More than 1M characters of text.');
      // Near-empty pages are usually scans; the agent may need to view them.
      if(text.replace(/\s/g,'').length<30)ocrRequiredPages.push(n);
      pages.push({page:n,text});
    }
    return {pages,ocrRequiredPages};
  }finally{await task.destroy();}
}
