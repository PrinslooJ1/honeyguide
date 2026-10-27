import { useState } from 'react';
import { LuBird, LuExternalLink, LuFlower2, LuTriangleAlert, LuInfo, LuCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Bloom, Profile } from '../db';
import { MONTHS, OUTLOOK_TEXT, PLANTS, getPlant, outlookFor, plantMonths, plantsForProvince, type Plant } from '../content/forage';
import { PROVINCES, fmtDate } from '../lib';
import { Empty, Field, ListLink, Sheet, Topbar, toast } from '../ui';

const REWARD = { nectar: 'Nectar', pollen: 'Pollen', both: 'Nectar and pollen' } as const;

/** A small flower mark per plant group: an illustration, not a photo. */
export function PlantMark({ plant, size = 44 }: { plant: Plant; size?: number }) {
  const colour = { aloe: '#E0612B', tree: '#E8B90F', fynbos: '#C2447A', crop: '#E8C547', weed: '#E8B90F' }[plant.group];
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" style={{ flex: 'none' }}>
      <rect width="44" height="44" rx="12" fill="var(--surface-2)" />
      {plant.group === 'aloe' ? (
        <g><path d="M22 36V14" stroke="var(--good)" strokeWidth="2" />{[10, 14, 18, 22].map((y, i) => <path key={i} d={`M22 ${y}l-4 3M22 ${y}l4 3`} stroke={colour} strokeWidth="2.5" strokeLinecap="round" />)}<path d="M14 38c3-5 5-7 8-8 3 1 5 3 8 8" fill="none" stroke="var(--good)" strokeWidth="2" /></g>
      ) : plant.group === 'tree' ? (
        <g>{[[15, 16], [27, 14], [21, 24], [30, 25], [13, 27]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.5" fill={colour} />)}<path d="M22 38V28" stroke="var(--accent)" strokeWidth="2.5" /></g>
      ) : plant.group === 'fynbos' ? (
        <g>{[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="22" cy="14" rx="3.5" ry="8" fill={colour} transform={`rotate(${a} 22 22)`} opacity=".85" />)}<circle cx="22" cy="22" r="4" fill="#F5C518" /></g>
      ) : (
        <g>{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <ellipse key={a} cx="22" cy="12" rx="3" ry="7" fill={colour} transform={`rotate(${a} 22 22)`} />)}<circle cx="22" cy="22" r="5" fill="var(--accent)" /></g>
      )}
    </svg>
  );
}

export function MonthBar({ months, peak = [], now = new Date().getMonth() + 1 }: { months: number[]; peak?: number[]; now?: number }) {
  return (
    <div className="month-bar" role="img" aria-label={`Flowers in ${months.map((m) => MONTHS[m - 1]).join(', ')}`}>
      {MONTHS.map((label, i) => {
        const m = i + 1;
        const cls = peak.includes(m) ? 'peak' : months.includes(m) ? 'on' : '';
        return <span key={label} className={`${cls} ${m === now ? 'now' : ''}`} title={label}><i>{label[0]}</i></span>;
      })}
    </div>
  );
}

function Flags({ p }: { p: Plant }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <span className="badge">{REWARD[p.reward]}</span>
      {p.birds && <span className="badge warn"><LuBird /> Mainly birds</span>}
      {p.invasive && <span className="badge bad">Invasive: never plant</span>}
      {p.general && <span className="badge">General window</span>}
    </span>
  );
}

export function ForageLibrary() {
  const profile = db.useLive(async () => (await db.all<Profile>('profiles'))[0]);
  const [province, setProvince] = useState<string | undefined>();
  const prov = province ?? profile?.province ?? '';
  const month = new Date().getMonth() + 1;
  const plants = plantsForProvince(prov || undefined).sort((a, b) => Number(plantMonths(b, prov).includes(month)) - Number(plantMonths(a, prov).includes(month)));
  return (
    <>
      <Topbar title="Forage" backTo="/" />
      <p className="muted" style={{ marginTop: 0 }}>Plants South African beekeepers report as bee forage, with their reported flowering months. Windows shift with rain and altitude, so log what you see with Bloom Watch.</p>
      <Field label="Province">
        <select className="input" value={prov} onChange={(e) => setProvince(e.target.value)}>
          <option value="">All provinces</option>
          {PROVINCES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </Field>
      <h3 className="h2">In bloom now and later</h3>
      <div className="list">
        {plants.map((p) => (
          <ListLink key={p.id} href={`/plant/${p.id}`} left={<PlantMark plant={p} />}
            title={<>{p.name} {plantMonths(p, prov).includes(month) && <span className="badge good">In season</span>}</>}
            sub={<MonthBar months={plantMonths(p, prov)} peak={p.peak} />} />
        ))}
      </div>
      <p className="small muted">Source: SANBI list of plants important to South African beekeepers (beekeeper survey, by home province; not ranked). Cards await expert review.</p>
    </>
  );
}

export function PlantDetail({ id }: { id: string }) {
  const p = getPlant(id);
  const data = db.useLive(async () => {
    const [blooms, apiaries, profiles] = await Promise.all([db.byIndex<Bloom>('blooms', 'plant_id', id), db.all<Apiary>('apiaries'), db.all<Profile>('profiles')]);
    blooms.sort((a, b) => b.seen_at.localeCompare(a.seen_at));
    return { blooms, apiaries, province: profiles[0]?.province };
  }, [id]);
  const [sheet, setSheet] = useState(false);
  if (!p) return (<><Topbar title="Plant" backTo="/forage" /><Empty title="Plant not found" text="It may have been removed from the library." /></>);
  const prov = data?.province;
  const months = plantMonths(p, prov);

  const logBloom = async (apiaryId: string | null) => {
    const apiary = data?.apiaries.find((a) => a.id === apiaryId);
    const recent = data?.blooms.find((b) => Date.now() - new Date(b.seen_at).getTime() < 7 * 86400000 && (b.apiary_id || null) === apiaryId);
    if (recent) {
      setSheet(false);
      return toast('Already logged this week. Thank you!');
    }
    await db.save<Bloom>('blooms', { id: db.uuid(), plant_id: p.id, apiary_id: apiaryId, province: apiary?.province || prov, seen_at: new Date().toISOString() });
    setSheet(false);
    toast(`${p.name} logged as in bloom`);
  };

  return (
    <>
      <Topbar title={p.name} backTo="/forage" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <PlantMark plant={p} size={64} />
        <div className="grow">
          {p.latin && <div className="muted" style={{ fontStyle: 'italic' }}>{p.latin}</div>}
          <div style={{ marginTop: 6 }}><Flags p={p} /></div>
        </div>
      </div>
      <h3 className="h2">Reported flowering</h3>
      <MonthBar months={months} peak={p.peak} />
      <p className="small muted">{p.general ? 'A general guide, not from the beekeeper survey.' : `Reported by beekeepers${p.monthsByProvince && prov && p.monthsByProvince[prov] ? ` in ${prov}` : ''}.`}{p.peak ? ' Darker months are the peak.' : ''}</p>
      {p.monthsByProvince && (
        <div className="card small"><b>Varies by province</b>
          {Object.entries(p.monthsByProvince).map(([k, v]) => <div key={k}>{k}: {MONTHS[v[0] - 1]} to {MONTHS[v[v.length - 1] - 1]}</div>)}
        </div>
      )}
      <h3 className="h2">How bees use it</h3>
      <p style={{ marginTop: 0 }}>{p.engage}</p>
      {p.note && <div className={`banner ${p.invasive ? 'bad' : 'info'}`}>{p.invasive ? <LuTriangleAlert /> : <LuInfo />}<div><p style={{ marginTop: 0 }}>{p.note}</p></div></div>}
      {p.birds && <p className="small muted">A showy flower is not always a bee flower: this one leans on birds for pollination.</p>}

      <button className="btn" style={{ marginTop: 16 }} onClick={() => setSheet(true)}><LuFlower2 /> In bloom near me now</button>
      {data && data.blooms.length > 0 && (
        <>
          <h3 className="h2">Your sightings</h3>
          <div className="list">
            {data.blooms.slice(0, 8).map((b) => (
              <div key={b.id} className="list-item"><LuCheck className="tone-good" /><div className="grow"><div className="title">{fmtDate(b.seen_at)}</div><div className="sub">{data.apiaries.find((a) => a.id === b.apiary_id)?.name || b.province || 'No apiary'}</div></div></div>
            ))}
          </div>
        </>
      )}
      <h3 className="h2">Sources</h3>
      <div className="stack small">
        {p.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><LuExternalLink /> {s.label}</a>)}
      </div>
      <p className="small muted">Photo to come: only CC0 or CC BY images, checked by an expert to show a honeybee on this flower.</p>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Where did you see it?">
        <p className="small muted" style={{ marginTop: 0 }}>Bloom Watch stores the apiary, never your current position. Regional counts are shown only when several beekeepers report.</p>
        <div className="stack">
          {data?.apiaries.map((a) => <button key={a.id} className="btn secondary" onClick={() => logBloom(a.id)}>{a.name}</button>)}
          <button className="btn ghost" onClick={() => logBloom(null)}>Somewhere else in {prov || 'my province'}</button>
        </div>
      </Sheet>
    </>
  );
}

/** Per-apiary 12-month calendar and the 8-week outlook. */
export function ApiaryForage({ apiary }: { apiary: Apiary }) {
  const tagged = (apiary.forage_plants || []).map(getPlant).filter(Boolean) as Plant[];
  const plants = tagged.length ? tagged : plantsForProvince(apiary.province);
  if (!plants.length) return null;
  const o = outlookFor(plants, apiary.province);
  const month = new Date().getMonth() + 1;
  const tone = o.now.kind === 'dearth' ? 'warn' : o.now.kind === 'flow' ? 'good' : 'info';
  return (
    <>
      <h3 className="h2">Forage</h3>
      <div className={`banner ${tone}`}>
        <LuFlower2 />
        <div>
          <b>{OUTLOOK_TEXT[o.now.kind]}</b>
          <p>
            {o.now.blooming.length ? `In bloom: ${o.now.blooming.map((p) => p.name).join(', ')}. ` : ''}
            {o.dearthAhead ? 'A dearth is likely in the next 8 weeks: check stores and avoid unnecessary opening.' : o.flowAhead ? 'A flow is likely in the next 8 weeks: make sure colonies have space.' : ''}
          </p>
        </div>
      </div>
      <div className="forage-cal" style={{ marginTop: 10 }}>
        <div className="forage-row head"><span /> {MONTHS.map((m, i) => <i key={m} className={i + 1 === month ? 'now' : ''}>{m[0]}</i>)}</div>
        {plants.map((p) => (
          <a key={p.id} className="forage-row" href={`#/plant/${p.id}`}>
            <span>{p.name}</span>
            {MONTHS.map((m, i) => <i key={m} className={`${plantMonths(p, apiary.province).includes(i + 1) ? (p.birds ? 'half' : 'on') : ''} ${i + 1 === month ? 'now' : ''}`} />)}
          </a>
        ))}
      </div>
      <p className="small muted">{tagged.length ? 'Plants you tagged at this apiary.' : `Plants beekeepers report in ${apiary.province || 'South Africa'}. Edit the apiary to tag what actually grows nearby.`} Lighter cells: mainly bird-pollinated.</p>
    </>
  );
}

export function ForagePicker({ province, value, onChange }: { province?: string; value: string[]; onChange: (v: string[]) => void }) {
  const plants = plantsForProvince(province);
  return (
    <div className="pills" role="group" aria-label="Forage near this apiary">
      {plants.map((p) => (
        <button key={p.id} type="button" className="pill" aria-pressed={value.includes(p.id)} onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}>
          {value.includes(p.id) && <LuCheck />}{p.name}
        </button>
      ))}
    </div>
  );
}

export const ALL_PLANTS = PLANTS;
