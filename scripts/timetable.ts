// Automatic: npm run timetable            (uses the synced Canvas course codes)
//   answer:  npm run timetable -- --choose "CS2040:TUT=12,LAB=3C"
// Or link:  npm run timetable -- "<NUSMods share link>"
// Fetches public NUSMods data; saves .local/timetable.json. Choices are remembered.
import {parseArgs} from 'node:util';
import {academicYear,autoChoose,currentSemester,examFor,meetingsFor,parseChoices,parseShareLink,type ModuleData,type Unresolved} from '../src/nusmods.ts';
// @ts-expect-error plain ESM helper without type declarations
import {readJson,writeJsonAtomic,local} from '../lib/store.mjs';

const {values,positionals}=parseArgs({allowPositionals:true,options:{ay:{type:'string'},sem:{type:'string'},choose:{type:'string'}}});
const ay=values.ay||academicYear();
if(!/^\d{4}-\d{4}$/.test(ay))throw new Error('--ay must look like 2026-2027');
const prior=readJson(local('timetable.json'));
let semester:number,codes:string[],choices:Record<string,Record<string,string[]>>,source:string;
if(positionals[0]){
  const selection=parseShareLink(positionals[0]);
  semester=selection.semester;codes=Object.keys(selection.modules);choices=selection.modules;source='nusmods-link';
}else{
  const snapshot=readJson(local('snapshot.json'));
  if(!snapshot)throw new Error('Run npm run sync first (course codes come from Canvas), or pass a NUSMods share link.');
  semester=Number(values.sem||currentSemester());codes=snapshot.courses.map((c:{code:string})=>c.code);
  const saved=prior?.ay===ay&&prior?.semester===semester?prior.choices??{}:{};
  choices={...saved};
  for(const [code,picks] of Object.entries(parseChoices(values.choose)))choices[code]={...choices[code],...picks};
  source='canvas-auto';
}
const meetings=[],exams=[],missing:string[]=[],unresolved:Unresolved[]=[];
for(const code of codes){
  const r=await fetch(`https://api.nusmods.com/v2/${ay}/modules/${code}.json`,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok){missing.push(code);continue;}
  const module=await r.json() as ModuleData;
  if(!module.semesterData.some(s=>s.semester===semester)){missing.push(code);continue;}
  const pick=source==='nusmods-link'?{chosen:choices[code]??{},unresolved:[]}:autoChoose(module,semester,choices[code]);
  if(source==='canvas-auto')choices[code]={...choices[code],...pick.chosen};
  unresolved.push(...pick.unresolved);
  meetings.push(...meetingsFor(module,semester,pick.chosen));
  const exam=examFor(module,semester);if(exam)exams.push(exam);
}
writeJsonAtomic(local('timetable.json'),{ay,semester,source,modules:codes,choices,meetings,exams,missing,unresolved,checkedAt:new Date().toISOString()});
console.log(JSON.stringify({ay,semester,source,modules:codes.length,meetings:meetings.length,exams:exams.length,missing,
  needsChoice:unresolved.map(u=>({course:u.course,lessonType:u.lessonType,abbrev:u.abbrev,options:u.options.length}))}));
