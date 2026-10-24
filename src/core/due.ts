// Vendored from nus-canvas-mobile/src/due.ts by scripts/vendor-core.mjs. Do not edit here.
import type {Event} from './domain.ts';
import {recordOf} from './records.ts';

export type DueState='open'|'done'|'all';
// Colors follow the current course list sorted by code, so up to six courses are
// always distinct and no real course code needs to ship in the bundle.
const palette=['#1478D4','#008878','#8860CE','#E77814','#CB4A79','#6378C5'];
let assigned=new Map<string,string>();
export function assignCourseColors(codes:string[]){assigned=new Map([...new Set(codes)].sort().map((code,i)=>[code,palette[i%palette.length]]));}
export function courseColor(code:string){return assigned.get(code)||palette[Array.from(code).reduce((n,c)=>n+c.charCodeAt(0),0)%palette.length];}
export function courseTextColor(code:string,dark=false){const color=courseColor(code);return dark?'#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*.7+255*.3).toString(16).padStart(2,'0')).join(''):color;}
export function isDue(e:Event){const r=recordOf(e);return ['assignment','quiz','exam','midterm'].includes(r.type)&&!['published','modified'].includes(r.timing.role);}
export function isDone(e:Event){return !!(e.submitted||e.personal?.done);}
export function assessmentEmphasis(e:Event){
  const tier=isDue(e)?({assignment:0,quiz:1,midterm:2,exam:3} as Record<string,number>)[e.type]||0:0;
  return {tier,label:tier===3?'FINAL':tier===2?'MIDTERM':tier===1?'QUIZ':'',fontSize:17+(tier>=2?tier-1:0),fontWeight:(tier>=2?'700':'600') as '600'|'700'};
}
export function filterDue(events:Event[],course='all',type='all',state:DueState='open'){
  return events.filter(e=>isDue(e)&&(course==='all'||e.course===course)&&(type==='all'||e.type===type)&&(state==='all'||(state==='done'?isDone(e):!isDone(e))))
    .sort((a,b)=>`${a.date||'9999'} ${a.time}`.localeCompare(`${b.date||'9999'} ${b.time}`)||a.course.localeCompare(b.course)||a.id.localeCompare(b.id));
}
// Reveal complete history date groups from oldest forwards; render chronologically.
// This is local presentation only: no sync, submission or completion inference.
export function timelineWindow(events:Event[],today:string,historyDays=0){
  const dated=events.filter(e=>e.date).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)||a.id.localeCompare(b.id));
  const past=dated.filter(e=>e.date!<today),days=[...new Set(past.map(e=>e.date!))];
  const count=Math.max(0,Math.floor(historyDays)),visibleDays=new Set(days.slice(0,count));
  const history=past.filter(e=>visibleDays.has(e.date!));
  return {events:[...history,...dated.filter(e=>e.date!>=today)],historyCount:history.length,pastCount:past.length,pastOpen:past.filter(e=>!isDone(e)).length,hasMore:visibleDays.size<days.length};
}
export function monthDays(month:string){const start=new Date(month+'-01T12:00:00Z'),offset=(start.getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>new Date(start.getTime()+(i-offset)*86400000).toISOString().slice(0,10));}
export function moveMonth(month:string,n:number){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+n);return date.toISOString().slice(0,7);}
