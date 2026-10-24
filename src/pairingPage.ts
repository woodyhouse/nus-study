// Local-only page with the pairing QR. Opened from disk; it makes no requests.
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function pairingPage(link:string,qrSvg:string,app:string){
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Due 了么 配对</title><style>body{font:16px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#17181c}
.qr{width:280px;height:280px;margin:16px 0}ol{padding-left:20px}code{word-break:break-all;font-size:12px;color:#555}details{margin-top:24px}</style></head><body>
<h1>Due 了么 配对</h1>
<ol><li>用 iPhone 相机扫下面的二维码，点弹出的链接，在 Safari 打开。</li>
<li>按页面提示点「分享 → 添加到主屏幕」。</li>
<li>从主屏幕打开 Due 了么，会自动完成配对。</li></ol>
<p>已经装过 Due 了么：扫码打开后点页面上的「复制配对链接」，再到 App 的 设置 →「从剪贴板粘贴并配对」。</p>
<div class="qr">${qrSvg}</div>
<p>这个链接包含你数据包的解密密钥：只给自己的设备用，不要发到群里或截图分享。</p>
<details><summary>扫不了？显示链接文本</summary><code>${escape(link)}</code></details>
</body></html>`;
}
