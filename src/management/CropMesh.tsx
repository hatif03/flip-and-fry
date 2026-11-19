import { Box, Cylinder } from '@/scene/Primitives';
import { CROPS, type CropId } from './crops';

/**
 * One plant at a stage of its growth, built from boxes and spheres: a sprout, taller stems and leaves, then fruit when it is ready, brown when it
 * has wilted. Shared by the planter boxes on the roof and the farm. Presentation only.
 */
export function CropPlant({ crop, grown, ready, wilted, scale = 1 }: { crop: CropId; grown: number; ready: boolean; wilted: boolean; scale?: number }) {
  const height = (ready ? .5 : .12 + grown * .3) * scale, leaf = wilted ? '#8a7a55' : crop === 'mushroom' ? '#c9a77a' : '#5f9a4a', color = CROPS[crop].color;
  if (crop === 'mushroom') return <group>
    <Cylinder position={[0, height * .4, 0]} radius={.05 * scale} height={height * .8} color="#efe2c6" />
    <mesh position={[0, height * .85, 0]}><sphereGeometry args={[.14 * scale * (ready ? 1.2 : .8), 8, 6]} /><meshStandardMaterial color={wilted ? '#8a7a55' : leaf} /></mesh>
  </group>;
  return <group>
    <Cylinder position={[0, height / 2, 0]} radius={.05 * scale} height={height} color={leaf} />
    <Box position={[0, height, 0]} size={[.28 * scale, .08 * scale, .28 * scale]} color={leaf} />
    {ready && !wilted && <><mesh position={[.12 * scale, height - .02, .08 * scale]}><sphereGeometry args={[.1 * scale, 8, 6]} /><meshStandardMaterial color={color} /></mesh><mesh position={[-.1 * scale, height - .04, -.06 * scale]}><sphereGeometry args={[.09 * scale, 8, 6]} /><meshStandardMaterial color={color} /></mesh></>}
  </group>;
}
