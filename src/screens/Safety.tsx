import { useState } from 'react';
import { LuPhone, LuLocateFixed, LuTriangleAlert, LuShieldCheck, LuTruck, LuSparkles, LuExternalLink, LuMoon } from 'react-icons/lu';
import { getPosition, lsGet, lsSet } from '../lib';
import { Topbar, toast } from '../ui';

/** Checklist whose ticks reset each day, kept only on this phone. */
function Checklist({ id, items }: { id: string; items: string[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<string[]>(() => {
    const saved = lsGet<{ day: string; done: string[] }>(`hg:check:${id}`, { day: today, done: [] });
    return saved.day === today ? saved.done : [];
  });
  const toggle = (it: string) => {
    const next = done.includes(it) ? done.filter((x) => x !== it) : [...done, it];
    setDone(next);
    lsSet(`hg:check:${id}`, { day: today, done: next });
  };
  return (
    <div className="list">
      {items.map((it) => (
        <label key={it} className="list-item" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={done.includes(it)} onChange={() => toggle(it)} style={{ width: 24, height: 24, accentColor: 'var(--primary-strong)' }} />
          <span className="grow">{it}</span>
        </label>
      ))}
    </div>
  );
}

export function Safety() {
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const locate = async () => {
    setLocating(true);
    try {
      const p = await getPosition();
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) });
    } catch {
      toast('Could not get a location fix. Describe the nearest town, farm or road instead.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <Topbar title="Safety" backTo="/more" />

      <div className="banner bad">
        <LuTriangleAlert />
        <div>
          <b>Severe reaction to a sting? Call now.</b>
          <p>Warning signs: swelling of the face, lips or throat, trouble breathing, wheezing, dizziness, collapse, or a rash spreading over the body. Use a prescribed adrenaline auto-injector straight away if there is one.</p>
        </div>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        <a className="btn danger" href="tel:10177"><LuPhone /> Ambulance 10177</a>
        <div className="grid-2">
          <a className="btn danger" href="tel:112"><LuPhone /> 112 from a cell phone</a>
          <a className="btn danger" href="tel:10111"><LuPhone /> Police 10111</a>
        </div>
        <button className="btn secondary" onClick={locate} disabled={locating}><LuLocateFixed /> {locating ? 'Finding your position…' : 'Show my position to read out'}</button>
        {pos && (
          <div className="card" role="status">
            <div className="big-num" style={{ fontSize: 24 }}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>Accurate to about {pos.acc} m. Read this out with the nearest town or farm name: emergency services may not get your exact location from the network. This position is not saved.</p>
          </div>
        )}
      </div>
      <p className="small muted">Move away from the hive first. Scrape a sting out with a fingernail or card. If a sting has ever caused a bad reaction, see a doctor before working bees again.</p>

      <h3 className="h2"><LuShieldCheck style={{ verticalAlign: -3 }} /> Before you open a hive</h3>
      <Checklist id="gear" items={['Veil and suit closed, no gaps at wrists and ankles', 'Gloves and boots on', 'Smoker lit, with spare fuel', 'Hive tool and a cloth', 'Water to drink and to put out sparks', 'Someone knows where you are and when you will be back', 'Weather is warm, calm and dry']} />

      <h3 className="h2"><LuSparkles style={{ verticalAlign: -3 }} /> Fire</h3>
      <div className="card stack small">
        <p style={{ margin: 0 }}>Smokers start veld fires. On hot, dry, windy days check the South African Weather Service fire danger warnings before you go out; an index above 75 means extreme risk.</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Clear dry grass where you light and put down the smoker.</li>
          <li>Keep water close; empty the smoker into a metal tin, not onto the ground.</li>
          <li>Never leave a smoker burning in the veld.</li>
        </ul>
        <a href="https://www.weathersa.co.za/" target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><LuExternalLink /> South African Weather Service</a>
      </div>

      <h3 className="h2"><LuTruck style={{ verticalAlign: -3 }} /> Moving hives</h3>
      <Checklist id="move" items={['Strap every hive so boxes cannot shift', 'Close entrances after dark, when the bees are home', 'Ventilate the hives for the trip', 'Shade and water ready at the new site', 'No Cape bees moved into African-bee country', 'No frames or boxes from a diseased hive', 'Landowner permission at the new site', 'Update the apiary in Honeyguide']} />
      <p className="small muted"><LuMoon style={{ verticalAlign: -2 }} /> Night mode (More › Display) is for moving and closing hives after dark, never for opening them.</p>

      <h3 className="h2">Keeping disease out</h3>
      <div className="card small stack">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Do not swap frames or boxes between colonies or apiaries without good reason.</li>
          <li>Clean your hive tool and gloves between apiaries, with alcohol or boiling water.</li>
          <li>Never feed honey from another colony; it can carry foulbrood spores.</li>
          <li>Report suspected American foulbrood to your provincial Department of Agriculture. It is a notifiable disease.</li>
        </ul>
        <p style={{ margin: 0 }} className="muted">Honeyguide never gives chemical treatment doses. Ask your extension officer or a vet.</p>
      </div>
      <p className="small muted">Draft safety content, awaiting review by a first-aid professional and an experienced beekeeper. Confirm emergency numbers for your area.</p>
    </>
  );
}
