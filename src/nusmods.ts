// NUSMods share links -> fixed weekly meetings and official exam slots.
// Uses the public NUSMods API (api.nusmods.com); no NUS login involved.
import type {Meeting} from './core/timetable.ts';
import {wall} from './core/domain.ts';

export const LESSON_ABBREV:Record<string,string>={'Design Lecture':'DLEC',Laboratory:'LAB',Lecture:'LEC','Packaged Laboratory':'PLAB','Packaged Lecture':'PLEC',
  'Packaged Tutorial':'PTUT',Recitation:'REC','Sectional Teaching':'SEC','Seminar-Style Module Class':'SEM',Tutorial:'TUT','Tutorial Type 2':'TUT2','Tutorial Type 3':'TUT3',Workshop:'WS'};
const DAYS:Record<string,number>={Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:7};

export type Selection={semester:number;modules:Record<string,Record<string,string[]>>};
export type Lesson={classNo:string;startTime:string;endTime:string;weeks:number[]|object;day:string;lessonType:string;venue:string};
export type ModuleData={moduleCode:string;title:string;semesterData:{semester:number;examDate?:string;examDuration?:number;timetable?:Lesson[]}[]};
export type Exam={course:string;title:string;date:string;time:string;durationMinutes:number|null};

// Accepts both share formats: CS2040=LEC:1,TUT:12 and CS2040=LEC:(1);TUT:(12).
export function parseShareLink(link:string):Selection{
  const url=new URL(link.trim());
  if(url.hostname!=='nusmods.com'&&url.hostname!=='www.nusmods.com')throw new Error('Not a nusmods.com link.');
  const sem=url.pathname.match(/\/timetable\/sem-(\d)\//)?.[1];
  if(!sem)throw new Error('The link does not name a semester (…/timetable/sem-1/share?…).');
  const modules:Selection['modules']={};
  for(const [code,value] of url.searchParams){
    if(!/^[A-Z]{2,4}\d{4}[A-Z]{0,3}$/.test(code))continue;
    const lessons:Record<string,string[]>={};
    for(const part of value.split(/[,;]/).filter(Boolean)){
      const m=part.match(/^([A-Z0-9]+):\(?([^)]*)\)?$/);
      if(m)lessons[m[1]]=m[2].split(/[,;]/).filter(Boolean);
    }
    modules[code]=lessons;
  }
  if(!Object.keys(modules).length)throw new Error('No modules found in the link.');
  return {semester:Number(sem),modules};
}

export function weeksText(weeks:number[]|object):string{
  if(!Array.isArray(weeks)||!weeks.length)return '';
  const sorted=[...new Set(weeks)].sort((a,b)=>a-b),parts:string[]=[];
  for(let i=0;i<sorted.length;){let j=i;while(j+1<sorted.length&&sorted[j+1]===sorted[j]+1)j++;parts.push(i===j?`${sorted[i]}`:`${sorted[i]}–${sorted[j]}`);i=j+1;}
  return parts.join(',');
}
const hhmm=(t:string)=>`${t.slice(0,2)}:${t.slice(2,4)}`;

export function meetingsFor(module:ModuleData,semester:number,chosen:Record<string,string[]>):Meeting[]{
  const lessons=module.semesterData.find(s=>s.semester===semester)?.timetable||[];
  return lessons.filter(l=>chosen[LESSON_ABBREV[l.lessonType]??l.lessonType]?.includes(l.classNo)&&DAYS[l.day])
    .map(l=>({course:module.moduleCode,weekday:DAYS[l.day],start:hhmm(l.startTime),end:hhmm(l.endTime),
      venue:[l.venue||'地点待定',LESSON_ABBREV[l.lessonType]??l.lessonType].join(' · '),weeks:weeksText(l.weeks)}));
}
export function examFor(module:ModuleData,semester:number):Exam|null{
  const s=module.semesterData.find(x=>x.semester===semester);
  if(!s?.examDate)return null;
  const {date,time}=wall(s.examDate);
  return date?{course:module.moduleCode,title:'Final Exam',date,time,durationMinutes:s.examDuration??null}:null;
}
// NUS academic years start in August.
export function academicYear(now=new Date()):string{const y=now.getUTCFullYear(),start=now.getUTCMonth()>=7?y:y-1;return `${start}-${start+1}`;}

// Automatic mode: start from the Canvas course codes. A lesson type with a single
// class is chosen outright; types with several classes need the student's answer.
export type Unresolved={course:string;lessonType:string;abbrev:string;options:{classNo:string;slots:string[]}[]};
const DAY_ZH=['','周一','周二','周三','周四','周五','周六','周日'];
export function autoChoose(module:ModuleData,semester:number,given:Record<string,string[]>={}):{chosen:Record<string,string[]>;unresolved:Unresolved[]}{
  const lessons=module.semesterData.find(s=>s.semester===semester)?.timetable||[];
  const byType=new Map<string,{type:string;classes:Map<string,Lesson[]>}>();
  for(const l of lessons){
    const abbrev=LESSON_ABBREV[l.lessonType]??l.lessonType,entry=byType.get(abbrev)??{type:l.lessonType,classes:new Map()};
    entry.classes.set(l.classNo,[...(entry.classes.get(l.classNo)??[]),l]);byType.set(abbrev,entry);
  }
  const chosen:Record<string,string[]>={},unresolved:Unresolved[]=[];
  for(const [abbrev,{type,classes}] of byType){
    const pick=given[abbrev]?.filter(c=>classes.has(c));
    if(pick?.length)chosen[abbrev]=pick;
    else if(classes.size===1)chosen[abbrev]=[...classes.keys()];
    else unresolved.push({course:module.moduleCode,lessonType:type,abbrev,options:[...classes].map(([classNo,ls])=>({classNo,
      slots:ls.map(l=>`${DAY_ZH[DAYS[l.day]]??l.day} ${hhmm(l.startTime)}–${hhmm(l.endTime)} ${l.venue||''}`.trim())}))});
  }
  return {chosen,unresolved};
}
// "CS2040:TUT=12,LAB=3C;MA1521:LEC=2" -> {CS2040:{TUT:['12'],LAB:['3C']},MA1521:{LEC:['2']}}
export function parseChoices(text=''):Record<string,Record<string,string[]>>{
  const out:Record<string,Record<string,string[]>>={};
  for(const part of text.split(';').map(s=>s.trim()).filter(Boolean)){
    const m=part.match(/^([A-Z]{2,4}\d{4}[A-Z]{0,3}):(.+)$/i);if(!m)throw new Error(`Cannot read choice "${part}"; use CODE:TUT=12,LAB=3C`);
    const code=m[1].toUpperCase();out[code]??={};
    for(const kv of m[2].split(',')){const [k,v]=kv.split('=').map(s=>s?.trim());if(!k||!v)throw new Error(`Cannot read "${kv}" in ${code}`);out[code][k.toUpperCase()]=[v];}
  }
  return out;
}
// Semester 1 runs Aug–Dec, Semester 2 Jan–May; special terms are not handled.
export function currentSemester(now=new Date()){return now.getUTCMonth()>=6?1:2;}
