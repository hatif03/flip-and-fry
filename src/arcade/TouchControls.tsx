import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChefHat, Hand, Zap } from 'lucide-react';
import { engine } from '@/game/engine';
import { DASH_COOLDOWN_SECONDS } from '@/game/config';
import { cn } from '@/lib/utils';
import { getActiveInput } from '@/scene/KitchenScene';

/** A phone has no keyboard, so the solo kitchen gets a stick and three buttons. Every target is at least 44 px. */
const RADIUS = 46, DEAD = .18;

/** True on a touch screen. Tests can force it with ?touch=1. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('touch') === '1' || window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/** Keep the finger's events on the control even when it slides off. A browser can refuse for a pointer it no longer knows; the control still works. */
function capture(element: HTMLElement, id: number): void { try { element.setPointerCapture(id); } catch { /* not an active pointer */ } }

function Stick() {
  const base = useRef<HTMLDivElement>(null), [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const box = base.current?.getBoundingClientRect(); if (!box) return;
    const dx = event.clientX - (box.left + box.width / 2), dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy), scale = distance > RADIUS ? RADIUS / distance : 1, x = dx * scale / RADIUS, y = dy * scale / RADIUS;
    setKnob({ x: x * RADIUS, y: y * RADIUS });
    // Up on the screen is "forward" for the chef, which is y = +1 in the input.
    const input = getActiveInput(); if (input) { const live = Math.hypot(x, y) >= DEAD; input.touch.x = live ? x : 0; input.touch.y = live ? -y : 0; }
  };
  const release = (): void => { setKnob({ x: 0, y: 0 }); const input = getActiveInput(); if (input) { input.touch.x = 0; input.touch.y = 0; } };
  return <div ref={base} role="application" aria-label="Move the chef: drag" data-testid="stick" className="pointer-events-auto relative size-32 touch-none select-none rounded-full border-2 border-paper/60 bg-ink/35" onContextMenu={e => e.preventDefault()}
    onPointerDown={event => { capture(event.currentTarget, event.pointerId); move(event); }} onPointerMove={event => { if (event.buttons > 0 || event.currentTarget.hasPointerCapture(event.pointerId)) move(event); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <div aria-hidden className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-paper/70 shadow-md" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
  </div>;
}

function Button({ label, hint, className, children, down, up }: { label: string; hint: string; className?: string; children: React.ReactNode; down: () => void; up?: () => void }) {
  return <button type="button" aria-label={`${label}: ${hint}`} data-testid={`touch-${label.toLowerCase()}`} className={cn('pointer-events-auto flex touch-none select-none flex-col items-center justify-center gap-0.5 rounded-full border-2 border-paper/70 bg-teal/85 text-paper shadow-lg active:scale-95 active:bg-tomato', className)}
    onContextMenu={e => e.preventDefault()} onPointerDown={e => { capture(e.currentTarget, e.pointerId); down(); }} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
    {children}<span className="text-[10px] font-extrabold uppercase leading-none tracking-wide">{label}</span>
  </button>;
}

export function TouchControls() {
  const ready = engine.state.chefs[0].cooldown <= 0;
  return <div data-testid="touch-controls" className="pointer-events-none fixed inset-x-0 bottom-0 z-[25] h-[320px]">
    <div className="absolute bottom-[150px] left-3"><Stick /></div>
    <div className="absolute bottom-[104px] right-3 flex items-end gap-2">
      <Button label="Dash" hint={ready ? 'a short burst' : `ready in ${Math.ceil(engine.state.chefs[0].cooldown)} seconds`} className={cn('size-14', !ready && 'opacity-50')} down={() => { const input = getActiveInput(); if (input) input.touch.dash = true; }}><Zap size={20} aria-hidden /></Button>
      <div className="flex flex-col gap-2">
        <Button label="Work" hint="hold to chop, wash or put out a fire" className="size-[72px]" down={() => { const input = getActiveInput(); if (input) input.touch.work = true; }} up={() => { const input = getActiveInput(); if (input) input.touch.work = false; }}><ChefHat size={24} aria-hidden /></Button>
        <Button label="Pick" hint="pick up or put down" className="size-[72px] bg-tomato/90" down={() => { const input = getActiveInput(); if (input) input.touch.pick = true; }}><Hand size={24} aria-hidden /></Button>
      </div>
    </div>
    <p className="sr-only">Dash recharges in {DASH_COOLDOWN_SECONDS} seconds.</p>
  </div>;
}
