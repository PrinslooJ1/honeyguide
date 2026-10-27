// Release 1.2: migration planner and move log.
import { useEffect, useState } from 'react';
import { LuTruck, LuPlus, LuTriangleAlert, LuInfo, LuMoon, LuCheck, LuPencil } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Inspection, Move } from '../db';
import { fmtDate } from '../lib';
import { beeZone, zonesForProvince, BEE_ZONE_LABEL, type BeeZone } from '../region';
import { getSettings, setSettings } from '../settings';
import { zar } from '../docs';
import { Empty, Field, ListLink, Pills, Topbar, back, go, toast } from '../ui';

const CHECKLIST = [
  'Strap every hive so boxes cannot shift',
  'Close entrances after dark, when the bees are home',
  'Ventilate the hives for the trip',
  'Shade and water ready at the new site',
  'Landowner permission at the new site',
  'No Cape bees moved into African-bee country',
  'No frames or boxes from a diseased hive',
];

export const zoneOf = (a?: Apiary): BeeZone => (a?.lat != null && a.lng != null ? beeZone(a.lat, a.lng) : zonesForProvince(a?.province).beeZone);

export interface MoveWarning { tone: 'bad' | 'warn'; text: string }

export function moveWarnings(from: Apiary | undefined, to: Apiary | undefined, hives: Hive[], inspections: Inspection[]): MoveWarning[] {
  const out: MoveWarning[] = [];
  const fz = zoneOf(from), tz = zoneOf(to);
  const last = (h: Hive) => inspections.filter((i) => i.hive_id === h.id).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
  const cape = hives.filter((h) => h.subspecies === 'capensis');
  if (cape.length && tz === 'african') out.push({ tone: 'bad', text: `${cape.map((h) => h.name).join(', ')}: Cape bees into African-bee country. Cape workers can take over African colonies (capensis parasitism). Check the movement rules with your provincial Department of Agriculture first.` });
  const unsure = hives.filter((h) => h.subspecies !== 'scutellata' && h.subspecies !== 'capensis');
  if (unsure.length && (fz === 'cape' || fz === 'hybrid') && tz === 'african') out.push({ tone: 'warn', text: `${unsure.map((h) => h.name).join(', ')}: bee type not set, moving from the ${BEE_ZONE_LABEL[fz].toLowerCase()} into African-bee country. Make sure these are not Cape bees.` });
  const afb = hives.filter((h) => last(h)?.afb_suspect);
  if (afb.length) out.push({ tone: 'bad', text: `${afb.map((h) => h.name).join(', ')}: American foulbrood suspected. Do not move these hives; report it to your provincial Department of Agriculture.` });
  const shb = hives.filter((h) => inspections.some((i) => i.hive_id === h.id && i.pests?.includes('small_hive_beetle') && Date.now() - new Date(i.inspected_at).getTime() < 30 * 86400000));
  if (shb.length) out.push({ tone: 'warn', text: `${shb.map((h) => h.name).join(', ')}: small hive beetle seen in the last month. Moving stresses colonies; move only strong ones.` });
  if (to && !to.landowner && !to.permission_notes) out.push({ tone: 'warn', text: `No landowner permission recorded for ${to.name}. Add it to the apiary before you move.` });
  return out;
}

export function MoveList() {
  const data = db.useLive(async () => ({ moves: await db.all<Move>('moves'), apiaries: await db.all<Apiary>('apiaries') }));
  if (!data) return null;
  const name = (id: string) => data.apiaries.find((a) => a.id === id)?.name || 'Deleted apiary';
  const planned = data.moves.filter((m) => m.status === 'planned').sort((a, b) => a.planned_for.localeCompare(b.planned_for));
  const done = data.moves.filter((m) => m.status === 'done').sort((a, b) => (b.moved_at || '').localeCompare(a.moved_at || ''));
  return (
    <>
      <Topbar title="Hive moves" backTo="/business" right={<a className="icon-btn" href="#/move/new" aria-label="Plan a move"><LuPlus /></a>} />
      <p className="muted" style={{ marginTop: 0 }}>Plan moves to aloe fields or crops with the checks that matter in South Africa. Completed moves stay here as your movement record.</p>
      {data.moves.length === 0 ? (
        <Empty title="No moves yet" text="Plan a move to see capensis, disease and permission checks, a night-move checklist and the cost per hive." action={<a className="btn" href="#/move/new"><LuTruck /> Plan a move</a>} />
      ) : (
        <>
          <h3 className="h2">Planned</h3>
          {planned.length ? <div className="list">{planned.map((m) => <ListLink key={m.id} href={`/move/${m.id}`} left={<LuTruck />} title={`${name(m.from_apiary_id)} → ${name(m.to_apiary_id)}`} sub={`${fmtDate(m.planned_for)} · ${m.hive_ids.length} hive${m.hive_ids.length === 1 ? '' : 's'}`} />)}</div> : <p className="muted">Nothing planned.</p>}
          <h3 className="h2">Movement record</h3>
          {done.length ? <div className="list">{done.map((m) => <ListLink key={m.id} href={`/move/${m.id}`} left={<LuCheck />} title={`${name(m.from_apiary_id)} → ${name(m.to_apiary_id)}`} sub={`Moved ${fmtDate(m.moved_at || m.planned_for)} · ${m.hive_ids.length} hive${m.hive_ids.length === 1 ? '' : 's'}`} />)}</div> : <p className="muted">No completed moves yet.</p>}
        </>
      )}
    </>
  );
}

export function MoveForm({ id, fromId }: { id?: string; fromId?: string }) {
  const data = db.useLive(async () => ({ apiaries: await db.all<Apiary>('apiaries'), hives: await db.all<Hive>('hives') }));
  const [m, setM] = useState<Partial<Move> | null>(id ? null : { from_apiary_id: fromId, hive_ids: [], planned_for: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'planned', checklist: [] });
  useEffect(() => { if (id) db.get<Move>('moves', id).then((r) => setM(r || {})); }, [id]);
  if (!m || !data) return null;
  const set = (p: Partial<Move>) => setM({ ...m, ...p });
  const fromHives = data.hives.filter((h) => h.apiary_id === m.from_apiary_id && !['dead', 'absconded'].includes(h.status || 'active'));
  const save = async () => {
    if (!m.from_apiary_id || !m.to_apiary_id) return toast('Choose where the hives are moving from and to');
    if (m.from_apiary_id === m.to_apiary_id) return toast('Choose a different destination');
    if (!m.hive_ids?.length) return toast('Choose at least one hive');
    const rec = await db.save<Move>('moves', { ...(m as Move), id: m.id || db.uuid() });
    id ? back(`/move/${rec.id}`) : go(`/move/${rec.id}`, true);
  };
  if (data.apiaries.length < 2) return (<><Topbar title="Plan a move" backTo="/moves" /><Empty title="You need two apiaries" text="Add the destination as an apiary first, for example the aloe field or the grower's farm." action={<a className="btn" href="#/apiary/new">Add apiary</a>} /></>);
  return (
    <>
      <Topbar title={id ? 'Edit move' : 'Plan a move'} backTo="/moves" />
      <div className="stack">
        <Field label="From">
          <select className="input" value={m.from_apiary_id || ''} onChange={(e) => set({ from_apiary_id: e.target.value, hive_ids: [] })}>
            <option value="">Choose apiary</option>
            {data.apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="To">
          <select className="input" value={m.to_apiary_id || ''} onChange={(e) => set({ to_apiary_id: e.target.value })}>
            <option value="">Choose destination</option>
            {data.apiaries.filter((a) => a.id !== m.from_apiary_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {m.from_apiary_id && (
          <div className="field"><span>Hives to move</span>
            {fromHives.length ? (
              <>
                <Pills label="Hives" options={fromHives.map((h) => ({ value: h.id, label: h.name }))} value={m.hive_ids || []} onChange={(v) => set({ hive_ids: v })} />
                <button type="button" className="btn ghost small" style={{ width: 'fit-content' }} onClick={() => set({ hive_ids: fromHives.map((h) => h.id) })}>Select all</button>
              </>
            ) : <span className="small muted">No live hives at this apiary.</span>}
          </div>
        )}
        <Field label="Planned date"><input className="input" type="date" value={m.planned_for || ''} onChange={(e) => set({ planned_for: e.target.value })} /></Field>
        <div className="grid-2 stack-narrow">
          <Field label="Distance (km, one way)"><input className="input" inputMode="decimal" value={m.distance_km ?? ''} onChange={(e) => set({ distance_km: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} /></Field>
          <Field label="Cost per km (R)" hint="your figure"><input className="input" inputMode="decimal" value={m.cost_per_km ?? ''} onChange={(e) => set({ cost_per_km: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} /></Field>
        </div>
        <Field label="Other costs (R)" hint="labour, hire, permits"><input className="input" inputMode="decimal" value={m.other_costs ?? ''} onChange={(e) => set({ other_costs: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} /></Field>
        <Field label="Notes" hint="optional"><textarea className="input" value={m.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <button className="btn" onClick={save}>Save move plan</button>
      </div>
    </>
  );
}

export function MoveDetail({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const move = await db.get<Move>('moves', id);
    const [apiaries, hives, inspections] = await Promise.all([db.all<Apiary>('apiaries'), db.all<Hive>('hives'), db.all<Inspection>('inspections')]);
    return { move, apiaries, hives, inspections };
  }, [id]);
  if (!data) return null;
  const m = data.move;
  if (!m) return (<><Topbar title="Move" backTo="/moves" /><Empty title="Move not found" text="It may have been deleted." /></>);
  const from = data.apiaries.find((a) => a.id === m.from_apiary_id);
  const to = data.apiaries.find((a) => a.id === m.to_apiary_id);
  const hives = data.hives.filter((h) => m.hive_ids.includes(h.id));
  const warnings = moveWarnings(from, to, hives, data.inspections);
  const blocked = warnings.some((w) => w.tone === 'bad');
  const travel = (m.distance_km ?? 0) * 2 * (m.cost_per_km ?? 0); // there and back
  const total = travel + (m.other_costs ?? 0);
  const ticked = m.checklist || [];
  const toggle = (item: string) => db.save<Move>('moves', { ...m, checklist: ticked.includes(item) ? ticked.filter((x) => x !== item) : [...ticked, item] });

  const markMoved = async () => {
    if (blocked && !window.confirm('There are serious warnings for this move. Move anyway?')) return;
    for (const h of hives) await db.save<Hive>('hives', { ...h, apiary_id: m.to_apiary_id });
    await db.save<Move>('moves', { ...m, status: 'done', moved_at: new Date().toISOString() });
    toast(`${hives.length} hive${hives.length === 1 ? '' : 's'} moved to ${to?.name}`);
  };

  return (
    <>
      <Topbar title="Move plan" backTo="/moves" right={m.status === 'planned' ? <a className="icon-btn" href={`#/move/${id}/edit`} aria-label="Edit move"><LuPencil /></a> : undefined} />
      <div className="card">
        <div className="h2" style={{ margin: 0 }}>{from?.name} → {to?.name}</div>
        <div className="small muted">{m.status === 'done' ? `Moved ${fmtDate(m.moved_at || '')}` : m.status === 'cancelled' ? 'Cancelled' : `Planned for ${fmtDate(m.planned_for)}`}</div>
        <div style={{ marginTop: 8 }}>{hives.map((h) => h.name).join(', ') || 'No hives'}</div>
      </div>

      <h3 className="h2">Checks</h3>
      {warnings.length === 0 ? (
        <div className="banner good"><LuCheck /><div><b>No warnings</b><p>Bee type, disease and permission checks are clear for this move.</p></div></div>
      ) : (
        <div className="stack">{warnings.map((w, i) => <div key={i} className={`banner ${w.tone}`}><LuTriangleAlert /><div><p style={{ marginTop: 0 }}>{w.text}</p></div></div>)}</div>
      )}
      <div className="banner info" style={{ marginTop: 10 }}><LuInfo /><div><p style={{ marginTop: 0 }}>In a national survey, migratory beekeepers lost about twice as many colonies as stationary ones (35.5% against 17.2%). Move only strong, healthy colonies, and only when the forage is worth it.</p></div></div>

      <h3 className="h2">Cost</h3>
      <div className="card">
        <dl className="kv">
          <dt>Travel</dt><dd>{m.distance_km ? `${m.distance_km} km each way × 2 × ${zar(m.cost_per_km)} = ${zar(travel)}` : 'Add distance and cost per km'}</dd>
          <dt>Other</dt><dd>{zar(m.other_costs ?? 0)}</dd>
          <dt>Total</dt><dd>{zar(total)}{hives.length ? ` · ${zar(total / hives.length)} per hive` : ''}</dd>
        </dl>
      </div>

      {m.status === 'planned' && (
        <>
          <h3 className="h2">Night-move checklist</h3>
          <div className="list">
            {CHECKLIST.map((it) => (
              <label key={it} className="list-item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={ticked.includes(it)} onChange={() => toggle(it)} style={{ width: 24, height: 24, accentColor: 'var(--primary-strong)' }} />
                <span className="grow">{it}</span>
              </label>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={() => { setSettings({ theme: getSettings().theme === 'night' ? 'system' : 'night' }); }}><LuMoon /> {getSettings().theme === 'night' ? 'Leave night mode' : 'Night mode for the move'}</button>
            <button className="btn" onClick={markMoved}><LuTruck /> Hives are moved: update their apiary</button>
            <button className="btn ghost" onClick={async () => { await db.save<Move>('moves', { ...m, status: 'cancelled' }); toast('Move cancelled'); }}>Cancel this move</button>
          </div>
          <p className="small muted">{ticked.length} of {CHECKLIST.length} checks ticked.</p>
        </>
      )}
      {m.notes && (<><h3 className="h2">Notes</h3><p>{m.notes}</p></>)}
    </>
  );
}
