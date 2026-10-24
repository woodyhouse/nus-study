// Courseware review: the agent writes Extraction v1 files; this module validates
// them against the extracted text before anything reaches the pack.
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonicalUrl,validateExtraction,type StudyRecord} from './core/records.ts';
import type {Snapshot} from './core/domain.ts';
import {isOffice} from './office.ts';
import {textSources} from './textSources.ts';

export type Format='pdf'|'pptx'|'docx'|'text';
export type DocumentText={schemaVersion:1;hash:string;metadataVersion:string;pages:{page:number;text:string}[];ocrRequiredPages:number[];extractedAt:string;format?:Format;pageImages?:string[];imagesAt?:string};
const LOCAL=resolve(import.meta.dirname,'..','.local');
export const textPath=(id:string,dir=LOCAL)=>resolve(dir,'text',`${id}.json`);
export const reviewPath=(id:string,dir=LOCAL)=>resolve(dir,'review',`${id}.json`);
const readJson=(path:string)=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;

// Everything the agent reviews: course files (PDF, Word, PowerPoint) and Canvas
// text (announcements, descriptions, syllabus, pages). `sourceKind` is what the
// agent writes in each source's `kind`.
export type Reviewable={id:string;course:string;title:string;url:string;sourceKind:'pdf'|'announcement'|'canvas-api';file:boolean};
export function reviewables(snapshot:Snapshot):Reviewable[]{
  const files=(snapshot.documents||[]).filter(d=>d.status!=='locked'&&(d.kind==='pdf'||(d.kind==='file'&&isOffice(d.title))))
    .map(d=>({id:d.id,course:d.course,title:d.title,url:canonicalUrl(d.url),sourceKind:d.kind==='pdf'?'pdf' as const:'canvas-api' as const,file:true}));
  return [...files,...textSources(snapshot).map(t=>({id:t.id,course:t.course,title:t.title,url:canonicalUrl(t.url),sourceKind:t.kind,file:false}))];
}

// Whitespace, width and case differences between text layers are ignored.
export const normalize=(text:string)=>text.normalize('NFKC').replace(/[\s​]+/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').toLowerCase();

export function verifyQuotes(record:StudyRecord,doc:DocumentText):{ok:boolean;failed:string[]}{
  const failed=record.sources.filter(s=>{
    // A one-page Canvas text may be cited without a page number.
    const page=doc.pages.find(p=>p.page===(s.page??(doc.pages.length===1?1:-1)));
    return !page||!s.quote.trim()||!normalize(page.text).includes(normalize(s.quote));
  }).map(s=>s.id);
  return {ok:!failed.length,failed};
}

// Validated, quote-checked records for one document. Throws on contract errors.
export function checkReview(input:unknown,doc:DocumentText&{id:string;course:string},courseId:number):{records:StudyRecord[];unverified:number}{
  let unverified=0;
  const text=!!doc.format&&doc.format!=='pdf';
  const records=validateExtraction(input,{id:doc.id,course:doc.course,hash:doc.hash,pageCount:doc.pages.length,text}).map(r=>{
    const {ok}=verifyQuotes(r,doc);
    if(!ok)unverified++;
    // Only a mechanical quote match earns source-backed; conflicts stay conflicts.
    const status=r.review.status==='conflict'?'conflict':ok?'source-backed':'needs-review';
    // Evidence IDs are per file ("p12"); prefix them so records can be merged across files.
    const id=(s:string)=>`${doc.id}#${s}`;
    return {...r,courseId,sources:r.sources.map(s=>({...s,id:id(s.id)})),
      review:{...r.review,status,fieldEvidence:Object.fromEntries(Object.entries(r.review.fieldEvidence).map(([k,v])=>[k,v.map(id)]))}} as StudyRecord;
  });
  return {records,unverified};
}

export type QueueItem={documentId:string;course:string;title:string;format:Format;sourceKind:Reviewable['sourceKind'];url:string;hash:string;pages:number;
  ocrRequiredPages:number[];pageImages:string[];textFile:string;resultFile:string;reason:'new'|'changed'|'page-images'};

export function reviewQueue(snapshot:Snapshot,dir=LOCAL):QueueItem[]{
  return reviewables(snapshot).flatMap(d=>{
    const text:DocumentText|null=readJson(textPath(d.id,dir));
    if(!text)return [];
    const result=readJson(reviewPath(d.id,dir));
    // Page images added after the review (older runs) ask for a look at those pages.
    const images=!!result&&result.hash===text.hash&&!!text.pageImages?.length&&!!text.imagesAt&&statSync(reviewPath(d.id,dir)).mtimeMs<Date.parse(text.imagesAt);
    if(result?.hash===text.hash&&!images)return [];
    return [{documentId:d.id,course:d.course,title:d.title,format:text.format||'pdf',sourceKind:d.sourceKind,url:d.url,hash:text.hash,pages:text.pages.length,
      ocrRequiredPages:text.ocrRequiredPages,pageImages:text.pageImages||[],textFile:textPath(d.id,dir),resultFile:reviewPath(d.id,dir),reason:images?'page-images' as const:result?'changed' as const:'new' as const}];
  });
}

// Results for sources that no longer exist in Canvas are skipped and listed as stale.
export function loadReviewed(snapshot:Snapshot,dir=LOCAL):{records:StudyRecord[];unverified:number;rejected:{documentId:string;error:string}[];stale:string[]}{
  const records:StudyRecord[]=[],rejected:{documentId:string;error:string}[]=[],stale:string[]=[];let unverified=0;
  const folder=resolve(dir,'review');
  if(!existsSync(folder))return {records,unverified,rejected,stale};
  const courseId=new Map(snapshot.courses.map(c=>[c.code,c.id])),known=new Map(reviewables(snapshot).map(r=>[r.id,r]));
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.json'))){
    const id=file.slice(0,-5),doc=known.get(id),text:DocumentText|null=readJson(textPath(id,dir));
    if(!doc){stale.push(id);continue;}
    try{
      if(!text)throw new Error('No extracted text for this result; run npm run documents.');
      const out=checkReview(readJson(resolve(folder,file)),{...text,id,course:doc.course},courseId.get(doc.course)??0);
      records.push(...out.records);unverified+=out.unverified;
    }catch(error:any){rejected.push({documentId:id,error:String(error?.message||error).slice(0,300)});}
  }
  return {records,unverified,rejected,stale};
}
