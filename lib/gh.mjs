// Locates the GitHub CLI. A fresh install is often not on PATH in an already
// open terminal, so common install locations are checked as well.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
export function findGh(){
  if(spawnSync('gh',['--version'],{encoding:'utf8'}).status===0)return 'gh';
  const candidates=process.platform==='win32'
    ?[join(process.env.ProgramFiles||'C:\Program Files','GitHub CLI','gh.exe'),join(process.env.LOCALAPPDATA||'','Programs','GitHub CLI','gh.exe')]
    :['/opt/homebrew/bin/gh','/usr/local/bin/gh','/usr/bin/gh',join('/home','linuxbrew','.linuxbrew','bin','gh')];
  return candidates.find(p=>p&&existsSync(p))||null;
}
export function ghLoggedIn(gh){return !!gh&&spawnSync(gh,['auth','status','--hostname','github.com'],{encoding:'utf8'}).status===0;}
