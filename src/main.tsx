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
import { Labels } from './screens/Labels';
import { CodeLink, Scan } from './screens/Scan';
import { ForageLibrary, PlantDetail } from './screens/Forage';
import { Safety } from './screens/Safety';
import { Academy, LessonView } from './screens/Learn';
import { FlowerMatch, HiveDoctor, PlayHub, WaggleLab } from './screens/Play';
import { TrapDetail, TrapForm, TrapList } from './screens/Field';
import { BusinessHub } from './screens/Business';
import { MoveDetail, MoveForm, MoveList } from './screens/Moves';
import { ContractDetail, ContractForm, ContractInvoice, ContractList } from './screens/Contracts';
import { BatchDetail, BatchForm, HarvestList } from './screens/Honey';
import { JobDetail, JobForm, JobInvoice, JobList } from './screens/Jobs';
import { IncidentDetail, IncidentForm, IncidentList, IncidentReport } from './screens/Incidents';
import { GroupDetail, JoinScreen, SharingHub } from './screens/Share';
import { AgreementDetail, AgreementForm, LandownerList, migrateLandowners } from './screens/Landowners';
import { EquipmentDetail, EquipmentForm, EquipmentList } from './screens/Equipment';
import { LossSurvey } from './screens/Survey';
import { SeasonReplay } from './screens/Replay';

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
  else if (path === '/scan') screen = <Scan then={query.get('then') || undefined} />;
  else if (seg[0] === 'h' && seg[1]) screen = <CodeLink code={decodeURIComponent(seg[1])} />;
  else if (path === '/labels') screen = <Labels hiveId={query.get('hive') || undefined} apiaryId={query.get('apiary') || undefined} />;
  else if (path === '/traps') screen = <TrapList />;
  else if (path === '/trap/new') screen = <TrapForm />;
  else if (seg[0] === 'trap' && seg[2] === 'edit') screen = <TrapForm id={seg[1]} />;
  else if (seg[0] === 'trap' && seg[1]) screen = <TrapDetail id={seg[1]} />;
  else if (path === '/business') screen = <BusinessHub />;
  else if (path === '/moves') screen = <MoveList />;
  else if (path === '/move/new') screen = <MoveForm fromId={query.get('from') || undefined} />;
  else if (seg[0] === 'move' && seg[2] === 'edit') screen = <MoveForm id={seg[1]} />;
  else if (seg[0] === 'move' && seg[1]) screen = <MoveDetail id={seg[1]} />;
  else if (path === '/contracts') screen = <ContractList />;
  else if (path === '/contract/new') screen = <ContractForm />;
  else if (seg[0] === 'contract' && seg[2] === 'edit') screen = <ContractForm id={seg[1]} />;
  else if (seg[0] === 'contract' && seg[2] === 'invoice') screen = <ContractInvoice id={seg[1]} />;
  else if (seg[0] === 'contract' && seg[1]) screen = <ContractDetail id={seg[1]} />;
  else if (path === '/harvests') screen = <HarvestList />;
  else if (path === '/batch/new') screen = <BatchForm />;
  else if (seg[0] === 'batch' && seg[2] === 'edit') screen = <BatchForm id={seg[1]} />;
  else if (seg[0] === 'batch' && seg[1]) screen = <BatchDetail id={seg[1]} />;
  else if (path === '/jobs') screen = <JobList />;
  else if (path === '/job/new') screen = <JobForm />;
  else if (seg[0] === 'job' && seg[2] === 'edit') screen = <JobForm id={seg[1]} />;
  else if (seg[0] === 'job' && seg[2] === 'invoice') screen = <JobInvoice id={seg[1]} />;
  else if (seg[0] === 'job' && seg[1]) screen = <JobDetail id={seg[1]} />;
  else if (path === '/incidents') screen = <IncidentList />;
  else if (path === '/incident/new') screen = <IncidentForm />;
  else if (seg[0] === 'incident' && seg[2] === 'edit') screen = <IncidentForm id={seg[1]} />;
  else if (seg[0] === 'incident' && seg[2] === 'report') screen = <IncidentReport id={seg[1]} />;
  else if (seg[0] === 'incident' && seg[1]) screen = <IncidentDetail id={seg[1]} />;
  else if (path === '/sharing') screen = <SharingHub />;
  else if (seg[0] === 'group' && seg[1]) screen = <GroupDetail id={seg[1]} />;
  else if (seg[0] === 'join') screen = <JoinScreen code={seg[1] ? decodeURIComponent(seg[1]) : undefined} />;
  else if (path === '/landowners') screen = <LandownerList />;
  else if (path === '/agreement/new') screen = <AgreementForm apiaryId={query.get('apiary') || undefined} />;
  else if (seg[0] === 'agreement' && seg[2] === 'edit') screen = <AgreementForm id={seg[1]} />;
  else if (seg[0] === 'agreement' && seg[1]) screen = <AgreementDetail id={seg[1]} />;
  else if (path === '/equipment') screen = <EquipmentList />;
  else if (path === '/equipment/new') screen = <EquipmentForm fromHive={query.get('from') || undefined} />;
  else if (seg[0] === 'equipment' && seg[2] === 'edit') screen = <EquipmentForm id={seg[1]} />;
  else if (seg[0] === 'equipment' && seg[1]) screen = <EquipmentDetail id={seg[1]} />;
  else if (path === '/survey') screen = <LossSurvey />;
  else if (path === '/replay') screen = <SeasonReplay />;
  else if (path === '/forage') screen = <ForageLibrary />;
  else if (seg[0] === 'plant' && seg[1]) screen = <PlantDetail id={seg[1]} />;
  else if (path === '/safety') screen = <Safety />;
  else if (path === '/learn') screen = <Academy />;
  else if (seg[0] === 'learn' && seg[1]) screen = <LessonView id={seg[1]} />;
  else if (path === '/play') screen = <PlayHub />;
  else if (path === '/play/waggle') screen = <WaggleLab />;
  else if (path === '/play/flowers') screen = <FlowerMatch />;
  else if (path === '/play/doctor') screen = <HiveDoctor />;
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
  await migrateLandowners().catch(console.error);
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
