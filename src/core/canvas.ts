// Vendored from nus-canvas-mobile/src/canvas.ts by scripts/vendor-core.mjs. Do not edit here.
import { assignment, plain, wall, type Course, type Event, type Snapshot, type SourceDocument, type SourceCoverage } from './domain.ts';
import {courseColor} from './due.ts';
import {attachSourceFileLinks,fileLinks} from './sourcePdfs.ts';
import {recordOf} from './records.ts';
const ORIGIN = 'https://canvas.nus.edu.sg';
export async function getAll(path: string, token: string, fetcher: typeof fetch = fetch): Promise<any[]> {
  let url: string|null = ORIGIN+'/api/v1'+path;
  const seen = new Set<string>(), rows:any[]=[];
  while(url) {
    const nextURL = new URL(url);
    if(nextURL.origin!==ORIGIN || !nextURL.pathname.startsWith('/api/v1/')) throw new Error('拒绝跨站 API 请求。');
    if(seen.has(url)) throw new Error('Canvas 分页循环，未更新快照。');
    seen.add(url);
    const response: Response = await fetcher(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.url && new URL(response.url).origin!==ORIGIN) throw new Error('Canvas 返回了跨站响应。');
    if(!response.ok) {const error:any = new Error(response.status===401?'Canvas token 无效或已到期，请重新连接。':response.status===429?'Canvas 查询过于频繁，请稍后重试。':`Canvas 接口暂不可用（${response.status}）。`);error.status=response.status;throw error;}
    const value = await response.json(); rows.push(...(Array.isArray(value)?value:[value]));
    url = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]??null;
  }
  return rows;
}
export async function verifyToken(token:string) {
  if(!token.trim() || /\s/.test(token) || token.length>4096) throw new Error('请输入有效的 Canvas token。');
  const rows = await getAll('/users/self/profile',token);
  if(!rows[0]?.id) throw new Error('Canvas 身份验证失败。');
  return String(rows[0].id);
}
function fileDocument(courseId:number,course:string,file:any):SourceDocument{
  const locked=!!(file.locked_for_user||file.hidden_for_user);
  const pdf=file['content-type']==='application/pdf'||/\.pdf$/i.test(file.display_name||file.filename||'');
  return {id:`file-${file.id}`,course,title:file.display_name||file.filename||'文件',kind:pdf?'pdf':'file',url:`${ORIGIN}/courses/${courseId}/files/${file.id}`,modifiedAt:file.updated_at||file.modified_at||null,
    metadataVersion:`${file.updated_at||''}:${file.modified_at||''}:${file.size??''}:${locked}`,text:'',status:locked?'locked':pdf?'awaiting-pdf-reader':'index-only'};
}
export async function synchronize(token:string, progress:(message:string)=>void, fetcher:typeof fetch=fetch):Promise<Snapshot> {
  const query=(path:string)=>getAll(path,token,fetcher);
  const raw = (await query('/courses?enrollment_state=active&include[]=syllabus_body&per_page=100')).filter(c=>c.workflow_state==='available');
  const courses:Course[]=raw.map(c=>{const code=String(c.course_code||c.id).match(/\b[A-Z]{2,}\d{4}[A-Z]?\b/)?.[0]||String(c.course_code||c.id);return {id:c.id,code,name:c.name||c.course_code,color:courseColor(code)};});
  const events:Event[]=[], unavailable:string[]=[], documents:SourceDocument[]=[],coverage:SourceCoverage[]=[];
  const checked=(course:string,section:string,count:number|null,available=true)=>coverage.push({course,section,count,available,checkedAt:new Date().toISOString()});
  for(const c of courses) {
    progress('正在同步 '+c.code);
    // Files the Files tab may hide (module items, links in announcements,
    // descriptions, the syllabus and pages) are fetched one by one below.
    const linked=new Map<string,string>(),pages=new Set<string>();
    const work=await query(`/courses/${c.id}/assignments?include[]=submission&per_page=100`);
    checked(c.code,'Assignments',work.length);
    events.push(...work.map(a=>assignment(c.code,a)));
    const original=raw.find(r=>r.id===c.id);
    if(Object.hasOwn(original,'syllabus_body')) {
      const text=plain(original.syllabus_body);
      checked(c.code,'课程说明',text?1:0);
      if(text) documents.push({id:`syllabus-${c.id}`,course:c.code,title:'课程说明',kind:'syllabus',url:`${ORIGIN}/courses/${c.id}/assignments/syllabus`,modifiedAt:null,metadataVersion:text,text,status:'awaiting-analysis'});
    } else {checked(c.code,'课程说明',null,false);unavailable.push(c.code+' / 课程说明');}
    for(const [section,path] of [
      ['Quiz',`/courses/${c.id}/quizzes?per_page=100`],
      ['公告',`/announcements?context_codes[]=course_${c.id}&start_date=2000-01-01&end_date=${new Date(Date.now()+86400000).toISOString().slice(0,10)}&per_page=100`],
      ['日历',`/calendar_events?context_codes[]=course_${c.id}&all_events=true&per_page=100`],
      ['Files',`/courses/${c.id}/files?sort=updated_at&order=desc&per_page=100`],
      ['Modules',`/courses/${c.id}/modules?per_page=100`],
    ]) {
      try {
        progress('正在同步 '+c.code+' / '+section);
        const list=await query(path);
        if(section==='Quiz') list.filter(q=>!q.assignment_id).forEach(q=>events.push(attachSourceFileLinks({id:`quiz-${q.id}`,course:c.code,type:'quiz',title:q.title||'Quiz',...wall(q.due_at),submitted:false,detail:`${plain(q.description)}\n时限：${q.time_limit??'未公布'} 分钟\n来源：Canvas Quiz ${q.id}`,url:q.html_url||''},q.description)));
        if(section==='公告') list.forEach(a=>events.push(attachSourceFileLinks({id:`announcement-${a.id}`,course:c.code,type:'announcement',title:a.title||'公告',...wall(a.posted_at),submitted:false,detail:plain(a.message)+'\n来源：Canvas 公告。正文中的考试日期需要进一步核验。',url:a.html_url||''},a.message)));
        if(section==='日历') list.filter(a=>a.start_at&&!a.assignment).forEach(a=>events.push({id:`calendar-${a.id}`,course:c.code,type:'academic',title:a.title||'日历事项',...wall(a.start_at),submitted:false,detail:plain(a.description)+'\n来源：Canvas Calendar',url:a.html_url||''}));
        if(section==='Files') for(const file of list) documents.push(fileDocument(c.id,c.code,file));
        if(section==='Modules') for(const module of list) {
          // Do not rely on include[]=items: Canvas may omit embedded large lists.
          const items=await query(`/courses/${c.id}/modules/${module.id}/items?per_page=100`);
          for(const i of items){if(i.type==='File'&&i.content_id)linked.set(String(i.content_id),i.title||'Canvas 文件');if(i.type==='Page'&&i.page_url)pages.add(String(i.page_url));}
          documents.push({id:`module-${module.id}`,course:c.code,title:module.name||'Module',kind:'module',url:`${ORIGIN}/courses/${c.id}/modules/${module.id}`,modifiedAt:null,metadataVersion:items.map(i=>`${i.id}:${i.title}:${i.type}:${i.content_id??''}:${i.page_url??''}`).join('|'),
            text:items.map(i=>`${i.title||'未命名'} · ${i.type||'项目'}`).join('\n'),status:'index-only'});
        }
        checked(c.code,section,list.length);
      } catch(error:any) { if([403,404].includes(error.status)) {unavailable.push(c.code+' / '+section);checked(c.code,section,null,false);for(let i=documents.length-1;i>=0;i--)if(documents[i].course===c.code&&section==='Modules'&&documents[i].kind==='module')documents.splice(i,1);} else throw error; }
    }
    for(const url of pages){
      try{
        const [page]=await query(`/courses/${c.id}/pages/${encodeURIComponent(url)}`);
        const text=plain(page?.body);
        for(const f of fileLinks(page?.body))if(!linked.has(f.id))linked.set(f.id,f.title);
        if(page&&!page.locked_for_user&&text)documents.push({id:`page-${c.id}-${page.page_id??url}`,course:c.code,title:page.title||url,kind:'page',url:`${ORIGIN}/courses/${c.id}/pages/${encodeURIComponent(url)}`,modifiedAt:page.updated_at||null,metadataVersion:`${page.updated_at||''}:${text.length}`,text,status:'awaiting-analysis'});
      }catch(error:any){if(![403,404].includes(error.status))throw error;}
    }
    for(const f of fileLinks(original.syllabus_body))if(!linked.has(f.id))linked.set(f.id,f.title);
    for(const e of events)if(e.course===c.code)for(const s of recordOf(e).sources)if(/^file-\d+$/.test(s.documentId||'')&&!linked.has(s.documentId!.slice(5)))linked.set(s.documentId!.slice(5),s.title);
    const known=new Set(documents.map(d=>d.id));
    for(const [id,title] of linked){
      if(known.has('file-'+id))continue;
      try{const [file]=await query(`/courses/${c.id}/files/${id}`);documents.push(fileDocument(c.id,c.code,file));}
      catch(error:any){if([401,429].includes(error.status))throw error;
        documents.push({id:`file-${id}`,course:c.code,title,kind:/\.pdf\b/i.test(title)?'pdf':'file',url:`${ORIGIN}/courses/${c.id}/files/${id}`,modifiedAt:null,metadataVersion:'unavailable',text:'',status:'locked'});}
    }
    checked(c.code,'Linked files',linked.size);
  }
  return {demo:false,updatedAt:new Date().toISOString(),courses,events,unavailable,documents,coverage};
}
