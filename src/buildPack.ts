// Snapshot (Canvas) + timetable (NUSMods) + reviewed courseware records -> a
// ReviewedPack the web app renders. Pure: no file or network access.
import {ReviewedPackSchema,applyReviewed,type ReviewedPack} from './core/reviewed.ts';
import {recordOf,type StudyRecord} from './core/records.ts';
import type {Snapshot} from './core/domain.ts';
import type {Meeting} from './core/timetable.ts';
import type {Exam} from './nusmods.ts';

export type Timetable={meetings:Meeting[];exams:Exam[]};

function sgtOffset(iso:string){
  const d=new Date(Date.parse(iso)+8*3600000);
  return d.toISOString().slice(0,19)+'+08:00';
}
export function examRecord(exam:Exam,courseId:number|null):StudyRecord{
  const id=`nusmods-exam-${exam.course}`,source='nusmods-'+exam.course;
  const endAt=exam.time&&exam.durationMinutes?sgtOffset(new Date(Date.parse(`${exam.date}T${exam.time}:00+08:00`)+exam.durationMinutes*60000).toISOString()):null;
  return {schemaVersion:1,id,courseId,course:exam.course,type:'exam',title:exam.title,summary:'',
    timing:{date:exam.date,time:exam.time,endAt,role:'start',precision:exam.time?'minute':'day',timezone:'Asia/Singapore'},
    requirements:{mode:'individual',submission:null,venue:null,weightPercent:null,rules:[]},
    blocks:[{kind:'text',title:'NUSMods 考试安排',text:`NUSMods 公布的期末考试：${exam.date} ${exam.time||'时间待定'} SGT${exam.durationMinutes?`，时长 ${exam.durationMinutes} 分钟`:''}。考场以 NUS 官方通知为准。`}],
    sources:[{id:source,kind:'manual',title:'NUSMods 考试安排（来自 NUS 公开课程数据）',url:'',documentId:null,page:null,quote:'',hash:null}],
    review:{status:'source-backed',fieldEvidence:{title:[source],timing:[source]},conflicts:[]}};
}

export function buildPack({snapshot,timetable=null,reviewed=[]}:{snapshot:Snapshot;timetable?:Timetable|null;reviewed?:StudyRecord[]}):ReviewedPack{
  if(snapshot.demo||!snapshot.accountKey)throw new Error('Sync Canvas first (no account-bound snapshot).');
  const courseId=new Map(snapshot.courses.map(c=>[c.code,c.id]));
  // Reuse the phone's reconciliation: reviewed facts merge into the matching
  // Canvas item (a real assignment keeps Canvas's deadline) instead of duplicating it.
  const merged=reviewed.length?applyReviewed(snapshot,{schemaVersion:1,accountKey:snapshot.accountKey,updatedAt:sgtOffset(snapshot.updatedAt),sources:[],
    courses:snapshot.courses.map(({id,code,name})=>({id,code,name})),records:reviewed}):snapshot;
  const records=new Map<string,StudyRecord>();
  for(const e of merged.events)records.set(e.id,recordOf(e,courseId.get(e.course)??null));
  // The official exam slot fills in only when nothing else describes the final.
  for(const exam of timetable?.exams??[]){
    if(!courseId.has(exam.course))continue;
    const known=[...records.values()].some(r=>r.course===exam.course&&r.type==='exam'&&/final|期末/i.test(r.title)&&!!r.timing.date);
    if(!known)records.set(`nusmods-exam-${exam.course}`,examRecord(exam,courseId.get(exam.course)!));
  }
  return ReviewedPackSchema.parse({schemaVersion:1,accountKey:snapshot.accountKey,updatedAt:sgtOffset(snapshot.updatedAt),
    sources:['Canvas API（只读同步）',...(timetable?['NUSMods 课表与考试安排']:[]),...(reviewed.length?['agent 课件核对（引文已逐条比对原文）']:[])],
    courses:snapshot.courses.map(({id,code,name})=>({id,code,name})),meetings:timetable?.meetings??[],assessmentPlans:[],
    records:[...records.values()],submitted:merged.events.filter(e=>e.submitted).map(e=>e.id)});
}
