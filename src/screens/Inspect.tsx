import { useEffect, useMemo, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuCopy, LuThermometer, LuTriangleAlert, LuTrash2, LuCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Inspection, Photo } from '../db';
import {
  ACTIONS, BROOD_PATTERN, PESTS, QUEEN_SIGNS, SPACE, TEMPERAMENT, agoLabel, fetchWeather, fmtDateTime, healthScore,
  inspectionWeatherVerdict, lsGet, lsSet, scoreTone,
} from '../lib';
import { getSettings } from '../settings';
import { Empty, Field, Hex, ListLink, Pills, Ring, Seg, Stepper, SyncChip, Topbar, back, go, toast } from '../ui';
import { loadSummaries } from './Home';
import { PhotoAdder, PhotoGrid } from './Photos';

export function InspectPicker() {
  const data = db.useLive(loadSummaries);
  if (!data) return null;
  const live = data.hives.filter((h) => !['dead', 'absconded'].includes(h.hive.status || 'active'));
  return (
    <>
      <Topbar title="Inspect a hive" right={<SyncChip />} />
      {live.length === 0 ? (
        <Empty title="No hives to inspect" text="Add an apiary and a hive first. Then every inspection takes about a minute to log."
          action={<a className="btn" href={data.apiaries.length ? `#/hive/new?apiary=${data.apiaries[0].id}` : '#/apiary/new'}>{data.apiaries.length ? 'Add a hive' : 'Add an apiary'}</a>} />
      ) : (
        data.apiaries.map((a) => {
          const hs = live.filter((h) => h.hive.apiary_id === a.id);
          if (!hs.length) return null;
          return (
            <section key={a.id}>
              <h3 className="h2">{a.name}</h3>
              <div className="list">
                {hs.sort((x, y) => x.hive.name.localeCompare(y.hive.name, undefined, { numeric: true })).map(({ hive, last }) => (
                  <ListLink key={hive.id} href={`/inspect/${hive.id}`} title={hive.name} sub={agoLabel(last?.inspected_at)}
                    left={<Hex size={44} label={<span style={{ fontSize: 13 }}>{last?.score ?? '–'}</span>} tone={last ? scoreTone(last.score) : 'muted'} />} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

const STEPS = ['Colony', 'Queen', 'Brood', 'Stores and space', 'Pests and disease', 'Actions and photos', 'Review'];
type Draft = Partial<Inspection> & { id: string };

function emptyDraft(hiveId: string): Draft {
  return {
    id: db.uuid(), hive_id: hiveId, inspected_at: new Date().toISOString(), queen_status: [], pests: [], actions: [],
    brood_frames: 0, honey_frames: 0, pollen_frames: 0, afb_suspect: false,
  };
}

export function InspectFlow({ hiveId }: { hiveId: string }) {
  const draftKey = `hg:draft:${hiveId}`;
  const [d, setD] = useState<Draft>(() => lsGet<Draft | null>(draftKey, null) || emptyDraft(hiveId));
  const [step, setStep] = useState(0);
  const ctx = db.useLive(async () => {
    const hive = await db.get<Hive>('hives', hiveId);
    const apiary = hive ? await db.get<Apiary>('apiaries', hive.apiary_id) : undefined;
    const prev = (await db.byIndex<Inspection>('inspections', 'hive_id', hiveId)).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
    const photos = (await db.byIndex<Photo>('photos', 'hive_id', hiveId)).filter((p) => p.inspection_id === d.id);
    return { hive, apiary, prev, photos };
  }, [hiveId, d.id]);

  // Keep a draft so a phone call or a sting does not lose the inspection.
  useEffect(() => lsSet(draftKey, d), [d, draftKey]);

  // Weather from the apiary's approximate location; no GPS fix is taken per inspection.
  useEffect(() => {
    const a = ctx?.apiary;
    if (d.weather === undefined && a?.lat != null && a.lng != null && navigator.onLine && getSettings().weather) {
      fetchWeather(a.lat, a.lng).then((w) => setD((x) => ({ ...x, weather: w })));
    }
  }, [ctx?.apiary?.id]);

  const score = useMemo(() => healthScore(d), [d]);
  if (!ctx) return null;
  if (!ctx.hive) return (<><Topbar title="Inspect" backTo="/inspect" /><Empty title="Hive not found" text="It may have been deleted." /></>);
  const set = (patch: Partial<Inspection>) => setD((x) => ({ ...x, ...patch }));
  const verdict = inspectionWeatherVerdict(d.weather);

  const repeatLast = () => {
    const p = ctx.prev;
    if (!p) return;
    set({
      temperament: p.temperament, queen_status: p.queen_status || [], brood_frames: p.brood_frames, brood_pattern: p.brood_pattern,
      honey_frames: p.honey_frames, pollen_frames: p.pollen_frames, space: p.space, pests: (p.pests || []).slice(),
    });
    toast('Filled in from the last inspection. Change what is different.');
  };

  const finish = async () => {
    await db.save<Inspection>('inspections', { ...(d as Inspection), score, inspected_at: d.inspected_at || new Date().toISOString() });
    const qs = d.queen_status || [];
    const hive = ctx.hive!;
    let status = hive.status;
    if (qs.includes('queenless') || qs.includes('laying_workers')) status = 'queenless';
    else if ((qs.includes('eggs') || qs.includes('queen_seen')) && hive.status === 'queenless') status = 'active';
    if (status !== hive.status) await db.save<Hive>('hives', { ...hive, status });
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    navigator.vibrate?.([20, 40, 20]);
    toast(navigator.onLine ? 'Inspection saved' : 'Saved on this phone. It will sync when you have signal.');
    go(`/hive/${hiveId}`, true);
  };

  const discard = async () => {
    if (!window.confirm('Discard this inspection?')) return;
    for (const p of ctx.photos) await db.remove('photos', p.id);
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    back(`/hive/${hiveId}`);
  };

  return (
    <>
      <Topbar title={ctx.hive.name} backTo={`/hive/${hiveId}`} right={<button className="icon-btn" aria-label="Discard inspection" onClick={discard}><LuTrash2 /></button>} />
      <div className="progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}
      </div>
      <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
      <h2 className="step-title">{STEPS[step]}</h2>

      <div className="stack" style={{ marginTop: 14 }}>
        {step === 0 && (
          <>
            {d.weather && (
              <div className={`banner ${verdict?.ok ? 'good' : 'warn'}`}>
                <LuThermometer />
                <div><b>{Math.round(d.weather.temp ?? 0)}°C · wind {Math.round(d.weather.wind ?? 0)} km/h</b><p>{verdict?.text}</p></div>
              </div>
            )}
            {ctx.prev && <button className="btn ghost" onClick={repeatLast}><LuCopy /> Same as last time ({agoLabel(ctx.prev.inspected_at).toLowerCase()})</button>}
            <div className="field"><span>Temperament</span>
              <Seg label="Temperament" options={TEMPERAMENT} value={d.temperament} onChange={(v) => set({ temperament: v })} />
            </div>
            {d.temperament === 'defensive' && (
              <div className="banner warn"><LuTriangleAlert /><div><b>Defensive colony</b><p>Use more smoke, work slowly, and keep people and animals well away. Close up early if the bees keep building up.</p></div></div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <p className="muted" style={{ margin: 0 }}>Tick everything you saw. Eggs mean a laying queen was there in the last three days.</p>
            <Pills label="Queen signs" options={QUEEN_SIGNS} value={d.queen_status || []} onChange={(v) => {
              // "No queen signs" cannot sit with signs of a queen.
              const added = v.find((x) => !(d.queen_status || []).includes(x));
              let next = v;
              if (added === 'queenless') next = v.filter((x) => !['queen_seen', 'eggs', 'young_larvae'].includes(x));
              else if (['queen_seen', 'eggs', 'young_larvae'].includes(added || '')) next = v.filter((x) => x !== 'queenless');
              set({ queen_status: next });
            }} />
            {(d.queen_status || []).includes('laying_workers') && (
              <div className="banner warn"><LuTriangleAlert /><div><b>Laying workers</b><p>Several eggs per cell or drone brood in worker cells. In Cape bee areas this is common after queen loss. Ask your mentor or club before trying to requeen.</p></div></div>
            )}
            {(d.queen_status || []).includes('queen_cells') && (
              <div className="banner warn"><LuTriangleAlert /><div><b>Swarm cells</b><p>The colony is preparing to swarm. Consider adding space or making a split.</p></div></div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Frames with brood"><Stepper label="brood frames" value={d.brood_frames || 0} onChange={(v) => set({ brood_frames: v })} /></Field>
            <div className="field"><span>Brood pattern</span>
              <Seg label="Brood pattern" options={BROOD_PATTERN} value={d.brood_pattern} onChange={(v) => set({ brood_pattern: v })} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Frames of honey"><Stepper label="honey frames" value={d.honey_frames || 0} onChange={(v) => set({ honey_frames: v })} /></Field>
            <Field label="Frames of pollen"><Stepper label="pollen frames" value={d.pollen_frames || 0} onChange={(v) => set({ pollen_frames: v })} /></Field>
            <div className="field"><span>Space</span>
              <Pills label="Space" single options={SPACE} value={d.space ? [d.space] : []} onChange={(v) => set({ space: v[0] })} />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Pills label="Pests seen" options={PESTS} value={d.pests || []} onChange={(v) => set({ pests: v })} />
            <hr className="sep" />
            <div className="field"><span>Signs of American foulbrood?</span>
              <span className="small muted">Sunken, greasy or perforated cappings, a bad smell, or larvae that pull out like a brown thread on a matchstick.</span>
              <Seg label="AFB suspected" options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, suspected' }]} value={d.afb_suspect ? 'yes' : 'no'} onChange={(v) => set({ afb_suspect: v === 'yes' })} />
            </div>
            {d.afb_suspect && (
              <div className="banner bad">
                <LuTriangleAlert />
                <div>
                  <b>Treat this as American foulbrood until tested</b>
                  <ul>
                    <li>Close the hive and leave it where it is. Do not move it, combine it or swap frames.</li>
                    <li>Do not feed honey from it to other colonies.</li>
                    <li>Clean your hive tool and gloves before touching another hive.</li>
                    <li>Contact your provincial Department of Agriculture or state veterinarian. AFB is a notifiable disease.</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <div className="field"><span>What did you do?</span>
              <Pills label="Actions" options={ACTIONS} value={d.actions || []} onChange={(v) => set({ actions: v })} />
            </div>
            <div className="field"><span>Photos</span><PhotoAdder hiveId={hiveId} inspectionId={d.id} /></div>
            <PhotoGrid photos={ctx.photos} />
            <Field label="Notes" hint="optional"><textarea className="input" value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything to remember next time" /></Field>
          </>
        )}

        {step === 6 && (
          <>
            <Ring value={score} tone={d.afb_suspect ? 'bad' : scoreTone(score)} />
            <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>A guide from what you recorded, not a diagnosis.</p>
            <div className="card">
              <dl className="kv">
                <dt>When</dt><dd>{fmtDateTime(d.inspected_at)}</dd>
                <dt>Temperament</dt><dd>{TEMPERAMENT.find((t) => t.value === d.temperament)?.label || 'Not recorded'}</dd>
                <dt>Queen</dt><dd>{(d.queen_status || []).map((q) => QUEEN_SIGNS.find((x) => x.value === q)?.label).join(', ') || 'Nothing ticked'}</dd>
                <dt>Brood</dt><dd>{d.brood_frames} frames{d.brood_pattern ? `, ${d.brood_pattern}` : ''}</dd>
                <dt>Stores</dt><dd>{d.honey_frames} honey, {d.pollen_frames} pollen</dd>
                <dt>Pests</dt><dd>{(d.pests || []).map((p) => PESTS.find((x) => x.value === p)?.label).join(', ') || 'None seen'}</dd>
                {d.afb_suspect && (<><dt>AFB</dt><dd className="tone-bad">Suspected</dd></>)}
                <dt>Photos</dt><dd>{ctx.photos.length}</dd>
              </dl>
            </div>
          </>
        )}
      </div>

      <div className="flow-foot">
        <button className="btn secondary" onClick={() => (step ? setStep(step - 1) : back(`/hive/${hiveId}`))}><LuChevronLeft /> {step ? 'Back' : 'Cancel'}</button>
        {step < STEPS.length - 1 ? (
          <button className="btn" onClick={() => { setStep(step + 1); window.scrollTo(0, 0); }}>Next <LuChevronRight /></button>
        ) : (
          <button className="btn" onClick={finish}><LuCheck /> Save inspection</button>
        )}
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}

export function InspectionView({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const i = await db.get<Inspection>('inspections', id);
    if (!i) return { i };
    const hive = await db.get<Hive>('hives', i.hive_id);
    const photos = (await db.byIndex<Photo>('photos', 'hive_id', i.hive_id)).filter((p) => p.inspection_id === id);
    return { i, hive, photos };
  }, [id]);
  if (!data) return null;
  const { i, hive, photos = [] } = data;
  if (!i) return (<><Topbar title="Inspection" backTo="/log" /><Empty title="Inspection not found" text="It may have been deleted." /></>);
  const label = (list: { value: string; label: string }[], v?: string) => list.find((x) => x.value === v)?.label;
  const del = async () => {
    if (!window.confirm('Delete this inspection?')) return;
    await db.remove('inspections', id);
    toast('Inspection deleted');
    back(`/hive/${i.hive_id}`);
  };
  return (
    <>
      <Topbar title={hive?.name || 'Inspection'} backTo={hive ? `/hive/${hive.id}` : '/log'} />
      <p className="muted" style={{ marginTop: 0 }}>{fmtDateTime(i.inspected_at)}</p>
      <Ring value={i.score ?? 0} tone={i.afb_suspect ? 'bad' : scoreTone(i.score)} />
      {i.afb_suspect && <div className="banner bad" style={{ marginTop: 12 }}><LuTriangleAlert /><div><b>AFB suspected</b><p>Keep the hive closed and in place, and report it to your provincial Department of Agriculture.</p></div></div>}
      <div className="card" style={{ marginTop: 14 }}>
        <dl className="kv">
          <dt>Temperament</dt><dd>{label(TEMPERAMENT, i.temperament) || '–'}</dd>
          <dt>Queen</dt><dd>{(i.queen_status || []).map((q) => label(QUEEN_SIGNS, q)).join(', ') || '–'}</dd>
          <dt>Brood</dt><dd>{i.brood_frames ?? 0} frames{i.brood_pattern ? `, ${label(BROOD_PATTERN, i.brood_pattern)?.toLowerCase()}` : ''}</dd>
          <dt>Honey</dt><dd>{i.honey_frames ?? 0} frames</dd>
          <dt>Pollen</dt><dd>{i.pollen_frames ?? 0} frames</dd>
          <dt>Space</dt><dd>{label(SPACE, i.space) || '–'}</dd>
          <dt>Pests</dt><dd>{(i.pests || []).map((p) => label(PESTS, p)).join(', ') || 'None seen'}</dd>
          <dt>Actions</dt><dd>{(i.actions || []).map((p) => label(ACTIONS, p)).join(', ') || '–'}</dd>
          {i.weather?.temp != null && (<><dt>Weather</dt><dd>{Math.round(i.weather.temp)}°C, wind {Math.round(i.weather.wind ?? 0)} km/h</dd></>)}
          {i.notes && (<><dt>Notes</dt><dd>{i.notes}</dd></>)}
        </dl>
      </div>
      {photos.length > 0 && (<><h3 className="h2">Photos</h3><PhotoGrid photos={photos} /></>)}
      <button className="btn ghost" onClick={del} style={{ color: 'var(--bad)', marginTop: 18 }}><LuTrash2 /> Delete inspection</button>
    </>
  );
}
