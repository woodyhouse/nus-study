// One assessment is often described in several places (slides, a Word brief, an
// announcement). The agent reviews each source alone; this merges records for the
// same course + title. Agreeing timings merge their evidence; different timings
// become a conflict that shows every reading. Nothing is picked by guesswork.
import type {StudyRecord} from './core/records.ts';

const ASSESSMENT=new Set(['assignment','quiz','exam','midterm']);
// Same normalisation the app uses to match reviewed facts to Canvas items.
const key=(r:StudyRecord)=>r.course+'\u0000'+r.title.toLowerCase().replace(/\s|截止|日期|[-_]/g,'').replace('midtermtest','midterm');
const when=(r:StudyRecord)=>r.timing.date?`${r.timing.date}${r.timing.time?' '+r.timing.time:''}`:'';
const rank={'source-backed':0,'needs-review':1,conflict:2};

export function consolidate(records:StudyRecord[]):StudyRecord[]{
  const groups=new Map<string,StudyRecord[]>(),out:StudyRecord[]=[];
  for(const r of records){
    if(!ASSESSMENT.has(r.type)){out.push(r);continue;}
    const k=key(r);groups.set(k,[...(groups.get(k)||[]),r]);
  }
  for(const group of groups.values()){
    if(group.length===1){out.push(group[0]);continue;}
    // Base: dated, best-verified record first.
    const [base,...rest]=[...group].sort((a,b)=>Number(!a.timing.date)-Number(!b.timing.date)||rank[a.review.status]-rank[b.review.status]);
    const readings=new Map<string,string[]>();
    for(const r of group)if(when(r))readings.set(when(r),[...(readings.get(when(r))||[]),r.sources[0]?.title||r.id]);
    const requirements={...base.requirements,rules:[...new Set(group.flatMap(r=>r.requirements.rules))]};
    for(const r of rest){
      if(requirements.mode==='unknown')requirements.mode=r.requirements.mode;
      requirements.submission??=r.requirements.submission;requirements.venue??=r.requirements.venue;requirements.weightPercent??=r.requirements.weightPercent;
    }
    const fieldEvidence:Record<string,string[]>={};
    for(const r of group)for(const [f,ids] of Object.entries(r.review.fieldEvidence))fieldEvidence[f]=[...new Set([...(fieldEvidence[f]||[]),...ids])];
    const conflicts=group.flatMap(r=>r.review.conflicts);
    if(readings.size>1)conflicts.push({field:'timing',values:[...readings].map(([t,from])=>`${t}（${[...new Set(from)].join('、')}）`)});
    out.push({...base,summary:base.summary||rest.find(r=>r.summary)?.summary||'',requirements,
      blocks:group.flatMap(r=>r.blocks),sources:group.flatMap(r=>r.sources),
      review:{status:readings.size>1||group.some(r=>r.review.status==='conflict')?'conflict':base.review.status,fieldEvidence,conflicts}});
  }
  return out;
}
