// Vendored from nus-canvas-mobile/src/pdf/download.ts by scripts/vendor-core.mjs. Do not edit here.
import {getAll} from './canvas.ts';
import type {SourceDocument} from './domain.ts';
const LIMIT=25*1024*1024;
export async function downloadPdf(doc:SourceDocument,token:string,fetcher:typeof fetch=fetch):Promise<Uint8Array<ArrayBuffer>>{
  if(doc.kind!=='pdf'||doc.status==='locked'||!/^file-\d+$/.test(doc.id))throw new Error('此材料无法作为 PDF 下载。');
  const [file]=await getAll('/files/'+doc.id.slice(5),token,fetcher);
  if(file?.locked_for_user||file?.hidden_for_user)throw new Error('Canvas 已限制此文件的访问。');
  const url=new URL(file?.url||'');
  // Signed URLs are used in memory only. Never send the Canvas bearer to a CDN.
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='canvas.nus.edu.sg'||url.hostname.endsWith('.instructureusercontent.com')))throw new Error('未支持的文件下载域名，未发送凭据。');
  const response=await fetcher(url.href,{signal:AbortSignal.timeout(60000)});
  if(response.url&&new URL(response.url).protocol!=='https:')throw new Error('下载连接不安全，未解析。');
  if(!response.ok)throw new Error('PDF 下载失败，请重试。');
  if(Number(response.headers.get('content-length'))>LIMIT)throw new Error('PDF 超过 25 MB，请使用较小文件。');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>LIMIT)throw new Error('PDF 超过 25 MB，请使用较小文件。');
  if(!String.fromCharCode(...bytes.subarray(0,1024)).includes('%PDF-'))throw new Error('下载内容不是 PDF，未解析。');
  return bytes;
}
export function base64(bytes:Uint8Array):string{
  // No browser-only btoa/Buffer dependency in Hermes; bounded chunks avoid
  // constructing an additional full-size binary string on the phone.
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',chunks:string[]=[];
  let value='';
  for(let n=0;n<bytes.length;n+=3){const a=bytes[n],b=bytes[n+1]||0,c=bytes[n+2]||0;value+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(n+1<bytes.length?alphabet[((b&15)<<2)|(c>>6)]:'=')+(n+2<bytes.length?alphabet[c&63]:'=');if(value.length>=65536){chunks.push(value);value='';}}
  return chunks.join('')+value;
}
