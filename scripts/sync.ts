// Read-only Canvas sync (GET only) using the same core as the phone app.
// Writes .local/snapshot.json; prints counts only, never course content.
import {createHash} from 'node:crypto';
import {synchronize,verifyToken} from '../src/core/canvas.ts';
import {combine,type Snapshot} from '../src/core/domain.ts';
// @ts-expect-error plain ESM helper without type declarations
import {environment,readToken,readJson,writeJsonAtomic,local} from '../lib/store.mjs';

try{
  const token:string=readToken(environment());
  const accountKey=createHash('sha256').update('canvas:nus:'+await verifyToken(token)).digest('hex');
  const prior:Snapshot|null=readJson(local('snapshot.json'));
  const compatible=prior&&prior.accountKey===accountKey?prior:null;
  const fresh:Snapshot={...await synchronize(token,message=>console.log(message)),accountKey};
  // Missing API rows stay as history; extracted document text survives unchanged files.
  const next=combine(compatible,fresh);
  writeJsonAtomic(local('snapshot.json'),next);
  const summary={status:'ok',checkedAt:next.updatedAt,courses:next.courses.map(c=>c.code),events:next.events.length,
    documents:next.documents?.length??0,pdfs:next.documents?.filter(d=>d.kind==='pdf'&&d.status!=='locked').length??0,
    unavailable:next.unavailable,newChanges:(next.changes?.length??0)-(compatible?.changes?.length??0)};
  writeJsonAtomic(local('last-sync.json'),summary);
  console.log(JSON.stringify(summary));
}catch(error:any){
  writeJsonAtomic(local('last-sync.json'),{status:'failed',checkedAt:new Date().toISOString(),httpStatus:error?.status??null});
  console.error('Canvas sync failed; the previous snapshot was kept.'+(error?.status?` HTTP ${error.status}.`:'')+' No token was printed.');
  process.exitCode=1;
}
