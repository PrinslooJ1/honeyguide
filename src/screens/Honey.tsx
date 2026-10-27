// Release 1.3: harvest log, honey batches, jar passport stickers and the public honey passport.
import { useEffect, useMemo, useState } from 'react';
import { LuDroplet, LuPlus, LuPrinter, LuGlobe, LuExternalLink, LuTriangleAlert, LuPencil } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Batch, Harvest, Hive, Profile } from '../db';
import { getPlant } from '../content/forage';
import { fmtDate, lsGet, lsSet } from '../lib';
import { qrSvg } from '../qr';
import { seasonStart } from '../progress';
import { Empty, Field, ListLink, Pills, Seg, Sheet, Topbar, back, go, toast } from '../ui';
import { STOCKS, type Stock } from './Labels';

const JAR_SIZES = [250, 340, 500, 1000];

export function passportUrl(code: string) {
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}passport.html#${code}`;
}

function batchCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(4));
  return 'HB-' + Array.from(r, (b) => a[b % a.length]).join('');
}

// ---------------- harvest sheet on the hive page ----------------
export function HarvestButton({ hive, apiary }: { hive: Hive; apiary?: Apiary }) {
  const [open, setOpen] = useState(false);
  const [kg, setKg] = useState('');
  const [frames, setFrames] = useState('');
  const [moisture, setMoisture] = useState('');
  const options = [...(apiary?.forage_plants || []).map((id) => getPlant(id)?.name).filter(Boolean) as string[], 'Mixed wildflower'];
  const [forage, setForage] = useState<string>(options[0]);
  const save = async () => {
    const n = Number(kg.replace(',', '.'));
    if (!n || n <= 0) return toast('Enter the weight in kg');
    const m = moisture ? Number(moisture.replace(',', '.')) : null;
    await db.save<Harvest>('harvests', { id: db.uuid(), hive_id: hive.id, harvested_at: new Date().toISOString(), kg: n, frames: frames ? Number(frames) : null, forage, moisture: m });
    setOpen(false); setKg(''); setFrames(''); setMoisture('');
    toast(`${n} kg logged`);
  };
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}><LuDroplet /> Log a harvest</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Harvest from ${hive.name}`}>
        <div className="stack">
          <Field label="Honey (kg)"><input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 12.5" autoFocus /></Field>
          <Field label="Frames taken" hint="optional"><input className="input" inputMode="numeric" value={frames} onChange={(e) => setFrames(e.target.value)} /></Field>
          <div className="field"><span>Main forage</span><Pills label="Forage" single options={options.map((o) => ({ value: o, label: o }))} value={[forage]} onChange={(v) => setForage(v[0] || 'Mixed wildflower')} /></div>
          <Field label="Moisture (%)" hint="refractometer, optional"><input className="input" inputMode="decimal" value={moisture} onChange={(e) => setMoisture(e.target.value)} /></Field>
          {Number(moisture.replace(',', '.')) > 20 && <div className="banner warn"><LuTriangleAlert /><div><p style={{ marginTop: 0 }}>Above 20% water, the most the international honey standard (Codex) allows. Wet honey can ferment.</p></div></div>}
          <p className="small muted" style={{ margin: 0 }}>Take only capped honey, and leave the colony enough stores.</p>
          <button className="btn" onClick={save}>Save harvest</button>
        </div>
      </Sheet>
    </>
  );
}

// ---------------- harvest log ----------------
export function HarvestList() {
  const data = db.useLive(async () => ({
    harvests: await db.all<Harvest>('harvests'), hives: await db.all<Hive>('hives'), apiaries: await db.all<Apiary>('apiaries'), batches: await db.all<Batch>('batches'),
  }));
  if (!data) return null;
  const season = seasonStart();
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const thisYear = data.harvests.filter((h) => new Date(h.harvested_at) >= yearStart);
  const total = thisYear.reduce((s, h) => s + Number(h.kg), 0);
  const byForage = new Map<string, number>();
  thisYear.forEach((h) => byForage.set(h.forage || 'Unknown', (byForage.get(h.forage || 'Unknown') || 0) + Number(h.kg)));
  const hiveName = (id: string) => data.hives.find((h) => h.id === id)?.name || 'Hive';
  const sorted = [...data.harvests].sort((a, b) => b.harvested_at.localeCompare(a.harvested_at));
  const unbatched = data.harvests.filter((h) => !h.batch_id).length;
  return (
    <>
      <Topbar title="Honey" backTo="/business" />
      <div className="grid-2">
        <div className="card stat"><div className="big-num">{total.toFixed(1)}</div><div className="label">kg this year</div></div>
        <div className="card stat"><div className="big-num">{data.batches.length}</div><div className="label">Jar batches</div></div>
      </div>
      {byForage.size > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">By forage, this year</div>
          {[...byForage.entries()].sort((a, b) => b[1] - a[1]).map(([f, kg]) => (
            <div key={f} className="row between small" style={{ marginTop: 6 }}><span>{f}</span><b>{kg.toFixed(1)} kg</b></div>
          ))}
        </div>
      )}
      <div className="row between"><h3 className="h2">Batches</h3><a className="btn small secondary" href="#/batch/new"><LuPlus /> New batch</a></div>
      {data.batches.length ? (
        <div className="list">{data.batches.map((b) => <ListLink key={b.id} href={`/batch/${b.id}`} left={<LuDroplet />} title={b.name} sub={`${b.code}${b.public ? ' · public passport' : ''}${b.harvest_month ? ` · ${new Date(b.harvest_month).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}` : ''}`} />)}</div>
      ) : <p className="muted">Group harvests into a jar batch to print passport stickers.{unbatched ? ` ${unbatched} harvest${unbatched > 1 ? 's' : ''} ready.` : ''}</p>}
      <h3 className="h2">Harvests</h3>
      {sorted.length === 0 ? (
        <Empty title="No harvests yet" text="Open a hive and tap Log a harvest after you extract." />
      ) : (
        <div className="list">
          {sorted.map((h) => (
            <div key={h.id} className="list-item">
              <LuDroplet />
              <div className="grow"><div className="title">{Number(h.kg).toFixed(1)} kg · {hiveName(h.hive_id)}</div><div className="sub">{fmtDate(h.harvested_at)} · {h.forage || 'Forage not set'}{h.moisture != null ? ` · ${h.moisture}% water` : ''}{h.batch_id ? ` · ${data.batches.find((b) => b.id === h.batch_id)?.code || ''}` : ''}</div></div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">Season so far starts {fmtDate(season.start.toISOString())}.</p>
    </>
  );
}

// ---------------- batches ----------------
export function BatchForm({ id }: { id?: string }) {
  const data = db.useLive(async () => ({ harvests: await db.all<Harvest>('harvests'), hives: await db.all<Hive>('hives'), profile: (await db.all<Profile>('profiles'))[0] }));
  const [b, setB] = useState<Partial<Batch> | null>(id ? null : null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (!data || b) return;
    if (id) {
      db.get<Batch>('batches', id).then((r) => { setB(r || {}); setPicked(data.harvests.filter((h) => h.batch_id === id).map((h) => h.id)); });
    } else {
      const free = data.harvests.filter((h) => !h.batch_id);
      const latest = free.sort((x, y) => y.harvested_at.localeCompare(x.harvested_at))[0];
      const forages = free.map((h) => h.forage).filter(Boolean) as string[];
      const common = forages.sort((x, y) => forages.filter((f) => f === y).length - forages.filter((f) => f === x).length)[0];
      setB({ code: batchCode(), name: latest ? `${common || 'Honey'} ${new Date(latest.harvested_at).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}` : '', forage: common, province: data.profile?.province,
        harvest_month: latest ? latest.harvested_at.slice(0, 7) + '-01' : null, jar_size_g: 500, public: false, show_reg: true, show_contact: false });
      setPicked(free.map((h) => h.id));
    }
  }, [data, id, b]);
  if (!data || !b) return null;
  const set = (p: Partial<Batch>) => setB({ ...b, ...p });
  const choosable = data.harvests.filter((h) => !h.batch_id || h.batch_id === id);
  const kg = data.harvests.filter((h) => picked.includes(h.id)).reduce((s, h) => s + Number(h.kg), 0);
  const save = async () => {
    if (!b.name?.trim()) return toast('Name the batch');
    const rec = await db.save<Batch>('batches', { ...(b as Batch), id: b.id || db.uuid(), name: b.name.trim(), jars: b.jars ?? (b.jar_size_g ? Math.floor((kg * 1000) / b.jar_size_g) : null) });
    for (const h of data.harvests) {
      const inBatch = picked.includes(h.id);
      if (inBatch && h.batch_id !== rec.id) await db.save<Harvest>('harvests', { ...h, batch_id: rec.id });
      if (!inBatch && h.batch_id === rec.id) await db.save<Harvest>('harvests', { ...h, batch_id: null });
    }
    toast('Batch saved');
    id ? back(`/batch/${rec.id}`) : go(`/batch/${rec.id}`, true);
  };
  const hiveName = (hid: string) => data.hives.find((h) => h.id === hid)?.name || 'Hive';
  return (
    <>
      <Topbar title={id ? 'Edit batch' : 'New jar batch'} backTo="/harvests" />
      <div className="stack">
        <Field label="Batch name"><input className="input" value={b.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Winter aloe 2026" /></Field>
        <div className="field"><span>Harvests in this batch</span>
          {choosable.length ? <Pills label="Harvests" options={choosable.map((h) => ({ value: h.id, label: `${Number(h.kg).toFixed(1)} kg · ${hiveName(h.hive_id)} · ${fmtDate(h.harvested_at)}` }))} value={picked} onChange={setPicked} /> : <span className="small muted">No harvests to add. Log harvests on your hives first.</span>}
          <span className="small muted">{kg.toFixed(1)} kg selected</span>
        </div>
        <Field label="Forage"><input className="input" value={b.forage || ''} onChange={(e) => set({ forage: e.target.value })} placeholder="e.g. Spotted aloe" /></Field>
        <Field label="Region shown" hint="province only, never a location"><input className="input" value={b.province || ''} onChange={(e) => set({ province: e.target.value })} /></Field>
        <Field label="Harvest month"><input className="input" type="month" value={(b.harvest_month || '').slice(0, 7)} onChange={(e) => set({ harvest_month: e.target.value ? `${e.target.value}-01` : null })} /></Field>
        <div className="field"><span>Jar size</span><Seg label="Jar size" value={String(b.jar_size_g || 500)} onChange={(v) => set({ jar_size_g: Number(v) })} options={JAR_SIZES.map((g) => ({ value: String(g), label: g >= 1000 ? '1 kg' : `${g} g` }))} /></div>
        <p className="small muted" style={{ margin: 0 }}>About {b.jar_size_g ? Math.floor((kg * 1000) / b.jar_size_g) : 0} jars from {kg.toFixed(1)} kg.</p>
        <div className="card stack">
          <b>Public honey passport</b>
          <span className="small muted">When on, anyone who scans the jar's QR code sees the batch name, forage, province and harvest month. Never your location or apiary.</span>
          <Seg label="Passport" value={b.public ? 'on' : 'off'} onChange={(v) => set({ public: v === 'on' })} options={[{ value: 'off', label: 'Private' }, { value: 'on', label: 'Public' }]} />
          {b.public && (
            <>
              <Seg label="Show registration number" value={b.show_reg ? 'yes' : 'no'} onChange={(v) => set({ show_reg: v === 'yes' })} options={[{ value: 'yes', label: 'Show reg. no.' }, { value: 'no', label: 'Hide reg. no.' }]} />
              <Seg label="Show contact" value={b.show_contact ? 'yes' : 'no'} onChange={(v) => set({ show_contact: v === 'yes' })} options={[{ value: 'yes', label: 'Show contact' }, { value: 'no', label: 'Hide contact' }]} />
              {b.show_contact && !data.profile?.public_contact && <span className="small tone-warn">Add a public contact in More › Profile first.</span>}
            </>
          )}
        </div>
        <button className="btn" onClick={save}>Save batch</button>
      </div>
    </>
  );
}

function JarSticker({ batch, stock, reg }: { batch: Batch; stock: Stock; reg?: string }) {
  const pad = Math.min(3, stock.h * 0.08);
  const qrSide = Math.min(stock.h - pad * 2, stock.w * 0.45);
  const svg = useMemo(() => qrSvg(passportUrl(batch.code), 'Q', 4), [batch.code]);
  const scale = stock.h / 38;
  return (
    <div className="label" style={{ width: `${stock.w}mm`, height: `${stock.h}mm`, padding: `${pad}mm`, gap: `${pad}mm` }}>
      <div className="label-qr" style={{ width: `${qrSide}mm`, height: `${qrSide}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="label-text" style={{ fontSize: `${2.5 * scale}mm` }}>
        <div className="label-name" style={{ fontSize: `${3.8 * scale}mm` }}>{batch.name}</div>
        {batch.forage && <div>{batch.forage}</div>}
        <div>{[batch.province, batch.harvest_month && new Date(batch.harvest_month).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</div>
        {reg && <div>Reg. {reg}</div>}
        <div className="label-code">{batch.code}</div>
        <div className="label-hint">Scan for its story</div>
      </div>
    </div>
  );
}

export function BatchDetail({ id }: { id: string }) {
  const data = db.useLive(async () => ({ b: await db.get<Batch>('batches', id), harvests: (await db.all<Harvest>('harvests')).filter((h) => h.batch_id === id), profile: (await db.all<Profile>('profiles'))[0] }), [id]);
  const [stockId, setStockId] = useState(() => lsGet('hg:jarStock', 'roll-50'));
  const [copies, setCopies] = useState(1);
  if (!data) return null;
  const b = data.b;
  if (!b) return (<><Topbar title="Batch" backTo="/harvests" /><Empty title="Batch not found" text="It may have been deleted." /></>);
  const kg = data.harvests.reduce((s, h) => s + Number(h.kg), 0);
  const stock = STOCKS.find((s) => s.id === stockId) || STOCKS[3];
  const n = Math.max(1, copies);
  const reg = b.show_reg ? data.profile?.registration_number : undefined;
  const perSheet = stock.sheet ? stock.sheet.cols * stock.sheet.rows : 1;
  const pages: number[][] = [];
  for (let i = 0; i < n; i += perSheet) pages.push(Array.from({ length: Math.min(perSheet, n - i) }, (_, k) => i + k));
  const print = () => {
    let tag = document.getElementById('print-page-style');
    if (!tag) { tag = document.createElement('style'); tag.id = 'print-page-style'; document.head.appendChild(tag); }
    tag.textContent = `@page { size: ${stock.sheet ? '210mm 297mm' : `${stock.w}mm ${stock.h}mm`}; margin: 0; }`;
    window.print();
  };
  return (
    <>
      <div className="no-print">
        <Topbar title={b.name} backTo="/harvests" right={<a className="icon-btn" href={`#/batch/${id}/edit`} aria-label="Edit batch"><LuPencil /></a>} />
        <div className="card">
          <dl className="kv">
            <dt>Code</dt><dd>{b.code}</dd>
            <dt>Honey</dt><dd>{kg.toFixed(1)} kg from {data.harvests.length} harvest{data.harvests.length === 1 ? '' : 's'}</dd>
            <dt>Jars</dt><dd>{b.jars ?? '–'} × {b.jar_size_g ? (b.jar_size_g >= 1000 ? '1 kg' : `${b.jar_size_g} g`) : '?'}</dd>
            {b.forage && (<><dt>Forage</dt><dd>{b.forage}</dd></>)}
            {b.harvest_month && (<><dt>Harvested</dt><dd>{new Date(b.harvest_month).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</dd></>)}
            <dt>Passport</dt><dd>{b.public ? 'Public' : 'Private'}</dd>
          </dl>
        </div>
        {b.public ? (
          <a className="btn ghost" style={{ marginTop: 10 }} href={passportUrl(b.code)} target="_blank" rel="noreferrer"><LuGlobe /> Open the public passport <LuExternalLink /></a>
        ) : (
          <p className="small muted">The passport is private, so scanning the sticker shows a "not shared" page. Edit the batch to make it public.</p>
        )}
        <h3 className="h2">Passport stickers</h3>
        <div className="stack">
          <Field label="Sticker stock">
            <select className="input" value={stock.id} onChange={(e) => { setStockId(e.target.value); lsSet('hg:jarStock', e.target.value); }}>
              {STOCKS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="How many stickers"><input className="input" inputMode="numeric" value={copies} onChange={(e) => setCopies(Math.min(500, Number(e.target.value) || 1))} /></Field>
          <div className="label-preview"><div className="label-preview-inner"><JarSticker batch={b} stock={stock} reg={reg} /></div></div>
          <button className="btn" onClick={print}><LuPrinter /> Print {n} sticker{n === 1 ? '' : 's'}</button>
          <div className="banner info"><LuTriangleAlert /><div><p style={{ marginTop: 0 }}>This is a passport sticker that goes with your jar label, not a full legal label. Check the South African honey grading and labelling rules before you sell.</p></div></div>
        </div>
      </div>
      <div className="print-only">
        {pages.map((page, pi) => (
          <div key={pi} className={stock.sheet ? 'print-sheet' : 'print-roll'}
            style={stock.sheet ? { paddingTop: `${stock.sheet.top}mm`, paddingLeft: `${stock.sheet.left}mm`, gridTemplateColumns: `repeat(${stock.sheet.cols}, ${stock.w}mm)`, gridAutoRows: `${stock.h}mm`, columnGap: `${stock.sheet.gapX}mm`, rowGap: `${stock.sheet.gapY}mm` } : undefined}>
            {page.map((k) => <JarSticker key={k} batch={b} stock={stock} reg={reg} />)}
          </div>
        ))}
      </div>
    </>
  );
}
