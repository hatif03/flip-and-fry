import { context, requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';

const open = document.getElementById('open') as HTMLButtonElement;
const date = document.getElementById('date') as HTMLElement;
const who = document.getElementById('who') as HTMLElement;

// The game cannot auto-expand; it must come from this click.
open.addEventListener('click', event => requestExpandedMode(event, 'game'));

date.textContent = new Date().toISOString().slice(0, 10);
who.textContent = `Hello, ${context.username ?? 'chef'}`;

// Placeholder round trip to prove the server is reachable from the inline entry. P3/P4 replace it with /api/today.
void fetch('/api/init')
  .then(r => (r.ok ? (r.json() as Promise<InitResponse>) : null))
  .then(init => { if (init) date.textContent = init.date; })
  .catch(() => undefined);
