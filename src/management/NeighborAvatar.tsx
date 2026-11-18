import { useEffect, useState } from 'react';
import { restaurant } from './engine';
import { pixelFace } from './pixel-face';

const known = new Map<string, Promise<string | null>>();
/** Ask once per name for Reddit's avatar URL. A failed or missing lookup is simply no avatar. */
function lookup(name: string): Promise<string | null> {
  const ask = restaurant.remote?.avatar; if (!ask) return Promise.resolve(null);
  if (!known.has(name)) known.set(name, ask(name).catch(() => null));
  return known.get(name)!;
}

/**
 * A neighbor's face: the pixel face straight away, replaced by their Reddit avatar if Reddit gives one and the image really loads in
 * this webview. If the image is blocked or broken, the pixel face stays. It is decoration only.
 */
export function NeighborAvatar({ name, size = 12, className = '' }: { name: string; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; void lookup(name).then(u => { if (live) setUrl(u); }); return () => { live = false; }; }, [name]);
  const src = url && !failed ? url : pixelFace(name);
  return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} referrerPolicy="no-referrer" className={`inline-block align-[-2px] ${url && !failed ? '' : '[image-rendering:pixelated]'} ${className}`} style={{ width: size, height: size }} />;
}
