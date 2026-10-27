// Release 1.4: equipment and cleaning log. Boxes, frames and tools, where they are, and when they
// were last cleaned. Kit from a dead-out waits in quarantine until it is cleaned.
import { useEffect, useState } from 'react';
import { LuPackage, LuPlus, LuPencil, LuTrash2, LuSparkles, LuTriangleAlert } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Equipment, EquipmentKind, Hive, Inspection } from '../db';
import { daysAgo, fmtDate } from '../lib';
import { Empty, Field, ListLink, Pills, Seg, Sheet, Stepper, Topbar, back, go, toast } from '../ui';
import { lossLabel } from './Field';

export const KINDS: { value: EquipmentKind; label: string }[] = [
  { value: 'brood_box', label: 'Brood boxes' },
  { value: 'super', label: 'Supers' },
  { value: 'frames', label: 'Frames' },
  { value: 'floor', label: 'Floors' },
  { value: 'lid', label: 'Lids' },
  { value: 'excluder', label: 'Queen excluders' },
  { value: 'feeder', label: 'Feeders' },
  { value: 'nuc_box', label: 'Nuc boxes' },
  { value: 'smoker', label: 'Smoker' },
  { value: 'hive_tool', label: 'Hive tools' },
  { value: 'suit', label: 'Suits and gloves' },
  { value: 'extractor', label: 'Extractor' },
  { value: 'other', label: 'Other' },
];
const STATUS: { value: Equipment['status']; label: string }[] = [
  { value: 'stored', label: 'In the store' },
  { value: 'in_use', label: 'On a hive' },
  { value: 'quarantine', label: 'Quarantine' },
  { value: 'retired', label: 'Retired' },
];
const METHODS = ['Scraped clean', 'Scorched', 'Washed', 'Frozen (wax moth)', 'Comb replaced', 'Other'];
export const kindLabel = (v?: string) => KINDS.find((k) => k.value === v)?.label || 'Equipment';
const SINGULAR: Partial<Record<EquipmentKind, string>> = {
  brood_box: 'brood box', super: 'super', frames: 'frame', floor: 'floor', lid: 'lid', excluder: 'queen excluder', feeder: 'feeder', nuc_box: 'nuc box', hive_tool: 'hive tool', suit: 'suit',
};
/** "3 brood boxes", "1 brood box", "1 smoker". */
export const countLabel = (qty: number, kind?: EquipmentKind) => (qty === 1 && kind && SINGULAR[kind] ? `1 ${SINGULAR[kind]}` : `${qty} ${kindLabel(kind).toLowerCase()}`);

/** Did this kit come from a colony where foulbrood was suspected? Then it must not be reused casually. */
async function afbSource(sourceHiveId?: string | null) {
  if (!sourceHiveId) return false;
  const hive = await db.get<Hive>('hives', sourceHiveId);
  if (hive?.loss_cause === 'afb') return true;
  const last = (await db.byIndex<Inspection>('inspections', 'hive_id', sourceHiveId)).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
  return !!last?.afb_suspect;
}

const AFB_TEXT = 'Foulbrood was suspected in the colony this came from. Keep it closed away from bees and do not reuse it until your provincial Department of Agriculture or a bee inspector has told you what to do.';

export function EquipmentList() {
  const data = db.useLive(async () => ({ items: await db.all<Equipment>('equipment'), hives: await db.all<Hive>('hives') }));
  if (!data) return <Topbar title="Equipment" backTo="/more" />;
  const { items, hives } = data;
  const hiveName = (id?: string | null) => hives.find((h) => h.id === id)?.name;
  const group = (s: Equipment['status']) => items.filter((i) => i.status === s).sort((a, b) => a.name.localeCompare(b.name));
  const sub = (i: Equipment) => [countLabel(i.qty, i.kind), i.status === 'in_use' && hiveName(i.hive_id) ? `on ${hiveName(i.hive_id)}` : null,
    i.last_cleaned_at ? `cleaned ${fmtDate(i.last_cleaned_at)}` : 'not cleaned yet'].filter(Boolean).join(' · ');
  const section = (s: Equipment['status'], title: string) => {
    const list = group(s);
    if (!list.length) return null;
    return (<><h3 className="h2">{title}</h3><div className="list">{list.map((i) => <ListLink key={i.id} href={`/equipment/${i.id}`} left={<LuPackage />} title={i.name} sub={sub(i)} />)}</div></>);
  };
  const quarantined = group('quarantine').length;
  const stale = items.filter((i) => i.status === 'stored' && (!i.last_cleaned_at || (daysAgo(i.last_cleaned_at) ?? 0) > 365)).length;
  return (
    <>
      <Topbar title="Equipment" backTo="/more" right={<a className="icon-btn" href="#/equipment/new" aria-label="Add equipment"><LuPlus /></a>} />
      <p className="muted" style={{ marginTop: 0 }}>Boxes, frames and tools, where they are and when they were last cleaned. Clean kit stops pests and disease moving between colonies.</p>
      {items.length === 0 ? (
        <Empty title="Nothing logged yet" text="Add what you have in the store and on your hives. When a colony dies, log its boxes here so they are cleaned before reuse."
          action={<a className="btn" href="#/equipment/new"><LuPlus /> Add equipment</a>} />
      ) : (
        <>
          <div className="grid-3">
            <div className="card stat"><div className="big-num">{items.filter((i) => i.status !== 'retired').reduce((s, i) => s + i.qty, 0)}</div><div className="label">Pieces</div></div>
            <div className="card stat"><div className="big-num">{quarantined}</div><div className="label">In quarantine</div></div>
            <div className="card stat"><div className="big-num">{stale}</div><div className="label">Stored, not cleaned this year</div></div>
          </div>
          {quarantined > 0 && <div className="banner warn" style={{ marginTop: 12 }}><LuTriangleAlert /><div><b>Quarantine</b><p>Keep this kit sealed away from bees until it is cleaned. Wax moth and beetles breed in old comb.</p></div></div>}
          {section('quarantine', 'Quarantine')}
          {section('in_use', 'On hives')}
          {section('stored', 'In the store')}
          {section('retired', 'Retired')}
        </>
      )}
    </>
  );
}

export function EquipmentForm({ id, fromHive }: { id?: string; fromHive?: string }) {
  const hives = db.useLive(() => db.all<Hive>('hives'));
  const apiaries = db.useLive(() => db.all<Apiary>('apiaries'));
  const [e, setE] = useState<Partial<Equipment> | null>(id ? null : { kind: 'brood_box', qty: 1, status: 'stored', name: 'Brood boxes' });
  const [afb, setAfb] = useState(false);
  useEffect(() => {
    if (id) db.get<Equipment>('equipment', id).then((r) => setE(r || {}));
    else if (fromHive) {
      db.get<Hive>('hives', fromHive).then((h) => {
        if (!h) return;
        setE((x) => ({ ...x, status: 'quarantine', source_hive_id: h.id, name: `Boxes from ${h.name}`,
          notes: `From ${h.name} (${h.status === 'absconded' ? 'absconded' : 'dead out'}${h.lost_at ? `, ${fmtDate(h.lost_at)}` : ''}). Likely cause: ${lossLabel(h.loss_cause).toLowerCase()}.` }));
      });
    }
  }, [id, fromHive]);
  useEffect(() => { afbSource(e?.source_hive_id).then(setAfb); }, [e?.source_hive_id]);
  if (!e || !hives || !apiaries) return null;
  const set = (p: Partial<Equipment>) => setE({ ...e, ...p });
  const live = hives.filter((h) => apiaries.some((a) => a.id === h.apiary_id));
  const save = async () => {
    if (!e.name?.trim()) return toast('Give it a name');
    const rec = await db.save<Equipment>('equipment', { ...(e as Equipment), id: e.id || db.uuid(), name: e.name.trim(), hive_id: e.status === 'in_use' ? e.hive_id || null : null, history: e.history || [] });
    toast('Saved');
    id ? back(`/equipment/${rec.id}`) : go(`/equipment/${rec.id}`, true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit equipment' : 'New equipment'} backTo="/equipment" />
      <div className="stack">
        {afb && <div className="banner bad"><LuTriangleAlert /><div><b>Possible foulbrood</b><p>{AFB_TEXT}</p></div></div>}
        <div className="field"><span>What</span>
          <Pills label="Kind" single options={KINDS} value={e.kind ? [e.kind] : []} onChange={(v) => {
            const k = (v[0] as EquipmentKind) || 'other';
            const auto = KINDS.some((x) => x.label === e.name) || !e.name;
            set({ kind: k, ...(auto ? { name: kindLabel(k) } : {}) });
          }} />
        </div>
        <Field label="Name"><input className="input" value={e.name || ''} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Langstroth brood boxes" /></Field>
        <Field label="How many"><Stepper label="pieces" min={0} max={999} value={e.qty ?? 1} onChange={(v) => set({ qty: v })} /></Field>
        <div className="field"><span>Where is it</span><Seg label="Status" value={e.status} onChange={(v) => set({ status: v })} options={STATUS.map((s) => ({ value: s.value, label: s.label }))} /></div>
        {e.status === 'in_use' && (
          <Field label="On hive">
            <select className="input" value={e.hive_id || ''} onChange={(ev) => set({ hive_id: ev.target.value || null })}>
              <option value="">Not linked</option>
              {live.map((h) => <option key={h.id} value={h.id}>{h.name} · {apiaries.find((a) => a.id === h.apiary_id)?.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Came from" hint="optional, e.g. a dead-out">
          <select className="input" value={e.source_hive_id || ''} onChange={(ev) => set({ source_hive_id: ev.target.value || null })}>
            <option value="">Not recorded</option>
            {hives.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Notes" hint="optional"><textarea className="input" value={e.notes || ''} onChange={(ev) => set({ notes: ev.target.value })} /></Field>
        <button className="btn" onClick={save}>Save</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (!window.confirm(`Delete ${e.name}?`)) return; await db.remove('equipment', id); go('/equipment', true); }}><LuTrash2 /> Delete</button>}
      </div>
    </>
  );
}

export function EquipmentDetail({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const item = await db.get<Equipment>('equipment', id);
    const hives = await db.all<Hive>('hives');
    return { item, hives, afb: await afbSource(item?.source_hive_id) };
  }, [id]);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(METHODS[0]);
  const [note, setNote] = useState('');
  const [release, setRelease] = useState(true);
  if (!data) return null;
  const { item, hives, afb } = data;
  if (!item) return (<><Topbar title="Equipment" backTo="/equipment" /><Empty title="Not found" text="It may have been deleted." /></>);
  const hiveName = (hid?: string | null) => hives.find((h) => h.id === hid)?.name;
  const logClean = async () => {
    const at = new Date().toISOString();
    const history = [{ at, method, note: note.trim() || undefined }, ...(item.history || [])].slice(0, 50);
    const status = item.status === 'quarantine' && release && !afb ? 'stored' : item.status;
    await db.save<Equipment>('equipment', { ...item, last_cleaned_at: at, clean_method: method, history, status });
    setOpen(false); setNote('');
    toast(status !== item.status ? 'Cleaned and back in the store' : 'Cleaning logged');
  };
  return (
    <>
      <Topbar title={item.name} backTo="/equipment" right={<a className="icon-btn" href={`#/equipment/${id}/edit`} aria-label="Edit"><LuPencil /></a>} />
      {afb && <div className="banner bad" style={{ marginBottom: 12 }}><LuTriangleAlert /><div><b>Possible foulbrood</b><p>{AFB_TEXT}</p></div></div>}
      {!afb && item.status === 'quarantine' && <div className="banner warn" style={{ marginBottom: 12 }}><LuTriangleAlert /><div><b>In quarantine</b><p>Clean it before it goes on another colony, then log the cleaning here.</p></div></div>}
      <div className="card">
        <dl className="kv">
          <dt>What</dt><dd>{countLabel(item.qty, item.kind)}</dd>
          <dt>Where</dt><dd>{STATUS.find((s) => s.value === item.status)?.label}{item.status === 'in_use' && hiveName(item.hive_id) ? `: ${hiveName(item.hive_id)}` : ''}</dd>
          {item.source_hive_id && (<><dt>Came from</dt><dd>{hiveName(item.source_hive_id) || 'A hive no longer listed'}</dd></>)}
          <dt>Last cleaned</dt><dd>{item.last_cleaned_at ? `${fmtDate(item.last_cleaned_at)}${item.clean_method ? `, ${item.clean_method.toLowerCase()}` : ''}` : 'Not yet'}</dd>
          {item.notes && (<><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{item.notes}</dd></>)}
        </dl>
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => setOpen(true)}><LuSparkles /> Log cleaning</button>
      {(item.history || []).length > 0 && (
        <>
          <h3 className="h2">Cleaning history</h3>
          <div className="list">
            {(item.history || []).map((h, i) => <div key={i} className="list-item"><div className="grow"><div className="title">{h.method}</div><div className="sub">{fmtDate(h.at)}{h.note ? ` · ${h.note}` : ''}</div></div></div>)}
          </div>
        </>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Log cleaning">
        <div className="stack">
          <Pills label="How" single options={METHODS.map((m) => ({ value: m, label: m }))} value={[method]} onChange={(v) => setMethod(v[0] || METHODS[0])} />
          <Field label="Note" hint="optional"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Old comb melted down" /></Field>
          {item.status === 'quarantine' && !afb && <label className="row small"><input type="checkbox" checked={release} onChange={(ev) => setRelease(ev.target.checked)} /> Move it back to the store</label>}
          {afb && <p className="small tone-bad" style={{ margin: 0 }}>It stays in quarantine: possible foulbrood needs official advice first.</p>}
          <button className="btn" onClick={logClean}>Save</button>
        </div>
      </Sheet>
    </>
  );
}
