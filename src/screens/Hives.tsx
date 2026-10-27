import { useEffect, useState } from 'react';
import { LuHexagon, LuPencil, LuTrash2, LuTriangleAlert, LuCamera, LuQrCode } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Inspection, Photo } from '../db';
import {
  HIVE_STATUS, HIVE_TYPES, SCUTELLATA_PROVINCES, SUBSPECIES, agoLabel, fmtDate, fmtDateTime, queenColour, scoreTone, shortCode, statusInfo,
} from '../lib';
import { Empty, Field, Hex, ListLink, Pills, Seg, Sheet, Topbar, back, go, toast } from '../ui';
import { PhotoAdder, PhotoGrid } from './Photos';
import { AutopsyFields, WeightCard, lossLabel } from './Field';
import type { Weight } from '../db';
import { colonyView, STAGE_LABEL, type ColonyView } from '../engine';
import { LuLightbulb, LuTrendingUp, LuTrendingDown } from 'react-icons/lu';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120, h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`-2 -2 ${w + 4} ${h + 4}`} role="img" aria-label={`Health trend: ${values.join(', ')}`}>
      <polyline points={pts} fill="none" stroke="var(--primary-strong)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ColonyCard({ view }: { view: ColonyView }) {
  const t = view.trend;
  const delta = t.length >= 2 ? t[t.length - 1] - t[t.length - 2] : 0;
  return (
    <>
      <h3 className="h2">Colony</h3>
      <div className="card stack">
        <div className="row between">
          <div><div className="eyebrow">Stage</div><b>{STAGE_LABEL[view.stage]}</b></div>
          <div><div className="eyebrow">Strength</div><b>{view.strength ?? '–'}{view.strength != null && '/100'}</b></div>
          <div style={{ textAlign: 'right' }}><div className="eyebrow">Trend</div>
            {t.length >= 2 ? <span className={delta >= 0 ? 'tone-good' : 'tone-bad'}>{delta >= 0 ? <LuTrendingUp /> : <LuTrendingDown />} {delta > 0 ? '+' : ''}{delta}</span> : <span className="muted small">Needs 2 inspections</span>}
          </div>
        </div>
        <Sparkline values={t} />
        {view.flags.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {view.flags.map((f) => <div key={f.id} className={`small tone-${f.tone}`}><LuTriangleAlert style={{ verticalAlign: -2 }} /> {f.text}</div>)}
          </div>
        )}
        <div className={`banner ${view.action.tone}`}>
          <LuLightbulb />
          <div><b>Next step: {view.action.title}</b><p>{view.action.why}</p></div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Draft advice from your records, awaiting review by an experienced South African beekeeper. It never replaces your own judgement or your mentor.</p>
      </div>
    </>
  );
}

export function HiveDetail({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const hive = await db.get<Hive>('hives', id);
    if (!hive) return { hive };
    const [apiary, inspections, photos, weights] = await Promise.all([
      db.get<Apiary>('apiaries', hive.apiary_id),
      db.byIndex<Inspection>('inspections', 'hive_id', id),
      db.byIndex<Photo>('photos', 'hive_id', id),
      db.byIndex<Weight>('weights', 'hive_id', id),
    ]);
    inspections.sort((a, b) => b.inspected_at.localeCompare(a.inspected_at));
    photos.sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''));
    return { hive, apiary, inspections, photos, weights };
  }, [id]);
  const [photoSheet, setPhotoSheet] = useState(false);

  if (!data) return null;
  const { hive, apiary, inspections = [], photos = [], weights = [] } = data;
  if (!hive) return (<><Topbar title="Hive" backTo="/apiaries" /><Empty title="Hive not found" text="It may have been deleted." /></>);
  const last = inspections[0];
  const qc = queenColour(hive.queen_year);
  const view = colonyView(hive, apiary, inspections);
  const st = statusInfo(hive.status);

  return (
    <>
      <Topbar title={hive.name} backTo={`/apiary/${hive.apiary_id}`} right={<a className="icon-btn" href={`#/hive/${id}/edit`} aria-label="Edit hive"><LuPencil /></a>} />
      <div className="card row">
        <Hex size={84} label={last?.score ?? '–'} tone={last?.afb_suspect ? 'bad' : last ? scoreTone(last.score) : st.tone} />
        <div className="grow">
          <span className={`badge ${st.tone}`}>{st.label}</span>
          <div style={{ marginTop: 6, fontWeight: 650 }}>{apiary?.name}</div>
          <div className="small muted">{agoLabel(last?.inspected_at)}</div>
          <div className="small muted">{hive.code}</div>
        </div>
      </div>

      {last?.afb_suspect && (
        <div className="banner bad" style={{ marginTop: 12 }}>
          <LuTriangleAlert />
          <div><b>American foulbrood suspected at the last inspection</b><p>Keep this hive closed and in place, and contact your provincial Department of Agriculture. AFB is a notifiable disease.</p></div>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <a className="btn" href={`#/inspect/${id}`}><LuHexagon /> Inspect</a>
        <button className="btn secondary" onClick={() => setPhotoSheet(true)}><LuCamera /> Photo</button>
      </div>

      <a className="btn ghost" href={`#/labels?hive=${id}`} style={{ marginTop: 10 }}><LuQrCode /> Print QR label</a>

      {(hive.status === 'dead' || hive.status === 'absconded') && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <LuTriangleAlert />
          <div><b>{hive.status === 'dead' ? 'Colony lost' : 'Colony absconded'}{hive.lost_at ? ` · ${fmtDate(hive.lost_at)}` : ''}</b>
            <p>Likely cause: {lossLabel(hive.loss_cause)}. {hive.loss_cause ? '' : 'Edit the hive to record what you think happened.'}</p></div>
        </div>
      )}

      <ColonyCard view={view} />
      <WeightCard hiveId={id} weights={weights} />

      <h3 className="h2">About this hive</h3>
      <div className="card">
        <dl className="kv">
          <dt>Type</dt><dd>{hive.hive_type || 'Not set'}</dd>
          <dt>Bee</dt><dd>{SUBSPECIES.find((s) => s.value === hive.subspecies)?.label || 'Not set'}</dd>
          <dt>Queen</dt>
          <dd>{hive.queen_year ? (<>{qc && <span className="queen-dot" style={{ background: qc.hex }} />} {hive.queen_year}{hive.queen_marked ? `, marked ${qc?.name.toLowerCase()}` : ', unmarked'}</>) : 'Year unknown'}</dd>
          {hive.notes && (<><dt>Notes</dt><dd>{hive.notes}</dd></>)}
        </dl>
      </div>

      <h3 className="h2">Photos</h3>
      {photos.length ? <PhotoGrid photos={photos} /> : <p className="muted">No photos yet. Brood frames photographed over time are the best record of a colony's health.</p>}

      <h3 className="h2">Inspections</h3>
      {inspections.length === 0 ? (
        <p className="muted">No inspections logged yet.</p>
      ) : (
        <div className="list">
          {inspections.map((i) => (
            <ListLink key={i.id} href={`/inspection/${i.id}`} title={fmtDateTime(i.inspected_at)}
              sub={[i.temperament, i.brood_pattern && `${i.brood_pattern} brood`, i.pests?.length ? `${i.pests.length} pest${i.pests.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
              right={<span className={`badge ${i.afb_suspect ? 'bad' : scoreTone(i.score)}`}>{i.score}</span>} />
          ))}
        </div>
      )}

      <Sheet open={photoSheet} onClose={() => setPhotoSheet(false)} title="Add photo">
        <PhotoAdder hiveId={id} onAdded={() => setPhotoSheet(false)} />
      </Sheet>
    </>
  );
}

export function HiveForm({ id, apiaryId }: { id?: string; apiaryId?: string }) {
  const apiaries = db.useLive(() => db.all<Apiary>('apiaries'));
  const [h, setH] = useState<Partial<Hive> | null>(id ? null : { apiary_id: apiaryId, status: 'active', hive_type: 'Langstroth', queen_marked: false });
  useEffect(() => {
    if (id) db.get<Hive>('hives', id).then((r) => setH(r || {}));
    else if (apiaryId) {
      db.byIndex<Hive>('hives', 'apiary_id', apiaryId).then((hs) => setH((x) => ({ ...x, name: x?.name ?? `Hive ${hs.length + 1}` })));
    }
  }, [id, apiaryId]);
  if (!h || !apiaries) return null;
  const set = (patch: Partial<Hive>) => setH({ ...h, ...patch });
  const apiary = apiaries.find((a) => a.id === h.apiary_id);
  const capensisRisk = h.subspecies === 'capensis' && apiary?.province && SCUTELLATA_PROVINCES.includes(apiary.province);
  const year = new Date().getFullYear();

  const submit = async () => {
    if (!h.apiary_id) return toast('Choose an apiary');
    if (!h.name?.trim()) return toast('Give the hive a name');
    const rec = await db.save<Hive>('hives', { ...(h as Hive), id: h.id || db.uuid(), name: h.name.trim(), code: h.code || shortCode() });
    toast('Hive saved');
    if (id) back(`/hive/${rec.id}`);
    else go(`/hive/${rec.id}`, true);
  };
  const del = async () => {
    if (!window.confirm(`Delete ${h.name} and its inspection records?`)) return;
    await db.remove('hives', id!);
    toast('Hive deleted');
    go(`/apiary/${h.apiary_id}`, true);
  };

  if (!apiaries.length) {
    return (<><Topbar title="New hive" backTo="/apiaries" /><Empty title="Add an apiary first" text="Hives belong to an apiary, the site where they stand." action={<a className="btn" href="#/apiary/new">Add apiary</a>} /></>);
  }

  return (
    <>
      <Topbar title={id ? 'Edit hive' : 'New hive'} backTo={h.apiary_id ? `/apiary/${h.apiary_id}` : '/apiaries'} />
      <div className="stack">
        <Field label="Apiary">
          <select className="input" value={h.apiary_id || ''} onChange={(e) => set({ apiary_id: e.target.value })}>
            <option value="">Choose apiary</option>
            {apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Name"><input className="input" value={h.name || ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Hive type">
          <select className="input" value={h.hive_type || ''} onChange={(e) => set({ hive_type: e.target.value })}>
            {HIVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <div className="field"><span>Bee</span>
          <Seg label="Bee subspecies" options={SUBSPECIES.map((s) => ({ value: s.value, label: s.label }))} value={h.subspecies} onChange={(v) => set({ subspecies: v })} />
          {h.subspecies && <span className="small muted">{SUBSPECIES.find((s) => s.value === h.subspecies)?.hint}</span>}
        </div>
        {capensisRisk && (
          <div className="banner warn">
            <LuTriangleAlert />
            <div><b>Cape bees outside their home range</b>
              <p>{apiary!.province} is African-bee country. Cape bee workers can take over African bee colonies (the "capensis calamity"). Check the movement rules with your provincial Department of Agriculture before keeping Cape bees here.</p></div>
          </div>
        )}
        <div className="field"><span>Status</span>
          <Pills label="Hive status" single options={HIVE_STATUS.map((s) => ({ value: s.value, label: s.label }))} value={[h.status || 'active']} onChange={(v) => set({ status: v[0] || 'active' })} />
        </div>
        <AutopsyFields hive={h} set={set} />
        <Field label="Queen year" hint="sets the marking colour">
          <select className="input" value={h.queen_year || ''} onChange={(e) => set({ queen_year: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Unknown</option>
            {[0, 1, 2, 3, 4].map((d) => <option key={d} value={year - d}>{year - d} · {queenColour(year - d)?.name}</option>)}
          </select>
        </Field>
        <div className="field"><span>Queen marked?</span>
          <Seg label="Queen marked" options={[{ value: 'yes', label: 'Marked' }, { value: 'no', label: 'Not marked' }]} value={h.queen_marked ? 'yes' : 'no'} onChange={(v) => set({ queen_marked: v === 'yes' })} />
        </div>
        <Field label="Notes" hint="optional"><textarea className="input" value={h.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Origin, swarm date, temperament history" /></Field>
        <button className="btn" onClick={submit}>Save hive</button>
        {id && <button className="btn ghost" onClick={del} style={{ color: 'var(--bad)' }}><LuTrash2 /> Delete hive</button>}
      </div>
    </>
  );
}
