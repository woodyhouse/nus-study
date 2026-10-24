// Vendored from nus-canvas-mobile/src/domain.ts by scripts/vendor-core.mjs. Do not edit here.
import {changesBetween,recordOf,upgradeSnapshot,type StudyRecord,type Change} from './records.ts';
import type {ReviewedPack} from './reviewed.ts';
import {formatDay} from './dates.ts';
import {attachSourceFileLinks} from './sourcePdfs.ts';
export type Course = { id: number; code: string; name: string; color: string };
export type Event = { id: string; course: string; type: 'assignment'|'quiz'|'announcement'|'academic'|'exam'|'midterm'|'material'; title: string; date: string|null; time: string; submitted: boolean; detail: string; url: string; record?:StudyRecord; personal?:{read:boolean;done:boolean} };
export type SourceDocument = {
  id:string; course:string; title:string; kind:'pdf'|'file'|'module'|'syllabus'|'page';
  url:string; modifiedAt:string|null; metadataVersion:string; text:string;
  status:'awaiting-pdf-reader'|'awaiting-analysis'|'index-only'|'locked';
  extraction?:{schemaVersion:1;hash:string;metadataVersion:string;pages:{page:number;text:string}[];ocrRequiredPages:number[];extractedAt:string};
};
export type SourceCoverage = {course:string;section:string;checkedAt:string;count:number|null;available:boolean};
export type Snapshot = { schemaVersion?:1; demo: boolean; updatedAt: string; courses: Course[]; events: Event[]; unavailable: string[]; documents?:SourceDocument[]; coverage?:SourceCoverage[]; changes?:Change[];accountKey?:string;reviewed?:ReviewedPack;reviewStatus?:string };
export function plain(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim() : '';
}
export function wall(iso?: string|null): {date:string|null;time:string} {
  if (!iso || !Number.isFinite(Date.parse(iso))) return {date:null,time:''};
  const s = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  return {date:s.slice(0,10),time:s.slice(11,16)};
}
export function stateOf(event: Event, today = wall(new Date().toISOString()).date!): 'upcoming'|'pending'|'history'|'overdue' {
  if (event.submitted || event.personal?.done || event.type === 'announcement' || event.type === 'material') return 'history';
  if(event.record&&event.record.review.status!=='source-backed')return 'pending';
  if (!event.date) return 'pending';
  return event.date < today ? 'overdue' : 'upcoming';
}
export function labelDate(event: Pick<Event,'date'|'time'>): string {
  if (!event.date) return '日期待公布';
  const d = formatDay(event.date,{weekday:true,year:event.date.slice(0,4)!==wall(new Date().toISOString()).date?.slice(0,4)});
  return `${d}${event.time ? ' · '+event.time : ' · 时间待公布'}`;
}
export function shiftDay(day:string,n:number):string{return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function assignment(course: string, a: any): Event {
  const event:Event={id:`assignment-${a.id}`,course,type:a.is_quiz_assignment?'quiz':'assignment',title:String(a.name||'未命名作业'),...wall(a.due_at),submitted:!!a.submission?.submitted_at,
    detail:`${plain(a.description)}\n提交方式：${Array.isArray(a.submission_types)?a.submission_types.join('、'):'未公布'}\n分值：${a.points_possible??'未公布'}\n来源：Canvas Assignment ${a.id}`,url:a.html_url||''};
  const record=recordOf(event);
  record.requirements.mode=a.group_category_id?'group':'unknown';
  record.requirements.submission=Array.isArray(a.submission_types)?a.submission_types.join('、'):null;
  record.review.fieldEvidence.requirements=[record.sources[0].id];
  event.record=record;return attachSourceFileLinks(event,a.description);
}
export function combine(old: Snapshot|null, next: Snapshot): Snapshot {
  const events = new Map((old && !old.demo ? old.events : []).map(e=>[e.id,e]));
  next.events.forEach(e=>events.set(e.id,{...e,personal:events.get(e.id)?.personal||e.personal}));
  // Retain documents only for an unavailable endpoint. A successful current
  // listing must not resurrect revoked, removed or newly locked material.
  const documents=new Map((next.documents||[]).map(d=>[d.id,d]));
  for(const d of old&&!old.demo?old.documents||[]:[]){const fresh=documents.get(d.id);if(fresh?.metadataVersion===d.metadataVersion&&fresh.status!=='locked'&&d.extraction)documents.set(d.id,{...fresh,extraction:d.extraction,text:d.text,status:d.status});}
  if(old&&!old.demo) for(const d of old.documents||[]) {
    const section=d.kind==='module'?'Modules':d.kind==='syllabus'?'课程说明':'Files';
    if(next.coverage?.some(c=>c.course===d.course&&c.section===section&&!c.available)&&!documents.has(d.id)) documents.set(d.id,d);
  }
  return upgradeSnapshot({...next,events:[...events.values()],documents:[...documents.values()],changes:[...(old&&!old.demo?old.changes||[]:[]),...changesBetween(old,next)]});
}
export function documentEvent(doc:SourceDocument):Event {
  const labels={'awaiting-pdf-reader':'PDF 正文尚未提取；未核验其中的日期和规则。','awaiting-analysis':'正文已同步，尚未整理其中的考试或截止日期。','index-only':'仅同步目录；外部链接及模块页面正文尚未读取。',locked:'Canvas 标记为不可访问，未读取正文。'};
  const event:Event={id:doc.id,course:doc.course,type:'material',title:doc.title,...wall(doc.modifiedAt),submitted:false,url:doc.url,
    detail:`来源：Canvas ${doc.kind}。\n${doc.extraction?'已按页提取文字，事项尚未核实。':labels[doc.status]}\n显示日期仅为文件或目录的更新时间，不代表考试或截止日期。`};
  const record=recordOf(event);
  record.sources=[{id:doc.id,kind:doc.kind==='pdf'?'pdf':'canvas-api',title:doc.title,url:record.sources[0].url,documentId:doc.id,page:null,quote:'',hash:doc.extraction?.hash||null}];
  record.review.fieldEvidence={title:[doc.id],timing:[doc.id]};
  if(!doc.extraction&&doc.text)record.blocks.push({kind:'text',title:'原始文本',text:doc.text});
  event.record=record;return event;
}
export function demo(): Snapshot {
  const day = (n:number) => wall(new Date(Date.now()+n*86400000).toISOString()).date!;
  return {demo:true,updatedAt:new Date().toISOString(),unavailable:[],changes:[{id:'demo-change',eventId:'demo-1',course:'DEMO101',title:'Assignment 2',detectedAt:new Date().toISOString(),kind:'changed',fields:[{field:'timing',before:JSON.stringify({date:day(2),time:'23:59'}),after:JSON.stringify({date:day(3),time:'23:59'})}]}],documents:[
    {id:'demo-pdf',course:'DEMO101',title:'Sample Source PDF.pdf',kind:'pdf',url:'',modifiedAt:new Date().toISOString(),metadataVersion:'fictional-1',text:'',status:'awaiting-pdf-reader'},
    {id:'demo-syllabus',course:'DEMO202',title:'课程说明（虚构示例）',kind:'syllabus',url:'',modifiedAt:null,metadataVersion:'fictional-1',text:'虚构示例：这里展示课程说明的原始文本。尚未进行 AI 解析，不生成考试安排。',status:'awaiting-analysis'},
  ],coverage:[],courses:[{id:1,code:'DEMO101',name:'Data & Algorithms',color:'#1478D4'},{id:2,code:'DEMO202',name:'Probability Studio',color:'#008878'},{id:3,code:'DEMO303',name:'Optimization Lab',color:'#8860CE'},{id:4,code:'DEMO404',name:'Strategy & Decisions',color:'#E77814'}],events:[
    {id:'demo-1',course:'DEMO101',type:'assignment',title:'Assignment 2',date:day(3),time:'23:59',submitted:false,detail:'虚构示例：完成问题集并提交 PDF。来源：Sample Source PDF.pdf 第 2 页。所有课程及安排均为演示数据。',url:''},
    {id:'demo-2',course:'DEMO202',type:'quiz',title:'Quiz 1',date:day(5),time:'14:00',submitted:false,detail:'虚构示例：60 分钟课堂测验，场地待公布。',url:''},
    {id:'demo-3',course:'DEMO202',type:'assignment',title:'Problem Set 3',date:null,time:'',submitted:false,detail:'虚构示例：截止日期尚未公布。',url:''},
    {id:'demo-4',course:'DEMO101',type:'announcement',title:'课程答疑安排',date:day(-2),time:'12:00',submitted:false,detail:'虚构示例：课后答疑，请查看原始公告。',url:''},
    {id:'demo-5',course:'DEMO303',type:'midterm',title:'Midterm',date:day(12),time:'18:00',submitted:false,detail:'虚构示例：90 分钟期中考试。所有日期与考试要求均为演示数据。',url:''},
    {id:'demo-6',course:'DEMO404',type:'exam',title:'Final Exam',date:day(27),time:'09:00',submitted:false,detail:'虚构示例：期末考试，具体规则待公布。所有日期与考试要求均为演示数据。',url:''},
    {id:'demo-history-1',course:'DEMO101',type:'assignment',title:'Assignment 1',date:day(-4),time:'23:59',submitted:false,detail:'虚构历史任务：日期已过，完成状态仍由你自己标记。',url:''},
    {id:'demo-history-2',course:'DEMO202',type:'quiz',title:'Practice Quiz',date:day(-9),time:'14:00',submitted:false,personal:{read:false,done:true},detail:'虚构历史任务：已手动完成，可再次点击圆圈取消。',url:''},
  ]};
}
