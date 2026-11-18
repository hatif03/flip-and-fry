import { context, requestExpandedMode } from '@devvit/web/client';
import { splashText } from './splash-text';

const open = document.getElementById('open') as HTMLButtonElement;
const text = splashText(context.postData as Record<string, unknown> | undefined, context.username);
for (const [id, value] of Object.entries({ date: text.eyebrow, title: text.title, blurb: text.blurb, who: text.byline })) (document.getElementById(id) as HTMLElement).textContent = value;

// The game cannot auto-expand; it must come from this tap. Nothing else happens here: no server call, nothing to load.
open.addEventListener('click', event => requestExpandedMode(event, 'game'));
