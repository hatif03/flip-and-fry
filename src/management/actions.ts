import { z } from 'zod';
import { DAY_LENGTH, DISH_IDS, OUTFIT_IDS, PRICE_MAX, PRICE_MIN, furnitureKind } from './types';

/**
 * The planning actions an owner takes between services. The engine reports each accepted one, the client queues and sends
 * them, and the server applies them with the same engine methods. Service actions (comp, priority, cook...) join this union
 * when the engine supports them. Imports only types.ts, so both the engine and the replay can use it.
 */
/** A service ends by DAY_LENGTH + 90 s of sim time at the latest; anything longer is a bug, not a slow night. */
export const MAX_SERVICE_TICKS = Math.round((DAY_LENGTH + 90) * 10) + 20;
const planning = { tick: z.literal(0) };
/** Service actions are stamped with the tick they happen on: how many 0.1 s steps the service had run. */
const service = { tick: z.number().int().min(1).max(MAX_SERVICE_TICKS), /** Whose hands, in a hosted service: 0 (the owner, the default) or 1 (a neighbor helping). */ by: z.number().int().min(0).max(1).optional() };
/** The restaurant name is the only free text in the game: letters, numbers, spaces and apostrophes, 28 characters. */
export const restaurantName = z.string().min(1).max(28).regex(/^[\p{L}\p{N} ']+$/u);
export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ ...planning, kind: z.literal('place'), item: z.object({ id: z.number().int(), kind: furnitureKind, x: z.number().int().min(0).max(13), z: z.number().int().min(0).max(9), rotation: z.number().int().min(0).max(3) }) }),
  z.object({ ...planning, kind: z.literal('sell'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('hire'), role: z.enum(['chef', 'server']) }),
  z.object({ ...planning, kind: z.literal('train'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('dish'), dish: z.enum(DISH_IDS), enabled: z.boolean(), price: z.number().int().min(PRICE_MIN).max(PRICE_MAX) }),
  z.object({ ...planning, kind: z.literal('expand') }),
  z.object({ ...planning, kind: z.literal('loan') }),
  z.object({ ...planning, kind: z.literal('claim'), id: z.string().max(40) }),
  z.object({ ...planning, kind: z.literal('dismiss'), id: z.number().int() }),
  z.object({ ...planning, kind: z.literal('rename'), name: restaurantName }),
  z.object({ ...planning, kind: z.literal('music'), on: z.boolean() }),
  z.object({ ...planning, kind: z.literal('research'), budget: z.union([z.literal(0), z.literal(20), z.literal(40)]) }),
  z.object({ ...planning, kind: z.literal('outfit'), part: z.enum(['hat', 'apron']), color: z.enum(OUTFIT_IDS) }),
  // While the doors are open the owner can step in at the pass. Quality is never sent: the engine works it out from the ticks.
  z.object({ ...service, kind: z.literal('claimTicket'), guestId: z.number().int() }),
  z.object({ ...service, kind: z.literal('cook'), guestId: z.number().int() }),
  z.object({ ...service, kind: z.literal('abandon'), guestId: z.number().int() }),
  // Prep by hand: press and hold, then let go. Only the two ticks are sent; what the hold was worth is worked out by the engine.
  z.object({ ...service, kind: z.literal('hold'), guestId: z.number().int() }),
  z.object({ ...service, kind: z.literal('release'), guestId: z.number().int() }),
  z.object({ ...service, kind: z.literal('priority'), guestId: z.number().int() }),
  z.object({ ...service, kind: z.literal('comp'), guestId: z.number().int() }),
]);
export type Action = z.infer<typeof actionSchema>;
export const MAX_ACTIONS = 400;
/** The most owner actions one service may carry. A busy night needs a few dozen. */
export const MAX_SERVICE_ACTIONS = 140;
export const isServiceAction = (a: Action): boolean => a.tick > 0;
export const actionLogSchema = z.array(actionSchema).max(MAX_ACTIONS);
