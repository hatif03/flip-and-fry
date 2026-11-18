import { z } from 'zod';
import { furnitureKind } from './types';

/**
 * The planning actions an owner takes between services. The engine reports each accepted one, the client queues and sends
 * them, and the server applies them with the same engine methods. Service actions (comp, priority, cook...) join this union
 * when the engine supports them. Imports only types.ts, so both the engine and the replay can use it.
 */
const planning = { tick: z.literal(0) };
/** The restaurant name is the only free text in the game: letters, numbers, spaces and apostrophes, 28 characters. */
export const restaurantName = z.string().min(1).max(28).regex(/^[\p{L}\p{N} ']+$/u);
export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ ...planning, kind: z.literal('place'), item: z.object({ id: z.number().int(), kind: furnitureKind, x: z.number().int().min(0).max(13), z: z.number().int().min(0).max(9), rotation: z.number().int().min(0).max(3) }) }),
  z.object({ ...planning, kind: z.literal('sell'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('hire'), role: z.enum(['chef', 'server']) }),
  z.object({ ...planning, kind: z.literal('train'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('dish'), dish: z.enum(['salad', 'burger']), enabled: z.boolean(), price: z.number().int().min(10).max(60) }),
  z.object({ ...planning, kind: z.literal('expand') }),
  z.object({ ...planning, kind: z.literal('loan') }),
  z.object({ ...planning, kind: z.literal('claim'), id: z.string().max(40) }),
  z.object({ ...planning, kind: z.literal('dismiss'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('rename'), name: restaurantName }),
  z.object({ ...planning, kind: z.literal('music'), on: z.boolean() }),
]);
export type Action = z.infer<typeof actionSchema>;
export const MAX_ACTIONS = 400;
export const actionLogSchema = z.array(actionSchema).max(MAX_ACTIONS);
