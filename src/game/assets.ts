/** Local models and audio. Paths are served from public/ and never fetched from a remote host. */
export interface ModelAsset { url: string; front?: 'positiveZ' | 'negativeZ' | 'positiveX' | 'negativeX'; up?: 'positiveY' | 'negativeY' | 'positiveZ' | 'negativeZ'; thumbnail?: string; }
export const MODELS: Record<string, ModelAsset> = {
  bulletin: { url: '/assets/models/bulletin.glb', front: 'positiveZ', up: 'positiveY' },
  parkBench: { url: '/assets/models/bench.glb', front: 'positiveZ', up: 'positiveY' },
  knife: { url: '/assets/models/knife.glb', front: 'negativeX', up: 'positiveY' },
  burger: { url: '/assets/models/burger.glb' },
  salad: { url: '/assets/models/salad.glb' },
  tomato: { url: '/assets/models/tomato.glb' },
  lettuce: { url: '/assets/models/lettuce.glb' },
  grill: { url: '/assets/models/grill.glb' },
};
export const CITY_CAR: ModelAsset = { url: '/assets/models/car.glb', front: 'negativeX', up: 'positiveY' };
export const AUDIO = {
  cityEngine: '/assets/audio/engine.mp3',
  cityHorn: '/assets/audio/horn.mp3',
  chop: '/assets/audio/chop.mp3',
  music: '/assets/audio/music.mp3',
  served: '/assets/audio/served.mp3',
};