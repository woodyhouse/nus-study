import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseShareLink,meetingsFor,examFor,weeksText,academicYear,autoChoose,parseChoices,currentSemester} from '../src/nusmods.ts';
import {buildPack} from '../src/buildPack.ts';
import {checkReview,loadReviewed,reviewQueue,normalize} from '../src/review.ts';
import {extractText} from '../src/pdfText.ts';
import {pairingPage} from '../src/pairingPage.ts';
import {sealPack,openPack,newPackKey,parsePairing,pairingFragment} from '../src/core/sealed.ts';
import {snapshotFromPack} from '../src/core/snapshot.ts';
import {ReviewedPackSchema} from '../src/core/reviewed.ts';
import {snapshot,docText,extraction,nusmodsModule,hash} from './fixtures.mjs';

test('NUSMods share links in both formats',()=>{
 assert.deepEqual(parseShareLink('https://nusmods.com/timetable/sem-1/share?AB1234=LEC:1,TUT:03&CD5678=LEC:2&hidden=x'),{semester:1,modules:{AB1234:{LEC:['1'],TUT:['03']},CD5678:{LEC:['2']}}});
 assert.deepEqual(parseShareLink('https://nusmods.com/timetable/sem-2/share?AB1234=LEC:(1);TUT:(03)').modules.AB1234,{LEC:['1'],TUT:['03']});
 assert.throws(()=>parseShareLink('https://example.com/timetable/sem-1/share?AB1234=LEC:1'),/nusmods/);
 assert.throws(()=>parseShareLink('https://nusmods.com/timetable/share?AB1234=LEC:1'),/semester/);
});

test('NUSMods lessons become meetings; exams convert to Singapore time',()=>{
 const meetings=meetingsFor(nusmodsModule,1,{LEC:['1'],TUT:['03']});
 assert.deepEqual(meetings,[
  {course:'AB1234',weekday:4,start:'09:00',end:'10:00',venue:'LT0 · LEC',weeks:'1–13'},
  {course:'AB1234',weekday:6,start:'14:00',end:'16:00',venue:'X1-01 · TUT',weeks:'3–6,8–10'}]);
 assert.deepEqual(examFor(nusmodsModule,1),{course:'AB1234',title:'Final Exam',date:'2026-11-24',time:'09:00',durationMinutes:120});
 assert.equal(examFor(nusmodsModule,2),null);
 assert.equal(weeksText({start:'x'}),'');
 assert.equal(academicYear(new Date('2026-10-24')),'2026-2027');assert.equal(academicYear(new Date('2027-07-15')),'2026-2027');assert.equal(academicYear(new Date('2027-08-01')),'2027-2028');
});

test('automatic timetable picks single-class lessons and asks only about the rest',()=>{
 const first=autoChoose(nusmodsModule,1);
 assert.deepEqual(first.chosen,{TUT:['03']});
 assert.deepEqual(first.unresolved.map(u=>[u.course,u.abbrev,u.options.map(o=>o.classNo)]),[['AB1234','LEC',['1','2']]]);
 assert.deepEqual(first.unresolved[0].options[0].slots,['周四 09:00–10:00 LT0']);
 const answered=autoChoose(nusmodsModule,1,{LEC:['2'],TUT:['99']});
 assert.deepEqual(answered.chosen,{LEC:['2'],TUT:['03']});assert.equal(answered.unresolved.length,0);
 assert.deepEqual(parseChoices('ab1234:tut=03,lec=2; CD5678:LAB=3C'),{AB1234:{TUT:['03'],LEC:['2']},CD5678:{LAB:['3C']}});
 assert.throws(()=>parseChoices('AB1234 TUT 03'),/CODE:TUT=12/);
 assert.equal(currentSemester(new Date('2026-10-24')),1);assert.equal(currentSemester(new Date('2027-02-01')),2);
});

test('quotes are checked against the cited page; only exact matches become source-backed',()=>{
 const doc={...docText,id:'file-77',course:'AB1234'};
 const ok=checkReview(extraction(),doc,1001);
 assert.equal(ok.records[0].review.status,'source-backed');assert.equal(ok.records[0].courseId,1001);assert.equal(ok.unverified,0);
 const loose=checkReview(extraction({quote:'quiz   2 WILL be held in class on 5 Nov 2026, 14:00 — 15:00.'}),doc,1001);
 assert.equal(loose.records[0].review.status,'source-backed');
 const invented=checkReview(extraction({quote:'Quiz 2 is on 6 Nov.'}),doc,1001);
 assert.equal(invented.records[0].review.status,'needs-review');assert.equal(invented.unverified,1);
 assert.throws(()=>checkReview(extraction({h:'0'.repeat(64)}),doc,1001),/版本/);
 assert.equal(normalize(' A　B '),'ab');
});

test('review queue and loader work from the .local layout',()=>{
 const dir=mkdtempSync(join(tmpdir(),'kit-'));mkdirSync(join(dir,'text'));mkdirSync(join(dir,'review'));
 writeFileSync(join(dir,'text','file-77.json'),JSON.stringify(docText));
 assert.deepEqual(reviewQueue(snapshot(),dir).map(q=>[q.documentId,q.reason,q.pages]),[['file-77','new',2]]);
 writeFileSync(join(dir,'review','file-77.json'),JSON.stringify(extraction()));
 assert.equal(reviewQueue(snapshot(),dir).length,0);
 writeFileSync(join(dir,'review','file-99.json'),JSON.stringify(extraction({documentId:'file-99'})));
 const loaded=loadReviewed(snapshot(),dir);
 assert.equal(loaded.records.length,1);assert.deepEqual(loaded.rejected.map(r=>r.documentId),['file-99']);
});

test('pack merges reviewed facts into Canvas items, keeps submission state and adds official exams',()=>{
 const doc={...docText,id:'file-77',course:'AB1234'};
 const reviewed=checkReview(extraction(),doc,1001).records;
 const timetable={meetings:meetingsFor(nusmodsModule,1,{LEC:['1']}),exams:[examFor(nusmodsModule,1)]};
 const pack=buildPack({snapshot:snapshot(),timetable,reviewed});
 assert.equal(ReviewedPackSchema.safeParse(pack).success,true);
 assert.equal(pack.updatedAt,'2026-10-20T12:00:00+08:00');
 const quiz=pack.records.filter(r=>r.title==='Quiz 2');
 assert.equal(quiz.length,1);assert.equal(quiz[0].id,'assignment-502');
 // Gradebook-only Canvas quiz: the slides' in-class time wins.
 assert.equal(quiz[0].timing.date,'2026-11-05');assert.equal(quiz[0].timing.time,'14:00');
 assert.deepEqual(pack.submitted,['assignment-501']);
 assert.equal(pack.records.find(r=>r.id==='nusmods-exam-AB1234').timing.endAt,'2026-11-24T11:00:00+08:00');
 assert.equal(pack.meetings.length,1);
 const app=snapshotFromPack(pack,null);
 assert.equal(app.events.find(e=>e.id==='assignment-501').submitted,true);
 assert.equal(app.events.find(e=>e.id==='assignment-502').date,'2026-11-05');
 assert.throws(()=>buildPack({snapshot:{...snapshot(),accountKey:undefined}}),/Sync Canvas first/);
});

test('sealed pack and pairing link round-trip without exposing content',async()=>{
 const pack=buildPack({snapshot:snapshot()}),key=newPackKey(),sealed=await sealPack(pack,key);
 assert.doesNotMatch(JSON.stringify(sealed),/AB1234|Assignment/);
 assert.deepEqual(await openPack(sealed,key),pack);
 const link='https://example.github.io/app/'+pairingFragment({src:'https://gist.githubusercontent.com/u/i/raw/nus-study-pack.json',key});
 assert.equal(parsePairing(link).key,key);
 const page=pairingPage(link,'<svg></svg>','https://example.github.io/app/');
 assert.match(page,/default-src 'none'/);assert.doesNotMatch(page,/<script/);
});

function tinyPdf(pages){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`],font=3+pages.length*2;
 pages.forEach((text,i)=>{const stream=`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n';const offsets=objects.map((o,i)=>{const at=out.length;out+=`${i+1} 0 obj\n${o}\nendobj\n`;return at;});
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Uint8Array(Buffer.from(out,'latin1'));
}
test('PDF text is extracted per page and near-empty pages are flagged for OCR',async()=>{
 const {pages,ocrRequiredPages}=await extractText(tinyPdf(['Midterm will be held on 5 Nov 2026 at 14:00 in LT0.','Hi']));
 assert.equal(pages.length,2);assert.match(pages[0].text,/Midterm will be held on 5 Nov 2026/);assert.deepEqual(ocrRequiredPages,[2]);
 assert.equal(hash.length,64);
});
