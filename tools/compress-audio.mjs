// Authoring-time only: re-encodes the shipped MP3s as mono at a low bitrate. Sources live in tools/source/audio (not shipped).
// Usage: node tools/compress-audio.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const from = 'tools/source/audio', to = 'public/assets/audio';
mkdirSync(to, { recursive: true });
let before = 0, after = 0;
for (const name of readdirSync(from).filter(f => f.endsWith('.mp3'))) {
  const kbps = name === 'music.mp3' ? 56 : 48;
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', `${from}/${name}`, '-ac', '1', '-b:a', `${kbps}k`, '-map_metadata', '-1', `${to}/${name}`]);
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${name}: ${r.stderr}`);
  const a = statSync(`${from}/${name}`).size, b = statSync(`${to}/${name}`).size; before += a; after += b;
  console.log(name.padEnd(12), `${Math.round(a / 1024)} KB -> ${Math.round(b / 1024)} KB`);
}
console.log(`total ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
