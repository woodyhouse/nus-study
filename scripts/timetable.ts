// npm run timetable -- "<NUSMods share link>" [--ay 2026-2027]
// Fetches public module data from NUSMods and saves .local/timetable.json.
import {parseArgs} from 'node:util';
import {academicYear,examFor,meetingsFor,parseShareLink,type ModuleData} from '../src/nusmods.ts';
// @ts-expect-error plain ESM helper without type declarations
import {writeJsonAtomic,local} from '../lib/store.mjs';

const {values,positionals}=parseArgs({allowPositionals:true,options:{ay:{type:'string'}}});
if(!positionals[0])throw new Error('Usage: npm run timetable -- "<NUSMods share link>"');
const selection=parseShareLink(positionals[0]),ay=values.ay||academicYear();
if(!/^\d{4}-\d{4}$/.test(ay))throw new Error('--ay must look like 2026-2027');
const meetings=[],exams=[],missing:string[]=[];
for(const [code,chosen] of Object.entries(selection.modules)){
  const r=await fetch(`https://api.nusmods.com/v2/${ay}/modules/${code}.json`,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok){missing.push(code);continue;}
  const module=await r.json() as ModuleData;
  meetings.push(...meetingsFor(module,selection.semester,chosen));
  const exam=examFor(module,selection.semester);if(exam)exams.push(exam);
}
writeJsonAtomic(local('timetable.json'),{ay,semester:selection.semester,modules:Object.keys(selection.modules),meetings,exams,missing,checkedAt:new Date().toISOString()});
console.log(JSON.stringify({ay,semester:selection.semester,modules:Object.keys(selection.modules).length,meetings:meetings.length,exams:exams.length,missing}));
