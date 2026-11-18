// Authoring-time only: shrinks the shipped GLBs. Sources live in tools/source/models (not shipped); the result goes to public/assets/models.
// Textures are cut to 256 px (the pixel look hides the detail) and re-encoded as WebP; geometry is welded, deduplicated, quantized and
// meshopt-compressed (the decoder is bundled with three/drei, so nothing is fetched at run time).  Usage: node tools/compress-models.mjs
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const from = 'tools/source/models', to = 'public/assets/models', SIZE = Number(process.env.TEX ?? 256);
mkdirSync(to, { recursive: true });
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
let before = 0, after = 0;
for (const name of readdirSync(from).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(`${from}/${name}`);
  await doc.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [SIZE, SIZE], quality: 78 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${to}/${name}`, doc);
  const a = statSync(`${from}/${name}`).size, b = statSync(`${to}/${name}`).size; before += a; after += b;
  console.log(name.padEnd(14), `${Math.round(a / 1024)} KB -> ${Math.round(b / 1024)} KB`);
}
console.log(`total ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
