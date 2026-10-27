// Release 1.4: landowner log. Who allows your bees on their land, until when, on what terms,
// and what happened there (complaints, visits, honey given). Private to you, even in a shared apiary.
import { useEffect, useState } from 'react';
import { LuHouse, LuPlus, LuPencil, LuTrash2, LuPhone, LuMail, LuTriangleAlert, LuCheck, LuRefreshCw, LuMessageCircle } from 'react-icons/lu';
import * as db from '../db';
import type { Agreement, AgreementKind, Apiary, SiteEvent, SiteEventKind } from '../db';
import { fmtDate } from '../lib';
import { myId } from '../share';
import { Empty, Field, ListLink, Pills, Seg, Sheet, Topbar, back, go, toast } from '../ui';

export const AGREEMENT_KINDS: { value: AgreementKind; label: string }[] = [
  { value: 'verbal', label: 'Verbal' },
  { value: 'written', label: 'Written' },
  { value: 'lease', label: 'Lease or rent' },
  { value: 'pollination', label: 'Pollination placement' },
  { value: 'other', label: 'Other' },
];
export const EVENT_KINDS: { value: SiteEventKind; label: string }[] = [
  { value: 'complaint', label: 'Complaint' },
  { value: 'visit', label: 'Visit or call' },
  { value: 'payment', label: 'Paid or gave honey' },
  { value: 'renewal', label: 'Renewed' },
  { value: 'note', label: 'Note' },
];
const kindLabel = (v?: string) => AGREEMENT_KINDS.find((k) => k.value === v)?.label || 'Agreement';
const eventLabel = (v?: string) => EVENT_KINDS.find((k) => k.value === v)?.label || 'Note';

const today = () => new Date().toISOString().slice(0, 10);
function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
/** Whole days from today to the end date; negative once it has passed. */
export function daysLeft(a: Agreement, now = new Date()) {
  if (!a.expires_on) return null;
  const end = new Date(`${a.expires_on}T23:59:59`);
  return Math.ceil((end.getTime() - now.getTime()) / 86400000) - 1;
}
export type AgreementState = 'ended' | 'expired' | 'due' | 'ok' | 'open';
export function agreementState(a: Agreement, now = new Date()): AgreementState {
  if (a.status === 'ended') return 'ended';
  const d = daysLeft(a, now);
  if (d == null) return 'open';
  if (d < 0) return 'expired';
  return d <= (a.remind_days ?? 30) ? 'due' : 'ok';
}
export function expiryText(a: Agreement) {
  const d = daysLeft(a);
  if (a.status === 'ended') return 'Ended';
  if (d == null) return 'No end date';
  if (d < 0) return `Expired ${fmtDate(a.expires_on!)}`;
  if (d === 0) return 'Expires today';
  return `Expires ${fmtDate(a.expires_on!)} · in ${d} day${d === 1 ? '' : 's'}`;
}

/** Agreements that need action now: expired, or inside their reminder window. */
export async function agreementsDue() {
  return (await db.all<Agreement>('agreements')).filter((a) => ['expired', 'due'].includes(agreementState(a)));
}

/**
 * Older versions kept the landowner on the apiary row, which partners and helpers can see.
 * Move those details into the private log, once.
 */
export async function migrateLandowners() {
  if (await db.getMeta('migrated:landowners')) return;
  const me = myId();
  const [apiaries, agreements] = await Promise.all([db.all<Apiary>('apiaries'), db.all<Agreement>('agreements')]);
  for (const a of apiaries) {
    if (a.owner_id && me && a.owner_id !== me) continue;
    if (!a.landowner && !a.permission_notes) continue;
    if (!agreements.some((x) => x.apiary_id === a.id)) {
      await db.save<Agreement>('agreements', {
        id: db.uuid(), apiary_id: a.id, landowner: a.landowner || 'Landowner', kind: 'verbal', remind_days: 30, status: 'active',
        notes: a.permission_notes || undefined,
      });
    }
    await db.save<Apiary>('apiaries', { ...a, landowner: undefined, permission_notes: undefined });
  }
  await db.setMeta('migrated:landowners', true);
}

const toneOf: Record<AgreementState, string> = { expired: 'tone-bad', due: 'tone-warn', ok: '', open: '', ended: 'muted' };

export function LandownerList() {
  const data = db.useLive(async () => ({ agreements: await db.all<Agreement>('agreements'), apiaries: await db.all<Apiary>('apiaries'), events: await db.all<SiteEvent>('site_events') }));
  if (!data) return <Topbar title="Landowners" backTo="/more" />;
  const name = (id?: string | null) => data.apiaries.find((a) => a.id === id)?.name;
  const open = (a: Agreement) => data.events.filter((e) => e.agreement_id === a.id && e.kind === 'complaint' && !e.resolved).length;
  const order: AgreementState[] = ['expired', 'due', 'ok', 'open', 'ended'];
  const sorted = [...data.agreements].sort((a, b) => order.indexOf(agreementState(a)) - order.indexOf(agreementState(b)) || (a.expires_on || '9').localeCompare(b.expires_on || '9'));
  const attention = sorted.filter((a) => ['expired', 'due'].includes(agreementState(a)) || open(a));
  const rest = sorted.filter((a) => !attention.includes(a));
  const row = (a: Agreement) => (
    <ListLink key={a.id} href={`/agreement/${a.id}`} left={<LuHouse />} title={a.landowner}
      sub={<>{name(a.apiary_id) ? `${name(a.apiary_id)} · ` : ''}<span className={toneOf[agreementState(a)]}>{expiryText(a)}</span>{open(a) ? <span className="tone-warn"> · {open(a)} open complaint{open(a) > 1 ? 's' : ''}</span> : ''}</>} />
  );
  return (
    <>
      <Topbar title="Landowners" backTo="/more" right={<a className="icon-btn" href="#/agreement/new" aria-label="Add a landowner"><LuPlus /></a>} />
      <p className="muted" style={{ marginTop: 0 }}>Who lets your bees stand on their land, until when, and what you agreed. Private to you, even in a shared apiary.</p>
      {data.agreements.length === 0 ? (
        <Empty title="No landowners yet" text="Add the farmer or neighbour for each site, with their number and when the permission runs out. Honeyguide reminds you before it does."
          action={<a className="btn" href="#/agreement/new"><LuPlus /> Add a landowner</a>} />
      ) : (
        <>
          {attention.length > 0 && (<><h3 className="h2">Needs attention</h3><div className="list">{attention.map(row)}</div></>)}
          {rest.length > 0 && (<><h3 className="h2">{attention.length ? 'Others' : 'All sites'}</h3><div className="list">{rest.map(row)}</div></>)}
        </>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>Keep only what you need, and tell the landowner you keep their contact details here.</p>
    </>
  );
}

export function AgreementForm({ id, apiaryId }: { id?: string; apiaryId?: string }) {
  const me = myId();
  const apiaries = db.useLive(async () => (await db.all<Apiary>('apiaries')).filter((a) => !a.owner_id || !me || a.owner_id === me));
  const [a, setA] = useState<Partial<Agreement> | null>(id ? null : { kind: 'verbal', remind_days: 30, status: 'active', apiary_id: apiaryId || null, starts_on: today() });
  useEffect(() => { if (id) db.get<Agreement>('agreements', id).then((r) => setA(r || {})); }, [id]);
  if (!a || !apiaries) return null;
  const set = (p: Partial<Agreement>) => setA({ ...a, ...p });
  const save = async () => {
    if (!a.landowner?.trim()) return toast('Add the landowner\'s name');
    if (a.starts_on && a.expires_on && a.expires_on < a.starts_on) return toast('The end date is before the start date');
    const rec = await db.save<Agreement>('agreements', { ...(a as Agreement), id: a.id || db.uuid(), landowner: a.landowner.trim() });
    toast('Saved');
    id ? back(`/agreement/${rec.id}`) : go(`/agreement/${rec.id}`, true);
  };
  const del = async () => {
    if (!window.confirm(`Delete the agreement with ${a.landowner} and its log?`)) return;
    for (const e of (await db.all<SiteEvent>('site_events')).filter((x) => x.agreement_id === id)) await db.remove('site_events', e.id);
    await db.remove('agreements', id!);
    toast('Deleted');
    go('/landowners', true);
  };
  return (
    <>
      <Topbar title={id ? 'Edit landowner' : 'New landowner'} backTo="/landowners" />
      <div className="stack">
        <Field label="Landowner"><input className="input" value={a.landowner || ''} onChange={(e) => set({ landowner: e.target.value })} placeholder="e.g. Oom Piet van Wyk, Mrs Dlamini" autoFocus={!id} /></Field>
        <Field label="Apiary" hint="the site on their land">
          <select className="input" value={a.apiary_id || ''} onChange={(e) => set({ apiary_id: e.target.value || null })}>
            <option value="">Not linked</option>
            {apiaries.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Phone" hint="optional"><input className="input" type="tel" inputMode="tel" value={a.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Email" hint="optional"><input className="input" type="email" inputMode="email" value={a.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
        </div>
        <div className="field"><span>Kind of permission</span><Pills label="Kind" single options={AGREEMENT_KINDS} value={a.kind ? [a.kind] : []} onChange={(v) => set({ kind: (v[0] as AgreementKind) || 'verbal' })} /></div>
        <div className="grid-2">
          <Field label="From"><input className="input" type="date" value={a.starts_on || ''} onChange={(e) => set({ starts_on: e.target.value || null })} /></Field>
          <Field label="Until" hint="optional"><input className="input" type="date" value={a.expires_on || ''} onChange={(e) => set({ expires_on: e.target.value || null })} /></Field>
        </div>
        {!a.expires_on && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small ghost" onClick={() => set({ expires_on: addMonths(a.starts_on || today(), 12) })}>1 year</button>
            <button className="btn small ghost" onClick={() => set({ expires_on: addMonths(a.starts_on || today(), 6) })}>6 months</button>
            <button className="btn small ghost" onClick={() => set({ expires_on: addMonths(a.starts_on || today(), 3) })}>3 months</button>
          </div>
        )}
        {a.expires_on && (
          <div className="field"><span>Remind me</span>
            <Seg label="Reminder" value={String(a.remind_days ?? 30)} onChange={(v) => set({ remind_days: Number(v) })}
              options={[{ value: '14', label: '2 weeks before' }, { value: '30', label: '1 month' }, { value: '60', label: '2 months' }]} />
          </div>
        )}
        <Field label="What you agreed" hint="optional"><textarea className="input" value={a.terms || ''} onChange={(e) => set({ terms: e.target.value })} placeholder="e.g. 6 jars of honey a year; hives behind the shed, away from the stables; call before coming" /></Field>
        <Field label="Notes" hint="optional"><textarea className="input" value={a.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <button className="btn" onClick={save}>Save</button>
        {id && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={del}><LuTrash2 /> Delete</button>}
      </div>
    </>
  );
}

function EventSheet({ agreement, open, onClose }: { agreement: Agreement; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<SiteEventKind>('complaint');
  const [person, setPerson] = useState('');
  const [body, setBody] = useState('');
  const save = async () => {
    if (!body.trim() && kind !== 'visit') return toast('Say what happened');
    await db.save<SiteEvent>('site_events', { id: db.uuid(), agreement_id: agreement.id, apiary_id: agreement.apiary_id || null, happened_at: new Date().toISOString(), kind, person: person.trim() || undefined, body: body.trim() || undefined, resolved: false });
    setBody(''); setPerson('');
    onClose();
    toast('Logged');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log what happened">
      <div className="stack">
        <Pills label="What" single options={EVENT_KINDS.filter((k) => k.value !== 'renewal')} value={[kind]} onChange={(v) => setKind((v[0] as SiteEventKind) || 'note')} />
        <Field label="Who" hint="optional"><input className="input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder={kind === 'complaint' ? 'e.g. Neighbour at no. 12' : agreement.landowner} /></Field>
        <Field label={kind === 'complaint' ? 'The complaint' : 'Details'}><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'complaint' ? 'e.g. Bees at the swimming pool in the afternoons' : kind === 'payment' ? 'e.g. 6 jars of honey for the year' : ''} /></Field>
        {kind === 'complaint' && <p className="small muted" style={{ margin: 0 }}>Bees at a pool or birdbath usually want water. A water point near the hives often solves it.</p>}
        <button className="btn" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

export function AgreementDetail({ id }: { id: string }) {
  const data = db.useLive(async () => {
    const a = await db.get<Agreement>('agreements', id);
    const apiary = a?.apiary_id ? await db.get<Apiary>('apiaries', a.apiary_id) : undefined;
    const events = (await db.byIndex<SiteEvent>('site_events', 'agreement_id', id)).sort((x, y) => y.happened_at.localeCompare(x.happened_at));
    return { a, apiary, events };
  }, [id]);
  const [logOpen, setLogOpen] = useState(false);
  if (!data) return null;
  const { a, apiary, events } = data;
  if (!a) return (<><Topbar title="Landowner" backTo="/landowners" /><Empty title="Not found" text="It may have been deleted." /></>);
  const st = agreementState(a);
  const renew = async () => {
    const from = a.expires_on && a.expires_on > today() ? a.expires_on : today();
    const until = addMonths(from, 12);
    await db.save<Agreement>('agreements', { ...a, expires_on: until, status: 'active' });
    await db.save<SiteEvent>('site_events', { id: db.uuid(), agreement_id: a.id, apiary_id: a.apiary_id || null, happened_at: new Date().toISOString(), kind: 'renewal', body: `Renewed until ${fmtDate(until)}`, resolved: true });
    toast(`Renewed until ${fmtDate(until)}`);
  };
  const phone = a.phone?.replace(/[^\d+]/g, '');
  const wa = phone ? phone.replace(/^0/, '27').replace(/^\+/, '') : '';
  return (
    <>
      <Topbar title={a.landowner} backTo="/landowners" right={<a className="icon-btn" href={`#/agreement/${id}/edit`} aria-label="Edit"><LuPencil /></a>} />
      {st === 'expired' && <div className="banner bad"><LuTriangleAlert /><div><b>Permission has run out</b><p>Talk to {a.landowner} about renewing, then tap Renew.</p></div></div>}
      {st === 'due' && <div className="banner warn"><LuTriangleAlert /><div><b>Permission runs out soon</b><p>{expiryText(a)}. A good time to drop off a jar and ask about next year.</p></div></div>}
      <div className="card" style={{ marginTop: st === 'expired' || st === 'due' ? 12 : 0 }}>
        <dl className="kv">
          {apiary && (<><dt>Apiary</dt><dd><a href={`#/apiary/${apiary.id}`}>{apiary.name}</a></dd></>)}
          <dt>Permission</dt><dd>{kindLabel(a.kind)}</dd>
          <dt>From</dt><dd>{a.starts_on ? fmtDate(a.starts_on) : '–'}</dd>
          <dt>Until</dt><dd className={toneOf[st]}>{expiryText(a)}</dd>
          {a.terms && (<><dt>Agreed</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.terms}</dd></>)}
          {a.notes && (<><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</dd></>)}
        </dl>
      </div>
      {(phone || a.email) && (
        <div className="grid-2" style={{ marginTop: 12 }}>
          {phone && <a className="btn secondary" href={`tel:${phone}`}><LuPhone /> Call</a>}
          {phone && <a className="btn secondary" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><LuMessageCircle /> WhatsApp</a>}
          {a.email && <a className="btn secondary" href={`mailto:${a.email}`}><LuMail /> Email</a>}
        </div>
      )}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setLogOpen(true)}><LuPlus /> Log</button>
        {a.status === 'active' ? <button className="btn secondary" onClick={renew}><LuRefreshCw /> Renew 1 year</button>
          : <button className="btn secondary" onClick={() => db.save<Agreement>('agreements', { ...a, status: 'active' })}>Make active again</button>}
      </div>

      <h3 className="h2">Site log</h3>
      {events.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>Complaints, visits and honey given will show here.</p> : (
        <div className="stack">
          {events.map((e) => (
            <div key={e.id} className="card">
              <div className="row between small"><b className={e.kind === 'complaint' && !e.resolved ? 'tone-warn' : ''}>{eventLabel(e.kind)}{e.person ? ` · ${e.person}` : ''}</b><span className="muted">{fmtDate(e.happened_at)}</span></div>
              {e.body && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{e.body}</p>}
              {e.kind === 'complaint' && (
                <button className="link-btn small" onClick={() => db.save<SiteEvent>('site_events', { ...e, resolved: !e.resolved })}>
                  {e.resolved ? <><LuCheck /> Sorted out · undo</> : 'Mark as sorted out'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {a.status === 'active' && <button className="btn ghost" style={{ marginTop: 18 }} onClick={async () => { if (window.confirm('Mark this agreement as ended? Keep it for your records.')) { await db.save<Agreement>('agreements', { ...a, status: 'ended' }); toast('Marked as ended'); } }}>End agreement</button>}
      <EventSheet agreement={a} open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}

/** Landowner card on the apiary page. Only the owner sees it. */
export function ApiaryLandowner({ apiary }: { apiary: Apiary }) {
  const list = db.useLive(async () => (await db.all<Agreement>('agreements')).filter((a) => a.apiary_id === apiary.id), [apiary.id]);
  if (!list) return null;
  const current = list.find((a) => a.status === 'active') || list[0];
  return (
    <>
      <h3 className="h2">Landowner</h3>
      {current ? (
        <a className="card row" href={`#/agreement/${current.id}`} style={{ textDecoration: 'none' }}>
          <LuHouse style={{ width: 24, height: 24, flex: 'none' }} />
          <div className="grow"><b>{current.landowner}</b><div className={`small ${toneOf[agreementState(current)] || 'muted'}`}>{kindLabel(current.kind)} · {expiryText(current)}</div></div>
        </a>
      ) : (
        <a className="btn secondary" href={`#/agreement/new?apiary=${apiary.id}`}><LuPlus /> Add the landowner and permission</a>
      )}
    </>
  );
}
