// Vendored from nus-canvas-mobile/src/records.ts by scripts/vendor-core.mjs. Do not edit here.
import {z} from 'zod';
import type {Event,Snapshot} from './domain.ts';

const text=z.string().max(100000);
const safeUrl=z.string().refine(value=>{
  if(!value)return true;
  try{const u=new URL(value);return u.origin==='https://canvas.nus.edu.sg'&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}
},'Use a canonical Canvas URL without credentials or signed query parameters');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
export const EvidenceSchema=z.strictObject({
  id:z.string(),kind:z.enum(['canvas-api','pdf','announcement','manual']),title:text,url:safeUrl,
  documentId:z.string().nullable(),page:z.number().int().positive().nullable(),
  quote:text,hash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
export const BlockSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('text'),title:text,text}),
  z.strictObject({kind:z.literal('facts'),title:text,items:z.array(z.strictObject({label:text,value:text})).max(100)}),
  z.strictObject({kind:z.literal('checklist'),title:text,items:z.array(text).max(100)}),
  z.strictObject({kind:z.literal('attachment'),title:text,url:safeUrl}),
]);
export const RecordSchema=z.strictObject({
  schemaVersion:z.literal(1),id:z.string(),courseId:z.number().int().nonnegative().nullable(),course:text,
  type:z.enum(['assignment','quiz','exam','midterm','announcement','academic','material']),title:text,summary:text,
  timing:z.strictObject({date:date.nullable(),time:z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),endAt:z.iso.datetime({offset:true}).nullable(),
    role:z.enum(['deadline','start','published','modified','unknown']),precision:z.enum(['minute','day','unknown']),timezone:z.literal('Asia/Singapore')}),
  requirements:z.strictObject({mode:z.enum(['individual','group','unknown']),submission:text.nullable(),venue:text.nullable(),weightPercent:z.number().min(0).max(100).nullable(),rules:z.array(text).max(100)}),
  blocks:z.array(BlockSchema).max(500),sources:z.array(EvidenceSchema).max(500),
  review:z.strictObject({status:z.enum(['source-backed','needs-review','conflict']),fieldEvidence:z.record(z.string(),z.array(z.string())),conflicts:z.array(z.strictObject({field:text,values:z.array(text)}))}),
});
export type StudyRecord=z.infer<typeof RecordSchema>;
export type ContentBlock=z.infer<typeof BlockSchema>;
export type Change={id:string;eventId:string;course:string;title:string;detectedAt:string;kind:'added'|'changed';fields:{field:string;before:string;after:string}[]};
export function canonicalUrl(value:string):string{try{const u=new URL(value);return u.origin==='https://canvas.nus.edu.sg'?u.origin+u.pathname:'';}catch{return '';}}
export function recordOf(event:Event,courseId:number|null=null):StudyRecord{
  if(event.record)return RecordSchema.parse({...event.record,courseId:event.record.courseId??courseId});
  const url=canonicalUrl(event.url),source='api-'+event.id;
  return RecordSchema.parse({schemaVersion:1,id:event.id,courseId,course:event.course,type:event.type,title:event.title,summary:'',
    timing:{date:event.date,time:event.time,timezone:'Asia/Singapore',endAt:null,role:event.type==='material'?'modified':event.type==='announcement'?'published':['assignment','quiz'].includes(event.type)?'deadline':event.date?'start':'unknown',precision:event.date?(event.time?'minute':'day'):'unknown'},
    requirements:{mode:'unknown',submission:null,venue:null,weightPercent:null,rules:[]},
    blocks:[{kind:'text',title:'原始说明',text:event.detail}],
    sources:[{id:source,kind:event.type==='announcement'?'announcement':'canvas-api',title:'Canvas 原始记录',url,documentId:null,page:null,quote:'',hash:null}],
    review:{status:'source-backed',fieldEvidence:{title:[source],timing:[source]},conflicts:[]}});
}
export function upgradeSnapshot(snapshot:Snapshot):Snapshot{return {...snapshot,schemaVersion:1,changes:snapshot.changes||[],events:snapshot.events.map(e=>({...e,record:recordOf(e,snapshot.courses.find(c=>c.code===e.course)?.id??null)}))};}
export function changesBetween(old:Snapshot|null,next:Snapshot):Change[]{
  if(!old||old.demo)return [];
  const previous=new Map(old.events.map(e=>[e.id,e]));
  const changes:Change[]=[];
  for(const event of next.events){
    const prior=previous.get(event.id),after=recordOf(event),before=prior?recordOf(prior):null;
    const fields=before?(['title','summary','timing','requirements','blocks','review'] as const).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>({field:k,before:JSON.stringify(before[k]),after:JSON.stringify(after[k])})):[];
    if(!before||fields.length)changes.push({id:`${event.id}@${next.updatedAt}`,eventId:event.id,course:event.course,title:event.title,detectedAt:next.updatedAt,kind:before?'changed':'added',fields});
  }
  return changes;
}
export function reminderEligible(record:StudyRecord):boolean{return record.review.status==='source-backed'&&record.timing.role!=='modified'&&record.timing.role!=='published'&&!!record.timing.date;}
export const DocumentTextSchema=z.strictObject({schemaVersion:z.literal(1),hash:z.string().regex(/^[a-f0-9]{64}$/),metadataVersion:text,
  pages:z.array(z.strictObject({page:z.number().int().positive(),text})).min(1).max(500),ocrRequiredPages:z.array(z.number().int().positive()).max(500),extractedAt:z.iso.datetime({offset:true})});
export function eventFromRecord(input:unknown,prior?:Event):Event{
  const record=RecordSchema.parse(input),dated=record.review.status==='source-backed';
  return {id:record.id,course:record.course,type:record.type,title:record.title,date:dated?record.timing.date:null,time:dated?record.timing.time:'',submitted:prior?.submitted||false,personal:prior?.personal,
    detail:record.blocks.filter(b=>b.kind==='text').map(b=>b.text).join('\n'),url:record.sources.find(s=>s.url)?.url||'',record};
}
export const ExtractionSchema=z.strictObject({schemaVersion:z.literal(1),documentId:z.string(),hash:z.string().regex(/^[a-f0-9]{64}$/),records:z.array(RecordSchema).max(200)});
// PDFs cite a page; Canvas text (announcements, descriptions, pages, slides)
// cites the source as a whole or a slide/page number.
export function validateExtraction(input:unknown,document:{id:string;course:string;hash:string;pageCount:number;text?:boolean}):StudyRecord[]{
  const value=ExtractionSchema.parse(input);
  if(value.documentId!==document.id||value.hash!==document.hash)throw new Error('解析结果与原始文件版本不一致。');
  const located=(s:StudyRecord['sources'][number])=>document.text?(s.kind==='announcement'||s.kind==='canvas-api')&&(s.page===null||s.page<=document.pageCount):s.kind==='pdf'&&s.page!==null&&s.page<=document.pageCount;
  return value.records.map(r=>{
    if(r.course!==document.course||!r.sources.length||r.sources.some(s=>!located(s)||s.documentId!==document.id||s.hash!==document.hash||!s.quote.trim()))throw new Error('解析结果缺少有效的文件页码和原文证据。');
    const ids=new Set(r.sources.map(s=>s.id));
    if(Object.values(r.review.fieldEvidence).flat().some(id=>!ids.has(id)))throw new Error('字段证据引用无效。');
    // A parser/model cannot grant its own verification badge.
    return {...r,review:{...r.review,status:r.review.status==='conflict'?'conflict':'needs-review'}};
  });
}
export const typeNames={assignment:'作业',quiz:'Quiz',exam:'考试',midterm:'Midterm',announcement:'公告',academic:'校历',material:'资料'};
export function changeText(f:Change['fields'][number]):string{
  const labels:Record<string,string>={title:'标题',summary:'摘要',timing:'时间',requirements:'要求',blocks:'说明',review:'核实状态'};
  const display=(raw:string)=>{try{const v=JSON.parse(raw);if(f.field==='timing')return `${v.date||'日期待公布'} ${v.time||''}`.trim();if(f.field==='blocks')return v.map((b:any)=>b.text||b.title).join('；');if(f.field==='requirements')return [v.mode==='group'?'小组':v.mode==='individual'?'个人':'形式待公布',v.submission,v.venue,v.weightPercent===null?null:`${v.weightPercent}%`,...(v.rules||[])].filter(Boolean).join('；');if(f.field==='review')return v.status==='conflict'?'存在冲突':v.status==='needs-review'?'待核实':'原始来源';return String(v);}catch{return raw;}};
  return `${labels[f.field]||f.field}：${display(f.before)} → ${display(f.after)}`;
}
