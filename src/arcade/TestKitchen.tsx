import { useEffect, useSyncExternalStore } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Briefing, GameHUD, HomeScreen, ResultsScreen, Toolbar } from '@/components/KitchenUI';
import { KitchenAudio } from '@/game/audio';
import { engine } from '@/game/engine';
import KitchenScene from '@/scene/KitchenScene';
import { ArcadeShare } from './ArcadeShare';
import { DailyShiftCard } from './DailyShiftCard';
import { isTouchDevice, TouchControls } from './TouchControls';

/**
 * The hands-on kitchen, any time the doors are closed: three shifts, solo or two chefs, the practice tutorial and the scorecard.
 * It replaces the rooftop view while it is open, so only one WebGL context is alive. Scores and outfits are kept by the storage
 * driver (the server on Reddit, the browser elsewhere); nothing here can touch the restaurant's money or its score.
 */
export default function TestKitchen({ onExit, touch = isTouchDevice() }: { onExit: () => void; touch?: boolean }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot), today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    engine.setPhase('menu');
    const audio = new KitchenAudio();
    return () => { audio.dispose(); engine.setPhase('menu'); };
  }, []);
  const go = (path: string): void => engine.setPhase(path === '/briefing' ? 'briefing' : 'menu');
  const start = (practice = false): void => engine.start(practice);
  const props = { state, go, start };
  return <div className="fixed inset-0 z-0 overflow-hidden bg-teal" data-testid="test-kitchen">
    <KitchenScene state={state} />
    {state.phase === 'menu' && <HomeScreen {...props} />}
    {state.phase === 'briefing' && <Briefing {...props} />}
    {state.phase === 'playing' && <GameHUD state={state} />}
    {state.phase === 'results' && <ResultsScreen {...props} share={result => <ArcadeShare result={result} />} />}
    {state.phase === 'playing' && touch && state.mode === 'solo' && !state.paused && <TouchControls />}
    <Toolbar {...props} />
    {state.phase === 'menu' && <DailyShiftCard date={today} />}
    {state.phase !== 'playing' && <button type="button" onClick={onExit} className="pointer-events-auto fixed left-4 top-4 z-30 flex min-h-11 items-center gap-2 rounded-xl bg-ink/70 px-3 text-sm font-extrabold text-paper shadow-md md:left-8"><ArrowLeft size={18} aria-hidden />Back to your restaurant</button>}
  </div>;
}
