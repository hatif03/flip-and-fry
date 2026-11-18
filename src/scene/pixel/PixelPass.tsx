import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { weatherBlend } from '@/management/weather';
import { blitFragment, quadVertex, snapFragment } from './shaders';
import { WEATHERS, autoPixelSize, paletteWeights } from './pixel-settings';

type Luts = Record<(typeof WEATHERS)[number], THREE.Texture>;

/** Loads the three palette lookup tables. Stays null on any failure, so the game falls back to plain 3D instead of breaking. */
function useLuts(): Luts | null {
  const [luts, setLuts] = useState<Luts | null>(null);
  useEffect(() => {
    let cancelled = false; const loader = new THREE.TextureLoader(), made: THREE.Texture[] = [];
    Promise.all(WEATHERS.map(w => loader.loadAsync(`/pixel/lut-${w}.png`))).then(textures => {
      textures.forEach(t => { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; /* flipY off: row g of the image is v = g / 32 */ made.push(t); });
      if (!cancelled) setLuts({ sunset: textures[0], sun: textures[1], rain: textures[2] });
    }).catch(() => { if (!cancelled) setLuts(null); });
    return () => { cancelled = true; made.forEach(t => t.dispose()); };
  }, []);
  return luts;
}

/**
 * The pixel look, applied to the existing 3D scene: render it small, tone-map and snap it to the weather's palette, then draw it
 * back at full size with nearest-neighbour filtering. Nothing in the scene changes; this only replaces how the frame is presented.
 * Mount this inside <Canvas>. While it is mounted it takes over rendering (a positive-priority frame callback disables R3F's own).
 */
export function PixelPass({ k, dither = 0 }: { k: number | null; dither?: number }) {
  const luts = useLuts();
  return luts ? <Pipeline k={k} dither={dither} luts={luts} /> : null;
}

function Pipeline({ k: fixed, dither, luts }: { k: number | null; dither: number; luts: Luts }) {
  const { gl, size, scene, camera } = useThree();
  const k = fixed ?? autoPixelSize(size.width);
  const width = Math.max(1, Math.ceil(size.width / k)), height = Math.max(1, Math.ceil(size.height / k));
  const half = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_half_float') || gl.extensions.has('EXT_color_buffer_float'));
  const pipeline = useMemo(() => {
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false } as const;
    // HDR where the device allows it, so bright lamps tone-map the way they do on screen.
    const sceneTarget = new THREE.WebGLRenderTarget(width, height, { ...nearest, type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true });
    const pixelTarget = new THREE.WebGLRenderTarget(width, height, { ...nearest, depthBuffer: false });
    const snap = new THREE.ShaderMaterial({
      vertexShader: quadVertex, fragmentShader: snapFragment, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: sceneTarget.texture }, lutSunset: { value: luts.sunset }, lutSun: { value: luts.sun }, lutRain: { value: luts.rain }, uWeights: { value: new THREE.Vector3(1, 0, 0) }, uDither: { value: dither }, toneMappingExposure: { value: gl.toneMappingExposure } },
    });
    const blit = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: blitFragment, depthTest: false, depthWrite: false, uniforms: { tPixels: { value: pixelTarget.texture } } });
    return { sceneTarget, pixelTarget, snap, blit, snapQuad: new FullScreenQuad(snap), blitQuad: new FullScreenQuad(blit) };
  }, [width, height, half, luts, dither, gl]);
  useEffect(() => () => { pipeline.sceneTarget.dispose(); pipeline.pixelTarget.dispose(); pipeline.snap.dispose(); pipeline.blit.dispose(); pipeline.snapQuad.dispose(); pipeline.blitQuad.dispose(); }, [pipeline]);

  useFrame(() => {
    const { sceneTarget, pixelTarget, snap, snapQuad, blitQuad } = pipeline;
    snap.uniforms.toneMappingExposure.value = gl.toneMappingExposure;
    (snap.uniforms.uWeights.value as THREE.Vector3).set(...paletteWeights(weatherBlend.sun, weatherBlend.rain));
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(sceneTarget); gl.clear(); gl.render(scene, camera);
    gl.setRenderTarget(pixelTarget); snapQuad.render(gl);
    gl.setRenderTarget(previous); blitQuad.render(gl);
  }, 1);
  return null;
}
