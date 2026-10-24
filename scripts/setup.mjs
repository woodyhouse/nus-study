import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {root,local} from '../lib/store.mjs';
mkdirSync(local(),{recursive:true,mode:0o700});
const env=resolve(root,'.env.local');
if(!existsSync(env))writeFileSync(env,`NUS_STUDY_STORE_KEY=${randomBytes(32).toString('hex')}\n`,{mode:0o600});
console.log('Setup ready. Personal data stays in .local/ and .env.local (both git-ignored).');
