// Vendored from nus-canvas-mobile/src/reviewed.ts by scripts/vendor-core.mjs. Do not edit here.
import {z} from 'zod';
import type {Snapshot,Event} from './domain.ts';
import {RecordSchema,eventFromRecord,recordOf,type StudyRecord} from './records.ts';
import {courseColor} from './due.ts';
import {AssessmentPlanSchema} from './grades.ts';

export const ReviewedPackSchema=z.strictObject({schemaVersion:z.literal(1),accountKey:z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt:z.iso.datetime({offset:true}),sources:z.array(z.string()).max(200),
  courses:z.array(z.strictObject({id:z.number().int().positive(),code:z.string(),name:z.string()})).max(100),
  meetings:z.array(z.strictObject({course:z.string(),weekday:z.number().int().min(1).max(7),start:z.string(),end:z.string(),venue:z.string(),weeks:z.string()})).max(100).default([]),
  assessmentPlans:z.array(AssessmentPlanSchema).max(100).default([]),records:z.array(RecordSchema).max(2000),
  // IDs Canvas reports as submitted; lets packs carry submission state without a live API.
  submitted:z.array(z.string().max(200)).max(2000).default([])});
export type ReviewedPack=z.infer<typeof ReviewedPackSchema>;
function canonicalTitle(e:Pick<Event,'title'|'type'>){return e.title.toLowerCase().replace(/\s|截止|日期|[-_]/g,'').replace('midtermtest','midterm');}
function sameAssessment(a:Event,b:Event){return a.course===b.course&&canonicalTitle(a)===canonicalTitle(b)&&['assignment','quiz','exam','midterm'].includes(a.type)&&['assignment','quiz','exam','midterm'].includes(b.type);}
function mergeRecord(api:Event,reviewed:StudyRecord):Event{
  const r=recordOf(api),gradeOnly=/entering marks|for entering|记录成绩|录入成绩/i.test(api.detail);
  // A gradebook placeholder's due_at is not the in-class exam time.
  const authoritativeDeadline=!gradeOnly&&/^assignment-/.test(api.id)&&api.type==='assignment';
  const requirements={...reviewed.requirements};
  if(authoritativeDeadline){requirements.submission=r.requirements.submission??requirements.submission;if(r.requirements.mode!=='unknown')requirements.mode=r.requirements.mode;}
  const record:StudyRecord={...reviewed,id:api.id,type:gradeOnly?reviewed.type:api.type,
    timing:authoritativeDeadline?r.timing:reviewed.timing,requirements,
    blocks:[...reviewed.blocks,...r.blocks.map(b=>({...b,title:'Canvas 当前说明'}))],
    sources:[...reviewed.sources,...r.sources],review:{...reviewed.review,fieldEvidence:{...reviewed.review.fieldEvidence,...(authoritativeDeadline?{timing:r.review.fieldEvidence.timing}:{} )}}};
  if(authoritativeDeadline&&r.timing.date){record.review.status='source-backed';record.review.conflicts=record.review.conflicts.filter(c=>c.field!=='timing');}
  return eventFromRecord(record,api);
}
export function applyReviewed(snapshot:Snapshot,input:unknown):Snapshot{
  const pack=ReviewedPackSchema.parse(input);
  if(snapshot.demo||!snapshot.accountKey||snapshot.accountKey!==pack.accountKey)throw new Error('核实资料与当前 Canvas 账号不匹配。');
  const enrolled=new Map(snapshot.courses.map(c=>[c.code,c.id]));
  const compatible=pack.records.filter(r=>r.course==='NUS'||enrolled.get(r.course)===r.courseId);
  const events=new Map(snapshot.events.map(e=>[e.id,e]));
  for(const record of compatible){
    const curated=eventFromRecord(record),prior=events.get(curated.id)||[...events.values()].find(e=>sameAssessment(e,curated));
    // A previously imported row is not a new live API authority.
    if(prior&&/^assignment-/.test(prior.id)) events.set(prior.id,mergeRecord(prior,record));
    else if(prior){events.set(prior.id,eventFromRecord({...record,id:prior.id},prior));}
    else events.set(curated.id,curated);
  }
  return {...snapshot,events:[...events.values()],courses:snapshot.courses.map(c=>({...c,color:courseColor(c.code)})),reviewed:pack};
}
export function withCachedReview(base:Snapshot,next:Snapshot){
  if(base.accountKey&&next.accountKey&&base.accountKey!==next.accountKey)return next;
  return base.reviewed&&base.accountKey===next.accountKey?applyReviewed(next,base.reviewed):next;
}
