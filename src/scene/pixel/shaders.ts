/** Fullscreen vertex shader: no matrices, the quad already spans clip space. */
export const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Scene pixels -> palette. The scene was rendered into an offscreen target, where three.js applies neither tone mapping nor the
 * sRGB curve, so this pass applies both (the same ACES operator and exposure as the on-screen path) and then snaps the result
 * to the palette with one lookup-table fetch per weather, blended by the weather weights. The tables hold only palette colours,
 * so the output never contains anything else (a transition blends two palette colours for a few frames).
 */
export const snapFragment = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D lutSunset;
uniform sampler2D lutSun;
uniform sampler2D lutRain;
uniform vec3 uWeights;
uniform float uDither;
#include <tonemapping_pars_fragment>
// sRGBTransferOETF is already declared in every ShaderMaterial prefix; including its chunk again fails to compile.
varying vec2 vUv;

vec3 lookup(sampler2D lut, vec3 c) {
  vec3 q = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5);
  return texture2D(lut, vec2((q.b * 32.0 + q.r + 0.5) / 1024.0, (q.g + 0.5) / 32.0)).rgb;
}
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec3 c = ACESFilmicToneMapping(texture2D(tScene, vUv).rgb);
  c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
  c += (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
  vec3 o = uWeights.x * lookup(lutSunset, c) + uWeights.y * lookup(lutSun, c) + uWeights.z * lookup(lutRain, c);
  gl_FragColor = vec4(o, 1.0);
}`;

/** Copies the snapped low-resolution image to the screen. Nearest sampling is what makes the pixels hard-edged. */
export const blitFragment = /* glsl */ `
precision highp float;
uniform sampler2D tPixels;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tPixels, vUv).rgb, 1.0); }`;
