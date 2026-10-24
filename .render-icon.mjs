import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
const [svgPath,out,size,round]=process.argv.slice(2);
const svg=readFileSync(svgPath,'utf8');
const b=await chromium.launch();const p=await b.newPage({viewport:{width:+size,height:+size}});
await p.setContent(`<html><body style="margin:0;background:transparent">${round==='round'?`<div style="width:${size}px;height:${size}px;border-radius:${size*0.2237}px;overflow:hidden">`:'<div>'}${svg.replace('<svg ',`<svg width="${size}" height="${size}" `)}</div></body></html>`);
await p.screenshot({path:out,omitBackground:true});await b.close();
