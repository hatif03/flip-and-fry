import { lazy, Suspense, useState } from 'react';
import ManagementGame from '@/management/ManagementGame';

// The hands-on kitchen is its own chunk: nobody downloads it until they open the Test Kitchen.
const TestKitchen = lazy(() => import('@/arcade/TestKitchen'));

/** The rooftop restaurant, or the Test Kitchen in its place (only one 3D scene is alive at a time). */
export default function Index() {
  const [view, setView] = useState<'rooftop' | 'kitchen'>('rooftop');
  if (view === 'kitchen') return <Suspense fallback={<div role="status" className="fixed inset-0 grid place-items-center bg-teal font-display text-xl text-paper">Heating the grill…</div>}><TestKitchen onExit={() => setView('rooftop')} /></Suspense>;
  return <ManagementGame onTestKitchen={() => setView('kitchen')} />;
}
