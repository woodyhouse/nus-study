// Vendored from nus-canvas-mobile/src/timetable.ts by scripts/vendor-core.mjs. Do not edit here.
// Weekly timetable from fixed meetings plus the semester calendar. Sessions are
// view data, never persisted or turned into deadlines.

export type Meeting={course:string;weekday:number;start:string;end:string;venue:string;weeks:string};
export type Session=Meeting&{date:string};
export type WeekInfo={monday:string;label:string;teaching:number|null};

// NUS AY2026/27 Semester 1, matching the private dashboard's verified dates:
// teaching from 10 Aug, Recess 19–27 Sep, no classes on 9 Oct (Well-being Day),
// last teaching day 13 Nov, Reading Week from 14 Nov. University-wide, not personal.
export const SEMESTER={week1:'2026-08-10',recess:['2026-09-19','2026-09-27'],lastTeachingDay:'2026-11-13',readingWeek:'2026-11-14',
  noClass:{'2026-10-09':'Well-being Day'} as Record<string,string>};

export function addDays(date:string,days:number){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
// 1 = Monday … 7 = Sunday (0 is accepted as Sunday too).
export function isoWeekday(date:string){return new Date(`${date}T00:00:00Z`).getUTCDay()||7;}
export function mondayOf(date:string){return addDays(date,1-isoWeekday(date));}
const days=(a:string,b:string)=>Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000);

export function parseWeeks(text:string):Set<number>{
  const weeks=new Set<number>();
  for(const part of text.split(/[,，、\s]+/).filter(Boolean)){
    const range=part.match(/^(\d+)\s*[-–—~]\s*(\d+)$/),single=part.match(/^\d+$/);
    if(range)for(let w=Number(range[1]);w<=Number(range[2])&&w<=30;w++)weeks.add(w);
    else if(single)weeks.add(Number(part));
  }
  return weeks;
}

export function weekInfo(date:string):WeekInfo{
  const monday=mondayOf(date),recessMonday=mondayOf(SEMESTER.recess[1]);
  if(monday<SEMESTER.week1)return {monday,label:'学期未开始',teaching:null};
  if(monday===recessMonday)return {monday,label:'Recess Week',teaching:null};
  if(monday>SEMESTER.lastTeachingDay)return {monday,label:monday<=addDays(SEMESTER.readingWeek,6)?'Reading Week':'教学周已结束',teaching:null};
  const k=days(SEMESTER.week1,monday)/7,teaching=k+1-(monday>recessMonday?1:0);
  return {monday,label:`第 ${teaching} 周`,teaching};
}

export function noClassReason(date:string):string|null{
  if(date<SEMESTER.week1||date>SEMESTER.lastTeachingDay)return '非教学日';
  if(date>=SEMESTER.recess[0]&&date<=SEMESTER.recess[1])return 'Recess Week';
  return SEMESTER.noClass[date]||null;
}

export function sessionsForWeek(meetings:Meeting[],anyDate:string):Session[]{
  const {monday,teaching}=weekInfo(anyDate);
  if(teaching===null)return [];
  return meetings.flatMap(m=>{
    const day=((m.weekday%7)+6)%7+1,date=addDays(monday,day-1),weeks=parseWeeks(m.weeks);
    if(noClassReason(date)||(weeks.size>0&&!weeks.has(teaching)))return [];
    return [{...m,date}];
  }).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

export function minutesOf(time:string){const [h,m]=time.split(':').map(Number);return h*60+m;}
export function hourRange(meetings:Meeting[]):[number,number]{
  if(!meetings.length)return [9,18];
  return [Math.min(...meetings.map(m=>Math.floor(minutesOf(m.start)/60))),Math.max(...meetings.map(m=>Math.ceil(minutesOf(m.end)/60)))];
}

// Fictional timetable for the demo snapshot.
export const DEMO_MEETINGS:Meeting[]=[
  {course:'DEMO101',weekday:1,start:'10:00',end:'12:00',venue:'LT8',weeks:'1–13'},
  {course:'DEMO202',weekday:2,start:'12:00',end:'14:00',venue:'LT11',weeks:'1–13'},
  {course:'DEMO303',weekday:3,start:'09:00',end:'11:00',venue:'COM1-0212',weeks:'1–13'},
  {course:'DEMO101',weekday:4,start:'10:00',end:'11:00',venue:'S16-0430',weeks:'2–13'},
  {course:'DEMO404',weekday:5,start:'15:00',end:'17:00',venue:'LT7A',weeks:'1–13'},
  {course:'DEMO202',weekday:6,start:'09:00',end:'11:00',venue:'E-Learning',weeks:'1–13'},
];
