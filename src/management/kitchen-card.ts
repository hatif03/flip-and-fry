import { faceCells, faceColor } from './pixel-face';

/**
 * The picture that goes on a kitchen post: the kitchen's name, its style, its reputation in stars and a pixel face for the host,
 * drawn on a small canvas in the game's colours and returned as a PNG data URI (well under the 300 KB the server accepts). Drawn from
 * what the player's own restaurant says; nothing is fetched.
 */
export type KitchenCardInfo = { name: string; style: string; host: string | null; reputation: number };
export const CARD_WIDTH = 512, CARD_HEIGHT = 256;

export function drawKitchenCard(ctx: CanvasRenderingContext2D, info: KitchenCardInfo): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#224F4A'; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = '#FFF2D7'; ctx.fillRect(12, 12, CARD_WIDTH - 24, CARD_HEIGHT - 24); ctx.fillStyle = '#233D3B'; ctx.fillRect(18, 18, CARD_WIDTH - 36, CARD_HEIGHT - 36); ctx.fillStyle = '#224F4A'; ctx.fillRect(24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48);
  ctx.textAlign = 'left'; ctx.fillStyle = '#F2B743'; ctx.font = '700 20px "Pixelify Sans", monospace'; ctx.fillText('A KITCHEN ON THE ROOF', 48, 66);
  ctx.fillStyle = '#FFF2D7'; ctx.font = `700 ${info.name.length > 18 ? 38 : 48}px "Pixelify Sans", monospace`; ctx.fillText(info.name, 48, 132, 340);
  ctx.fillStyle = '#F0AB70'; ctx.font = '700 22px "Pixelify Sans", monospace'; ctx.fillText(info.style, 48, 172, 340);
  const stars = Math.max(1, Math.min(5, Math.round(info.reputation)));
  ctx.fillStyle = '#F2B743'; ctx.font = '700 30px monospace'; ctx.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), 48, 214);
  // The host's pixel face, scaled up with hard edges.
  const cell = 14, x0 = CARD_WIDTH - 48 - cell * 7, y0 = 60;
  ctx.fillStyle = '#FFF2D7'; ctx.fillRect(x0, y0, cell * 7, cell * 7); ctx.fillStyle = faceColor(info.host ?? info.name);
  faceCells(info.host ?? info.name).forEach((row, y) => row.forEach((on, x) => { if (on) ctx.fillRect(x0 + (x + 1) * cell, y0 + (y + 1) * cell, cell, cell); }));
  if (info.host) { ctx.fillStyle = '#FFF2D7'; ctx.font = '700 16px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText(info.host, x0 + cell * 3.5, y0 + cell * 7 + 24, cell * 7 + 20); }
}

/** A PNG data URI of the card, or undefined where a canvas is not available. */
export function kitchenCardImage(info: KitchenCardInfo, make: () => HTMLCanvasElement | null = () => (typeof document === 'undefined' ? null : document.createElement('canvas'))): string | undefined {
  const canvas = make(); if (!canvas) return undefined;
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT; const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
  drawKitchenCard(ctx, info);
  try { return canvas.toDataURL('image/png'); } catch { return undefined; }
}
