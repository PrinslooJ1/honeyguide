import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { applyTheme, getSettings, useSettings } from './settings';
import { initAuth, onAuth, startAutoSync } from './sync';
import { Nav, OfflineStrip, ToastHost, useRoute } from './ui';
import { Home } from './screens/Home';
import { ApiaryDetail, ApiaryForm, ApiaryList } from './screens/Apiaries';
import { HiveDetail, HiveForm } from './screens/Hives';
import { InspectFlow, InspectPicker, InspectionView } from './screens/Inspect';
import { Log } from './screens/Log';
import { More } from './screens/More';
import { Onboarding } from './screens/Onboarding';
import { LockScreen } from './screens/Lock';

applyTheme();

function useLock() {
  const s = useSettings();
  const [locked, setLocked] = useState(Boolean(getSettings().lock));
  useEffect(() => {
    if (!s.lock) return setLocked(false);
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > (s.lock!.afterMinutes || 0) * 60000) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [s.lock]);
  return { locked, unlock: () => setLocked(false) };
}

function App() {
  const settings = useSettings();
  const { path, query } = useRoute();
  const { locked, unlock } = useLock();
  const [, force] = useState(0);
  useEffect(() => onAuth(() => force((n) => n + 1)) as () => void, []);

  if (locked) return <LockScreen onUnlock={unlock} />;
  if (!settings.onboarded) return <Onboarding />;

  const seg = path.split('/').filter(Boolean);
  let screen;
  let flow = false;
  if (path === '/') screen = <Home />;
  else if (path === '/apiaries') screen = <ApiaryList />;
  else if (path === '/apiary/new') screen = <ApiaryForm />;
  else if (seg[0] === 'apiary' && seg[2] === 'edit') screen = <ApiaryForm id={seg[1]} />;
  else if (seg[0] === 'apiary') screen = <ApiaryDetail id={seg[1]} />;
  else if (path === '/hive/new') screen = <HiveForm apiaryId={query.get('apiary') || undefined} />;
  else if (seg[0] === 'hive' && seg[2] === 'edit') screen = <HiveForm id={seg[1]} />;
  else if (seg[0] === 'hive') screen = <HiveDetail id={seg[1]} />;
  else if (path === '/inspect') screen = <InspectPicker />;
  else if (seg[0] === 'inspect') {
    screen = <InspectFlow hiveId={seg[1]} />;
    flow = true;
  } else if (seg[0] === 'inspection') screen = <InspectionView id={seg[1]} />;
  else if (path === '/log') screen = <Log />;
  else if (path.startsWith('/more')) screen = <More />;
  else screen = <Home />;

  return (
    <div className="app">
      <OfflineStrip />
      <main className="main">{screen}</main>
      {!flow && <Nav path={path} />}
      <ToastHost />
    </div>
  );
}

async function boot() {
  await initAuth();
  startAutoSync();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
  navigator.storage?.persist?.();
}
boot();
