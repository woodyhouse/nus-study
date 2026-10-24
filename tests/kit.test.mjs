import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseShareLink,meetingsFor,examFor,weeksText,academicYear,autoChoose,parseChoices,currentSemester} from '../src/nusmods.ts';
import {buildPack} from '../src/buildPack.ts';
import {checkReview,loadReviewed,reviewQueue,normalize} from '../src/review.ts';
import {extractText} from '../src/pdfText.ts';
import {pairingPage} from '../src/pairingPage.ts';
import {textSources,bodyOf,textHash} from '../src/textSources.ts';
import {consolidate} from '../src/consolidate.ts';
import {officeText,isOffice} from '../src/office.ts';
import {renderPages} from '../src/pageImages.ts';
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
 writeFileSync(join(dir,'review','file-77-copy.json'),'{"broken":true}');
 const loaded=loadReviewed(snapshot(),dir);
 assert.equal(loaded.records.length,1);assert.deepEqual(loaded.stale.sort(),['file-77-copy','file-99']);assert.deepEqual(loaded.rejected,[]);
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

test('Canvas text (announcements, descriptions) is reviewed like a one-page source',()=>{
 const snap=snapshot();
 snap.events.push({id:'announcement-10',course:'AB1234',type:'announcement',title:'Project update',date:'2026-10-02',time:'10:00',submitted:false,
  detail:'The project report is now due on 30 Oct 2026, 23:59.\n来源：Canvas 公告。正文中的考试日期需要进一步核验。',url:'https://canvas.nus.edu.sg/courses/1001/discussion_topics/10'});
 assert.equal(bodyOf(snap.events[0]),'Upload a PDF.');
 const sources=textSources(snap),a=sources.find(t=>t.id==='text-announcement-10');
 assert.equal(a.kind,'announcement');assert.match(a.text,/^Project update\n发布时间：2026-10-02 10:00 SGT\n\nThe project report/);
 assert.doesNotMatch(a.text,/来源：Canvas/);
 const dir=mkdtempSync(join(tmpdir(),'kit-'));mkdirSync(join(dir,'text'));mkdirSync(join(dir,'review'));
 const h=textHash(a.text);
 writeFileSync(join(dir,'text','text-announcement-10.json'),JSON.stringify({schemaVersion:1,format:'text',hash:h,metadataVersion:h,pages:[{page:1,text:a.text}],ocrRequiredPages:[],extractedAt:'2026-10-20T00:00:00Z'}));
 const [item]=reviewQueue(snap,dir);
 assert.deepEqual([item.documentId,item.format,item.sourceKind,item.url],['text-announcement-10','text','announcement','https://canvas.nus.edu.sg/courses/1001/discussion_topics/10']);
 const result=extraction({documentId:item.documentId,h,quote:'now due on 30 Oct 2026, 23:59'});
 Object.assign(result.records[0],{id:'review-ab1234-project-report',type:'assignment',title:'Project report',timing:{...result.records[0].timing,date:'2026-10-30',time:'23:59',endAt:null,role:'deadline'}});
 result.records[0].sources=[{...result.records[0].sources[0],kind:'announcement',page:null,title:'Project update',url:item.url}];
 writeFileSync(join(dir,'review','text-announcement-10.json'),JSON.stringify(result));
 const loaded=loadReviewed(snap,dir);
 assert.deepEqual(loaded.rejected,[]);assert.equal(loaded.records[0].review.status,'source-backed');
 assert.equal(loaded.records[0].sources[0].id,'text-announcement-10#p2');assert.deepEqual(loaded.records[0].review.fieldEvidence.timing,['text-announcement-10#p2']);
});

test('the same assessment from several sources merges, or becomes a conflict when timings differ',()=>{
 const doc={...docText,id:'file-77',course:'AB1234'};
 const [slides]=checkReview(extraction(),doc,1001).records;
 const brief={...slides,sources:slides.sources.map(s=>({...s,id:'file-88#p1',documentId:'file-88',title:'Quiz brief.docx'})),requirements:{...slides.requirements,venue:'LT0',rules:['Bring a calculator.']}};
 const [same]=consolidate([slides,brief]);
 assert.equal(same.review.status,'source-backed');assert.equal(same.sources.length,2);assert.equal(same.requirements.venue,'LT0');
 assert.deepEqual(same.requirements.rules,['Closed book.','Bring a calculator.']);
 const moved={...brief,timing:{...brief.timing,date:'2026-11-12'}};
 const [conflict]=consolidate([slides,moved]);
 assert.equal(conflict.review.status,'conflict');
 assert.deepEqual(conflict.review.conflicts[0].values,['2026-11-05 14:00（Week 6 slides.pdf）','2026-11-12 14:00（Quiz brief.docx）']);
 assert.equal(consolidate([slides,{...brief,title:'Quiz 3'}]).length,2);
});

function zip(files){
 const parts=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=deflateRawSync(Buffer.from(text)),n=Buffer.from(name),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(Buffer.byteLength(text),22);local.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt32LE(Buffer.byteLength(text),24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  parts.push(local,n,data);central.push(c,n);offset+=30+n.length+data.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...parts,cd,end]));
}
test('Word and PowerPoint text is read per page or slide',()=>{
 const slide=t=>`<p:sld><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t>Weight 10%</a:t></a:r></a:p></p:txBody></p:sld>`;
 const pptx=officeText(zip({'ppt/slides/slide10.xml':slide('Last'),'ppt/slides/slide2.xml':slide('Quiz 2 on 5 Nov &amp; online')}),'Week 6.pptx');
 assert.equal(pptx.format,'pptx');assert.deepEqual(pptx.pages.map(p=>p.text),['Quiz 2 on 5 Nov & online\nWeight 10%','Last\nWeight 10%']);
 const body='<w:document><w:body><w:p><w:r><w:t xml:space="preserve">Report due </w:t></w:r><w:r><w:t>30 Oct</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Rubric</w:t></w:r></w:p></w:body></w:document>';
 const docx=officeText(zip({'word/document.xml':body}),'Brief.DOCX');
 assert.deepEqual(docx.pages,[{page:1,text:'Report due 30 Oct'},{page:2,text:'Rubric'}]);
 assert.throws(()=>officeText(new Uint8Array([1,2,3]),'x.pptx'),/ZIP/);
 assert.equal(isOffice('a.ppt'),false);
});

test('pages without a text layer are rendered to PNG for the agent',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kit-'));
 const [file]=await renderPages(tinyPdf(['Hi']),[1],dir);
 assert.deepEqual([...readFileSync(file).subarray(0,4)],[0x89,0x50,0x4e,0x47]);
});
