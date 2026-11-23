import { Component, memo, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Batch, Box, Cylinder, type InstanceSpec } from '@/scene/Primitives';
import { CATALOG, CELL, HEIGHT, guestPatienceSeconds, width, type Furniture, type Point, type RestaurantState } from './types';
import { restaurant } from './engine';
import { CropPlant } from './CropMesh';
import { GardenYard } from './GardenYard';
import { YARD_BOUNDS, YARD_CENTER } from './garden-yard';
import { placementError, localPoint, accessPoints } from './layout';
import { Customer, Employee } from './Agents';
import { RestaurantLabels, RestaurantLabelPositions } from './RestaurantLabels';
import { FrameWatch } from '@/scene/FrameWatch';
import { FurnitureBody, FurnitureView, Meal, RestaurantSign } from './FurnitureView';
import { BuildGrid, PlacementFootprint } from './BuildGrid';
import { CityScenery } from './CityScenery';
import { CityLife } from './CityLife';
import { CityPark } from './CityPark';
import { CityBulletin } from './CityBulletin';
import { cityMapBounds, type CityDistrict } from './city-map';
import { CityWeather } from './CityWeather';
import type { WeatherKind, WeatherMode } from './weather';
import { PixelPass } from '@/scene/pixel/PixelPass';
import { pixelSettings } from '@/scene/pixel/pixel-settings';

interface SceneProps { state: RestaurantState; building: boolean; draft: Furniture | null; selected: number | null; zoom: number; angle: number; cityView?: boolean; cityDistrict?: CityDistrict; trafficAudio?: boolean; weatherMode: WeatherMode; cover?: Cover; garden?: boolean; onBed?: (index: number) => void; onWeatherChange: (kind: WeatherKind) => void; onTile: (point: Point) => void; onSelect: (id: number) => void; }
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { restaurant.pause(true); }
  render() { return this.state.failed ? <div className="flex h-full items-center justify-center p-6"><div className="paper max-w-sm p-6 text-center"><h2 className="text-2xl">Let’s reopen the rooftop</h2><p className="my-3">The 3D scene could not load. Your saved restaurant is safe. Check your connection and WebGL support.</p><button className="game-button mx-auto" onClick={() => window.location.reload()}>Reload</button></div></div> : this.props.children; }
}
/** How much of the canvas a panel hides, in CSS pixels. The canvas itself never resizes; the camera frames the room in what is left. */
const NO_COVER: Cover = { bottom: 0, right: 0 };
export interface Cover { bottom: number; right: number; left?: number }
interface Framing { zoom: number; ox: number; oy: number }
function SceneClock({ columns, zoom, angle, cityView, cityDistrict, building, cover, garden, service = false }: { columns: number; zoom: number; angle: number; cityView: boolean; cityDistrict: CityDistrict; building: boolean; cover: Cover; garden: boolean; service?: boolean }) {
  const { camera, size } = useThree();
  const goal = useRef<Framing | null>(null), now = useRef<Framing | null>(null), key = useRef('');
  const apply = (f: Framing) => { const cam = camera as THREE.OrthographicCamera; cam.zoom = f.zoom; cam.setViewOffset(size.width, size.height, f.ox, f.oy, size.width, size.height); cam.updateProjectionMatrix(); };
  useEffect(() => {
    const wide = cityView && !building && !garden;
    const neighborhood = cityMapBounds(columns, cityDistrict);
    const cam = camera as THREE.OrthographicCamera, center = garden ? new THREE.Vector3(...YARD_CENTER) : new THREE.Vector3(wide ? (neighborhood.left + neighborhood.right) / 2 : (columns - 1) * CELL / 2, wide ? (neighborhood.height - 1) / 2 : 1.6, wide ? (neighborhood.back + neighborhood.front) / 2 : 6.3);
    const yaw = Math.PI / 6 + angle * Math.PI / 2, distance = wide ? 85 : 24;
    camera.position.set(center.x + Math.sin(yaw) * distance, center.y + distance * 22 / 24, center.z + Math.cos(yaw) * distance); camera.lookAt(center); camera.updateMatrixWorld(true);
    camera.userData.viewDistance = camera.position.distanceTo(center);
    const bounds = new THREE.Box3();
    for (const x of garden ? [YARD_BOUNDS.left, YARD_BOUNDS.right] : wide ? [neighborhood.left, neighborhood.right] : [-1.2, columns * CELL - .2]) for (const y of [-1, garden ? YARD_BOUNDS.height : wide ? neighborhood.height : 4.3]) for (const z of garden ? [YARD_BOUNDS.back, YARD_BOUNDS.front] : wide ? [neighborhood.back, neighborhood.front] : [-1.3, 14.4]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const extent = bounds.getSize(new THREE.Vector3());
    // Frame the room in the part of the canvas no panel covers, then shift it to the middle of that part. The canvas keeps its size.
    const left = cover.left ?? 0, visibleW = Math.max(120, size.width - cover.right - left), visibleH = Math.max(120, size.height - cover.bottom);
    goal.current = { zoom: Math.min(visibleW / (extent.x + 1.3), visibleH / (extent.y + 1.3)) * zoom * (wide || building || garden || service && size.height > size.width ? 1 : .86), ox: (cover.right - left) / 2, oy: cover.bottom / 2 };
    // A new camera position (rotate, neighborhood view) cuts; a panel opening, zooming or resizing glides.
    const next = `${wide}:${angle}:${cityDistrict}:${columns}:${garden}`, still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!now.current || key.current !== next || still) { key.current = next; now.current = { ...goal.current }; apply(now.current); }
    camera.userData.cityView = wide; camera.userData.district = wide ? cityDistrict : 'restaurant';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size, columns, zoom, angle, cityView, cityDistrict, building, garden, service, cover.bottom, cover.right, cover.left]);
  useFrame((_, dt) => {
    const c = now.current, g = goal.current; if (!c || !g) return;
    if (Math.abs(g.zoom - c.zoom) < .01 && Math.abs(g.ox - c.ox) < .5 && Math.abs(g.oy - c.oy) < .5) { if (c.zoom !== g.zoom || c.ox !== g.ox || c.oy !== g.oy) { Object.assign(c, g); apply(c); } return; }
    const k = 1 - Math.exp(-Math.min(dt, .1) * 10); c.zoom += (g.zoom - c.zoom) * k; c.ox += (g.ox - c.ox) * k; c.oy += (g.oy - c.oy) * k; apply(c);
  }, -3);
  useFrame((_, dt) => restaurant.update(dt), -2);
  return null;
}
/** The sign shows the reputation as whole stars, 1 to 5. */
export const signStars = (reputation: number): number => Math.max(1, Math.min(5, Math.round(reputation)));
const Terrace = memo(function Terrace({ columns, name, stars }: { columns: number; name: string; stars: number }) {
  const center = (columns - 1) * CELL / 2;
  const tiles = useMemo<InstanceSpec[]>(() => {
    const result: InstanceSpec[] = [], gap = pixelSettings().enabled ? 0 : .025; // a grout line thinner than one scene pixel only aliases into specks
    for (let x = 0; x < columns; x++) for (let z = 0; z < HEIGHT; z++) {
      const kitchen = x < 5 && z < 4;
      result.push({ position: [x * CELL, .015, z * CELL], scale: [CELL - gap, .08, CELL - gap], color: kitchen ? (x + z) % 2 ? '#E9D7B6' : '#FFF2D7' : ['#bd7757', '#c7865e', '#c17e58'][(x * 17 + z * 3) % 3] });
    } return result;
  }, [columns]);
  const cable = useMemo<[number, number, number][]>(() => Array.from({ length: 30 }, (_, i) => [-.5 + (columns * CELL) * i / 29, 4.1 - Math.sin(i / 29 * Math.PI) * .6, -.7]), [columns]);
  return <>
    <Box position={[center, -.48, 6.3]} size={[columns * CELL + .5, .9, 14.55]} color="#224F4A" />
    <Box position={[center, -.04, 6.3]} size={[columns * CELL + .7, .16, 14.65]} color="#F6E7CA" />
    <Batch items={tiles} />
    <Box position={[center, .56, -.9]} size={[columns * CELL + .6, 1.2, .35]} color="#B76544" />
    <Box position={[center, 1.21, -.9]} size={[columns * CELL + .8, .16, .6]} color="#F0AB70" />
    <Box position={[-.9, .45, 6.3]} size={[.32, .9, 14.2]} color="#B76544" />
    <Box position={[columns * CELL - .5, .45, 6.3]} size={[.32, .9, 14.2]} color="#B76544" />
    <group position={[center, -.43, 13.65]} scale={.7}><RestaurantSign name={name} stars={stars} /></group>
    <group position={[4 * CELL, .1, 13.4]}><Box size={[1.45, .12, 1.2]} color="#F6E7CA" /><Box position={[0, -.16, .7]} size={[1.7, .18, .4]} color="#dbbd94" /></group>
    <Line points={cable} color="#233D3B" lineWidth={2} />{cable.filter((_, i) => i % 3 === 0).map((p, i) => <group key={i} position={p}><Cylinder position={[0, -.09, 0]} radius={.05} height={.15} color="#224F4A" /><mesh position={[0, -.22, 0]}><sphereGeometry args={[.105, 12, 8]} /><meshStandardMaterial color="#FFF2D7" emissive="#F2B743" emissiveIntensity={2} /></mesh></group>)}
    {[-.5, columns * CELL - .5].map(x => <Box key={x} position={[x, 2, -.7]} size={[.12, 4.2, .12]} color="#224F4A" />)}
    <group position={[5.5, 0, -.46]}><Box position={[0, 1.7, 0]} size={[3.7, .16, .28]} color="#224F4A" />{Array.from({ length: 7 }, (_, i) => <Cylinder key={i} position={[-1.4 + i * .45, 1.95, 0]} radius={.12} height={.38} color={i % 2 ? '#FFF2D7' : '#F2B743'} />)}</group>
  </>;
});
/**
 * The rooftop garden on the left parapet: a planter box per plot, with what is growing in it. Only on Reddit, from the garden the server last
 * reported; growth is drawn from the server's clock offset, so a box fills in as the time passes. Presentation only.
 */
const RoofGarden = memo(function RoofGarden() {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 20000); return () => clearInterval(id); }, []);
  const peek = restaurant.remote?.world?.peek?.(); if (!peek) return null;
  const now = Date.now() + peek.offset;
  return <>{peek.view.plots.map((p, i) => {
    const z = 2 + i * 3, grown = p.crop ? Math.min(1, Math.max(0, (now - p.plantedAt) / Math.max(1, p.readyAt - p.plantedAt))) : 0, ready = Boolean(p.crop) && now >= p.readyAt;
    return <group key={i} position={[-.9, .9, z]}>
      <Box position={[0, .12, 0]} size={[.7, .24, 2]} color="#8a5a3a" /><Box position={[0, .25, 0]} size={[.56, .06, 1.86]} color="#4b3427" />
      {p.crop && [-.6, 0, .6].map((dz, k) => <group key={k} position={[0, .28, dz]}><CropPlant crop={p.crop!} grown={grown} ready={ready} wilted={p.wilted} /></group>)}
    </group>;
  })}</>;
});
function Ghost({ item, valid }: { item: Furniture; valid: boolean }) {
  const n = CATALOG[item.kind].size;
  return <group name="placement-preview">
    <PlacementFootprint item={item} valid={valid} />
    <group position={[(item.x + (n - 1) / 2) * CELL, .13, (item.z + (n - 1) / 2) * CELL]} rotation={[0, -item.rotation * Math.PI / 2, 0]}>
      <group position={[0, .04, 0]}><FurnitureBody kind={item.kind} /></group>
    </group>
    {accessPoints(item).map((p, i) => <mesh key={i} position={[p.x * CELL, .11, p.z * CELL]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.2, .29, 20]} /><meshBasicMaterial color={valid ? '#F2B743' : '#DC533C'} /></mesh>)}
  </group>;
}
export default function RestaurantScene(props: SceneProps) {
  const { state, draft, building, selected, onTile, onSelect, zoom, angle, cityView = false, cityDistrict = 'city', trafficAudio = true, weatherMode, cover = NO_COVER, garden = false, onBed = () => undefined, onWeatherChange } = props;
  const [lost, setLost] = useState<boolean>(false), columns = width(state), patienceSeconds = guestPatienceSeconds(state);
  const labels = useRef<Map<string, HTMLDivElement>>(new Map()), pixel = useMemo(() => pixelSettings(), []);
  return <SceneBoundary><div className="relative h-full w-full"><Canvas orthographic shadows dpr={pixel.enabled ? 1 : [1, 1.5]} style={pixel.enabled ? { imageRendering: 'pixelated' } : undefined} camera={{ position: [18, 22, 28], zoom: 35, near: .1, far: 250 }} gl={{ antialias: !pixel.enabled, alpha: false }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.12; gl.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); restaurant.pause(true); setLost(true); }); }}>
    {pixel.enabled && <PixelPass k={pixel.k} />}
    <CityWeather columns={columns} mode={weatherMode} building={building} onChange={onWeatherChange} /><FrameWatch />
    <SceneClock columns={columns} zoom={zoom} angle={angle} cityView={cityView} cityDistrict={cityDistrict} building={building} cover={cover} garden={garden} service={state.phase === 'service'} /><CityScenery columns={columns} /><CityPark /><CityBulletin /><CityLife columns={columns} audioEnabled={trafficAudio} building={building} /><Terrace columns={columns} name={state.name} stars={signStars(state.reputation)} /><RoofGarden />{restaurant.remote?.world && <GardenYard onBed={onBed} />}
    {state.furniture.filter(f => f.id !== draft?.id).map(item => <FurnitureView key={item.id} item={item} selected={selected === item.id} onSelect={id => { if (draft) { const f = state.furniture.find(f => f.id === id); if (f) onTile({ x: f.x, z: f.z }); } else onSelect(id); }} />)}
    {building && <BuildGrid columns={columns} draft={draft} onTile={onTile} furniture={state.furniture} />}
    {draft && <Ghost item={draft} valid={!placementError(state, draft)} />}
    {state.staff.map(member => <Employee key={member.id} member={member} />)}
    {state.guests.map(guest => <Customer key={guest.id} guest={guest} patienceSeconds={patienceSeconds} />)}
    {state.guests.filter(g => g.stage === 'eating').map(g => {
      const table = state.furniture.find(f => f.id === g.tableId); if (!table) return null;
      const p = localPoint(table, g.seat === 0 ? .18 : .82, .4);
      return <group key={g.id} position={[p.x * CELL, 1.115, p.z * CELL]}><Meal dish={g.dish} /></group>;
    })}
    {state.dirty.map(key => { const [id, seat] = key.split(':').map(Number), table = state.furniture.find(f => f.id === id); if (!table) return null; const p = localPoint(table, seat ? .82 : .18, .4); return <group key={key} position={[p.x * CELL, 1.115, p.z * CELL]}><Cylinder radius={.22} height={.035} color="#B9AD94" /></group>; })}
    <RestaurantLabelPositions labels={labels} />
    <Suspense fallback={null} />
  </Canvas><RestaurantLabels state={state} labels={labels} receipts={restaurant.incomeReceipts} paused={restaurant.paused} speed={restaurant.speed} plates={!cityView && !garden && (state.phase === 'service' || building)} />{lost && <div className="absolute inset-0 grid place-items-center bg-ink/70 p-4"><div className="paper p-6"><h2>Graphics paused</h2><p className="my-3">Reload to reconnect to your saved restaurant.</p><button className="game-button" onClick={() => window.location.reload()}>Reload restaurant</button></div></div>}</div></SceneBoundary>;
}
