// Courseware review: the agent writes Extraction v1 files; this module validates
// them against the extracted page text before anything reaches the pack.
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateExtraction,type StudyRecord} from './core/records.ts';
import type {Snapshot} from './core/domain.ts';

export type DocumentText={schemaVersion:1;hash:string;metadataVersion:string;pages:{page:number;text:string}[];ocrRequiredPages:number[];extractedAt:string};
const LOCAL=resolve(import.meta.dirname,'..','.local');
export const textPath=(id:string,dir=LOCAL)=>resolve(dir,'text',`${id}.json`);
export const reviewPath=(id:string,dir=LOCAL)=>resolve(dir,'review',`${id}.json`);
const readJson=(path:string)=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;

// Whitespace, width and case differences between PDF text layers are ignored.
export const normalize=(text:string)=>text.normalize('NFKC').replace(/[\s​]+/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').toLowerCase();

export function verifyQuotes(record:StudyRecord,doc:DocumentText):{ok:boolean;failed:string[]}{
  const failed=record.sources.filter(s=>{
    const page=doc.pages.find(p=>p.page===s.page);
    return !page||!s.quote.trim()||!normalize(page.text).includes(normalize(s.quote));
  }).map(s=>s.id);
  return {ok:!failed.length,failed};
}

// Validated, quote-checked records for one document. Throws on contract errors.
export function checkReview(input:unknown,doc:DocumentText&{id:string;course:string},courseId:number):{records:StudyRecord[];unverified:number}{
  let unverified=0;
  const records=validateExtraction(input,{id:doc.id,course:doc.course,hash:doc.hash,pageCount:doc.pages.length}).map(r=>{
    const {ok}=verifyQuotes(r,doc);
    if(!ok)unverified++;
    // Only a mechanical quote match earns source-backed; conflicts stay conflicts.
    const status=r.review.status==='conflict'?'conflict':ok?'source-backed':'needs-review';
    return {...r,courseId,review:{...r.review,status}} as StudyRecord;
  });
  return {records,unverified};
}

export type QueueItem={documentId:string;course:string;title:string;hash:string;pages:number;ocrRequiredPages:number[];textFile:string;resultFile:string;reason:'new'|'changed'};

export function reviewQueue(snapshot:Snapshot,dir=LOCAL):QueueItem[]{
  return (snapshot.documents||[]).filter(d=>d.kind==='pdf').flatMap(d=>{
    const text:DocumentText|null=readJson(textPath(d.id,dir));
    if(!text)return [];
    const result=readJson(reviewPath(d.id,dir));
    if(result?.hash===text.hash)return [];
    return [{documentId:d.id,course:d.course,title:d.title,hash:text.hash,pages:text.pages.length,ocrRequiredPages:text.ocrRequiredPages,
      textFile:textPath(d.id,dir),resultFile:reviewPath(d.id,dir),reason:result?'changed':'new'}];
  });
}

export function loadReviewed(snapshot:Snapshot,dir=LOCAL):{records:StudyRecord[];unverified:number;rejected:{documentId:string;error:string}[]}{
  const records:StudyRecord[]=[],rejected:{documentId:string;error:string}[]=[];let unverified=0;
  const folder=resolve(dir,'review');
  if(!existsSync(folder))return {records,unverified,rejected};
  const courseId=new Map(snapshot.courses.map(c=>[c.code,c.id]));
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.json'))){
    const id=file.slice(0,-5),doc=(snapshot.documents||[]).find(d=>d.id===id),text:DocumentText|null=readJson(textPath(id,dir));
    try{
      if(!doc||!text)throw new Error('No synced document with extracted text for this result.');
      const out=checkReview(readJson(resolve(folder,file)),{...text,id,course:doc.course},courseId.get(doc.course)??0);
      records.push(...out.records);unverified+=out.unverified;
    }catch(error:any){rejected.push({documentId:id,error:String(error?.message||error).slice(0,300)});}
  }
  return {records,unverified,rejected};
}
