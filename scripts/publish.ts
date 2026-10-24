// Seals .local/pack.json and uploads ONLY the ciphertext to your own secret Gist
// through your GitHub CLI login. The key and pairing link stay in .local/; the
// pairing QR opens as a local page for you to scan. Nothing secret is printed.
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import QRCode from 'qrcode';
import {newPackKey,pairingFragment,sealPack} from '../src/core/sealed.ts';
import {pairingPage} from '../src/pairingPage.ts';
// @ts-expect-error plain ESM helper without type declarations
import {findGh,ghLoggedIn} from '../lib/gh.mjs';
// @ts-expect-error plain ESM helper without type declarations
import {readJson,writeJsonAtomic,local} from '../lib/store.mjs';

const APP=process.env.NUS_STUDY_APP_URL||'https://woodyhouse.github.io/nus-study/',FILE='nus-study-pack.json';
const GH:string|null=findGh();
const gh=(args:string[],input?:string)=>{
  if(!GH)throw new Error('GitHub CLI (gh) is not installed. Install it, then run npm run github:login.');
  const r=spawnSync(GH,args,{input,encoding:'utf8',maxBuffer:64*1024*1024});
  if(r.error)throw new Error('GitHub CLI (gh) could not be started.');
  if(r.status!==0)throw new Error(`gh ${args.slice(0,3).join(' ')} failed: ${(r.stderr||'').split('\n')[0].slice(0,200)}`);
  return r.stdout;
};

const pack=readJson(local('pack.json'));
if(!pack)throw new Error('Run npm run pack first.');
if(!ghLoggedIn(GH))throw new Error('Not signed in to GitHub. Run npm run github:login; the student signs in in the window it opens.');
if(!existsSync(local('pack-key.txt')))writeFileSync(local('pack-key.txt'),newPackKey()+'\n',{mode:0o600});
const key=readFileSync(local('pack-key.txt'),'utf8').trim();
const content=JSON.stringify(await sealPack(pack,key));
writeFileSync(local(FILE),content,{mode:0o600});

let gist=readJson(local('gist.json'));
const body={description:'Due 了么 sealed pack (encrypted)',files:{[FILE]:{content}}};
if(gist?.id)gh(['api','-X','PATCH',`/gists/${gist.id}`,'--input','-'],JSON.stringify(body));
else{
  const created=JSON.parse(gh(['api','-X','POST','/gists','--input','-'],JSON.stringify({...body,public:false})));
  gist={id:created.id,owner:created.owner.login,createdAt:new Date().toISOString()};
}
const rawUrl=`https://gist.githubusercontent.com/${gist.owner}/${gist.id}/raw/${FILE}`;
writeJsonAtomic(local('gist.json'),{...gist,rawUrl,updatedAt:new Date().toISOString()});

// The raw URL is CDN-cached for up to ~5 minutes after an update.
const served=await fetch(rawUrl,{cache:'no-store'}).then(r=>r.ok?r.text():'').catch(()=>'');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const link=APP+pairingFragment({src:rawUrl,key});
writeFileSync(local('pairing-link.txt'),link+'\n',{mode:0o600});
const firstTime=!existsSync(local('pairing.html'))||process.argv.includes('--show-pairing');
writeFileSync(local('pairing.html'),pairingPage(link,await QRCode.toString(link,{type:'svg',margin:1,errorCorrectionLevel:'M'}),APP),{mode:0o600});
if(firstTime){
  const page=local('pairing.html');
  if(process.platform==='win32')spawnSync('cmd',['/c','start','',page]);else spawnSync(process.platform==='darwin'?'open':'xdg-open',[page]);
}
console.log(JSON.stringify({published:true,records:pack.records.length,updatedAt:pack.updatedAt,
  gistServesLatest:sha(served)===sha(content)?true:'cdn-cache-pending',pairingPageOpened:firstTime}));
