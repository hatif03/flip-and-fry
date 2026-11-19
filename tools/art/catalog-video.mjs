// Authoring-time only: a placeholder featuring video (1500x1000, no audio) from this game's own stills. Record real footage when you can.
// Usage: node tools/art/catalog-video.mjs   -> docs/listing/featuring-placeholder.mp4
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';

const frames = ['docs/listing/fallback-1500x1000.png', 'tools/pixel/out/ui-models-service.png', 'tools/pixel/out/shot-phone-rain.png', 'tools/pixel/out/ui-models-ledger.png'];
const inputs = frames.flatMap(f => ['-loop', '1', '-t', '3', '-i', f]);
const fit = i => `[${i}:v]scale=1500:1000:force_original_aspect_ratio=decrease:flags=neighbor,pad=1500:1000:(ow-iw)/2:(oh-ih)/2:color=0xeac49b,setsar=1,fps=30[v${i}]`;
const filter = `${frames.map((_, i) => fit(i)).join(';')};${frames.map((_, i) => `[v${i}]`).join('')}concat=n=${frames.length}:v=1:a=0,format=yuv420p[out]`;
execFileSync(ffmpeg, ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', 'docs/listing/featuring-placeholder.mp4'], { stdio: 'inherit' });
