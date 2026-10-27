// Release 1.3: bee-removal job book with invoices. Client details are private to the owner.
import { useEffect, useState } from 'react';
import { LuPlus, LuBriefcase, LuPrinter, LuPencil, LuTrash2, LuPhone, LuTriangleAlert } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Job, JobOutcome, Photo, Profile } from '../db';
import { fmtDate, shortCode } from '../lib';
import { InvoiceDoc, getProfile, nextInvoiceNo, printDoc, zar } from '../docs';
import { Empty, Field, ListLink, Pills, Sheet, Topbar, back, go, toast } from '../ui';
import { PhotoAdder, PhotoGrid } from './Photos';

export const OUTCOMES: { value: JobOutcome; label: string }[] = [
  { value: 'removed_live', label: 'Removed alive' },
  { value: 'relocated', label: 'Relocated to my apiary' },
  { value: 'not_bees', label: 'Not honeybees' },
  { value: 'no_access', label: 'Could not reach' },
  { value: 'referred', label: 'Referred on' },
  { value: 'other', label: 'Other' },
];
const outcomeLabel = (o?: JobOutcome | null) => OUTCOMES.find((x) => x.value === o)?.label || 'Open';

export function JobList() {
  const jobs = db.useLive(() => db.all<Job>('jobs'));
  if (!jobs) return null;
  const open = jobs.filter((j) => !j.done_at).sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const done = jobs.filter((j) => j.done_at).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const unpaid = done.filter((j) => !j.paid && (j.fee ?? 0) > 0).reduce((s, j) => s + (j.fee || 0), 0);
  return (
    <>
      <Topbar title="Bee-removal jobs" backTo="/business" right={<a className="icon-btn" href="#/job/new" aria-label="Add job"><LuPlus /></a>} />
      {jobs.length === 0 ? (
        <Empty title="No callouts yet" text="Log swarm and colony removal callouts: client, area, photos, outcome and fee, with an invoice when you're done." action={<a className="btn" href="#/job/new"><LuPlus /> Add a callout</a>} />
      ) : (
        <>
          <div className="grid-2">
            <div className="card stat"><div className="big-num">{open.length}</div><div className="label">Open callouts</div></div>
            <div className="card stat"><div className="big-num" style={{ fontSize: 24 }}>{zar(unpaid)}</div><div className="label">Done, not paid</div></div>
          </div>
          <h3 className="h2">Open</h3>
          {open.length ? <div className="list">{open.map((j) => <ListLink key={j.id} href={`/job/${j.id}`} left={<LuBriefcase />} title={j.client_name} sub={`${fmtDate(j.requested_at)}${j.area ? ` · ${j.area}` : ''}`} />)}</div> : <p className="muted">No open callouts.</p>}
          {done.length > 0 && (<><h3 className="h2">Done</h3><div className="list">{done.map((j) => <ListLink key={j.id} href={`/job/${j.id}`} left={<LuBriefcase />} title={j.client_name} sub={`${outcomeLabel(j.outcome)} · ${fmtDate(j.done_at || '')}${j.fee ? ` · ${zar(j.fee)}${j.paid ? ' paid' : ''}` : ''}`} />)}</div></>)}
        </>
      )}
      <p className="small muted">Client names and numbers stay private to you. Only keep what you need, and tell clients you are recording their details for the job.</p>
    </>
  );
}

export function JobForm({ id }: { id?: string }) {
  const [j, setJ] = useState<Partial<Job> | null>(id ? null : { requested_at: new Date().toISOString(), paid: false });
  useEffect(() => { if (id) db.get<Job>('jobs', id).then((r) => setJ(r || {})); }, [id]);
  if (!j) return null;
  const set = (p: Partial<Job>) => setJ({ ...j, ...p });
  const save = async () => {
    if (!j.client_name?.trim()) return toast('Add the client name');
    const rec = await db.save<Job>('jobs', { ...(j as Job), id: j.id || db.uuid(), client_name: j.client_name.trim() });
    toast('Callout saved');
    id ? back(`/job/${rec.id}`) : go(`/job/${rec.id}`, true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit callout' : 'New callout'} backTo="/jobs" />
      <div className="stack">
        <Field label="Client"><input className="input" value={j.client_name || ''} onChange={(e) => set({ client_name: e.target.value })} autoFocus={!id} /></Field>
        <Field label="Phone" hint="optional"><input className="input" type="tel" value={j.client_phone || ''} onChange={(e) => set({ client_phone: e.target.value })} /></Field>
        <Field label="Area or address" hint="private"><input className="input" value={j.area || ''} onChange={(e) => set({ area: e.target.value })} placeholder="e.g. Garsfontein, in the garage roof" /></Field>
        <Field label="Requested"><input className="input" type="date" value={j.requested_at.slice(0, 10)} onChange={(e) => set({ requested_at: new Date(e.target.value).toISOString() })} /></Field>
        <Field label="Fee (R)" hint="optional"><input className="input" inputMode="decimal" value={j.fee ?? ''} onChange={(e) => set({ fee: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} /></Field>
        <Field label="Notes" hint="optional"><textarea className="input" value={j.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Height, access, how long the bees have been there" /></Field>
        <button className="btn" onClick={save}>Save callout</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (!window.confirm('Delete this callout?')) return; await db.remove('jobs', id); go('/jobs', true); }}><LuTrash2 /> Delete callout</button>}
      </div>
    </>
  );
}

export function JobDetail({ id }: { id: string }) {
  const data = db.useLive(async () => ({ j: await db.get<Job>('jobs', id), photos: (await db.all<Photo>('photos')).filter((p) => p.job_id === id), apiaries: await db.all<Apiary>('apiaries') }), [id]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [outcome, setOutcome] = useState<JobOutcome>('removed_live');
  const [apiaryId, setApiaryId] = useState('');
  if (!data) return null;
  const j = data.j;
  if (!j) return (<><Topbar title="Callout" backTo="/jobs" /><Empty title="Callout not found" text="It may have been deleted." /></>);
  const close = async () => {
    let hive_id: string | null = null;
    if (outcome === 'relocated') {
      const target = apiaryId || data.apiaries[0]?.id;
      if (!target) return toast('Add an apiary first');
      const hive = await db.save<Hive>('hives', { id: db.uuid(), apiary_id: target, name: `Removal ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`, code: shortCode(), status: 'active', hive_type: 'Langstroth', notes: `Removed from ${j.area || 'a callout'} for ${j.client_name}.` });
      hive_id = hive.id;
    }
    await db.save<Job>('jobs', { ...j, outcome, done_at: new Date().toISOString(), hive_id });
    setCloseOpen(false);
    toast(outcome === 'relocated' ? 'Done: the colony is now a hive in your apiary' : 'Callout closed');
  };
  return (
    <>
      <Topbar title={j.client_name} backTo="/jobs" right={<a className="icon-btn" href={`#/job/${id}/edit`} aria-label="Edit callout"><LuPencil /></a>} />
      <div className="card">
        <dl className="kv">
          <dt>Requested</dt><dd>{fmtDate(j.requested_at)}</dd>
          {j.area && (<><dt>Where</dt><dd>{j.area}</dd></>)}
          {j.client_phone && (<><dt>Phone</dt><dd><a href={`tel:${j.client_phone.replace(/\s/g, '')}`}><LuPhone style={{ verticalAlign: -2 }} /> {j.client_phone}</a></dd></>)}
          <dt>Outcome</dt><dd>{outcomeLabel(j.outcome)}{j.done_at ? `, ${fmtDate(j.done_at)}` : ''}</dd>
          <dt>Fee</dt><dd>{zar(j.fee)}{j.fee ? (j.paid ? ' · paid' : ' · not paid') : ''}</dd>
          {j.invoice_no && (<><dt>Invoice</dt><dd>{j.invoice_no}</dd></>)}
          {j.notes && (<><dt>Notes</dt><dd>{j.notes}</dd></>)}
        </dl>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {!j.done_at && <button className="btn" onClick={() => setCloseOpen(true)}>Job done</button>}
        {j.done_at && (j.fee ?? 0) > 0 && <a className="btn secondary" href={`#/job/${id}/invoice`}><LuPrinter /> {j.invoice_no ? 'View invoice' : 'Make the invoice'}</a>}
        {j.done_at && (j.fee ?? 0) > 0 && !j.paid && <button className="btn ghost" onClick={async () => { await db.save<Job>('jobs', { ...j, paid: true }); toast('Marked paid'); }}>Mark as paid</button>}
        {j.hive_id && <a className="btn ghost" href={`#/hive/${j.hive_id}`}>Open the new hive</a>}
      </div>
      <h3 className="h2">Photos</h3>
      <PhotoAdder jobId={id} tags={['Before', 'After', 'Site']} />
      <div style={{ marginTop: 10 }}><PhotoGrid photos={data.photos} /></div>
      <Sheet open={closeOpen} onClose={() => setCloseOpen(false)} title="How did it go?">
        <div className="stack">
          <Pills label="Outcome" single options={OUTCOMES} value={[outcome]} onChange={(v) => setOutcome((v[0] as JobOutcome) || 'removed_live')} />
          {outcome === 'relocated' && (
            <Field label="Into apiary">
              <select className="input" value={apiaryId || data.apiaries[0]?.id || ''} onChange={(e) => setApiaryId(e.target.value)}>
                {data.apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
          <button className="btn" onClick={close}>Close the callout</button>
        </div>
      </Sheet>
    </>
  );
}

export function JobInvoice({ id }: { id: string }) {
  const [state, setState] = useState<{ j?: Job; profile?: Profile } | null>(null);
  useEffect(() => {
    (async () => {
      let j = await db.get<Job>('jobs', id);
      if (j && !j.invoice_no) j = await db.save<Job>('jobs', { ...j, invoice_no: await nextInvoiceNo() });
      setState({ j, profile: await getProfile() });
    })();
  }, [id]);
  if (!state) return null;
  const { j, profile } = state;
  if (!j) return (<><Topbar title="Invoice" backTo="/jobs" /><Empty title="Callout not found" text="It may have been deleted." /></>);
  return (
    <>
      <div className="no-print">
        <Topbar title={`Invoice ${j.invoice_no}`} backTo={`/job/${id}`} />
        {!profile?.invoice_details && <div className="banner info" style={{ marginBottom: 12 }}><LuTriangleAlert /><div><b>Add your invoice details</b><p>Trading name, address, phone and payment details: More › Profile › Invoice details.</p></div></div>}
        <button className="btn" onClick={printDoc} style={{ marginBottom: 12 }}><LuPrinter /> Print or save as PDF</button>
      </div>
      <InvoiceDoc number={j.invoice_no!} date={j.done_at || new Date().toISOString()} profile={profile}
        to={{ name: j.client_name, extra: [j.area, j.client_phone].filter(Boolean).join('\n') }}
        lines={[{ description: `Bee removal${j.area ? `, ${j.area}` : ''}: ${outcomeLabel(j.outcome).toLowerCase()}`, qty: 1, unit: j.fee || 0 }]} />
    </>
  );
}
