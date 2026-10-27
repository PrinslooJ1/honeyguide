import { useEffect, useState } from 'react';
import { LuTruck, LuQrCode, LuCrosshair, LuMapPin, LuPencil, LuPlus, LuTrash2, LuThermometer, LuShieldCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Profile, Weather } from '../db';
import { PROVINCES, fetchWeather, getPosition, inspectionWeatherVerdict, roundCoord, scoreTone, statusInfo } from '../lib';
import { getSettings } from '../settings';
import { Empty, Field, Hex, ListLink, SyncChip, Topbar, back, go, toast } from '../ui';
import { BEE_ZONE_LABEL, RAINFALL_LABEL, suggestRegion, zonesForProvince, beeZone as beeZoneAt, rainfallZone, type RegionGuess } from '../region';
import { ApiaryForage, ForagePicker } from './Forage';
import { loadSummaries } from './Home';
import { access, apiaryRole, nameFor, useShare } from '../share';
import { ShareNote } from './Share';
import { ApiaryLandowner } from './Landowners';

export function ApiaryList() {
  const data = db.useLive(loadSummaries);
  const share = useShare();
  return (
    <>
      <Topbar title="Apiaries" right={<SyncChip />} />
      {data && data.apiaries.length === 0 && (
        <Empty title="No apiaries yet" text="Add the sites where your hives stand: your garden, a farm, a pollination block."
          action={<a className="btn" href="#/apiary/new"><LuPlus /> Add apiary</a>} />
      )}
      {data && data.apiaries.length > 0 && (
        <>
          <div className="list">
            {data.apiaries.sort((a, b) => a.name.localeCompare(b.name)).map((a) => {
              const hs = data.hives.filter((h) => h.hive.apiary_id === a.id);
              const flagged = hs.filter((h) => h.reasons.length).length;
              return (
                <ListLink key={a.id} href={`/apiary/${a.id}`}
                  left={<Hex size={44} label={<span style={{ fontSize: 15 }}>{hs.length}</span>} tone={flagged ? 'warn' : 'good'} />}
                  title={a.name}
                  sub={`${apiaryRole(a, share) === 'owner' ? a.province || 'Province not set' : `Shared by ${nameFor(a.owner_id, share)}`} · ${hs.length} hive${hs.length === 1 ? '' : 's'}${flagged ? ` · ${flagged} need attention` : ''}`} />
              );
            })}
          </div>
          <a className="btn secondary" href="#/apiary/new" style={{ marginTop: 14 }}><LuPlus /> Add apiary</a>
        </>
      )}
    </>
  );
}

export function ApiaryDetail({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const all = await loadSummaries();
    return { apiary: all.apiaries.find((a) => a.id === id), hives: all.hives.filter((h) => h.hive.apiary_id === id) };
  }, [id]);
  const [weather, setWeather] = useState<Weather | null>();
  const share = useShare();
  const apiary = data?.apiary;
  useEffect(() => {
    if (apiary?.lat != null && apiary.lng != null && navigator.onLine && getSettings().weather) {
      fetchWeather(apiary.lat, apiary.lng).then(setWeather);
    }
  }, [apiary?.lat, apiary?.lng]);

  if (!data) return null;
  if (!apiary) return (<><Topbar title="Apiary" backTo="/apiaries" /><Empty title="Apiary not found" text="It may have been deleted, or it is no longer shared with you." /></>);
  const verdict = inspectionWeatherVerdict(weather);
  const acc = access(apiaryRole(apiary, share));

  return (
    <>
      <Topbar title={apiary.name} backTo="/apiaries" right={acc.canEdit ? <a className="icon-btn" href={`#/apiary/${id}/edit`} aria-label="Edit apiary"><LuPencil /></a> : undefined} />
      <p className="muted" style={{ marginTop: 0 }}>
        {apiary.province || 'Province not set'} ·{' '}
        {apiary.location_precision === 'precise' ? 'Exact location saved' : apiary.location_precision === 'approximate' ? 'Approximate location (about 1 km)' : 'No location saved'}
      </p>

      {weather && (
        <div className={`banner ${verdict?.ok ? 'good' : 'warn'}`} style={{ marginBottom: 12 }}>
          <LuThermometer />
          <div>
            <b>{Math.round(weather.temp ?? 0)}°C · wind {Math.round(weather.wind ?? 0)} km/h</b>
            <p>{verdict?.text}</p>
          </div>
        </div>
      )}

      <div className="row between">
        <h3 className="h2">Hives</h3>
        <div className="row" style={{ gap: 8 }}>
          {data.hives.length > 0 && acc.canEdit && <a className="btn small ghost" href={`#/labels?apiary=${id}`} aria-label="Print labels for this apiary"><LuQrCode /> Labels</a>}
          {data.hives.length > 0 && acc.isOwner && <a className="btn small ghost" href={`#/move/new?from=${id}`} aria-label="Plan a move from this apiary"><LuTruck /> Move</a>}
          {acc.canEdit && <a className="btn small secondary" href={`#/hive/new?apiary=${id}`}><LuPlus /> Add hive</a>}
        </div>
      </div>
      {data.hives.length === 0 ? (
        <Empty title="No hives here yet" text={acc.canEdit ? "Add each hive box at this site. You can give it a name like 'Hive 1' or 'Aloe row 3'." : 'The owner has not added hives here yet.'}
          action={acc.canEdit ? <a className="btn" href={`#/hive/new?apiary=${id}`}><LuPlus /> Add first hive</a> : undefined} />
      ) : (
        <div className="hex-grid">
          {data.hives.sort((a, b) => a.hive.name.localeCompare(b.hive.name, undefined, { numeric: true })).map(({ hive, last, reasons }) => (
            <a key={hive.id} className="hex-tile" href={`#/hive/${hive.id}`}>
              <Hex label={last?.score ?? '–'} tone={last?.afb_suspect ? 'bad' : last ? scoreTone(last.score) : statusInfo(hive.status).tone} />
              <span className="hex-name">{hive.name}</span>
              <span className={`hex-sub ${reasons.length ? 'tone-warn' : ''}`}>{reasons[0] || statusInfo(hive.status).label}</span>
            </a>
          ))}
        </div>
      )}

      <ApiaryForage apiary={apiary} />
      <p className="small muted">{(() => {
        const z = apiary.lat != null && apiary.lng != null ? { rainfall: rainfallZone(apiary.lat, apiary.lng), beeZone: beeZoneAt(apiary.lat, apiary.lng) } : zonesForProvince(apiary.province);
        return `${RAINFALL_LABEL[z.rainfall]} · ${BEE_ZONE_LABEL[z.beeZone]} (suggested)`;
      })()}</p>

      {(apiary.forage_notes || apiary.access_notes) && (
        <>
          <h3 className="h2">Site notes</h3>
          <div className="card">
            <dl className="kv">
              {apiary.forage_notes && (<><dt>Forage</dt><dd>{apiary.forage_notes}</dd></>)}
              {apiary.access_notes && (<><dt>Access</dt><dd>{apiary.access_notes}</dd></>)}
            </dl>
          </div>
        </>
      )}
      {acc.isOwner && <ApiaryLandowner apiary={apiary} />}
      <div style={{ marginTop: 16 }}>
        {share && (share.apiaries.some((x) => x.apiary_id === id) || !acc.isOwner) ? <ShareNote apiary={apiary} share={share} /> : <p className="small muted row"><LuShieldCheck /> Private: only you can see this apiary and its location.</p>}
      </div>
    </>
  );
}

export function ApiaryForm({ id }: { id?: string }) {
  const [a, setA] = useState<Partial<Apiary> | null>(id ? null : { location_precision: 'off' });
  const [locating, setLocating] = useState(false);
  const [guess, setGuess] = useState<RegionGuess | null>(null);
  const share = useShare();
  useEffect(() => {
    if (id) db.get<Apiary>('apiaries', id).then((r) => setA(r || {}));
    else db.all<Profile>('profiles').then((p) => setA((x) => ({ ...x, province: x?.province || p[0]?.province })));
  }, [id]);
  if (!a) return null;
  const set = (patch: Partial<Apiary>) => setA({ ...a, ...patch });

  const locate = async (precision: 'approximate' | 'precise') => {
    setLocating(true);
    try {
      const pos = await getPosition();
      set({ lat: roundCoord(pos.coords.latitude, precision), lng: roundCoord(pos.coords.longitude, precision), location_precision: precision });
      setGuess(suggestRegion(pos.coords.latitude, pos.coords.longitude));
      toast(precision === 'precise' ? 'Exact location saved' : 'Approximate location saved');
    } catch (e: any) {
      toast(e?.code === 1 ? 'Location permission was declined. You can still save the apiary.' : 'Could not get a location fix. Try again in the open.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (!a.name?.trim()) return toast('Give the apiary a name');
    const rec = await db.save<Apiary>('apiaries', { ...(a as Apiary), id: a.id || db.uuid(), name: a.name.trim() });
    toast('Apiary saved');
    if (id) back(`/apiary/${rec.id}`);
    else go(`/apiary/${rec.id}`, true);
  };

  const del = async () => {
    const hives = (await db.all<Hive>('hives')).filter((h) => h.apiary_id === id);
    if (!confirmDelete(`Delete ${a.name}${hives.length ? ` and its ${hives.length} hive records` : ''}?`)) return;
    for (const h of hives) await db.remove('hives', h.id);
    await db.remove('apiaries', id!);
    toast('Apiary deleted');
    go('/apiaries', true);
  };

  const mode = getSettings().locationMode;
  const isOwner = !id || apiaryRole(a as Apiary, share) === 'owner';
  return (
    <>
      <Topbar title={id ? 'Edit apiary' : 'New apiary'} backTo="/apiaries" />
      <div className="stack">
        <Field label="Name"><input className="input" value={a.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Home garden, Oom Piet se plaas" autoFocus={!id} /></Field>
        <Field label="Province">
          <select className="input" value={a.province || ''} onChange={(e) => set({ province: e.target.value })}>
            <option value="">Choose province</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>

        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}><LuMapPin /><b className="grow">Location</b>
            <span className="small muted">{a.location_precision === 'off' || !a.location_precision ? 'Not saved' : a.location_precision === 'precise' ? 'Exact' : 'About 1 km'}</span>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>Used once, when you tap a button, for weather and later for forage. Never tracked in the background. Only you can see it.</p>
          {!isOwner ? (
            <p className="small">Only the owner can change the location.</p>
          ) : mode === 'off' ? (
            <p className="small">Location is switched off in More › Privacy.</p>
          ) : (
            <div className="grid-2">
              <button className="btn secondary" disabled={locating} onClick={() => locate('approximate')}><LuCrosshair /> {locating ? 'Finding…' : 'Approximate'}</button>
              {mode === 'precise' && <button className="btn secondary" disabled={locating} onClick={() => locate('precise')}><LuMapPin /> Exact pin</button>}
              {a.lat != null && <button className="btn ghost" onClick={() => set({ lat: null, lng: null, location_precision: 'off' })}>Clear</button>}
            </div>
          )}
          {guess && (
            <div className="banner info" style={{ marginTop: 12 }}>
              <LuMapPin />
              <div>
                <b>Suggested region</b>
                <p>{guess.province ? `${guess.province} (near ${guess.nearest})` : 'This looks outside South Africa'} · {RAINFALL_LABEL[guess.rainfall]} · {BEE_ZONE_LABEL[guess.beeZone]}</p>
                <p className="small muted">Worked out on this phone. Boundaries blur, so change it if it's wrong.</p>
                {guess.province && guess.province !== a.province && (
                  <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => { set({ province: guess.province! }); setGuess(null); }}>Use {guess.province}</button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="field"><span>Forage near this apiary <span className="hint">· tap what grows within about 3 km</span></span>
          <ForagePicker province={a.province} value={a.forage_plants || []} onChange={(v) => set({ forage_plants: v })} />
        </div>

        <Field label="Forage nearby" hint="optional"><input className="input" value={a.forage_notes || ''} onChange={(e) => set({ forage_notes: e.target.value })} placeholder="e.g. Spotted aloe, citrus, gums" /></Field>
        <Field label="Access and security" hint="optional; seen by anyone you share this apiary with"><textarea className="input" value={a.access_notes || ''} onChange={(e) => set({ access_notes: e.target.value })} placeholder="Gate code, dogs, track condition" /></Field>
        {isOwner && <p className="small muted" style={{ margin: 0 }}>The landowner, their phone number and your permission now live in the private landowner log, on the apiary page.</p>}
        <button className="btn" onClick={submit}>Save apiary</button>
        {id && isOwner && <button className="btn ghost" onClick={del} style={{ color: 'var(--bad)' }}><LuTrash2 /> Delete apiary</button>}
      </div>
    </>
  );
}

export function confirmDelete(message: string) {
  return window.confirm(message);
}
