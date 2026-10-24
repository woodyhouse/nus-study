// Fallback: paste an existing Canvas token into a hidden prompt in YOUR OWN
// terminal. Never paste a token into chat or an agent tool.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {stdin,stdout} from 'node:process';
import {environment,storePersonalToken,note} from '../lib/store.mjs';

export function hiddenInput(input=stdin,output=stdout){
  if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')throw new Error('A real local terminal is required. Do not enter tokens into an agent tool console.');
  return new Promise((done,reject)=>{
    let value='',settled=false;const wasRaw=input.isRaw;
    const end=error=>{if(settled)return;settled=true;input.off('data',onData);input.off('end',onEnd);input.setRawMode(!!wasRaw);input.pause();output.write('\n');if(error)reject(error);else done(value);value='';};
    const onEnd=()=>end(new Error('Input closed.'));
    const onData=chunk=>{
      // Strip bracketed-paste wrappers without echoing the clipboard contents.
      for(const char of chunk.toString('utf8').replace(/\x1b\[20[01]~/g,'')){
        if(settled)break;
        if(char==='\x03'||char==='\x04'){end(new Error('Cancelled.'));break;}
        if(char==='\r'||char==='\n'){if(value.trim())end();continue;}
        if(char==='\x7f'||char==='\b'){value=value.slice(0,-1);continue;}
        if(char.charCodeAt(0)>=32&&char.charCodeAt(0)<=126)value+=char;
        if(value.length>4096)end(new Error('Input too long.'));
      }
    };
    input.setRawMode(true);input.resume();input.on('data',onData);input.on('end',onEnd);
  });
}

async function main(){
  try{
    const config=environment();
    console.log('Due 了么 — personal Canvas token\nThe token is hidden, verified with one read-only request, and stored encrypted on this computer only.\n');
    console.log('Create one at: '+config.base+'/profile/settings (New access token)');
    note('waiting');stdout.write('Paste your token, then press Enter (input hidden): ');
    let token=await hiddenInput();
    await storePersonalToken(config,token);token='';
    note('verified');console.log('Token verified and stored. Go back to your agent; it can continue now.');
  }catch{note('failed',{stage:'token'});console.error('Cancelled or verification failed. Existing credentials were kept. Nothing was logged.');process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))await main();
