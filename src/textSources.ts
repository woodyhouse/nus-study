// Canvas text the agent reviews like a one-page document: announcements,
// assignment/quiz/calendar descriptions, the syllabus and module pages.
// Professors often put the real dates only here, not in Canvas due dates.
import {createHash} from 'node:crypto';
import type {Event,Snapshot} from './core/domain.ts';

export type TextSource={id:string;course:string;title:string;kind:'announcement'|'canvas-api';url:string;text:string};

// The core appends these labels after the description; the body is what precedes them.
const SUFFIXES=['\n提交方式：','\n时限：','\n来源：Canvas'];
export function bodyOf(event:Pick<Event,'detail'>):string{
  const cuts=SUFFIXES.map(s=>event.detail.indexOf(s)).filter(i=>i>=0);
  return (cuts.length?event.detail.slice(0,Math.min(...cuts)):event.detail).trim();
}

const when=(e:Event)=>e.date?`${e.date}${e.time?' '+e.time:''} SGT`:'未公布';
const labels:Record<string,string>={announcement:'发布时间',assignment:'Canvas 截止时间',quiz:'Canvas 截止时间',academic:'Canvas 日历时间'};

export function textSources(snapshot:Snapshot):TextSource[]{
  const out:TextSource[]=[];
  for(const e of snapshot.events){
    if(!/^(announcement|assignment|quiz|calendar)-/.test(e.id))continue;
    const body=bodyOf(e);
    if(!body)continue;
    // The posting time lets the agent resolve "next Friday" without guessing.
    out.push({id:'text-'+e.id,course:e.course,title:e.title,kind:e.type==='announcement'?'announcement':'canvas-api',url:e.url,
      text:`${e.title}\n${labels[e.type]||'时间'}：${when(e)}\n\n${body}`});
  }
  for(const d of snapshot.documents||[])
    if((d.kind==='syllabus'||d.kind==='page')&&d.status!=='locked'&&d.text.trim())
      out.push({id:'text-'+d.id,course:d.course,title:d.title,kind:'canvas-api',url:d.url,text:`${d.title}\n\n${d.text.trim()}`});
  return out;
}

export const textHash=(text:string)=>createHash('sha256').update(text).digest('hex');
