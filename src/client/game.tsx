import { restaurant } from '../management/engine';
import { redditJourneys } from './journeys.reddit';
import { connectArcade } from './arcade-sync';
import { startPresence } from './presence';
import { Session, type Http } from './session';

/** The expanded entry. It loads today's park from the server first, then mounts the existing game on top of it. */
const http: Http = async (method, path, body, extra) => {
  const response = await fetch(path, { method, headers: body === undefined ? extra : { 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const root = document.getElementById('root')!;
function show(message: string, retry?: () => void): void {
  root.replaceChildren();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;gap:14px;padding:24px;text-align:center;background:#224F4A;color:#FFF2D7;font:700 16px system-ui,sans-serif';
  const text = document.createElement('p'); text.textContent = message; text.style.margin = '0'; text.setAttribute('role', 'status');
  box.append(text);
  if (retry) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Try again';
    button.style.cssText = 'min-height:48px;min-width:160px;border:0;border-radius:12px;background:#DC533C;color:#FFF2D7;font:800 16px system-ui,sans-serif;cursor:pointer';
    button.addEventListener('click', retry); box.append(button);
  }
  root.append(box);
}

async function boot(): Promise<void> {
  show('Opening the doors…');
  try {
    const session = new Session(restaurant, http, undefined, redditJourneys);
    const error = await session.start();
    if (error) { show(error, () => void boot()); return; }
    // The Test Kitchen's scores live on the server too. Set before the kitchen code loads; a failure only means it starts empty.
    const arcade = await connectArcade(http);
    // Changes are batched for under a second; make sure the last ones leave before the tab is hidden.
    document.addEventListener('visibilitychange', () => { if (document.hidden) void session.flush(); });
    window.addEventListener('pagehide', () => { void session.flush(); void arcade.flush(); });
    // The dish a visiting neighbor would order: the most expensive one on this menu.
    startPresence(http, () => { const menu = restaurant.state.menu; return (Object.keys(menu) as (keyof typeof menu)[]).filter(d => menu[d].enabled).sort((a, b) => menu[b].price - menu[a].price)[0] ?? 'salad'; });
    await import('../main');
    // Ready once the scene has had a frame or two to draw, not merely when the code has loaded.
    requestAnimationFrame(() => requestAnimationFrame(() => redditJourneys.appReady()));
  } catch {
    show('Could not reach your restaurant. Check your connection.', () => void boot());
  }
}
void boot();
