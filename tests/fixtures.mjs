// Fictional fixtures only: no real courses, people, venues or Canvas IDs.
import {createHash} from 'node:crypto';
export const accountKey=createHash('sha256').update('canvas:nus:1').digest('hex');
export const hash=createHash('sha256').update('fictional pdf').digest('hex');

export function snapshot(){
  return {demo:false,updatedAt:'2026-10-20T04:00:00.000Z',accountKey,unavailable:[],
    courses:[{id:1001,code:'AB1234',name:'Example Algorithms',color:'#000'},{id:1002,code:'CD5678',name:'Example Statistics',color:'#000'}],
    events:[
      {id:'assignment-501',course:'AB1234',type:'assignment',title:'Assignment 2',date:'2026-10-28',time:'23:59',submitted:true,detail:'Upload a PDF.',url:''},
      {id:'assignment-502',course:'AB1234',type:'quiz',title:'Quiz 2',date:'2026-11-30',time:'23:59',submitted:false,detail:'For entering marks only.',url:''},
      {id:'announcement-9',course:'CD5678',type:'announcement',title:'Welcome',date:'2026-08-10',time:'09:00',submitted:false,detail:'Hello class.',url:''},
    ],
    documents:[{id:'file-77',course:'AB1234',title:'Week 6 slides.pdf',kind:'pdf',url:'',modifiedAt:'2026-10-01T00:00:00Z',metadataVersion:'v1',text:'',status:'awaiting-pdf-reader'}]};
}

export const docText={schemaVersion:1,hash,metadataVersion:'v1',extractedAt:'2026-10-20T04:00:00.000Z',ocrRequiredPages:[],
  pages:[{page:1,text:'Week 6'},{page:2,text:'Quiz 2 will be held in class on 5 Nov 2026, 14:00 – 15:00.\nClosed book.'}]};

export function extraction({quote='Quiz 2 will be held in class on 5 Nov 2026, 14:00 – 15:00.',documentId='file-77',h=hash}={}){
  return {schemaVersion:1,documentId,hash:h,records:[{schemaVersion:1,id:'review-ab1234-quiz-2',courseId:null,course:'AB1234',type:'quiz',title:'Quiz 2',summary:'',
    timing:{date:'2026-11-05',time:'14:00',endAt:'2026-11-05T15:00:00+08:00',role:'start',precision:'minute',timezone:'Asia/Singapore'},
    requirements:{mode:'individual',submission:null,venue:null,weightPercent:null,rules:['Closed book.']},
    blocks:[{kind:'text',title:'课件说明',text:'Quiz 2 in class.'}],
    sources:[{id:'p2',kind:'pdf',title:'Week 6 slides.pdf',url:'',documentId,page:2,quote,hash:h}],
    review:{status:'source-backed',fieldEvidence:{title:['p2'],timing:['p2'],requirements:['p2']},conflicts:[]}}]};
}

export const nusmodsModule={moduleCode:'AB1234',title:'Example Algorithms',semesterData:[
  {semester:1,examDate:'2026-11-24T01:00:00.000Z',examDuration:120,timetable:[
    {classNo:'1',startTime:'0900',endTime:'1000',weeks:[1,2,3,4,5,6,7,8,9,10,11,12,13],day:'Thursday',lessonType:'Lecture',venue:'LT0'},
    {classNo:'2',startTime:'0900',endTime:'1000',weeks:[1,2,3],day:'Friday',lessonType:'Lecture',venue:'LT0'},
    {classNo:'03',startTime:'1400',endTime:'1600',weeks:[3,4,5,6,8,9,10],day:'Saturday',lessonType:'Tutorial',venue:'X1-01'}]},
  {semester:2,timetable:[]}]};
