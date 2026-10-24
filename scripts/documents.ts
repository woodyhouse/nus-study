// Downloads new or changed course PDFs (read-only), extracts per-page text and
// writes the review queue for the agent. Limits: 25 MB, 500 pages, 1M chars.
import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {extractText} from '../src/pdfText.ts';
import {downloadPdf} from '../src/core/download.ts';
import type {Snapshot} from '../src/core/domain.ts';
import {reviewQueue,textPath,type DocumentText} from '../src/review.ts';
// @ts-expect-error plain ESM helper without type declarations
import {environment,readToken,readJson,writeJsonAtomic,local} from '../lib/store.mjs';

const MAX_PER_RUN=Number(process.env.NUS_STUDY_MAX_DOCS||80);

{
  const snapshot:Snapshot|null=readJson(local('snapshot.json'));
  if(!snapshot)throw new Error('Run npm run sync first.');
  const token:string=readToken(environment());
  const todo=(snapshot.documents||[]).filter(d=>d.kind==='pdf'&&d.status!=='locked').filter(d=>(readJson(textPath(d.id)) as DocumentText|null)?.metadataVersion!==d.metadataVersion);
  let extracted=0,unchanged=0;const failed:{documentId:string;error:string}[]=[];
  mkdirSync(local('files'),{recursive:true,mode:0o700});
  for(const doc of todo.slice(0,MAX_PER_RUN)){
    try{
      const bytes=await downloadPdf(doc,token);
      const hash=createHash('sha256').update(bytes).digest('hex'),prior:DocumentText|null=readJson(textPath(doc.id));
      writeFileSync(local('files',`${doc.id}.pdf`),bytes,{mode:0o600});
      if(prior?.hash===hash){writeJsonAtomic(textPath(doc.id),{...prior,metadataVersion:doc.metadataVersion});unchanged++;continue;}
      const {pages,ocrRequiredPages}=await extractText(bytes);
      writeJsonAtomic(textPath(doc.id),{schemaVersion:1,hash,metadataVersion:doc.metadataVersion,pages,ocrRequiredPages,extractedAt:new Date().toISOString()});
      extracted++;
    }catch(error:any){failed.push({documentId:doc.id,error:String(error?.message||error).slice(0,200)});}
  }
  const queue=reviewQueue(snapshot);
  writeJsonAtomic(local('review-queue.json'),{createdAt:new Date().toISOString(),items:queue});
  console.log(JSON.stringify({candidates:todo.length,extracted,unchanged,failed,deferred:Math.max(0,todo.length-MAX_PER_RUN),reviewQueue:queue.length}));
}
