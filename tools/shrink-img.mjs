// Authoring-time only: re-encodes the screenshots in docs/img as small palette PNGs.
import sharp from 'sharp';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const dir = process.argv[2] ?? 'docs/img';
for (const f of (await readdir(dir)).filter(f => f.endsWith('.png'))) {
  const buf = await sharp(await readFile(`${dir}/${f}`)).png({ palette: true, quality: 90, effort: 9, colours: 128 }).toBuffer();
  await writeFile(`${dir}/${f}`, buf); console.log(f, Math.round(buf.length / 1024), 'KB');
}
