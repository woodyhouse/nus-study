// Fails if tracked files contain personal state or secrets. Run before every push.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const unsafe=files.filter(p=>/(^|\/)(\.local|node_modules)(\/|$)|(^|\/)\.env(?!\.example$)|\.(pdf|enc)$/i.test(p));
const markers=[
  /\be\d{7}@u\.nus\.edu\b/i,/\bA\d{7}[A-Z]\b/,            // NUS email / student ID
  /\b\d{4,}~[A-Za-z0-9]{40,}/,/gh[pousr]_[A-Za-z0-9]{30,}/, // Canvas / GitHub tokens
  /[#&]k=[A-Za-z0-9_-]{43}\b/,                             // pairing key
  /gist\.githubusercontent\.com\/[^/\s]+\/[0-9a-f]{32}/,   // a real Gist ID
  /[A-Za-z]:[\\/]Users[\\/][^\\/\s]+|(?<![\w.])\/(?:Users|home)\/[^/\s]+\//, // local home paths
];
for(const path of files){
  if(path==='scripts/privacy-check.mjs'||/\.(png|jpg|ico|woff2?)$/.test(path))continue;
  const text=readFileSync(path,'utf8');
  if(markers.some(rx=>rx.test(text)))unsafe.push(path);
}
if(unsafe.length){console.error('Privacy check failed in:',[...new Set(unsafe)].join(', '));process.exitCode=1;}
else console.log(`Privacy check passed for ${files.length} tracked files.`);
