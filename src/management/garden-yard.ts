/** Where the farm stands in the scene: far enough from the city that nothing else is in view. All lengths are scene units. */
export const YARD_X = 120;
export const TILE = 1.2;
/** The corner of bed `index` (0 to 3): two beds across, two down, with a path between. */
export const bedOrigin = (index: number): [number, number] => [YARD_X + .1 + (index % 2) * 6.1, .6 + Math.floor(index / 2) * 4.1];
/** The middle of the yard, for the camera. */
export const YARD_CENTER: [number, number, number] = [YARD_X + 6, .6, 6];
export const YARD_BOUNDS = { left: YARD_X - 1, right: YARD_X + 13, back: -1.2, front: 13.2, height: 2.6 };
