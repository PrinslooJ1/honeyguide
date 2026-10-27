// Release 1.2: pollination contracts with spray agreement and invoice. Private to the owner.
import { useEffect, useState } from 'react';
import { LuPlus, LuHandshake, LuPrinter, LuTriangleAlert, LuPencil, LuTrash2 } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Contract, ContractStatus, Profile } from '../db';
import { fmtDate } from '../lib';
import { InvoiceDoc, getProfile, nextInvoiceNo, printDoc, zar } from '../docs';
import { Empty, Field, ListLink, Seg, Stepper, Topbar, back, go, toast } from '../ui';
import { lockedGuard } from './Vault';

export const CONTRACT_STEPS: { value: ContractStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'agreed', label: 'Agreed' },
  { value: 'placed', label: 'Hives placed' },
  { value: 'completed', label: 'Completed' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
];
const stepLabel = (s: ContractStatus) => CONTRACT_STEPS.find((x) => x.value === s)?.label || s;
export const contractTotal = (c: Contract) => (c.hives || 0) * (c.fee_per_hive || 0);

export function ContractList() {
  const contracts = db.useLive(() => db.all<Contract>('contracts'));
  if (!contracts) return null;
  const open = contracts.filter((c) => c.status !== 'paid').sort((a, b) => (a.starts_on || '').localeCompare(b.starts_on || ''));
  const paid = contracts.filter((c) => c.status === 'paid');
  const owed = contracts.filter((c) => c.status === 'invoiced').reduce((s, c) => s + contractTotal(c), 0);
  return (
    <>
      <Topbar title="Pollination contracts" backTo="/business" right={<a className="icon-btn" href="#/contract/new" aria-label="Add contract"><LuPlus /></a>} />
      {contracts.length === 0 ? (
        <Empty title="No contracts yet" text="Record each pollination agreement: grower, crop, hives, fee per hive, dates and the spray agreement. Turn it into an invoice when the job is done." action={<a className="btn" href="#/contract/new"><LuPlus /> Add a contract</a>} />
      ) : (
        <>
          <div className="grid-2">
            <div className="card stat"><div className="big-num">{open.reduce((s, c) => s + (c.hives || 0), 0)}</div><div className="label">Hives on open contracts</div></div>
            <div className="card stat"><div className="big-num" style={{ fontSize: 24 }}>{zar(owed)}</div><div className="label">Invoiced, not yet paid</div></div>
          </div>
          <h3 className="h2">Open</h3>
          {open.length ? <div className="list">{open.map((c) => <ListLink key={c.id} href={`/contract/${c.id}`} left={<LuHandshake />} title={`${c.grower} · ${c.crop}`} sub={`${stepLabel(c.status)} · ${c.hives} hives · ${zar(contractTotal(c))}${c.starts_on ? ` · from ${fmtDate(c.starts_on)}` : ''}`} />)}</div> : <p className="muted">None open.</p>}
          {paid.length > 0 && (<><h3 className="h2">Paid</h3><div className="list">{paid.map((c) => <ListLink key={c.id} href={`/contract/${c.id}`} left={<LuHandshake />} title={`${c.grower} · ${c.crop}`} sub={`Paid ${fmtDate(c.paid_at || '')} · ${zar(contractTotal(c))}`} />)}</div></>)}
        </>
      )}
    </>
  );
}

export function ContractForm({ id }: { id?: string }) {
  const apiaries = db.useLive(() => db.all<Apiary>('apiaries'));
  const [c, setC] = useState<Partial<Contract> | null>(id ? null : { status: 'draft', hives: 10, fee_per_hive: 0, spray_agreed: false });
  useEffect(() => { if (id) db.get<Contract>('contracts', id).then((r) => setC(r || {})); }, [id]);
  if (!c || !apiaries) return null;
  const set = (p: Partial<Contract>) => setC({ ...c, ...p });
  const num = (v: string) => (v ? Number(v.replace(',', '.')) : 0);
  const save = async () => {
    if (lockedGuard(c)) return;
    if (!c.grower?.trim() || !c.crop?.trim()) return toast('Add the grower and the crop');
    const rec = await db.save<Contract>('contracts', { ...(c as Contract), id: c.id || db.uuid(), grower: c.grower.trim(), crop: c.crop.trim() });
    toast('Contract saved');
    id ? back(`/contract/${rec.id}`) : go(`/contract/${rec.id}`, true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit contract' : 'New contract'} backTo="/contracts" />
      <div className="stack">
        <Field label="Grower"><input className="input" value={c.grower || ''} onChange={(e) => set({ grower: e.target.value })} placeholder="e.g. Van Wyk Citrus" autoFocus={!id} /></Field>
        <Field label="Farm" hint="optional"><input className="input" value={c.farm || ''} onChange={(e) => set({ farm: e.target.value })} /></Field>
        <Field label="Contact" hint="name, phone or email; private"><input className="input" value={c.contact || ''} onChange={(e) => set({ contact: e.target.value })} /></Field>
        <Field label="Crop"><input className="input" value={c.crop || ''} onChange={(e) => set({ crop: e.target.value })} placeholder="e.g. Citrus, canola, macadamia" /></Field>
        <div className="grid-2 stack-narrow">
          <Field label="Hives"><Stepper label="hives" min={0} max={2000} value={c.hives || 0} onChange={(v) => set({ hives: v })} /></Field>
          <Field label="Fee per hive (R)"><input className="input" inputMode="decimal" value={c.fee_per_hive || ''} onChange={(e) => set({ fee_per_hive: num(e.target.value) })} /></Field>
        </div>
        <div className="grid-2 stack-narrow">
          <Field label="Hives in"><input className="input" type="date" value={c.starts_on || ''} onChange={(e) => set({ starts_on: e.target.value || null })} /></Field>
          <Field label="Hives out"><input className="input" type="date" value={c.ends_on || ''} onChange={(e) => set({ ends_on: e.target.value || null })} /></Field>
        </div>
        <Field label="Placed at apiary" hint="optional">
          <select className="input" value={c.apiary_id || ''} onChange={(e) => set({ apiary_id: e.target.value || null })}>
            <option value="">Not set</option>
            {apiaries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <div className="field"><span>Spray agreement</span>
          <Seg label="Spray agreement" value={c.spray_agreed ? 'yes' : 'no'} onChange={(v) => set({ spray_agreed: v === 'yes' })} options={[{ value: 'no', label: 'Not yet' }, { value: 'yes', label: 'Agreed' }]} />
          <textarea className="input" value={c.spray_notes || ''} onChange={(e) => set({ spray_notes: e.target.value })} placeholder="What, when and how the grower will warn you; spraying only when bees aren't flying" />
        </div>
        <Field label="Notes" hint="optional"><textarea className="input" value={c.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <p className="small muted" style={{ margin: 0 }}>Total: <b>{zar(contractTotal(c as Contract))}</b></p>
        <button className="btn" onClick={save}>Save contract</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (!window.confirm('Delete this contract?')) return; await db.remove('contracts', id); go('/contracts', true); }}><LuTrash2 /> Delete contract</button>}
      </div>
    </>
  );
}

export function ContractDetail({ id }: { id: string }) {
  const data = db.useLive(async () => ({ c: await db.get<Contract>('contracts', id), apiaries: await db.all<Apiary>('apiaries') }), [id]);
  if (!data) return null;
  const c = data.c;
  if (!c) return (<><Topbar title="Contract" backTo="/contracts" /><Empty title="Contract not found" text="It may have been deleted." /></>);
  const idx = CONTRACT_STEPS.findIndex((s) => s.value === c.status);
  const next = CONTRACT_STEPS[idx + 1];
  const advance = async () => {
    if (!next) return;
    if (next.value === 'placed' && !c.spray_agreed && !window.confirm('There is no spray agreement yet. Place the hives anyway?')) return;
    if (next.value === 'invoiced') return go(`/contract/${id}/invoice`);
    await db.save<Contract>('contracts', { ...c, status: next.value, paid_at: next.value === 'paid' ? new Date().toISOString() : c.paid_at });
    toast(`Marked ${next.label.toLowerCase()}`);
  };
  return (
    <>
      <Topbar title={c.grower} backTo="/contracts" right={<a className="icon-btn" href={`#/contract/${id}/edit`} aria-label="Edit contract"><LuPencil /></a>} />
      <div className="steps">{CONTRACT_STEPS.map((s, i) => <span key={s.value} className={i <= idx ? 'on' : ''}>{s.label}</span>)}</div>
      {!c.spray_agreed && c.status !== 'paid' && (
        <div className="banner warn" style={{ marginTop: 12 }}><LuTriangleAlert /><div><b>No spray agreement yet</b><p>Agree in writing what will be sprayed, when, and how the grower will warn you, before the hives go in.</p></div></div>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <dl className="kv">
          <dt>Crop</dt><dd>{c.crop}</dd>
          {c.farm && (<><dt>Farm</dt><dd>{c.farm}</dd></>)}
          {c.contact && (<><dt>Contact</dt><dd>{c.contact}</dd></>)}
          <dt>Hives</dt><dd>{c.hives} × {zar(c.fee_per_hive)} = <b>{zar(contractTotal(c))}</b></dd>
          <dt>Dates</dt><dd>{c.starts_on ? fmtDate(c.starts_on) : '?'} to {c.ends_on ? fmtDate(c.ends_on) : '?'}</dd>
          {c.apiary_id && (<><dt>Apiary</dt><dd>{data.apiaries.find((a) => a.id === c.apiary_id)?.name}</dd></>)}
          <dt>Spray</dt><dd>{c.spray_agreed ? 'Agreed' : 'Not agreed'}{c.spray_notes ? `: ${c.spray_notes}` : ''}</dd>
          {c.invoice_no && (<><dt>Invoice</dt><dd>{c.invoice_no}{c.invoiced_at ? `, ${fmtDate(c.invoiced_at)}` : ''}</dd></>)}
        </dl>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {next && <button className="btn" onClick={advance}>{next.value === 'invoiced' ? <><LuPrinter /> Make the invoice</> : `Mark as ${next.label.toLowerCase()}`}</button>}
        {c.invoice_no && <a className="btn secondary" href={`#/contract/${id}/invoice`}><LuPrinter /> View invoice</a>}
      </div>
    </>
  );
}

export function ContractInvoice({ id }: { id: string }) {
  const [state, setState] = useState<{ c?: Contract; profile?: Profile } | null>(null);
  useEffect(() => {
    (async () => {
      let c = await db.get<Contract>('contracts', id);
      if (c && !c.invoice_no) c = await db.save<Contract>('contracts', { ...c, invoice_no: await nextInvoiceNo(), invoiced_at: new Date().toISOString(), status: c.status === 'paid' ? 'paid' : 'invoiced' });
      setState({ c, profile: await getProfile() });
    })();
  }, [id]);
  if (!state) return null;
  const { c, profile } = state;
  if (!c) return (<><Topbar title="Invoice" backTo="/contracts" /><Empty title="Contract not found" text="It may have been deleted." /></>);
  const dates = [c.starts_on && fmtDate(c.starts_on), c.ends_on && fmtDate(c.ends_on)].filter(Boolean).join(' to ');
  return (
    <>
      <div className="no-print">
        <Topbar title={`Invoice ${c.invoice_no}`} backTo={`/contract/${id}`} />
        {!profile?.invoice_details && <div className="banner info" style={{ marginBottom: 12 }}><LuTriangleAlert /><div><b>Add your invoice details</b><p>Trading name, address, phone and payment details: More › Profile › Invoice details.</p></div></div>}
        <button className="btn" onClick={printDoc} style={{ marginBottom: 12 }}><LuPrinter /> Print or save as PDF</button>
      </div>
      <InvoiceDoc number={c.invoice_no!} date={c.invoiced_at || new Date().toISOString()} profile={profile}
        to={{ name: c.grower, extra: [c.farm, c.contact].filter(Boolean).join('\n') }}
        lines={[{ description: `Pollination service: ${c.crop}${dates ? `, ${dates}` : ''}`, qty: c.hives, unit: c.fee_per_hive }]}
        notes={c.spray_agreed && c.spray_notes ? <>Spray agreement: {c.spray_notes}</> : undefined} />
    </>
  );
}
