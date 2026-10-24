// Vendored from nus-canvas-mobile/src/pack/sealed.ts by scripts/vendor-core.mjs. Do not edit here.
import {z} from 'zod';
import {ReviewedPackSchema,type ReviewedPack} from './reviewed.ts';

// A sealed pack is a ReviewedPack encrypted with AES-256-GCM. The student's own
// agent seals it on their computer and uploads only ciphertext (for example to a
// secret Gist); the phone holds the key from a one-time pairing link. Hosting
// never sees the key, the Canvas token or plaintext course data.
const FORMAT='nus-study-sealed-pack',VERSION=1;
const AAD=new TextEncoder().encode(`${FORMAT}/v${VERSION}`);
const b64url=z.string().regex(/^[A-Za-z0-9_-]+$/);
export const MAX_SEALED_BYTES=6_000_000;
export const SealedPackSchema=z.strictObject({format:z.literal(FORMAT),version:z.literal(VERSION),alg:z.literal('A256GCM'),
  iv:b64url.length(16),ciphertext:b64url.max(MAX_SEALED_BYTES)});
export type SealedPack=z.infer<typeof SealedPackSchema>;
export type Pairing={src:string;key:string};

export function toBase64Url(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function fromBase64Url(value:string){const s=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(s,c=>c.charCodeAt(0));}
export function newPackKey(){return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));}

function sourceUrl(value:string){
  const url=new URL(value),local=url.hostname==='127.0.0.1'||url.hostname==='localhost';
  if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('数据包地址必须是 https 链接。');
  if(url.username||url.password)throw new Error('数据包地址不能包含账号信息。');
  return url.href;
}
// Accepts the full pairing link or just its fragment: #src=<url>&k=<key>.
export function parsePairing(text:string):Pairing{
  const trimmed=text.trim(),hash=trimmed.includes('#')?trimmed.slice(trimmed.indexOf('#')+1):trimmed;
  const params=new URLSearchParams(hash),src=params.get('src'),key=params.get('k');
  if(!src||!key)throw new Error('配对链接缺少数据包地址或密钥。');
  if(!/^[A-Za-z0-9_-]{43}$/.test(key))throw new Error('配对密钥格式无效。');
  return {src:sourceUrl(src),key};
}
export function pairingFragment(pairing:Pairing){return '#'+new URLSearchParams({src:sourceUrl(pairing.src),k:pairing.key}).toString();}

async function importKey(key:string,usage:'encrypt'|'decrypt'){
  const raw=fromBase64Url(key);if(raw.length!==32)throw new Error('配对密钥长度无效。');
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,[usage]);
}
export async function sealPack(input:unknown,key:string):Promise<SealedPack>{
  const pack=ReviewedPackSchema.parse(input),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new TextEncoder().encode(JSON.stringify(pack));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},await importKey(key,'encrypt'),data));
  return {format:FORMAT,version:VERSION,alg:'A256GCM',iv:toBase64Url(iv),ciphertext:toBase64Url(ciphertext)};
}
export async function openPack(input:unknown,key:string):Promise<ReviewedPack>{
  const sealed=SealedPackSchema.parse(input);let plain:ArrayBuffer;
  try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64Url(sealed.iv),additionalData:AAD},await importKey(key,'decrypt'),fromBase64Url(sealed.ciphertext));}
  catch{throw new Error('数据包无法解密：密钥不匹配或内容被改动。');}
  return ReviewedPackSchema.parse(JSON.parse(new TextDecoder().decode(plain)));
}
export async function fetchSealedPack(pairing:Pairing,fetcher:typeof fetch=fetch):Promise<ReviewedPack>{
  const response=await fetcher(sourceUrl(pairing.src),{cache:'no-store',credentials:'omit',redirect:'follow'});
  if(!response.ok)throw new Error(`数据包下载失败（HTTP ${response.status}）。`);
  const text=await response.text();if(text.length>MAX_SEALED_BYTES+512)throw new Error('数据包过大。');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new Error('数据包不是有效的 JSON。');}
  return openPack(body,pairing.key);
}
