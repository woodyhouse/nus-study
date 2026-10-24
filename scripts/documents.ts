// Prepares everything the agent reviews, read-only:
// - course files: new or changed PDFs, Word and PowerPoint files are downloaded and
//   their text extracted per page; PDF pages without a text layer are rendered to
//   PNG so the agent can look at them;
// - Canvas text: announcements, descriptions, syllabus and module pages (no download).
// Limits: 100 MB per file, 1000 pages, 3M characters. Writes .local/review-queue.json.
import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {extractText} from '../src/pdfText.ts';
import {officeText,isOffice} from '../src/office.ts';
import {renderPages} from '../src/pageImages.ts';
import {textSources,textHash} from '../src/textSources.ts';
import {downloadFile} from '../src/core/download.ts';
import type {Snapshot} from '../src/core/domain.ts';
import {reviewQueue,textPath,type DocumentText} from '../src/review.ts';
// @ts-expect-error plain ESM helper without type declarations
import {environment,readToken,readJson,writeJsonAtomic,local} from '../lib/store.mjs';

const MAX_PER_RUN=Number(process.env.NUS_STUDY_MAX_DOCS||80),MAX_IMAGES_PER_RUN=Number(process.env.NUS_STUDY_MAX_PAGE_IMAGES||400);

{
  const snapshot:Snapshot|null=readJson(local('snapshot.json'));
  if(!snapshot)throw new Error('Run npm run sync first.');
  const now=new Date().toISOString();

  // Canvas text: one page per source; unchanged text keeps its review.
  let texts=0;
  for(const t of textSources(snapshot)){
    const hash=textHash(t.text);
    if((readJson(textPath(t.id)) as DocumentText|null)?.hash===hash)continue;
    writeJsonAtomic(textPath(t.id),{schemaVersion:1,format:'text',hash,metadataVersion:hash,pages:[{page:1,text:t.text}],ocrRequiredPages:[],extractedAt:now});
    texts++;
  }

  const files=(snapshot.documents||[]).filter(d=>d.status!=='locked'&&(d.kind==='pdf'||(d.kind==='file'&&isOffice(d.title))));
  const todo=files.filter(d=>(readJson(textPath(d.id)) as DocumentText|null)?.metadataVersion!==d.metadataVersion);
  const token:string|null=todo.length?readToken(environment()):null;
  let extracted=0,unchanged=0,pageImages=0,imagesDeferred=0;const failed:{documentId:string;title:string;error:string}[]=[];
  mkdirSync(local('files'),{recursive:true,mode:0o700});
  for(const doc of todo.slice(0,MAX_PER_RUN)){
    try{
      const bytes=await downloadFile(doc,token!,fetch,100*1024*1024);
      const hash=createHash('sha256').update(bytes).digest('hex'),prior:DocumentText|null=readJson(textPath(doc.id));
      const pdf=doc.kind==='pdf';
      if(pdf&&!String.fromCharCode(...bytes.subarray(0,1024)).includes('%PDF-'))throw new Error('Downloaded content is not a PDF.');
      writeFileSync(local('files',`${doc.id}.${pdf?'pdf':doc.title.split('.').pop()!.toLowerCase()}`),bytes,{mode:0o600});
      if(prior?.hash===hash){writeJsonAtomic(textPath(doc.id),{...prior,metadataVersion:doc.metadataVersion});unchanged++;continue;}
      let result:Pick<DocumentText,'pages'|'ocrRequiredPages'|'format'|'pageImages'|'imagesAt'>;
      if(pdf){
        const {pages,ocrRequiredPages}=await extractText(bytes.slice());
        const budget=Math.max(0,MAX_IMAGES_PER_RUN-pageImages),shown=ocrRequiredPages.slice(0,budget);
        rmSync(local('pages',doc.id),{recursive:true,force:true});
        const images=await renderPages(bytes,shown,local('pages',doc.id)).catch(()=>[] as string[]);
        pageImages+=images.length;imagesDeferred+=ocrRequiredPages.length-images.length;
        result={format:'pdf',pages,ocrRequiredPages,pageImages:images,imagesAt:now};
      }else result={...officeText(bytes,doc.title),ocrRequiredPages:[]};
      writeJsonAtomic(textPath(doc.id),{schemaVersion:1,hash,metadataVersion:doc.metadataVersion,...result,extractedAt:now});
      extracted++;
    }catch(error:any){failed.push({documentId:doc.id,title:doc.title,error:String(error?.message||error).slice(0,200)});}
  }
  // PDFs extracted before page images existed: render their scanned pages now.
  // The queue then asks for a second look at those pages only.
  for(const doc of files.filter(d=>d.kind==='pdf'&&!todo.includes(d))){
    const text:DocumentText|null=readJson(textPath(doc.id)),file=local('files',`${doc.id}.pdf`);
    if(!text||text.pageImages?.length||!text.ocrRequiredPages.length||!existsSync(file))continue;
    const shown=text.ocrRequiredPages.slice(0,Math.max(0,MAX_IMAGES_PER_RUN-pageImages));
    if(!shown.length){imagesDeferred+=text.ocrRequiredPages.length;continue;}
    const images=await renderPages(new Uint8Array(readFileSync(file)),shown,local('pages',doc.id)).catch(()=>[] as string[]);
    if(!images.length)continue;
    pageImages+=images.length;imagesDeferred+=text.ocrRequiredPages.length-images.length;
    writeJsonAtomic(textPath(doc.id),{...text,pageImages:images,imagesAt:now});
  }
  const queue=reviewQueue(snapshot);
  writeJsonAtomic(local('review-queue.json'),{createdAt:now,items:queue});
  const count=(f:string)=>queue.filter(q=>q.format===f).length;
  console.log(JSON.stringify({files:{candidates:todo.length,extracted,unchanged,failed,deferred:Math.max(0,todo.length-MAX_PER_RUN)},
    canvasTextUpdated:texts,pageImages,pageImagesDeferred:imagesDeferred,
    reviewQueue:{total:queue.length,pdf:count('pdf'),slides:count('pptx'),word:count('docx'),canvasText:count('text')}}));
}
