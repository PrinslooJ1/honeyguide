// Release 1.3: theft and incident log, with a one-tap report pack for the police or insurer.
import { useEffect, useState } from 'react';
import { LuPlus, LuShieldAlert, LuPrinter, LuPencil, LuTrash2 } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Incident, IncidentKind, Inspection, Photo, Profile } from '../db';
import { fmtDate, fmtDateTime } from '../lib';
import { getProfile, printDoc } from '../docs';
import { Empty, Field, ListLink, Pills, Seg, Topbar, back, go, toast, usePhotoUrl } from '../ui';
import { PhotoAdder, PhotoGrid } from './Photos';

export const KINDS: { value: IncidentKind; label: string }[] = [
  { value: 'theft', label: 'Theft' },
  { value: 'vandalism', label: 'Vandalism' },
  { value: 'fire', label: 'Fire' },
  { value: 'flood', label: 'Flood or storm' },
  { value: 'honey_badger', label: 'Honey badger' },
  { value: 'other', label: 'Other' },
];
const kindLabel = (k: IncidentKind) => KINDS.find((x) => x.value === k)?.label || k;

export function IncidentList() {
  const data = db.useLive(async () => ({ incidents: await db.all<Incident>('incidents'), apiaries: await db.all<Apiary>('apiaries') }));
  if (!data) return null;
  const sorted = [...data.incidents].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return (
    <>
      <Topbar title="Incidents" backTo="/business" right={<a className="icon-btn" href="#/incident/new" aria-label="Log incident"><LuPlus /></a>} />
      <p className="muted" style={{ marginTop: 0 }}>Log theft, vandalism, fire and other damage. One tap builds a report pack with your registration number, hive codes, last-seen dates and photos.</p>
      {sorted.length === 0 ? (
        <Empty title="No incidents" text="We hope it stays that way." action={<a className="btn secondary" href="#/incident/new"><LuPlus /> Log an incident</a>} />
      ) : (
        <div className="list">{sorted.map((i) => <ListLink key={i.id} href={`/incident/${i.id}`} left={<LuShieldAlert />} title={`${kindLabel(i.kind)} · ${data.apiaries.find((a) => a.id === i.apiary_id)?.name || 'No apiary'}`} sub={`${fmtDate(i.occurred_at)} · ${i.hive_ids?.length || 0} hive${i.hive_ids?.length === 1 ? '' : 's'}${i.saps_case_no ? ` · case ${i.saps_case_no}` : ''}`} />)}</div>
      )}
    </>
  );
}

export function IncidentForm({ id }: { id?: string }) {
  const data = db.useLive(async () => ({ apiaries: await db.all<Apiary>('apiaries'), hives: await db.all<Hive>('hives') }));
  const [i, setI] = useState<Partial<Incident> | null>(id ? null : { kind: 'theft', occurred_at: new Date().toISOString(), hive_ids: [] });
  useEffect(() => { if (id) db.get<Incident>('incidents', id).then((r) => setI(r || {})); }, [id]);
  if (!i || !data) return null;
  const set = (p: Partial<Incident>) => setI({ ...i, ...p });
  const hives = data.hives.filter((h) => h.apiary_id === i.apiary_id);
  const save = async () => {
    const rec = await db.save<Incident>('incidents', { ...(i as Incident), id: i.id || db.uuid() });
    toast('Incident saved');
    id ? back(`/incident/${rec.id}`) : go(`/incident/${rec.id}`, true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit incident' : 'Log an incident'} backTo="/incidents" />
      <div className="stack">
        <div className="field"><span>What happened</span><Pills label="Kind" single options={KINDS} value={[i.kind || 'theft']} onChange={(v) => set({ kind: (v[0] as IncidentKind) || 'theft' })} /></div>
        <Field label="When (best estimate)"><input className="input" type="datetime-local" value={(i.occurred_at || '').slice(0, 16)} onChange={(e) => set({ occurred_at: new Date(e.target.value).toISOString() })} /></Field>
        <Field label="Apiary">
          <select className="input" value={i.apiary_id || ''} onChange={(e) => set({ apiary_id: e.target.value || null, hive_ids: [] })}>
            <option value="">Choose apiary</option>
            {data.apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {i.apiary_id && <div className="field"><span>Hives affected</span>{hives.length ? <Pills label="Hives" options={hives.map((h) => ({ value: h.id, label: `${h.name}${h.code ? ` (${h.code})` : ''}` }))} value={i.hive_ids || []} onChange={(v) => set({ hive_ids: v })} /> : <span className="small muted">No hives at this apiary.</span>}</div>}
        <Field label="What you found"><textarea className="input" value={i.description || ''} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Three hives taken, fence cut, tyre tracks at the gate" /></Field>
        <Field label="SAPS case number" hint="optional"><input className="input" value={i.saps_case_no || ''} onChange={(e) => set({ saps_case_no: e.target.value })} /></Field>
        <button className="btn" onClick={save}>Save incident</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (!window.confirm('Delete this incident?')) return; await db.remove('incidents', id); go('/incidents', true); }}><LuTrash2 /> Delete incident</button>}
      </div>
    </>
  );
}

export function IncidentDetail({ id }: { id: string }) {
  const data = db.useLive(async () => ({ i: await db.get<Incident>('incidents', id), apiaries: await db.all<Apiary>('apiaries'), hives: await db.all<Hive>('hives'), photos: (await db.all<Photo>('photos')).filter((p) => p.incident_id === id) }), [id]);
  if (!data) return null;
  const i = data.i;
  if (!i) return (<><Topbar title="Incident" backTo="/incidents" /><Empty title="Incident not found" text="It may have been deleted." /></>);
  const apiary = data.apiaries.find((a) => a.id === i.apiary_id);
  return (
    <>
      <Topbar title={kindLabel(i.kind)} backTo="/incidents" right={<a className="icon-btn" href={`#/incident/${id}/edit`} aria-label="Edit incident"><LuPencil /></a>} />
      <div className="card">
        <dl className="kv">
          <dt>When</dt><dd>{fmtDateTime(i.occurred_at)}</dd>
          <dt>Apiary</dt><dd>{apiary?.name || 'Not set'}</dd>
          <dt>Hives</dt><dd>{data.hives.filter((h) => i.hive_ids?.includes(h.id)).map((h) => `${h.name}${h.code ? ` (${h.code})` : ''}`).join(', ') || 'None listed'}</dd>
          {i.saps_case_no && (<><dt>SAPS case</dt><dd>{i.saps_case_no}</dd></>)}
          {i.description && (<><dt>Found</dt><dd>{i.description}</dd></>)}
        </dl>
      </div>
      {i.kind === 'theft' && <a className="btn ghost" href="tel:10111" style={{ marginTop: 10 }}>Call SAPS 10111</a>}
      <a className="btn" href={`#/incident/${id}/report`} style={{ marginTop: 10 }}><LuPrinter /> Build the report pack</a>
      <h3 className="h2">Photos</h3>
      <PhotoAdder incidentId={id} tags={['Site', 'Damage', 'Tracks', 'Remaining hives']} />
      <div style={{ marginTop: 10 }}><PhotoGrid photos={data.photos} /></div>
    </>
  );
}

function ReportPhoto({ p }: { p: Photo }) {
  const url = usePhotoUrl(p);
  return url ? <figure className="doc-photo"><img src={url} alt={p.tag || 'Photo'} /><figcaption>{p.tag} · {fmtDate(p.taken_at)}</figcaption></figure> : null;
}

export function IncidentReport({ id }: { id: string }) {
  const [state, setState] = useState<{ i?: Incident; apiary?: Apiary; hives: Hive[]; inspections: Inspection[]; photos: Photo[]; profile?: Profile } | null>(null);
  const [withGps, setWithGps] = useState<'yes' | 'no'>('no');
  useEffect(() => {
    (async () => {
      const i = await db.get<Incident>('incidents', id);
      const apiary = i?.apiary_id ? await db.get<Apiary>('apiaries', i.apiary_id) : undefined;
      const hives = (await db.all<Hive>('hives', true)).filter((h) => i?.hive_ids?.includes(h.id));
      const inspections = await db.all<Inspection>('inspections');
      const photos = (await db.all<Photo>('photos')).filter((p) => p.incident_id === id || (p.hive_id && i?.hive_ids?.includes(p.hive_id)));
      setState({ i, apiary, hives, inspections, photos, profile: await getProfile() });
    })();
  }, [id]);
  if (!state) return null;
  const { i, apiary, hives, inspections, photos, profile } = state;
  if (!i) return (<><Topbar title="Report" backTo="/incidents" /><Empty title="Incident not found" text="It may have been deleted." /></>);
  const lastSeen = (h: Hive) => inspections.filter((x) => x.hive_id === h.id).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0]?.inspected_at;
  const incidentPhotos = photos.filter((p) => p.incident_id === id);
  const hivePhotos = hives.map((h) => photos.filter((p) => p.hive_id === h.id).sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''))[0]).filter(Boolean) as Photo[];
  return (
    <>
      <div className="no-print">
        <Topbar title="Report pack" backTo={`/incident/${id}`} />
        <div className="field" style={{ marginBottom: 12 }}><span>Include the apiary's GPS position?</span>
          <Seg label="Include GPS" value={withGps} onChange={setWithGps} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, for the police' }]} />
          <span className="small muted">Only include it if you are giving the pack to the police or your insurer.</span>
        </div>
        <button className="btn" onClick={printDoc} style={{ marginBottom: 12 }}><LuPrinter /> Print or save as PDF</button>
      </div>
      <div className="print-doc doc">
        <div className="doc-head">
          <div><div className="doc-title">Incident report</div><div className="doc-muted">{kindLabel(i.kind)} · {fmtDateTime(i.occurred_at)}</div></div>
          <div style={{ textAlign: 'right' }}><b>{profile?.display_name || 'Beekeeper'}</b>{profile?.registration_number && <div className="doc-muted">Beekeeper reg. {profile.registration_number}</div>}{profile?.public_contact && <div className="doc-pre">{profile.public_contact}</div>}</div>
        </div>
        <h3 className="doc-h">Where</h3>
        <p>{apiary?.name || 'Apiary not set'}{apiary?.province ? `, ${apiary.province}` : ''}</p>
        {apiary?.access_notes && <p className="doc-pre">{apiary.access_notes}</p>}
        {withGps === 'yes' && apiary?.lat != null && <p>GPS: {apiary.lat}, {apiary.lng} ({apiary.location_precision === 'precise' ? 'exact' : 'approximate, about 1 km'})</p>}
        {i.saps_case_no && <p><b>SAPS case number:</b> {i.saps_case_no}</p>}
        <h3 className="doc-h">What happened</h3>
        <p className="doc-pre">{i.description || 'No description.'}</p>
        <h3 className="doc-h">Hives affected</h3>
        <table className="doc-table">
          <thead><tr><th>Hive</th><th>Code on the box</th><th>Type</th><th>Last inspected</th></tr></thead>
          <tbody>{hives.map((h) => <tr key={h.id}><td>{h.name}</td><td>{h.code || '–'}</td><td>{h.hive_type || '–'}</td><td>{lastSeen(h) ? fmtDate(lastSeen(h)) : '–'}</td></tr>)}</tbody>
        </table>
        <p className="doc-muted">Each box is marked with the beekeeper's registration number{profile?.registration_number ? ` (${profile.registration_number})` : ''} and a Honeyguide QR label with the code above.</p>
        {(incidentPhotos.length > 0 || hivePhotos.length > 0) && (
          <>
            <h3 className="doc-h">Photos</h3>
            <div className="doc-photos">{[...incidentPhotos, ...hivePhotos].map((p) => <ReportPhoto key={p.id} p={p} />)}</div>
          </>
        )}
        <div className="doc-foot doc-muted">Prepared with Honeyguide on {fmtDate(new Date().toISOString())}.</div>
      </div>
    </>
  );
}
