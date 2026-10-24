// Vendored from nus-canvas-mobile/src/grades.ts by scripts/vendor-core.mjs. Do not edit here.
import {z} from 'zod';
import type {Course,Snapshot} from './domain.ts';

export const GRADE_POINTS={ 'A+':5,A:5,'A-':4.5,'B+':4,B:3.5,'B-':3,'C+':2.5,C:2,'D+':1.5,D:1,F:0 } as const;
export type LetterGrade=keyof typeof GRADE_POINTS;
export const LETTERS=Object.keys(GRADE_POINTS) as LetterGrade[];
export const GRADING_SOURCE='https://nus.edu.sg/registrar/academic-information-policies/graduate/academic-structure-grading';
const source=z.strictObject({title:z.string(),page:z.number().int().positive(),quote:z.string(),url:z.string().refine(v=>!v||/^https:\/\/canvas\.nus\.edu\.sg\/courses\/\d+\/files(?:\/\d+)?$/.test(v))});
export const AssessmentPlanSchema=z.strictObject({course:z.string(),source,items:z.array(z.strictObject({id:z.string(),label:z.string(),weight:z.number().min(0).max(100),parts:z.array(z.strictObject({id:z.string(),label:z.string()})).min(1).max(100).optional()})).max(100)});
export type AssessmentPlan=z.infer<typeof AssessmentPlanSchema>;
const short=z.string().max(120),numberInput=z.string().max(24);
export const GradeCourseSchema=z.strictObject({code:short,units:numberInput,included:z.boolean(),edited:z.boolean(),source:source.nullable(),
  items:z.array(z.strictObject({id:short,label:short,weight:numberInput,score:numberInput,max:numberInput,
    mode:z.enum(['parts','total']).optional(),parts:z.array(z.strictObject({id:short,label:short,score:numberInput,max:numberInput,share:numberInput})).min(1).max(100).optional()})).max(100),
  thresholds:z.array(z.strictObject({grade:z.enum(LETTERS as [LetterGrade,...LetterGrade[]]),min:numberInput})).length(11),
  letter:z.enum(['auto',...LETTERS] as ['auto',...LetterGrade[]])});
export type GradeCourse=z.infer<typeof GradeCourseSchema>;
export const GradeScenarioSchema=z.strictObject({schemaVersion:z.literal(1),courses:z.record(z.string(),GradeCourseSchema)});
export type GradeScenario=z.infer<typeof GradeScenarioSchema>;
export function exampleThresholds(){return LETTERS.map((grade,i)=>({grade,min:String([90,85,80,75,70,65,60,55,50,40,0][i])}));}
export function inputNumber(input:string){const trimmed=input.trim();return /^\d+(?:\.\d*)?$|^\.\d+$/.test(trimmed)&&Number.isFinite(Number(trimmed))?Number(trimmed):null;}
export function seedGradeCourse(course:Course,plan?:AssessmentPlan,demo=false):GradeCourse{
  const items:AssessmentPlan['items']=plan?.items||(demo?course.code==='DEMO202'?[{id:'quizzes',label:'Quiz',weight:30,parts:[{id:'q1',label:'Quiz 1'},{id:'q2',label:'Quiz 2'},{id:'q3',label:'Quiz 3'}]},{id:'project',label:'Project',weight:30},{id:'final',label:'Final',weight:40}]:[{id:'assignment',label:'Assignment',weight:30},{id:'midterm',label:'Midterm',weight:20},{id:'final',label:'Final',weight:50}]:[]);
  return {code:course.code,units:'4',included:true,edited:false,source:plan?.source||null,items:items.map(({parts,...item})=>({...item,weight:String(item.weight),score:'',max:'100',...(parts?{mode:'parts' as const,parts:parts.map(part=>({...part,score:'',max:'100',share:'1'}))}:{})})),thresholds:exampleThresholds(),letter:'auto'};
}
export function mergeGradeScenario(saved:GradeScenario|null,snapshot:Snapshot):GradeScenario{
  const courses={...(saved?.courses||{})};
  for(const course of snapshot.courses){const plan=snapshot.reviewed?.assessmentPlans?.find(p=>p.course===course.code),prior=courses[String(course.id)];
    if(!prior||(!prior.edited&&plan&&!prior.source))courses[String(course.id)]=seedGradeCourse(course,plan,snapshot.demo);
    else if(plan?.items.some(item=>item.parts?.length))courses[String(course.id)]={...prior,items:prior.items.map(item=>{
      const parts=plan.items.find(p=>p.id===item.id)?.parts;
      return parts&&!item.parts?{...item,mode:item.score.trim()?'total' as const:'parts' as const,parts:parts.map(part=>({...part,score:'',max:'100',share:'1'}))}:item;
    })};
  }
  return {schemaVersion:1,courses};
}
export function gradeStorageKey(snapshot:Pick<Snapshot,'accountKey'|'demo'>){return snapshot.demo?'nus-grade-simulation-v1-demo':snapshot.accountKey&&/^[a-f0-9]{64}$/.test(snapshot.accountKey)?'nus-grade-simulation-v1-'+snapshot.accountKey:null;}
export function thresholdError(thresholds:GradeCourse['thresholds']){
  if(thresholds.length!==11)return '需要完整的等级分数线';
  let previous=101;
  for(let i=0;i<LETTERS.length;i++){const row=thresholds[i],n=inputNumber(row?.min||'');if(row?.grade!==LETTERS[i]||n===null||n<0||n>100||n>=previous)return '分数线须按 A+ 到 F 严格递减，范围 0–100';previous=n;}
  return previous===0?null:'F 的最低分须为 0';
}
export function calculateGrade(plan:GradeCourse){
  const errors:string[]=[];let weightSum=0,knownWeight=0,earned=0;
  if(!plan.items.length)errors.push('请添加评分项和占比');
  for(const item of plan.items){const w=inputNumber(item.weight),score=inputNumber(item.score),max=inputNumber(item.max);
    if(w===null||w>100){errors.push(`${item.label}：占比须在 0–100%`);continue;}weightSum+=w;
    if(item.parts&&item.mode!=='total'){
      const shares=item.parts.map(part=>inputNumber(part.share));
      if(shares.some(share=>share===null||share<=0)){errors.push(`${item.label}：比例须大于 0`);continue;}
      const sum=shares.reduce<number>((sum,share)=>sum+share!,0);
      for(let i=0;i<item.parts.length;i++){
        const part=item.parts[i],value=inputNumber(part.score),outOf=inputNumber(part.max),partWeight=w*shares[i]!/sum;
        if(outOf===null||outOf<=0){errors.push(`${part.label}：满分须大于 0`);continue;}
        if(part.score.trim()&&(value===null||value>outOf)){errors.push(`${part.label}：得分须在 0–${outOf}`);continue;}
        if(value!==null){earned+=value/outOf*partWeight;knownWeight+=partWeight;}
      }
      continue;
    }
    if(max===null||max<=0){errors.push(`${item.label}：满分须大于 0`);continue;}
    if(item.score.trim()&&(score===null||score>max)){errors.push(`${item.label}：得分须在 0–${max}`);continue;}
    if(score!==null){earned+=score/max*w;knownWeight+=w;}
  }
  if(plan.items.length&&Math.abs(weightSum-100)>1e-6)errors.push(`占比合计 ${Number(weightSum.toFixed(2))}%，需为 100%`);
  const valid=errors.length===0,complete=valid&&Math.abs(knownWeight-100)<1e-6;
  const total=complete?earned:null,ruleError=thresholdError(plan.thresholds);
  const letter:LetterGrade|null=plan.letter!=='auto'?plan.letter:total!==null&&!ruleError?plan.thresholds.find(row=>total+1e-9>=Number(row.min))?.grade||null:null;
  const units=inputNumber(plan.units),unitsValid=units!==null&&units>0&&units<=100;
  return {errors,ruleError,weightSum,knownWeight,earned,total,complete,letter,points:letter?GRADE_POINTS[letter]:null,units:unitsValid?units:null,
    range:valid?[earned,earned+100-knownWeight] as [number,number]:null};
}
export function semesterGrade(plans:GradeCourse[]){
  const included=plans.filter(p=>p.included),ready=included.map(calculateGrade).filter(r=>r.points!==null&&r.units!==null);
  const units=ready.reduce((sum,r)=>sum+r.units!,0),weighted=ready.reduce((sum,r)=>sum+r.units!*r.points!,0);
  const partial=units>0?weighted/units:null;
  return {gpa:included.length>0&&ready.length===included.length?partial:null,partial,ready:ready.length,count:included.length,units};
}
