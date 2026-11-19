// Authoring-time only: the images for the Developer Settings "In-app catalog" form, composed from this game's own screenshots.
// Usage: node tools/art/catalog-images.mjs   -> docs/listing/{tile-560x256,fallback-1500x1000}.png
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = 'docs/listing';
await mkdir(out, { recursive: true });
const b64 = async (p, type = 'image/png') => `data:${type};base64,${(await readFile(p)).toString('base64')}`;
const font = await b64('node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2', 'font/woff2');
const rain = await b64('tools/pixel/out/shot-phone-rain.png');
const ui = await b64('tools/pixel/out/ui-models-service.png');
const icon = await b64('public/icon-pixel.png');

const css = `@font-face{font-family:P;src:url(${font}) format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0}body{background:#eac49b;font-family:P,monospace;color:#1f4a44;overflow:hidden}
img{image-rendering:pixelated}.t{font-weight:700;letter-spacing:1px;text-shadow:3px 3px 0 #fff3d6}`;

const tile = `<style>${css}body{width:560px;height:256px;display:flex;align-items:center}
.l{padding:0 0 0 24px;width:330px}.t{font-size:54px;line-height:.95}.s{margin-top:14px;font-size:20px;background:#1f4a44;color:#fff3d6;padding:6px 10px;display:inline-block}
.r{position:absolute;right:0;top:0;width:230px;height:256px;border-left:6px solid #1f4a44;background:url(${rain}) 38% 40%/540px no-repeat}</style>
<div class=l><div class=t>Flip and Fry</div><div class=s>A new night, daily</div></div><div class=r></div>`;

const wide = `<style>${css}body{width:1500px;height:1000px}
.l{position:absolute;left:70px;top:150px;width:600px}.t{font-size:132px;line-height:.9}.s{margin-top:34px;font-size:34px;background:#1f4a44;color:#fff3d6;padding:12px 20px;display:inline-block}
.d{margin-top:40px;font-size:30px;line-height:1.35;width:640px}.i{position:absolute;left:70px;bottom:60px;width:150px;border:6px solid #1f4a44}
.p{position:absolute;border:8px solid #1f4a44;box-shadow:12px 12px 0 #1f4a44;background:#fff3d6;overflow:hidden}
.a{right:380px;top:70px;width:420px;height:860px;background:url(${ui}) top/cover}.b{right:60px;top:170px;width:420px;height:760px;background:url(${rain}) 40% 35%/900px no-repeat}</style>
<div class=l><div class=t>Flip and<br>Fry</div><div class=s>A new night, every day</div>
<div class=d>Cook at the pass. Neighbors drop by. One verified service a day.</div></div>
<div class="p b"></div><div class="p a"></div><img class=i src="${icon}">`;

const browser = await chromium.launch();
try {
  for (const [name, html, w, h] of [['tile-560x256', tile, 560, 256], ['fallback-1500x1000', wide, 1500, 1000]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await writeFile(`${out}/${name}.png`, await page.screenshot({ type: 'png' }));
    await page.close();
  }
} finally { await browser.close(); }
