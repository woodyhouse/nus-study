// Renders PDF pages without a text layer (scans, image slides) to PNG files the
// agent can look at. Local only: .local/pages/<documentId>/p<N>.png.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_SIDE=1600;

export async function renderPages(bytes:Uint8Array,pages:number[],dir:string):Promise<string[]>{
  if(!pages.length)return [];
  mkdirSync(dir,{recursive:true,mode:0o700});
  const task=getDocument({data:bytes.slice(),disableFontFace:true,useSystemFonts:false,verbosity:0});
  try{
    const pdf:any=await task.promise,out:string[]=[];
    for(const n of pages){
      const page=await pdf.getPage(n),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(2,MAX_SIDE/Math.max(base.width,base.height))});
      const {canvas,context}=pdf.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:context,viewport,canvas}).promise;
      const file=join(dir,`p${n}.png`);
      writeFileSync(file,canvas.toBuffer('image/png'),{mode:0o600});
      out.push(file);page.cleanup();
    }
    return out;
  }finally{await task.destroy();}
}
