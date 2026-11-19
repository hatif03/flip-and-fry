import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { Box, Cylinder } from '@/scene/Primitives';
import { CropPlant } from './CropMesh';
import { restaurant } from './engine';
import { YARD_X, bedOrigin } from './garden-yard';

/**
 * The farm: a fenced garden yard with four raised beds, a well, a shed, a scarecrow, flowers and a few hens, standing apart from the rooftop in
 * the same scene. The camera goes there with the Garden view. Each bed is a plot of the garden the server reports; tapping one waters, harvests or
 * opens the seed choice. Locked beds wait under a cover until the level that opens them. Presentation only: nothing here changes a night.
 */
const Hen = memo(function Hen({ x, z, seed }: { x: number; z: number; seed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (!ref.current) return; const t = clock.elapsedTime + seed; ref.current.position.x = x + Math.sin(t * .4) * .6; ref.current.position.y = Math.abs(Math.sin(t * 5)) * .03; ref.current.rotation.y = Math.cos(t * .4) > 0 ? Math.PI / 2 : -Math.PI / 2; });
  return <group ref={ref} position={[x, 0, z]}>
    <Box position={[0, .22, 0]} size={[.32, .26, .22]} color="#fff2d7" /><Box position={[.2, .36, 0]} size={[.14, .16, .14]} color="#fff2d7" /><Box position={[.2, .47, 0]} size={[.05, .06, .1]} color="#dc533c" /><Box position={[.29, .35, 0]} size={[.08, .04, .05]} color="#f2b743" />
    <Box position={[0, .1, .05]} size={[.04, .12, .04]} color="#f2b743" /><Box position={[0, .1, -.05]} size={[.04, .12, .04]} color="#f2b743" />
  </group>;
});

function Fence({ length, x, z, along }: { length: number; x: number; z: number; along: 'x' | 'z' }) {
  const n = Math.round(length / 1.2);
  return <group position={[x, 0, z]}>
    {Array.from({ length: n + 1 }, (_, i) => <Box key={i} position={along === 'x' ? [i * 1.2, .35, 0] : [0, .35, i * 1.2]} size={[.12, .7, .12]} color="#b76544" />)}
    <Box position={along === 'x' ? [length / 2, .55, 0] : [0, .55, length / 2]} size={along === 'x' ? [length, .08, .06] : [.06, .08, length]} color="#d89a6a" />
    <Box position={along === 'x' ? [length / 2, .3, 0] : [0, .3, length / 2]} size={along === 'x' ? [length, .08, .06] : [.06, .08, length]} color="#d89a6a" />
  </group>;
}

export const GardenYard = memo(function GardenYard({ onBed }: { onBed: (index: number) => void }) {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 5000); return () => clearInterval(id); }, []);
  const peek = restaurant.remote?.world?.peek?.(), now = peek ? Date.now() + peek.offset : 0;
  const slots = peek?.view.slots ?? 2;
  const tiles: ReactElement[] = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) tiles.push(<Box key={`${x}:${z}`} position={[YARD_X + .6 + x * 1.2, -.02, .6 + z * 1.2]} size={[1.18, .06, 1.18]} color={(x + z) % 2 ? '#8fb36a' : '#9ac26a'} />);
  return <group>
    <Box position={[YARD_X + 6, -.62, 6]} size={[70, .2, 70]} color="#c9d4a0" />
    <Box position={[YARD_X + 6, -.3, 6]} size={[13.2, .5, 13.2]} color="#224F4A" />
    {tiles}
    <Box position={[YARD_X + 6, .02, 6.7]} size={[1.4, .05, 11]} color="#e8d9b8" /><Box position={[YARD_X + 6, .02, 11.2]} size={[11.6, .05, 1.2]} color="#e8d9b8" />
    <Fence length={12.6} x={YARD_X - .6} z={-.6} along="x" /><Fence length={12.6} x={YARD_X - .6} z={12} along="x" /><Fence length={12.6} x={YARD_X - .6} z={-.6} along="z" /><Fence length={12.6} x={YARD_X + 12} z={-.6} along="z" />
    {[0, 1, 2, 3].map(i => {
      const [bx, bz] = bedOrigin(i), plot = peek?.view.plots[i], locked = i >= slots;
      const grown = plot?.crop ? Math.min(1, Math.max(0, (now - plot.plantedAt) / Math.max(1, plot.readyAt - plot.plantedAt))) : 0, ready = Boolean(plot?.crop) && now >= (plot?.readyAt ?? 0);
      return <group key={i} name={`bed-${i}`} position={[bx, 0, bz]} onClick={e => { e.stopPropagation(); onBed(i); }}>
        <Box position={[1.8, .18, 1.2]} size={[3.8, .36, 2.6]} color="#8a5a3a" /><Box position={[1.8, .37, 1.2]} size={[3.5, .06, 2.3]} color={locked ? '#6f6a60' : '#4b3427'} />
        {!locked && plot?.crop && Array.from({ length: 6 }, (_, k) => <group key={k} position={[.6 + (k % 3) * 1.2, .4, .6 + Math.floor(k / 3) * 1.2]}><CropPlant crop={plot.crop!} grown={grown} ready={ready} wilted={plot.wilted} scale={1.4} /></group>)}
        {!locked && !plot?.crop && Array.from({ length: 6 }, (_, k) => <Box key={k} position={[.6 + (k % 3) * 1.2, .43, .6 + Math.floor(k / 3) * 1.2]} size={[.5, .04, .5]} color="#5a4030" />)}
        {locked && <><Box position={[1.8, .55, 1.2]} size={[3.5, .4, 2.3]} color="#9a8f7c" /><Box position={[1.8, 1.05, 1.2]} size={[.9, .5, .08]} color="#f6e7ca" /></>}
        {ready && !locked && <mesh position={[1.8, 1.6, 1.2]}><sphereGeometry args={[.22, 10, 8]} /><meshBasicMaterial color="#f2b743" /></mesh>}
      </group>;
    })}
    <group position={[YARD_X + 1.4, 0, -.1]}><Box position={[0, .9, 0]} size={[2.6, 1.8, 1.6]} color="#c9843f" /><Box position={[0, 2, 0]} size={[3, .22, 2]} color="#b76544" /><Box position={[0, 1.7, .1]} size={[2.6, .4, 1.6]} color="#b76544" /><Box position={[.6, .7, .82]} size={[.8, 1.2, .06]} color="#7a4a2a" /></group>
    <group position={[YARD_X + 11, 0, 1.6]}><Cylinder position={[0, .3, 0]} radius={.7} height={.6} color="#b9ad94" /><Cylinder position={[0, .45, 0]} radius={.5} height={.3} color="#3f7f93" /><Box position={[-.6, 1.1, 0]} size={[.1, 1.6, .1]} color="#7a4a2a" /><Box position={[.6, 1.1, 0]} size={[.1, 1.6, .1]} color="#7a4a2a" /><Box position={[0, 1.95, 0]} size={[1.6, .12, 1]} color="#b76544" /></group>
    <group position={[YARD_X + 6, 0, 6.3]}><Box position={[0, .8, 0]} size={[.1, 1.6, .1]} color="#7a4a2a" /><Box position={[0, 1.2, 0]} size={[1.2, .1, .1]} color="#7a4a2a" /><Box position={[0, 1.05, 0]} size={[.4, .6, .22]} color="#dc533c" /><Box position={[0, 1.55, 0]} size={[.3, .3, .3]} color="#f2b743" /><Box position={[0, 1.78, 0]} size={[.5, .08, .5]} color="#7a4a2a" /></group>
    {[[.5, 11.2], [11.4, 11.4], [11.6, 8], [.4, 8.5]].map(([x, z], i) => <group key={i} position={[YARD_X + x, 0, z]}><Cylinder position={[0, .1, 0]} radius={.18} height={.2} color="#5f9a4a" /><mesh position={[0, .3, 0]}><sphereGeometry args={[.12, 8, 6]} /><meshStandardMaterial color={['#f2b743', '#dc533c', '#e9a0c0', '#ffffff'][i % 4]} /></mesh></group>)}
    <Hen x={YARD_X + 3} z={11.3} seed={0} /><Hen x={YARD_X + 8} z={11.6} seed={2.1} /><Hen x={YARD_X + 5.5} z={10.2} seed={4.2} />
  </group>;
});
