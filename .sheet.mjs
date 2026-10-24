import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
const m='C:/Users/cookie/Documents/ChatGPT/NUS/nus-canvas-mobile/';
const img=(f,w,style='')=>`<figure><img src="data:image/png;base64,${readFileSync(m+f).toString('base64')}" width="${w}" style="${style}"><figcaption>${f.split('/').pop()}</figcaption></figure>`;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:900,height:300}});
await p.setContent(`<style>body{display:flex;gap:14px;align-items:end;font:11px sans-serif;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;padding:10px}figure{margin:0;text-align:center}</style>
${img('public/apple-touch-icon.png',150,'border-radius:34px')}${img('public/icon-maskable-512.png',150,'border-radius:50%')}${img('assets/android-icon-foreground.png',150)}${img('assets/android-icon-monochrome.png',150,'background:#333')}${img('assets/brand/due-stamp-dark.png',150,'border-radius:34px')}${img('assets/favicon.png',48)}`);
await p.screenshot({path:m+'.local/icon-sheet.png'});await b.close();
