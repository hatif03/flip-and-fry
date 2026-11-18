import { render } from 'vitest-browser-react';
import { vi } from 'vitest';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PixelPass } from '@/scene/pixel/PixelPass';
import { weatherBlend } from '@/management/weather';

type Read = { width: number; height: number; ratio: number; data: Uint8Array };
const hexAt = (d: Uint8Array, i: number) => '#' + [0, 1, 2].map(j => d[i + j].toString(16).padStart(2, '0')).join('');

/** Reads the frame the GPU just produced (in the same task as the draw, so no preserveDrawingBuffer is needed). */
function Probe({ sink }: { sink: (r: Read) => void }) {
  useFrame(({ gl }) => {
    const ctx = gl.getContext(), width = ctx.drawingBufferWidth, height = ctx.drawingBufferHeight, data = new Uint8Array(width * height * 4);
    ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, data); sink({ width, height, ratio: gl.getPixelRatio(), data });
  }, 2);
  return null;
}
/** Stands in for R3F's own render, which the Probe's positive priority switches off. Only the plain cases need it: the pixel pass renders for itself. */
function PlainRender() { useFrame(({ gl, scene, camera }) => { gl.render(scene, camera); }, 1); return null; }
function Scene({ children, sink, pixel, plain = false }: { children?: React.ReactNode; sink: (r: Read) => void; pixel: boolean; plain?: boolean }) {
  return <div style={{ width: 300, height: 200 }}>
    <Canvas orthographic dpr={1} camera={{ position: [0, 0, 10], zoom: 40 }} gl={{ antialias: !pixel }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.12; }}>
      {pixel && <PixelPass k={3} />}{plain && <PlainRender />}
      <ambientLight intensity={.6} /><directionalLight position={[3, 4, 5]} intensity={2.2} />
      <mesh position={[-1.6, .4, 0]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#DC533C" /></mesh>
      <mesh position={[1.4, -.2, 0]} rotation={[.5, .6, 0]}><boxGeometry args={[1.6, 1.6, 1.6]} /><meshStandardMaterial color="#F2B743" /></mesh>
      <mesh position={[0, -1.4, -1]}><planeGeometry args={[8, 1]} /><meshStandardMaterial color="#224F4A" /></mesh>
      {children}<Probe sink={sink} />
    </Canvas>
  </div>;
}
const until = async (ok: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) throw new Error('timed out waiting for the frame'); await new Promise(r => setTimeout(r, 50)); } };
const distinct = (r: Read) => { const set = new Set<string>(); for (let i = 0; i < r.data.length; i += 4) set.add(hexAt(r.data, i)); return set; };

beforeEach(() => { weatherBlend.sun = 0; weatherBlend.rain = 0; });
afterEach(() => { vi.restoreAllMocks(); });

describe('the pixel pass on a real GPU frame', () => {
  it('draws only palette colours, in hard-edged blocks exactly k pixels wide', async () => {
    const palettes = await (await fetch('/pixel/palettes.json')).json() as { weathers: Record<string, string[]> };
    let last: Read | null = null; await render(<Scene pixel sink={r => { last = r; }} />);
    const sunset = new Set(palettes.weathers.sunset);
    await until(() => !!last && [...distinct(last)].every(c => sunset.has(c)) && distinct(last).size > 3);
    const frame = last!, colours = distinct(frame);
    expect(colours.size).toBeLessThanOrEqual(16); for (const c of colours) expect(sunset.has(c), c).toBe(true);
    // Block structure: along a row, every run of one colour is a whole number of pixel blocks (k = 3 screen pixels at ratio 1).
    const block = 3 * frame.ratio, row = Math.floor(frame.height / 2) * frame.width * 4; let runs = 0, whole = 0, run = 1;
    for (let x = 1; x <= frame.width; x++) {
      const same = x < frame.width && hexAt(frame.data, row + x * 4) === hexAt(frame.data, row + (x - 1) * 4);
      if (same) run++; else { runs++; if (run % block === 0) whole++; run = 1; }
    }
    expect(whole / runs).toBeGreaterThanOrEqual(.95);
  });

  it('is much more than a palette swap: the lit shapes keep their form and several hues', async () => {
    let last: Read | null = null; await render(<Scene pixel sink={r => { last = r; }} />);
    await until(() => !!last && distinct(last).size > 3 && distinct(last).size <= 16);
    const colours = [...distinct(last!)].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
    expect(colours.some(c => c[0] > c[2] + 60)).toBe(true); // the red sphere and yellow box survive as warm colours
    expect(colours.length).toBeGreaterThanOrEqual(5);
  });

  it('switches to the rain palette when the weather turns to rain', async () => {
    const palettes = await (await fetch('/pixel/palettes.json')).json() as { weathers: Record<string, string[]> };
    let last: Read | null = null; await render(<Scene pixel sink={r => { last = r; }} />);
    await until(() => !!last && distinct(last).size > 3 && distinct(last).size <= 16);
    weatherBlend.rain = 1; weatherBlend.sun = 0;
    const rain = new Set(palettes.weathers.rain);
    await until(() => !!last && [...distinct(last)].every(c => rain.has(c)));
    expect([...distinct(last!)].every(c => rain.has(c))).toBe(true);
    weatherBlend.sun = 1; weatherBlend.rain = 0; const sun = new Set(palettes.weathers.sun);
    await until(() => !!last && [...distinct(last)].every(c => sun.has(c)));
  });

  it('falls back to the plain 3D frame, without throwing, when the lookup tables cannot load', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('offline'));
    let last: Read | null = null; await render(<Scene pixel plain sink={r => { last = r; }} />);
    await until(() => !!last);
    await new Promise(r => setTimeout(r, 500));
    expect(distinct(last!).size).toBeGreaterThan(16); // smooth shading: nothing was snapped
  });

  it('is off when not mounted: the unmodified scene has far more colours than any palette', async () => {
    let last: Read | null = null; await render(<Scene pixel={false} plain sink={r => { last = r; }} />);
    await until(() => !!last); expect(distinct(last!).size).toBeGreaterThan(16);
  });
});
