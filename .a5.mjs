import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const FONT=`-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:800,height:400},deviceScaleFactor:2});
// Measure the real text box, then size the frame around it: no overlap by construction.
await p.setContent(`<svg id="m" viewBox="0 0 100 100" width="100" height="100"><text id="t" x="0" y="0" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="1">DUE?</text></svg>`);
const box=await p.evaluate(()=>{const r=document.getElementById('t').getBBox();return {x:r.x,y:r.y,w:r.width,h:r.height};});
// letter-spacing adds trailing space after "?": trim it so the text is optically centred.
const w=box.w-1,cap=22*0.72; // cap height of the bold face
const stamp=(scale,padX,padY,stroke,tilt=-10,lift=0,nudge=0)=>{
  const fw=w+padX*2,fh=cap+padY*2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F4EFE6"/>
<g transform="translate(50 ${50-lift}) rotate(${tilt}) scale(${scale})"><rect x="${-fw/2}" y="${-fh/2}" width="${fw}" height="${fh}" rx="6" fill="none" stroke="#C0392B" stroke-width="${stroke}"/>
<text x="${0.5+nudge}" y="${cap/2}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="1" fill="#C0392B">DUE?</text></g></svg>`;};
const original=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F4EFE6"/><g transform="rotate(-12 50 50)"><rect x="16" y="34" width="68" height="32" rx="6" fill="none" stroke="#C0392B" stroke-width="4"/><text x="50" y="59" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" fill="#C0392B" letter-spacing="2">DUE?</text></g></svg>`;
const v={original,fixed:stamp(1.08,7,8,3.7,-10),tilt12:stamp(1.0,7.5,8,3.7,-10,2.5,0.8)};
for(const [k,s] of Object.entries(v))writeFileSync(`../nus-canvas-mobile/.local/a5-${k}.svg`,s);
const tile=(s,l)=>`<div class="app"><div class="ic">${s.replace('<svg ','<svg width="64" height="64" ')}</div><span>${l}</span></div>`;
const guide=`<svg viewBox="0 0 100 100" width="180" height="180" style="position:absolute;inset:0"><path d="M50 0V100M0 50H100" stroke="#0a84ff" stroke-width=".4" stroke-dasharray="2 2"/><rect x="10" y="10" width="80" height="80" fill="none" stroke="#0a84ff" stroke-width=".4" stroke-dasharray="2 2"/></svg>`;
const big=(s,l)=>`<div class="big"><div class="bic" style="position:relative">${s.replace('<svg ','<svg width="180" height="180" ')}${guide}</div><span>${l}</span></div>`;
await p.setViewportSize({width:760,height:560});
await p.setContent(`<style>body{margin:0;font:13px -apple-system,'Segoe UI',sans-serif;padding:16px;background:#fff}.bigrow{display:flex;gap:28px;justify-content:center;margin-bottom:18px}.big{display:flex;flex-direction:column;align-items:center;gap:8px}.bic{width:180px;height:180px;border-radius:40px;overflow:hidden}.screen{border-radius:24px;padding:16px;display:flex;justify-content:space-around;background:linear-gradient(160deg,#b9d4f0,#e9d7f2)}.dark{background:linear-gradient(160deg,#1c2541,#0b0c10);color:#eee;margin-top:10px}.app{display:flex;flex-direction:column;align-items:center;gap:6px;width:80px}.ic{width:64px;height:64px;border-radius:15px;overflow:hidden}</style>
<div class="bigrow">${big(v.original,'原 A5（重叠）')}${big(v.fixed,'上一版 10°')}${big(v.tilt12,'按规范：视觉中心上移 · 宽 80%')}</div>
<div class="screen">${tile(v.original,'原 A5')}${tile(v.fixed,'上一版')}${tile(v.tilt12,'按规范')}<div class="app"><div class="ic" style="background:#3b82f6"></div><span>Mail</span></div></div>
<div class="screen dark">${tile(v.original,'原 A5')}${tile(v.fixed,'上一版')}${tile(v.tilt12,'按规范')}<div class="app"><div class="ic" style="background:#e9e9ef"></div><span>Photos</span></div></div>`);
await p.screenshot({path:'../nus-canvas-mobile/.local/a5-compare.png',fullPage:true});await b.close();
console.log(JSON.stringify(box));
