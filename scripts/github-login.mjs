// Opens a visible terminal where the student signs in to GitHub (browser + one-time
// code). The agent only reads .local/github-status.json; it never sees the code.
import {spawnSync} from 'node:child_process';
import {stdin,stdout} from 'node:process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,local,writeJsonAtomic} from '../lib/store.mjs';
import {findGh,ghLoggedIn} from '../lib/gh.mjs';
import {launchNativeTerminal} from './native-terminal.mjs';
const note=(status,details={})=>writeJsonAtomic(local('github-status.json'),{status,...details,checkedAt:new Date().toISOString()});

async function pause(){
  if(!stdin.isTTY)return;
  stdout.write('\nPress Enter to close this window.');
  stdin.setRawMode?.(true);stdin.resume();await new Promise(done=>stdin.once('data',done));
}

if(process.argv.includes('--worker')){
  const gh=findGh();
  if(!gh){note('gh-missing');console.error('GitHub CLI is not installed. Ask your agent to install it, then run this again.');}
  else{
    console.log('NUS Study — GitHub sign-in\nA browser opens: sign in and enter the one-time code shown here. Never paste it into chat.\n');
    spawnSync(gh,['auth','login','--hostname','github.com','--git-protocol','https','--web','--scopes','gist'],{stdio:'inherit'});
    if(ghLoggedIn(gh)){note('logged-in');console.log('\nSigned in. Go back to your agent.');}
    else{note('failed');console.error('\nSign-in did not complete. Ask your agent to open this window again.');}
  }
  await pause();
}else{
  const gh=findGh();
  if(!gh){note('gh-missing');console.error('GitHub CLI (gh) not found. Install it first (winget install --id GitHub.cli -e / brew install gh).');process.exitCode=1;}
  else if(ghLoggedIn(gh)){note('logged-in',{reused:true});console.log(JSON.stringify({status:'logged-in'}));}
  else if(launchNativeTerminal(fileURLToPath(import.meta.url),root,['--worker'])){note('waiting-login');console.log(JSON.stringify({status:'waiting-login',note:'Sign-in window opened. Poll .local/github-status.json.'}));}
  else{note('launch-failed');console.error('Could not open a window. Ask the student to run in their own terminal: node scripts/github-login.mjs --worker');process.exitCode=1;}
}
