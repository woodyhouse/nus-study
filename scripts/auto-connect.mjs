// Standalone Canvas token setup. Opens a visible terminal and browser: YOU log in
// (with MFA) and type YES to create the token; the script verifies and encrypts
// it locally. The agent only reads .local/token-status.json.
import {stdin,stdout} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,environment,note,hasToken,storePersonalToken} from '../lib/store.mjs';
import {launchNativeTerminal} from './native-terminal.mjs';
import {prepareTokenDialog} from './token-browser.mjs';

// No agent snapshots, clipboard, browser storage export, tracing or token logs.
export async function generateAndStore(page,config,prepared,confirm,store=storePersonalToken){
  if(prepared.status!=='awaiting-confirmation')throw new Error('Form is not ready.');
  if(await page.url()!==config.base+'/profile/settings')throw new Error('Canvas origin changed.');
  if(!(await confirm(prepared)))return false;
  // One attempt only. Never retry generation after an uncertain result.
  if(await page.url()!==config.base+'/profile/settings')throw new Error('Canvas origin changed.');
  await page.getByRole('button',{name:'Generate token',exact:true}).click();
  const tokenField=page.getByTestId('visible_token');
  await tokenField.waitFor({state:'visible',timeout:30000});
  if(await page.url()!==config.base+'/profile/settings')throw new Error('Canvas origin changed.');
  let value=(await tokenField.textContent())?.trim()||'';
  try{await store(config,value);}finally{value='';}
  return true;
}

// Short, non-secret failure reason for the agent (no URLs with query strings).
const reason=error=>`${error?.name||'Error'}: ${String(error?.message||error).split('\n')[0].replace(/\?\S*/g,'?…')}`.slice(0,160);
async function pause(){
  if(!stdin.isTTY)return;
  stdout.write('\nPress Enter to close this window.');stdin.setRawMode?.(true);stdin.resume();
  await new Promise(done=>stdin.once('data',done));
}

// Before opening any window: make sure Chromium is installed and really starts.
async function ensureBrowser(){
  const {chromium}=await import('playwright');
  const install=force=>execFileSync(process.execPath,[resolve(root,'node_modules/playwright/cli.js'),'install',...(force?['--force']:[]),'chromium'],{stdio:'inherit'});
  const works=async()=>{try{const b=await chromium.launch({headless:true});await b.close();return true;}catch{return false;}};
  if(!existsSync(chromium.executablePath())){console.log('Installing Chromium for the Canvas login window (one time)…');install(false);}
  if(await works())return;
  console.log('Chromium did not start; reinstalling it once…');install(true);
  if(!(await works()))throw new Error('Chromium still does not start after reinstalling.');
}

async function worker(){
  if(!stdin.isTTY||!stdout.isTTY)throw new Error('Use a real local terminal.');
  process.env.DEBUG='';process.env.PWDEBUG='0';
  const input=createInterface({input:stdin,output:stdout});
  let browser,phase='browser';
  try{
    const config=environment();
    if(hasToken()&&!process.argv.includes('--replace')){
      note('verified',{reused:true});console.log('A saved token already exists; nothing to do. Use --replace only to create a new one.');return;
    }
    const {chromium}=await import('playwright');
    browser=await chromium.launch({headless:false});
    const page=await (await browser.newContext({locale:'en-GB',timezoneId:'Asia/Singapore'})).newPage();
    note('waiting-login');await page.goto(config.base+'/profile/settings');
    console.log('Log in to Canvas (and MFA) in the browser window. Cookies are not saved or exported.');
    await page.waitForURL(url=>url.origin===config.base&&!/^\/login(?:\/|$)/.test(url.pathname),{timeout:15*60*1000});
    await page.goto(config.base+'/profile/settings');
    await page.getByRole('link',{name:'New access token',exact:true}).waitFor({state:'visible',timeout:30000});
    const prepared=await prepareTokenDialog(page,{base:config.base});
    phase='token';note('awaiting-confirmation',{purpose:prepared.purpose,expiresAt:prepared.expiresAt});
    const accepted=await generateAndStore(page,config,prepared,async details=>{
      console.log(`\nCanvas: ${config.base}\nPurpose: ${details.purpose}\nExpires: ${details.expiresAt}`);
      console.log('Canvas tokens can carry more than read access; Due 了么 only sends read-only GET requests.');
      console.log('Create a NEW token and store it encrypted on this computer? Type YES to confirm.');
      return (await input.question('Confirmation: ')).trim()==='YES';
    });
    if(!accepted){note('cancelled');console.log('Cancelled. No token was created.');return;}
    note('verified');console.log('Token verified and encrypted locally. Nothing was printed or copied. Go back to your agent.');
  }catch(error){
    note('failed',{stage:phase,reason:reason(error)});
    console.error('\n'+reason(error));
    console.error(phase==='browser'?'Browser or login failed. Run npm run canvas:browser:install, then retry.':'Token creation did not complete. Do not create another automatically; check Canvas settings for an unused token. Saved credentials were kept.');
    process.exitCode=1;
  }finally{input.close();if(browser)await browser.close().catch(()=>{});}
  // Keep the window open so the student can see what happened.
  if(process.exitCode)await pause();
}

async function main(){
  if(process.argv.includes('--worker'))return worker();
  execFileSync(process.execPath,[resolve(root,'scripts/setup.mjs')],{cwd:root,stdio:'ignore'});
  if(!hasToken()||process.argv.includes('--replace')){
    try{await ensureBrowser();}catch(error){note('failed',{stage:'browser-preflight',reason:reason(error)});console.error(reason(error));process.exitCode=1;return;}
  }
  note('launching');
  if(!launchNativeTerminal(fileURLToPath(import.meta.url),root,['--worker',...(process.argv.includes('--replace')?['--replace']:[])])){
    note('launch-failed');
    console.error('Open your own terminal here and run: node scripts/auto-connect.mjs --worker');
    process.exitCode=1;
  }else console.log('Setup window opened. Login and confirmation happen there. Agent: read only .local/token-status.json.');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
