// Vendored from nus-canvas-mobile/src/pack/snapshot.ts by scripts/vendor-core.mjs. Do not edit here.
import {combine,type Snapshot} from './domain.ts';
import {applyReviewed,type ReviewedPack} from './reviewed.ts';
import {courseColor} from './due.ts';

// Web/PWA path: the phone never calls Canvas (no CORS, no token). The sealed
// pack is the whole source, rendered through the same record contract and
// merged with the prior snapshot so personal marks and change history survive.
export function snapshotFromPack(pack:ReviewedPack,prior:Snapshot|null):Snapshot{
  const compatible=prior&&!prior.demo&&prior.accountKey===pack.accountKey?prior:null;
  const base:Snapshot={demo:false,updatedAt:pack.updatedAt,accountKey:pack.accountKey,unavailable:[],events:[],
    courses:pack.courses.map(c=>({...c,color:courseColor(c.code)}))};
  const reviewed=applyReviewed(base,pack),submitted=new Set(pack.submitted);
  reviewed.events=reviewed.events.map(e=>submitted.has(e.id)?{...e,submitted:true}:e);
  return {...combine(compatible,reviewed),reviewStatus:'已导入加密数据包'};
}
