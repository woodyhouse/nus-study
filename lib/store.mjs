// Local, encrypted credential and file storage. Personal Canvas tokens are
// stored with AES-256-GCM under a random key in .env.local; nothing personal
// leaves .local/ except the sealed pack that publish uploads.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

export const root=fileURLToPath(new URL('../',import.meta.url));
export const local=(...parts)=>resolve(root,'.local',...parts);
export const ORIGIN='https://canvas.nus.edu.sg';

export function environment(){
  const env=resolve(root,'.env.local');
  if(existsSync(env))process.loadEnvFile(env);
  const key=process.env.NUS_STUDY_STORE_KEY||'';
  if(!/^[a-f0-9]{64}$/i.test(key))throw new Error('Run npm run setup first.');
  return {base:ORIGIN,key:Buffer.from(key,'hex')};
}
export function writeJsonAtomic(path,value){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});
  renameSync(path+'.tmp',path);
}
export function readJson(path,fallback=null){return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):fallback;}
// Status receipts are the only thing an agent should read about credentials.
export function note(status,details={}){writeJsonAtomic(local('token-status.json'),{status,...details,checkedAt:new Date().toISOString(),pid:process.pid});}

export function saveToken(config,token){
  mkdirSync(local(),{recursive:true,mode:0o700});
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',config.key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify({kind:'personal',access_token:token,origin:config.base})),cipher.final()]);
  writeFileSync(local('token.enc'),JSON.stringify({iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')}),{mode:0o600});
}
export function hasToken(){return existsSync(local('token.enc'));}
export function readToken(config){
  const saved=JSON.parse(readFileSync(local('token.enc'),'utf8'));
  const decipher=createDecipheriv('aes-256-gcm',config.key,Buffer.from(saved.iv,'hex'));
  decipher.setAuthTag(Buffer.from(saved.tag,'hex'));
  const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data,'hex')),decipher.final()]).toString());
  if(value.origin!==config.base)throw new Error('Canvas origin changed; connect again.');
  return value.access_token;
}
// Verifies a candidate token with one read-only request before it is stored.
export async function storePersonalToken(config,input,fetcher=fetch){
  const token=input.trim();
  if(!token||token.length>4096||/\s/.test(token))throw new Error('Invalid token input.');
  const r=await fetcher(config.base+'/api/v1/users/self/profile',{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`Canvas did not accept the token (HTTP ${r.status}).`);
  if(!(await r.json()).id)throw new Error('Canvas profile verification failed.');
  saveToken(config,token);
}
