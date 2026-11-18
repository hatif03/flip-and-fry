/**
 * Uploading a picture of a kitchen so a kitchen post can carry it. The browser draws the card and sends it as a small PNG data URI;
 * the server checks it really is a small PNG before handing it to Reddit's media upload. If anything is off, or the upload fails, the
 * post is simply made without a picture: the picture is never needed.
 */
export interface MediaApi { upload(url: string): Promise<{ mediaUrl: string }> }
export const MAX_IMAGE_BYTES = 300 * 1024;
const PNG_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The bytes of a data URI if it is a genuine small PNG, else null. */
export function pngFromDataUri(uri: unknown): Uint8Array | null {
  if (typeof uri !== 'string' || uri.length > MAX_IMAGE_BYTES * 1.4) return null;
  const m = PNG_URI.exec(uri); if (!m) return null;
  let raw: string; try { raw = atob(m[1]); } catch { return null; }
  if (raw.length <= 8 || raw.length > MAX_IMAGE_BYTES || !SIGNATURE.every((b, i) => raw.charCodeAt(i) === b)) return null;
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
/** The hosted picture's URL, or undefined when there is no valid picture or the upload did not work. */
export async function uploadKitchenImage(api: MediaApi | null, uri: unknown): Promise<string | undefined> {
  if (!api || !pngFromDataUri(uri)) return undefined;
  try { return (await api.upload(uri as string)).mediaUrl; } catch { return undefined; }
}
