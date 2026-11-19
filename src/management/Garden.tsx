import { useCallback, useEffect, useState } from 'react';
import { Droplets, Hammer, Hand, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import { cue } from '@/audio/cues';
import { cn } from '@/lib/utils';
import { CROPS, CROP_IDS, LEVEL_XP, PREPPED_SPEED, WATER_CUT, type CropId } from './crops';
import { restaurant } from './engine';
import { money } from './format';
import type { PlotView, WorldView } from '../shared/api';

/** "1h 20m", "12m", "45s": the time left, from the server's own clock offset. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
}

const Dot = ({ crop }: { crop: CropId }) => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full border border-ink/30" style={{ background: CROPS[crop].color }} />;

/**
 * The rooftop garden: plant, water, harvest on the server's clock, then spend the harvest in the dishes or at the order board. Only on Reddit,
 * and only between services: a service in progress holds the restaurant, so the garden waits.
 */
export function Garden() {
  const world = restaurant.remote?.world, [view, setView] = useState<WorldView | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0), [, setTick] = useState(0);
  const apply = useCallback((v: WorldView): void => { setView(v); setOffset(v.now - Date.now()); setError(null); }, []);
  useEffect(() => { let live = true; void world?.load().then(r => { if (!live) return; if ('error' in r) setError(r.error); else apply(r); }); return () => { live = false; }; }, [world, apply]);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(id); }, []);
  // A bed tapped on the farm changes the shared view; the panel follows it.
  const seen = world?.peek?.();
  useEffect(() => { if (seen && seen.view !== view) apply(seen.view); }, [seen, view, apply]);
  if (!world) return <p className="text-sm text-ink/65">The garden grows on Reddit, where it keeps time while you are away.</p>;
  const act = async (path: 'plant' | 'water' | 'harvest' | 'deliver' | 'upgrade' | 'rush' | 'claim' | 'leave' | 'take' | 'craft' | 'collect' | 'layoutsave' | 'layoutuse', body: { plot?: number; crop?: string; index?: number }, done?: string): Promise<void> => {
    setBusy(true); const r = await world.act(path, body); setBusy(false);
    if ('error' in r) { toast.error(r.error); return; }
    apply(r); if (done) toast.success(done); cue(path === 'harvest' ? 'pop' : path === 'upgrade' || path === 'rush' ? 'hammer' : path === 'deliver' ? 'coin' : 'plop');
  };
  if (!view) return <p role="status" className="text-sm text-ink/65">{error ?? 'Walking out to the roof…'}</p>;
  const now = Date.now() + offset, planning = restaurant.state.phase === 'planning';
  const base = LEVEL_XP[view.level - 1], pct = view.nextXp ? Math.min(100, Math.round((view.xp - base) / (view.nextXp - base) * 100)) : 100;
  const have = CROP_IDS.filter(c => (view.pantry[c] ?? 0) > 0);
  return <div className="space-y-3">
    <section aria-label="Level">
      <div className="flex items-baseline justify-between"><p className="font-display text-lg">Level {view.level}</p><p className="text-xs font-bold text-ink/60">{view.nextXp ? `${view.xp} / ${view.nextXp} XP` : `${view.xp} XP · top level`}</p></div>
      <div role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></div>
    </section>
    <section aria-label="The garden">
      <h3 className="mb-1 text-lg">Rooftop garden</h3>
      {!planning && <p className="mb-2 rounded-xl bg-gold/20 p-2 text-xs font-bold">The garden waits until the doors are shut.</p>}
      <ul className="space-y-2">{view.plots.map(p => <li key={p.index}><PlotCard plot={p} now={now} cash={view.cash} level={view.level} busy={busy || !planning} onPlant={crop => void act('plant', { plot: p.index, crop }, `${CROPS[crop].name} planted.`)} onWater={() => void act('water', { plot: p.index })} onHarvest={() => void act('harvest', { plot: p.index }, 'Harvested into the pantry.')} /></li>)}</ul>
      {view.level < 5 && <p className="mt-2 text-[11px] text-ink/55">More plots open at levels 3 and 5. New seeds open as you level up.</p>}
    </section>
    <section aria-label="Pantry">
      <h3 className="mb-1 text-lg">Pantry</h3>
      {have.length ? <ul className="flex flex-wrap gap-1.5">{have.map(c => <li key={c} className="flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-xs font-extrabold"><Dot crop={c} />{CROPS[c].name} <span className="tabular-nums">×{view.pantry[c]}</span></li>)}</ul>
        : <p className="text-xs text-ink/60">Empty. Dishes made from your own produce cost nothing in ingredients and tip 15% more.</p>}
    </section>
    <section aria-label="The workshop">
      <h3 className="mb-1 text-lg">Workshop</h3>
      <p className="mb-2 text-[11px] text-ink/60">Turn produce into stock, dough and pickles. A dish that uses one cooks {Math.round(PREPPED_SPEED * 100)}% faster in your team's hands and tips 10% more.</p>
      <ul className="space-y-2">{view.workshop.map(w => { const left = w.readyAt === null ? null : w.readyAt - now, have = view.pantry as Record<string, number | undefined>;
        return <li key={w.good} className={cn('rounded-2xl border p-3', left !== null && left <= 0 ? 'border-gold bg-gold/15' : 'border-ink/10 bg-white/40', !w.unlocked && 'opacity-60')}>
          <p className="flex items-baseline justify-between gap-2 text-sm font-extrabold"><span>{w.name} <span className="font-normal text-ink/55">×{w.yield}{(have[w.good] ?? 0) > 0 ? ` · you have ${have[w.good]}` : ''}</span></span><span className="tabular-nums text-ink/65">{!w.unlocked ? `Level ${w.level}` : left === null ? countdown(w.seconds * 1000) : left <= 0 ? 'ready' : countdown(left)}</span></p>
          <p className="mt-1 flex flex-wrap gap-1.5">{w.inputs.map(i => <span key={i.crop} className="flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold"><Dot crop={i.crop} />{i.n} {CROPS[i.crop].name.toLowerCase()} <span className={cn('tabular-nums', (view.pantry[i.crop] ?? 0) >= i.n ? 'text-teal' : 'text-tomato')}>({view.pantry[i.crop] ?? 0})</span></span>)}</p>
          {left !== null && left <= 0 ? <button type="button" disabled={busy || !planning} onClick={() => void act('collect', { crop: w.good }, `${w.name} collected.`)} className="mt-2 min-h-[44px] w-full rounded-xl bg-teal px-3 text-sm font-extrabold text-paper motion-safe:animate-pulse disabled:opacity-40">Collect ×{w.yield}</button>
            : <button type="button" disabled={busy || !planning || !w.canStart} onClick={() => void act('craft', { crop: w.good }, `${w.name} is on.`)} className="mt-2 min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-40">{left !== null ? 'Cooking' : w.unlocked ? (w.canStart ? 'Start a batch' : 'Need more produce') : `Opens at level ${w.level}`}</button>}
        </li>; })}</ul>
    </section>
    <section aria-label="The builder">
      <h3 className="mb-1 text-lg">Builder</h3>
      <p className="mb-2 text-[11px] text-ink/60">{view.builders.count === 1 ? 'One builder; a second joins at level 4.' : 'Two builders.'} A better station cooks faster and tips more. It takes real time, so start one before you go.</p>
      <ul className="space-y-2">
        {view.builders.jobs.map(j => { const left = j.readyAt - now; return <li key={j.furnitureId} className="rounded-2xl border border-gold bg-gold/15 p-3">
          <p className="flex items-center justify-between gap-2 text-sm font-extrabold"><span className="flex items-center gap-2"><Hammer size={16} aria-hidden />{j.name} to level {j.toLevel}</span><span className="tabular-nums text-ink/65">{left <= 0 ? 'done' : countdown(left)}</span></p>
          <button type="button" disabled={busy || !planning || view.builders.rushUsed || left <= 0 || view.cash < j.rushCost} onClick={() => void act('rush', { index: j.furnitureId }, 'Overtime paid. Finished.')} className="mt-2 min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-40">{view.builders.rushUsed ? 'Overtime used today' : `Pay overtime · ${money(j.rushCost)}`}</button>
        </li>; })}
        {view.stations.map(st => { const working = view.builders.jobs.some(j => j.furnitureId === st.id), blocked = view.builders.jobs.length >= view.builders.count;
          return <li key={st.id} className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/40 p-2.5">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{st.name} <span className="font-normal text-ink/55">level {st.level}</span></p>{st.next && <p className="text-[11px] text-ink/55">{st.next.levelNeeded > view.level ? `Needs restaurant level ${st.next.levelNeeded}` : `${money(st.next.cost)} · ${countdown(st.next.seconds * 1000)}`}</p>}</div>
            {st.next ? <button type="button" aria-label={`Upgrade ${st.name} to level ${st.next.toLevel}`} disabled={busy || !planning || working || blocked || st.next.levelNeeded > view.level || view.cash < st.next.cost} onClick={() => void act('upgrade', { index: st.id }, `${st.name}: a builder is on it.`)} className="min-h-[44px] shrink-0 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-40">{working ? 'Building' : `Level ${st.next.toLevel}`}</button> : <span className="shrink-0 text-xs font-extrabold text-teal">Top level</span>}
          </li>; })}
      </ul>
    </section>
    <section aria-label="The block">
      <h3 className="mb-1 text-lg">The block</h3>
      <div className="rounded-2xl border border-ink/10 bg-white/40 p-3">
        <p className="flex items-baseline justify-between text-sm font-extrabold"><span>Block party</span><span className="tabular-nums text-ink/65">{view.block.party.stars} stars this week</span></p>
        <p className="text-[11px] text-ink/55">Every verified star from this community counts{view.block.party.mine ? `; you added ${view.block.party.mine}` : '. Earn a star to share in the gifts'}.</p>
        <ul className="mt-2 flex gap-1.5">{view.block.party.tiers.map((t, i) => <li key={t.at} className="min-w-0 flex-1"><button type="button" disabled={!t.canClaim || busy || !planning} aria-label={`Party gift at ${t.at} stars: ${money(t.reward)}${t.claimed ? ', collected' : t.reached ? '' : ', not reached yet'}`} onClick={() => void act('claim', { index: i }, `A gift from the block: ${money(t.reward)}.`)} className={cn('flex min-h-[44px] w-full flex-col items-center justify-center rounded-xl border px-1 text-[11px] font-extrabold disabled:opacity-60', t.canClaim ? 'border-gold bg-gold text-ink motion-safe:animate-pulse' : t.claimed ? 'border-teal/40 bg-teal/10 text-teal' : 'border-ink/15 bg-paper')}><span>{t.at}★</span><span>{t.claimed ? 'Collected' : money(t.reward)}</span></button></li>)}</ul>
      </div>
      <div className="mt-2 rounded-2xl border border-ink/10 bg-white/40 p-3">
        <p className="text-sm font-extrabold">Shared fridge</p>
        <p className="text-[11px] text-ink/55">Leave one crop a day for a neighbor; take one a day.</p>
        {CROP_IDS.some(c => view.block.fridge.items[c]) ? <ul className="mt-2 flex flex-wrap gap-1.5">{CROP_IDS.filter(c => view.block.fridge.items[c]).map(c => <li key={c}><button type="button" disabled={view.block.fridge.took || busy || !planning} aria-label={`Take ${CROPS[c].name.toLowerCase()} from the fridge`} onClick={() => void act('take', { crop: c }, `${CROPS[c].name} taken.`)} className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal/10 px-3 text-xs font-extrabold disabled:opacity-50"><Dot crop={c} />{CROPS[c].name} ×{view.block.fridge.items[c]}</button></li>)}</ul> : <p className="mt-2 text-xs text-ink/60">The fridge is empty. Leave something for the next neighbor.</p>}
        {have.length > 0 && !view.block.fridge.left && <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-bold text-ink/55">Leave one:</span>{have.map(c => <button key={c} type="button" disabled={busy || !planning} aria-label={`Leave ${CROPS[c].name.toLowerCase()} in the fridge`} onClick={() => void act('leave', { crop: c }, `${CROPS[c].name} left for a neighbor.`)} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/15 bg-paper px-3 text-xs font-extrabold disabled:opacity-50"><Dot crop={c} />{CROPS[c].name}</button>)}</div>}
        {view.block.fridge.left && <p className="mt-2 text-[11px] font-bold text-teal">You left something today. Thank you.</p>}
      </div>
    </section>
    <section aria-label="The order board">
      <h3 className="mb-1 text-lg">Order board</h3>
      <ul className="space-y-2">{view.orders.map(o => <li key={o.index} className={cn('rounded-2xl border p-3', o.done ? 'border-teal/30 bg-teal/5 opacity-70' : 'border-ink/10 bg-white/40')}>
        <p className="flex items-baseline justify-between gap-2 text-sm font-extrabold"><span>{o.name} the {o.species}</span><span className="text-teal">{money(o.reward)} · {o.xp} XP</span></p>
        <p className="mt-1 flex flex-wrap gap-1.5">{o.wants.map(w => <span key={w.crop} className="flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold"><Dot crop={w.crop} />{w.n} {CROPS[w.crop].name.toLowerCase()} <span className={cn('tabular-nums', (view.pantry[w.crop] ?? 0) >= w.n ? 'text-teal' : 'text-tomato')}>({view.pantry[w.crop] ?? 0})</span></span>)}</p>
        <button type="button" disabled={o.done || !o.canFill || busy || !planning} onClick={() => void act('deliver', { index: o.index }, `${o.name} says thank you.`)} className="mt-2 min-h-[44px] w-full rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-40">{o.done ? 'Delivered' : o.canFill ? 'Deliver' : 'Need more produce'}</button>
      </li>)}</ul>
    </section>
  </div>;
}

function PlotCard({ plot, now, cash, level, busy, onPlant, onWater, onHarvest }: { plot: PlotView; now: number; cash: number; level: number; busy: boolean; onPlant: (crop: CropId) => void; onWater: () => void; onHarvest: () => void }) {
  if (!plot.crop) return <div className="rounded-2xl border border-dashed border-teal/40 bg-teal/5 p-3">
    <p className="mb-2 flex items-center gap-2 text-sm font-extrabold"><Sprout size={16} aria-hidden />Plot {plot.index + 1} is empty</p>
    <div className="flex flex-wrap gap-1.5">{CROP_IDS.map(c => { const locked = CROPS[c].level > level; return <button key={c} type="button" disabled={busy || locked || cash < CROPS[c].seed} aria-label={locked ? `${CROPS[c].name}, level ${CROPS[c].level}` : `Plant ${CROPS[c].name.toLowerCase()} for ${money(CROPS[c].seed)}`} onClick={() => onPlant(c)} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/15 bg-paper px-2.5 text-xs font-extrabold disabled:opacity-40"><Dot crop={c} />{CROPS[c].name}<span className="font-normal text-ink/55">{locked ? `L${CROPS[c].level}` : `${money(CROPS[c].seed)} · ${countdown(CROPS[c].seconds * 1000)}`}</span></button>; })}</div>
  </div>;
  const info = CROPS[plot.crop], left = plot.readyAt - now, grown = Math.min(1, Math.max(0, (now - plot.plantedAt) / Math.max(1, plot.readyAt - plot.plantedAt)));
  return <div className={cn('rounded-2xl border p-3', left <= 0 ? 'border-gold bg-gold/15' : 'border-ink/10 bg-white/40')}>
    <p className="flex items-center justify-between gap-2 text-sm font-extrabold"><span className="flex items-center gap-2"><Dot crop={plot.crop} />{info.name}</span><span className="tabular-nums text-ink/65">{left <= 0 ? (plot.wilted ? 'wilting' : 'ready') : countdown(left)}</span></p>
    <div role="progressbar" aria-label={`${info.name} growth`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(grown * 100)} className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-teal" style={{ width: `${grown * 100}%` }} /></div>
    <div className="mt-2 flex gap-2">
      {left <= 0 ? <button type="button" disabled={busy} onClick={onHarvest} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper motion-safe:animate-pulse disabled:opacity-40"><Hand size={16} aria-hidden />Harvest ×{plot.yield}{plot.wilted ? ' (wilted)' : ''}</button>
        : <button type="button" disabled={busy || plot.watered} onClick={onWater} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-50"><Droplets size={16} aria-hidden />{plot.watered ? 'Watered' : `Water · ${Math.round(WATER_CUT * 100)}% faster`}</button>}
    </div>
  </div>;
}
