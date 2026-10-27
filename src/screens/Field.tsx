// Release 1.1 field records: swarm traps, colony autopsy and the weight / lift log.
import { useEffect, useState } from 'react';
import { LuPlus, LuCheck, LuScale, LuTriangleAlert, LuBox, LuTrash2, LuPencil } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Trap, Weight } from '../db';
import { agoLabel, daysAgo, fmtDate, getPosition, roundCoord, shortCode } from '../lib';
import { getSettings } from '../settings';
import { Empty, Field, ListLink, Pills, Seg, Sheet, Stepper, Topbar, back, go, toast } from '../ui';

// ---------------- colony autopsy ----------------
// Mirrors the causes beekeepers named in the national loss survey (Pirk et al. 2014), plus theft, fire and drought.
export const LOSS_CAUSES = [
  { value: 'small_hive_beetle', label: 'Small hive beetle' },
  { value: 'absconding', label: 'Absconded, no clear cause' },
  { value: 'varroa', label: 'Varroa' },
  { value: 'chalkbrood', label: 'Chalkbrood' },
  { value: 'capensis', label: 'Capensis parasitism' },
  { value: 'queen_failure', label: 'Queen failure' },
  { value: 'starvation', label: 'Starvation' },
  { value: 'afb', label: 'Foulbrood' },
  { value: 'pesticide', label: 'Pesticide' },
  { value: 'honey_badger', label: 'Honey badger' },
  { value: 'theft', label: 'Theft or vandalism' },
  { value: 'fire', label: 'Fire' },
  { value: 'drought', label: 'Drought' },
  { value: 'unknown', label: 'Unknown' },
];
export const lossLabel = (v?: string | null) => LOSS_CAUSES.find((c) => c.value === v)?.label || 'Not recorded';

export function AutopsyFields({ hive, set }: { hive: Partial<Hive>; set: (p: Partial<Hive>) => void }) {
  if (hive.status !== 'dead' && hive.status !== 'absconded') return null;
  return (
    <div className="card stack">
      <b>What do you think happened?</b>
      <span className="small muted">A colony autopsy. Over time it shows what costs you colonies, and it can feed the national loss survey later (opt-in only).</span>
      <Pills label="Likely cause" single options={LOSS_CAUSES} value={hive.loss_cause ? [hive.loss_cause] : []} onChange={(v) => set({ loss_cause: v[0] || null, lost_at: hive.lost_at || new Date().toISOString() })} />
      {hive.status === 'absconded' && <span className="small">Clear the empty box soon: beetles and wax moth move into leftover comb.</span>}
    </div>
  );
}

// ---------------- weight / lift log ----------------
export function weightTrend(list: Weight[]) {
  const kg = list.filter((w) => w.kg != null).sort((a, b) => a.weighed_at.localeCompare(b.weighed_at));
  if (kg.length < 2) return null;
  const a = kg[kg.length - 2], b = kg[kg.length - 1];
  const days = Math.max(1, (new Date(b.weighed_at).getTime() - new Date(a.weighed_at).getTime()) / 86400000);
  const perWeek = ((Number(b.kg) - Number(a.kg)) / days) * 7;
  const kind = perWeek > 0.5 ? 'gaining' : perWeek < -0.5 ? 'losing' : 'steady';
  return { perWeek, kind, series: kg.slice(-10).map((w) => Number(w.kg)) };
}

export function WeightCard({ hiveId, weights }: { hiveId: string; weights: Weight[] }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'scale' | 'lift'>(() => (weights.some((w) => w.kg != null) ? 'scale' : 'lift'));
  const lastKg = [...weights].reverse().find((w) => w.kg != null)?.kg;
  const [kg, setKg] = useState<string>('');
  const [lift, setLift] = useState<Weight['lift']>();
  const sorted = [...weights].sort((a, b) => b.weighed_at.localeCompare(a.weighed_at));
  const trend = weightTrend(weights);

  const save = async () => {
    const n = method === 'scale' ? Number(kg.replace(',', '.')) : null;
    if (method === 'scale' && (!n || n <= 0 || n > 500)) return toast('Enter the weight in kg');
    if (method === 'lift' && !lift) return toast('Choose how heavy it felt');
    await db.save<Weight>('weights', { id: db.uuid(), hive_id: hiveId, weighed_at: new Date().toISOString(), kg: n, lift: method === 'lift' ? lift : null });
    setOpen(false); setKg(''); setLift(undefined);
    toast('Weight logged');
  };

  const max = trend ? Math.max(...trend.series) : 0, min = trend ? Math.min(...trend.series) : 0;
  return (
    <>
      <div className="row between"><h3 className="h2">Weight</h3><button className="btn small secondary" onClick={() => setOpen(true)}><LuScale /> Log weight</button></div>
      {sorted.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>Weigh or lift the back of the hive weekly without opening it. Rising weight means a flow; falling weight means a dearth or robbing.</p>
      ) : (
        <div className="card stack">
          {trend && (
            <>
              <div className="row between">
                <b className={trend.kind === 'losing' ? 'tone-warn' : trend.kind === 'gaining' ? 'tone-good' : ''}>
                  {trend.kind === 'gaining' ? 'Gaining' : trend.kind === 'losing' ? 'Losing' : 'Steady'}: {trend.perWeek > 0 ? '+' : ''}{trend.perWeek.toFixed(1)} kg a week
                </b>
                <span className="small muted">{min}–{max} kg</span>
              </div>
              <svg viewBox="0 0 300 60" style={{ width: '100%', height: 60 }} role="img" aria-label={`Weights: ${trend.series.join(', ')} kg`}>
                <polyline fill="none" stroke="var(--primary-strong)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
                  points={trend.series.map((v, i) => `${(i / (trend.series.length - 1)) * 290 + 5},${55 - ((v - min) / Math.max(1, max - min)) * 50}`).join(' ')} />
              </svg>
              <span className="small muted">{trend.kind === 'gaining' ? 'A flow is on: check the colony has space.' : trend.kind === 'losing' ? 'Stores are falling: a dearth or robbing. Check stores on the next warm, calm day.' : 'Little change since the last weighing.'}</span>
            </>
          )}
          <div className="stack" style={{ gap: 4 }}>
            {sorted.slice(0, 5).map((w) => (
              <div key={w.id} className="row between small"><span>{fmtDate(w.weighed_at)}</span><b>{w.kg != null ? `${w.kg} kg` : `Lift: ${w.lift}`}</b></div>
            ))}
          </div>
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Log weight">
        <div className="stack">
          <Seg label="Method" value={method} onChange={setMethod} options={[{ value: 'scale', label: 'Scale (kg)' }, { value: 'lift', label: 'Lift test' }]} />
          {method === 'scale' ? (
            <Field label="Hive weight in kg" hint={lastKg ? `last ${lastKg} kg` : undefined}><input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 42.5" autoFocus /></Field>
          ) : (
            <div className="field"><span>Lift the back of the hive slightly. How heavy?</span>
              <Seg label="Lift test" value={lift || undefined} onChange={(v) => setLift(v)} options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'heavy', label: 'Heavy' }]} />
            </div>
          )}
          <button className="btn" onClick={save}>Save</button>
        </div>
      </Sheet>
    </>
  );
}

// ---------------- swarm traps ----------------
const LURES = ['Old brood comb', 'Lemongrass oil', 'Wax-rubbed box', 'Commercial lure', 'None'];

export function trapDue(t: Trap) {
  if (t.status !== 'set') return false;
  const d = daysAgo(t.last_checked_at || t.placed_at) ?? 0;
  return d >= t.check_every_days;
}

export function TrapList() {
  const traps = db.useLive(() => db.all<Trap>('traps'));
  if (!traps) return null;
  const active = traps.filter((t) => t.status === 'set' || t.status === 'occupied').sort((a, b) => Number(trapDue(b)) - Number(trapDue(a)));
  const done = traps.filter((t) => t.status === 'collected' || t.status === 'removed');
  const caught = traps.filter((t) => t.caught_at).length;
  return (
    <>
      <Topbar title="Swarm traps" backTo="/more" right={<a className="icon-btn" href="#/trap/new" aria-label="Add trap"><LuPlus /></a>} />
      <p className="muted" style={{ marginTop: 0 }}>Most South African beekeepers grow by catching wild swarms. Track your bait boxes, check them on time and log every catch. Trap locations are private to you.</p>
      {traps.length === 0 ? (
        <Empty title="No traps yet" text="Add a bait box when you set it out: where it is, what lure you used and how often to check it." action={<a className="btn" href="#/trap/new"><LuPlus /> Add a trap</a>} />
      ) : (
        <>
          <div className="grid-3">
            <div className="card stat"><div className="big-num">{active.length}</div><div className="label">Out now</div></div>
            <div className="card stat"><div className="big-num">{active.filter(trapDue).length}</div><div className="label">Due a check</div></div>
            <div className="card stat"><div className="big-num">{caught}</div><div className="label">Swarms caught</div></div>
          </div>
          <h3 className="h2">Out now</h3>
          {active.length === 0 ? <p className="muted">No traps out.</p> : (
            <div className="list">
              {active.map((t) => (
                <ListLink key={t.id} href={`/trap/${t.id}`} left={<LuBox />} title={t.name}
                  sub={<>{t.status === 'occupied' ? <span className="tone-good">Bees moved in</span> : trapDue(t) ? <span className="tone-warn">Check due</span> : `Checked ${agoLabel(t.last_checked_at || t.placed_at).toLowerCase()}`}{t.location_note ? ` · ${t.location_note}` : ''}</>} />
              ))}
            </div>
          )}
          {done.length > 0 && (<><h3 className="h2">Finished</h3><div className="list">{done.map((t) => <ListLink key={t.id} href={`/trap/${t.id}`} left={<LuBox />} title={t.name} sub={t.caught_at ? `Caught ${fmtDate(t.caught_at)}` : 'Removed'} />)}</div></>)}
        </>
      )}
    </>
  );
}

export function TrapForm({ id }: { id?: string }) {
  const apiaries = db.useLive(() => db.all<Apiary>('apiaries'));
  const [t, setT] = useState<Partial<Trap> | null>(id ? null : { status: 'set', check_every_days: 7, placed_at: new Date().toISOString(), lure: 'Old brood comb' });
  useEffect(() => { if (id) db.get<Trap>('traps', id).then((r) => setT(r || {})); }, [id]);
  if (!t || !apiaries) return null;
  const set = (p: Partial<Trap>) => setT({ ...t, ...p });
  const locate = async () => {
    try {
      const pos = await getPosition();
      const precision = getSettings().locationMode === 'precise' ? 'precise' : 'approximate';
      set({ lat: roundCoord(pos.coords.latitude, precision), lng: roundCoord(pos.coords.longitude, precision) });
      toast(precision === 'precise' ? 'Trap pinned' : 'Approximate pin saved');
    } catch { toast('Could not get a location fix'); }
  };
  const save = async () => {
    if (!t.name?.trim()) return toast('Name the trap');
    const rec = await db.save<Trap>('traps', { ...(t as Trap), id: t.id || db.uuid(), name: t.name.trim() });
    toast('Trap saved');
    id ? back(`/trap/${rec.id}`) : go(`/trap/${rec.id}`, true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit trap' : 'New trap'} backTo="/traps" />
      <div className="stack">
        <Field label="Name"><input className="input" value={t.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Bluegum by the dam" autoFocus={!id} /></Field>
        <Field label="Where" hint="private note"><input className="input" value={t.location_note || ''} onChange={(e) => set({ location_note: e.target.value })} placeholder="e.g. Third tree past the gate, 2 m up" /></Field>
        {getSettings().locationMode !== 'off' && <button className="btn secondary" onClick={locate}>{t.lat != null ? 'Pin saved · update pin' : 'Pin this spot'}</button>}
        <Field label="Near apiary" hint="optional">
          <select className="input" value={t.apiary_id || ''} onChange={(e) => set({ apiary_id: e.target.value || null })}>
            <option value="">None</option>
            {apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <div className="field"><span>Lure</span><Pills label="Lure" single options={LURES.map((l) => ({ value: l, label: l }))} value={t.lure ? [t.lure] : []} onChange={(v) => set({ lure: v[0] })} /></div>
        <Field label="Check every (days)"><Stepper label="days between checks" min={1} max={30} value={t.check_every_days || 7} onChange={(v) => set({ check_every_days: v })} /></Field>
        <Field label="Notes" hint="optional"><textarea className="input" value={t.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <button className="btn" onClick={save}>Save trap</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (!window.confirm('Delete this trap?')) return; await db.remove('traps', id); go('/traps', true); }}><LuTrash2 /> Delete trap</button>}
      </div>
    </>
  );
}

export function TrapDetail({ id }: { id: string }) {
  const data = db.useLive(async () => ({ trap: await db.get<Trap>('traps', id), apiaries: await db.all<Apiary>('apiaries') }), [id]);
  const [collect, setCollect] = useState(false);
  const [apiaryId, setApiaryId] = useState('');
  if (!data) return null;
  const t = data.trap;
  if (!t) return (<><Topbar title="Trap" backTo="/traps" /><Empty title="Trap not found" text="It may have been deleted." /></>);
  const update = (p: Partial<Trap>) => db.save<Trap>('traps', { ...t, ...p });
  const due = trapDue(t);

  const moveIn = async () => {
    const target = apiaryId || t.apiary_id || data.apiaries[0]?.id;
    if (!target) return toast('Add an apiary first, then move the swarm there');
    const hives = await db.byIndex<Hive>('hives', 'apiary_id', target);
    const hive = await db.save<Hive>('hives', {
      id: db.uuid(), apiary_id: target, name: `Swarm ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`,
      code: shortCode(), status: 'active', hive_type: 'Langstroth', notes: `Caught in trap "${t.name}"${t.lure ? ` (lure: ${t.lure})` : ''}.`,
    });
    await update({ status: 'collected', hive_id: hive.id, caught_at: t.caught_at || new Date().toISOString() });
    setCollect(false);
    toast(`New hive added (${hives.length + 1} at that apiary)`);
    go(`/hive/${hive.id}`);
  };

  return (
    <>
      <Topbar title={t.name} backTo="/traps" right={<a className="icon-btn" href={`#/trap/${id}/edit`} aria-label="Edit trap"><LuPencil /></a>} />
      <div className="card">
        <dl className="kv">
          <dt>Status</dt><dd>{{ set: 'Set, waiting', occupied: 'Bees moved in', collected: 'Collected', removed: 'Removed' }[t.status]}</dd>
          <dt>Placed</dt><dd>{fmtDate(t.placed_at)}</dd>
          <dt>Last check</dt><dd>{t.last_checked_at ? fmtDate(t.last_checked_at) : 'Not yet'}{due && <span className="tone-warn"> · due now</span>}</dd>
          {t.lure && (<><dt>Lure</dt><dd>{t.lure}</dd></>)}
          {t.location_note && (<><dt>Where</dt><dd>{t.location_note}</dd></>)}
          {t.lat != null && (<><dt>Pin</dt><dd><a href={`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`} target="_blank" rel="noreferrer">Open in Maps</a></dd></>)}
          {t.caught_at && (<><dt>Caught</dt><dd>{fmtDate(t.caught_at)}</dd></>)}
        </dl>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {t.status === 'set' && (
          <>
            <button className="btn" onClick={async () => { await update({ last_checked_at: new Date().toISOString() }); toast('Checked: still empty'); }}><LuCheck /> Checked: still empty</button>
            <button className="btn secondary" onClick={async () => { await update({ status: 'occupied', caught_at: new Date().toISOString(), last_checked_at: new Date().toISOString() }); toast('Swarm caught!'); }}>🐝 Bees have moved in</button>
          </>
        )}
        {t.status === 'occupied' && (
          <>
            <div className="banner info"><LuTriangleAlert /><div><b>Move the swarm at night</b><p>Close the entrance after dark, when the bees are home, and move the box to its new site. Give it a few days before the first inspection.</p></div></div>
            <button className="btn" onClick={() => setCollect(true)}>Moved into a hive</button>
          </>
        )}
        {t.hive_id && <a className="btn secondary" href={`#/hive/${t.hive_id}`}>Open the new hive</a>}
        {(t.status === 'set' || t.status === 'occupied') && <button className="btn ghost" onClick={async () => { await update({ status: 'removed' }); toast('Trap removed'); }}>Take the trap down</button>}
        {t.status !== 'set' && <button className="btn ghost" onClick={async () => { await update({ status: 'set', placed_at: new Date().toISOString(), last_checked_at: null, caught_at: null, hive_id: null }); toast('Trap set again'); }}>Set it again</button>}
      </div>
      <Sheet open={collect} onClose={() => setCollect(false)} title="Which apiary?">
        <div className="stack">
          <select className="input" value={apiaryId || t.apiary_id || ''} onChange={(e) => setApiaryId(e.target.value)}>
            {data.apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn" onClick={moveIn}>Create the hive</button>
        </div>
      </Sheet>
    </>
  );
}
