// Sharing screens: groups, invites, joining, mentor links and comments.
import { useEffect, useMemo, useState } from 'react';
import { LuUsers, LuPlus, LuCopy, LuShare2, LuMessageCircle, LuTrash2, LuLogOut, LuGraduationCap, LuRefreshCw, LuTriangleAlert, LuDownload, LuSend, LuUserCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, HiveComment } from '../db';
import { fmtDate, fmtDateTime } from '../lib';
import { qrSvg } from '../qr';
import {
  ROLE_INFO, access, activeMember, createGroup, createInvite, createMentorLink, deleteGroup, deleteInvite, hiveRole, joinGroup, joinUrl,
  leaveGroup, myDisplayName, myId, nameFor, parseJoinCode, recentActivity, removeMember, renameGroup, shareApiary, unshareApiary, updateMember,
  refusedRows, retryRefused, discardRefused, refreshShare,
  useShare, type Group, type Invite, type Member, type MemberRole, type ShareData, type Unsent,
} from '../share';
import { cloudConfigured, currentSession, syncNow } from '../sync';
import { Empty, Field, ListLink, Seg, Sheet, Topbar, go, toast, useOnline, useSync } from '../ui';
import { Account } from './More';

const until = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

function needsSignal(online: boolean) {
  if (!online) { toast('Sharing needs signal. Try again when you are online.'); return true; }
  return false;
}

async function run(fn: () => Promise<unknown>, done?: string) {
  try {
    await fn();
    if (done) toast(done);
    return true;
  } catch (e: any) {
    toast(String(e?.userMessage || e?.message || 'Something went wrong').slice(0, 140));
    return false;
  }
}

/** QR, code and buttons to send an invite on WhatsApp or anywhere else. */
export function InviteCard({ invite, intro }: { invite: Invite; intro?: string }) {
  const url = joinUrl(invite.code);
  const svg = useMemo(() => qrSvg(url, 'M', 2), [url]);
  const text = `${intro || 'Join me on Honeyguide'}: ${url}\nOr open Honeyguide › More › Sharing › Join and enter ${invite.code}.`;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Honeyguide invite', text }); } catch { /* closed */ }
    } else {
      await navigator.clipboard?.writeText(text);
      toast('Invite copied');
    }
  };
  return (
    <div className="card stack invite">
      <div className="invite-qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Join QR code" role="img" />
      <div className="invite-code" aria-label={`Code ${invite.code.split('').join(' ')}`}>{invite.code.slice(0, 3)} {invite.code.slice(3)}</div>
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
        {ROLE_INFO[invite.role].label}{invite.cover_days ? ` for ${invite.cover_days} days after joining` : ''} · {invite.max_uses === 1 ? 'one person' : `up to ${invite.max_uses} people`} · use by {until(invite.expires_at)}
      </p>
      <div className="grid-2">
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><LuMessageCircle /> WhatsApp</a>
        <button className="btn secondary" onClick={share}><LuShare2 /> Share</button>
      </div>
      <button className="btn ghost small" style={{ width: '100%' }} onClick={async () => { await navigator.clipboard?.writeText(url); toast('Link copied'); }}><LuCopy /> Copy link</button>
    </div>
  );
}

export function UnsentBanner() {
  const list = db.useLive(async () => [...(await refusedRows()), ...((await db.getMeta<Unsent[]>('unsent')) || [])]);
  if (!list?.length) return null;
  const refused = list.filter((u) => (u.row as { _refused?: string })._refused).length;
  const save = () => {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `honeyguide-not-sent-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  return (
    <div className="banner warn" style={{ marginBottom: 12 }}>
      <LuTriangleAlert />
      <div className="grow">
        <b>{list.length} change{list.length > 1 ? 's' : ''} could not be sent</b>
        <p>{list[list.length - 1].reason} The other records are fine. Save a copy if you need it.</p>
        <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small secondary" onClick={save}><LuDownload /> Save a copy</button>
          {refused > 0 && <button className="btn small secondary" onClick={async () => { await retryRefused(); syncNow(); }}><LuRefreshCw /> Try again</button>}
          <button className="btn small ghost" onClick={async () => {
            if (!window.confirm('Discard these changes on this phone? Save a copy first if you need them.')) return;
            await discardRefused(); syncNow();
          }}>Discard</button>
        </div>
      </div>
    </div>
  );
}

function SignInFirst({ what }: { what: string }) {
  if (!cloudConfigured) return <p className="muted">Sharing is not available in this build.</p>;
  return (
    <>
      <div className="banner info" style={{ marginBottom: 12 }}><LuUsers /><div><b>Sign in to {what}</b><p>Sharing works through your Honeyguide account. Your records stay on this phone too.</p></div></div>
      <Account />
    </>
  );
}

export function SharingHub() {
  const share = useShare();
  const online = useOnline();
  const sync = useSync();
  const session = currentSession();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const activity = db.useLive(async () => (share ? recentActivity(share) : []), [share?.at]);
  const hives = db.useLive(() => db.all<Hive>('hives'));
  // Members and roles change on other phones: reload them whenever this screen opens.
  useEffect(() => { if (session && online) syncNow({ fresh: true }); }, [session?.user.id]);

  if (!session) return (<><Topbar title="Sharing" backTo="/more" /><SignInFirst what="share apiaries" /></>);
  const me = myId();
  const mine = (share?.groups || []).filter((g) => g.owner_id === me);
  const memberOf = (share?.groups || []).filter((g) => g.owner_id !== me);
  const members = (g: Group) => (share?.members || []).filter((m) => m.group_id === g.id);

  const create = async () => {
    if (needsSignal(online)) return;
    const ok = await run(async () => {
      const g = await createGroup(name.trim() || 'My apiary group');
      setNewOpen(false); setName('');
      go(`/group/${g.id}`);
    });
    if (!ok) return;
  };

  return (
    <>
      <Topbar title="Sharing" backTo="/more" right={<button className="icon-btn" aria-label="Refresh" disabled={sync.running} onClick={() => syncNow({ fresh: true })}><LuRefreshCw className={sync.running ? 'spin' : ''} /></button>} />
      <p className="muted" style={{ marginTop: 0 }}>Share chosen apiaries with a partner, give a neighbour cover while you are away, or let a mentor see one hive. Exact locations stay hidden unless you allow them.</p>
      <UnsentBanner />
      {!share && <p className="small muted">{online ? 'Loading your groups…' : 'Connect to load your groups.'}</p>}

      <div className="row between"><h3 className="h2">Your groups</h3><button className="btn small secondary" onClick={() => setNewOpen(true)}><LuPlus /> New group</button></div>
      {mine.filter((g) => g.kind === 'apiaries').length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>No groups yet. A group is the apiaries you share and the people you share them with.</p>
      ) : (
        <div className="list">
          {mine.filter((g) => g.kind === 'apiaries').map((g) => {
            const n = (share?.apiaries || []).filter((x) => x.group_id === g.id).length;
            const m = members(g);
            return <ListLink key={g.id} href={`/group/${g.id}`} left={<LuUsers />} title={g.name} sub={`${n} apiar${n === 1 ? 'y' : 'ies'} · ${m.length ? m.map((x) => x.display_name || 'Member').join(', ') : 'nobody yet'}`} />;
          })}
        </div>
      )}

      {mine.some((g) => g.kind === 'mentor') && (
        <>
          <h3 className="h2">Mentors</h3>
          <div className="list">
            {mine.filter((g) => g.kind === 'mentor').map((g) => {
              const m = members(g)[0];
              const hiveIds = (share?.hives || []).filter((x) => x.group_id === g.id).map((x) => x.hive_id);
              const hive = hives?.find((h) => hiveIds.includes(h.id));
              return <ListLink key={g.id} href={`/group/${g.id}`} left={<LuGraduationCap />} title={hive ? `${hive.name}` : g.name}
                sub={m ? `${m.display_name || 'Mentor'} · ${activeMember(m) ? `until ${until(m.expires_at)}` : 'ended'}` : 'Link not used yet'} />;
            })}
          </div>
        </>
      )}

      <div className="row between"><h3 className="h2">Shared with you</h3><a className="btn small secondary" href="#/join">Join with a code</a></div>
      {memberOf.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>When someone invites you, their apiaries appear here and in your apiary list.</p>
      ) : (
        <div className="list">
          {memberOf.map((g) => {
            const m = members(g).find((x) => x.user_id === me);
            const live = m && activeMember(m);
            return <ListLink key={g.id} href={`/group/${g.id}`} left={g.kind === 'mentor' ? <LuGraduationCap /> : <LuUserCheck />}
              title={`${g.owner_name || 'A beekeeper'} · ${g.name}`}
              sub={m ? `${ROLE_INFO[m.role].label}${m.expires_at ? (live ? ` until ${until(m.expires_at)}` : ' · access ended') : ''}` : ''} />;
          })}
        </div>
      )}

      {activity && activity.length > 0 && (
        <>
          <h3 className="h2">Recent activity</h3>
          <div className="list">
            {activity.map((a) => <ListLink key={a.id} href={a.href} title={<><b>{a.who}</b> {a.what}</>} sub={fmtDateTime(a.at)} />)}
          </div>
        </>
      )}

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="New group">
        <div className="stack">
          <Field label="Group name" hint="members see it"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pieter and me, Farm team" autoFocus /></Field>
          <button className="btn" onClick={create}>Create group</button>
        </div>
      </Sheet>
    </>
  );
}

// ---------------- one group ----------------
function MemberRow({ m, group, online }: { m: Member; group: Group; online: boolean }) {
  const live = activeMember(m);
  const mentor = group.kind === 'mentor';
  return (
    <div className="card stack">
      <div className="row between">
        <div><b>{m.display_name || 'Member'}</b><div className="small muted">{ROLE_INFO[m.role].label}{m.expires_at ? (live ? ` · until ${until(m.expires_at)}` : ' · access ended') : ''}</div></div>
        <button className="btn small ghost" onClick={async () => { if (needsSignal(online) || !window.confirm(`Remove ${m.display_name || 'this member'}? Their access ends now.`)) return; await run(() => removeMember(group.id, m.user_id), 'Member removed'); }}><LuTrash2 /> Remove</button>
      </div>
      {!mentor && (
        <Seg<MemberRole> label="Role" value={m.role} onChange={(role) => !needsSignal(online) && run(() => updateMember(group.id, m.user_id, { role, exact_location: role === 'partner' ? m.exact_location : false }), 'Role changed')}
          options={[{ value: 'partner', label: 'Partner' }, { value: 'helper', label: 'Helper' }, { value: 'viewer', label: 'Viewer' }]} />
      )}
      {m.role === 'partner' && (
        <label className="row small"><input type="checkbox" checked={m.exact_location} onChange={(e) => !needsSignal(online) && run(() => updateMember(group.id, m.user_id, { exact_location: e.target.checked }), e.target.checked ? 'Exact locations shared' : 'Exact locations hidden')} /> Show exact apiary locations</label>
      )}
      {m.expires_at && live && <button className="btn small ghost" onClick={() => !needsSignal(online) && run(() => updateMember(group.id, m.user_id, { expires_at: new Date().toISOString() }), 'Access ended')}>End access now</button>}
    </div>
  );
}

function InviteMaker({ group, online, onMade }: { group: Group; online: boolean; onMade: (i: Invite) => void }) {
  const [role, setRole] = useState<MemberRole>('partner');
  const [exact, setExact] = useState(false);
  const [cover, setCover] = useState(false);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (needsSignal(online)) return;
    setBusy(true);
    await run(async () => onMade(await createInvite({ groupId: group.id, role, exactLocation: exact, coverDays: cover ? Number(days) : null })));
    setBusy(false);
  };
  return (
    <div className="card stack">
      <Seg<MemberRole> label="Role" value={role} onChange={setRole} options={[{ value: 'partner', label: 'Partner' }, { value: 'helper', label: 'Helper' }, { value: 'viewer', label: 'Viewer' }]} />
      <p className="small muted" style={{ margin: 0 }}>{ROLE_INFO[role].text} Contracts, money, landowners and equipment always stay private to you.</p>
      {role === 'partner' && <label className="row small"><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Show exact apiary locations (otherwise about 1 km)</label>}
      <label className="row small"><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> Cover mode: access ends by itself</label>
      {cover && <Seg label="Cover length" value={days} onChange={setDays} options={[{ value: '3', label: '3 days' }, { value: '7', label: '1 week' }, { value: '14', label: '2 weeks' }, { value: '30', label: '1 month' }]} />}
      <button className="btn" disabled={busy} onClick={make}><LuPlus /> {busy ? 'Making…' : 'Make an invite'}</button>
    </div>
  );
}

export function GroupDetail({ id }: { id: string }) {
  const share = useShare();
  const online = useOnline();
  const apiaries = db.useLive(() => db.all<Apiary>('apiaries'));
  const hives = db.useLive(() => db.all<Hive>('hives'));
  const [made, setMade] = useState<Invite | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [busyApiary, setBusyApiary] = useState<string>();
  useEffect(() => { if (currentSession() && navigator.onLine) refreshShare().catch(() => {}); }, [id]);
  if (!currentSession()) return (<><Topbar title="Group" backTo="/sharing" /><SignInFirst what="see this group" /></>);
  if (!share || !apiaries || !hives) return <Topbar title="Group" backTo="/sharing" />;
  const g = share.groups.find((x) => x.id === id);
  if (!g) return (<><Topbar title="Group" backTo="/sharing" /><Empty title="Group not found" text="It may have been deleted, or you left it." action={<a className="btn" href="#/sharing">Back to sharing</a>} /></>);
  const me = myId();
  const owner = g.owner_id === me;
  const members = share.members.filter((m) => m.group_id === id);
  const sharedApiaries = share.apiaries.filter((x) => x.group_id === id).map((x) => x.apiary_id);
  const sharedHives = share.hives.filter((x) => x.group_id === id).map((x) => x.hive_id);
  const invites = share.invites.filter((i) => i.group_id === id && new Date(i.expires_at) > new Date() && i.uses < i.max_uses);

  if (!owner) {
    const m = members.find((x) => x.user_id === me);
    const live = m && activeMember(m);
    return (
      <>
        <Topbar title={g.name} backTo="/sharing" />
        <p className="muted" style={{ marginTop: 0 }}>Shared by {g.owner_name || 'another beekeeper'}. You are a <b>{m ? ROLE_INFO[m.role].label.toLowerCase() : 'member'}</b>{m?.expires_at ? (live ? ` until ${until(m.expires_at)}` : '; your access has ended') : ''}.</p>
        {m && <p className="small muted">{ROLE_INFO[m.role].text}</p>}
        {live && (
          <div className="list">
            {apiaries.filter((a) => sharedApiaries.includes(a.id)).map((a) => <ListLink key={a.id} href={`/apiary/${a.id}`} title={a.name} sub={a.province || ''} />)}
            {hives.filter((h) => sharedHives.includes(h.id)).map((h) => <ListLink key={h.id} href={`/hive/${h.id}`} title={h.name} sub="Shared hive" />)}
          </div>
        )}
        {live && !sharedApiaries.length && !sharedHives.length && <p className="muted">Nothing is shared in this group yet.</p>}
        <button className="btn ghost" style={{ marginTop: 18, color: 'var(--bad)' }} onClick={async () => {
          if (needsSignal(online) || !window.confirm(`Leave ${g.name}? Its records leave this phone. The owner keeps them.`)) return;
          if (await run(() => leaveGroup(id), 'You left the group')) go('/sharing', true);
        }}><LuLogOut /> Leave group</button>
      </>
    );
  }

  const myApiaries = apiaries.filter((a) => !a.owner_id || a.owner_id === me);
  const toggle = async (a: Apiary, on: boolean) => {
    if (needsSignal(online)) return;
    setBusyApiary(a.id);
    await run(() => (on ? shareApiary(id, a.id) : unshareApiary(id, a.id)), on ? `${a.name} shared` : `${a.name} no longer shared`);
    setBusyApiary(undefined);
  };

  return (
    <>
      <Topbar title={g.name} backTo="/sharing" />
      {rename === null ? (
        <button className="btn ghost small" onClick={() => setRename(g.name)}>Rename group</button>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Group name" />
          <button className="btn small" onClick={async () => { if (!needsSignal(online) && await run(() => renameGroup(id, rename.trim() || g.name), 'Renamed')) setRename(null); }}>Save</button>
        </div>
      )}

      {g.kind === 'apiaries' ? (
        <>
          <h3 className="h2">Apiaries in this group</h3>
          {myApiaries.length === 0 ? <p className="muted">Add an apiary first.</p> : (
            <div className="card stack">
              {myApiaries.map((a) => (
                <label key={a.id} className="row between">
                  <span><b>{a.name}</b><span className="small muted"> · {hives.filter((h) => h.apiary_id === a.id).length} hives</span></span>
                  <input type="checkbox" disabled={busyApiary === a.id} checked={busyApiary === a.id ? !sharedApiaries.includes(a.id) : sharedApiaries.includes(a.id)} onChange={(e) => toggle(a, e.target.checked)} aria-label={`Share ${a.name}`} />
                </label>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h3 className="h2">Shared hive</h3>
          <div className="list">{hives.filter((h) => sharedHives.includes(h.id)).map((h) => <ListLink key={h.id} href={`/hive/${h.id}`} title={h.name} sub="Photos, inspections and comments; view only" />)}</div>
        </>
      )}

      <h3 className="h2">Members</h3>
      {members.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>Nobody has joined yet.</p> : <div className="stack">{members.map((m) => <MemberRow key={m.user_id} m={m} group={g} online={online} />)}</div>}

      {g.kind === 'apiaries' && (
        <>
          <h3 className="h2">Invite someone</h3>
          {made ? (
            <div className="stack"><InviteCard invite={made} intro={`Join my apiary group "${g.name}" on Honeyguide`} /><button className="btn ghost" onClick={() => setMade(null)}>Make another invite</button></div>
          ) : (
            <InviteMaker group={g} online={online} onMade={setMade} />
          )}
        </>
      )}

      {invites.length > 0 && (
        <>
          <h3 className="h2">Open invites</h3>
          <div className="stack">
            {invites.map((i) => (
              <div key={i.code} className="card row between">
                <div><b className="mono">{i.code}</b><div className="small muted">{ROLE_INFO[i.role].label} · use by {until(i.expires_at)}</div></div>
                <button className="btn small ghost" onClick={() => !needsSignal(online) && run(() => deleteInvite(i.code), 'Invite cancelled')}>Cancel</button>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn ghost" style={{ marginTop: 22, color: 'var(--bad)' }} onClick={async () => {
        if (needsSignal(online) || !window.confirm(`Delete ${g.name}? Everyone in it loses access now. Your records are not deleted.`)) return;
        if (await run(() => deleteGroup(id), 'Group deleted')) go('/sharing', true);
      }}><LuTrash2 /> Delete group</button>
    </>
  );
}

// ---------------- joining ----------------
export function JoinScreen({ code: initial }: { code?: string }) {
  const online = useOnline();
  const [code, setCode] = useState((initial || '').toUpperCase());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const session = currentSession();
  useEffect(() => { myDisplayName().then((n) => setName((x) => x || n)); }, [session?.user.id]);
  if (!session) return (<><Topbar title="Join a group" backTo="/sharing" /><p className="muted" style={{ marginTop: 0 }}>Code {initial ? <b>{initial}</b> : ''}</p><SignInFirst what="join" /></>);
  const clean = parseJoinCode(code) || code.replace(/[^A-Z0-9]/g, '');
  const join = async () => {
    if (needsSignal(online)) return;
    setBusy(true);
    const ok = await run(async () => {
      await joinGroup(clean, name);
    }, 'Joined. Their records are on their way to this phone.');
    setBusy(false);
    if (ok) go('/sharing', true);
  };
  return (
    <>
      <Topbar title="Join a group" backTo="/sharing" />
      <p className="muted" style={{ marginTop: 0 }}>Enter the 6-character code from the invite, or scan its QR code with the scanner on the home screen.</p>
      <div className="stack">
        <Field label="Code"><input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7P2QX" autoCapitalize="characters" maxLength={12} /></Field>
        <Field label="Your name" hint="the owner and other members see it"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <button className="btn" disabled={busy || clean.length !== 6} onClick={join}>{busy ? 'Joining…' : 'Join'}</button>
      </div>
    </>
  );
}

// ---------------- mentor mode on a hive ----------------
export function MentorButton({ hive }: { hive: Hive }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');
  const [made, setMade] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const share = useShare();
  if (!cloudConfigured) return null;
  const groups = (share?.groups || []).filter((g) => g.kind === 'mentor' && share!.hives.some((x) => x.group_id === g.id && x.hive_id === hive.id));
  const mentors = (share?.members || []).filter((m) => groups.some((g) => g.id === m.group_id));
  const make = async () => {
    if (needsSignal(online)) return;
    setBusy(true);
    await run(async () => setMade((await createMentorLink(hive, Number(days))).invite));
    setBusy(false);
  };
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}><LuGraduationCap /> Ask a mentor</button>
      <Sheet open={open} onClose={() => { setOpen(false); setMade(null); }} title="Ask a mentor">
        {!currentSession() ? <SignInFirst what="invite a mentor" /> : made ? (
          <div className="stack"><InviteCard invite={made} intro={`Please have a look at my hive "${hive.name}" on Honeyguide`} /><button className="btn ghost" onClick={() => setMade(null)}>Done</button></div>
        ) : (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Your mentor sees this hive's inspections, photos and notes, and can comment. Nothing else: not your other hives, not the apiary or its location. Access ends by itself.</p>
            <Seg label="How long" value={days} onChange={setDays} options={[{ value: '3', label: '3 days' }, { value: '7', label: '1 week' }, { value: '14', label: '2 weeks' }, { value: '30', label: '1 month' }]} />
            <button className="btn" disabled={busy} onClick={make}>{busy ? 'Making…' : 'Make a mentor link'}</button>
            {mentors.length > 0 && (
              <div className="stack">
                <b className="small">Mentors on this hive</b>
                {mentors.map((m) => (
                  <div key={m.group_id + m.user_id} className="row between small">
                    <span>{m.display_name || 'Mentor'} · {activeMember(m) ? `until ${until(m.expires_at)}` : 'ended'}</span>
                    {activeMember(m) && <button className="btn small ghost" onClick={() => !needsSignal(online) && run(() => updateMember(m.group_id, m.user_id, { expires_at: new Date().toISOString() }), 'Mentor access ended')}>End now</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------------- comments ----------------
export function Comments({ hiveId, inspectionId, canComment }: { hiveId: string; inspectionId?: string; canComment: boolean }) {
  const share = useShare();
  const list = db.useLive(async () => {
    const all = await db.byIndex<HiveComment>('comments', 'hive_id', hiveId);
    const t = (c: HiveComment) => new Date(c.created_at || 0).getTime();
    return all.filter((c) => !inspectionId || c.inspection_id === inspectionId).sort((a, b) => t(a) - t(b));
  }, [hiveId, inspectionId]);
  const [body, setBody] = useState('');
  if (!list) return null;
  if (!list.length && !canComment) return null;
  const me = myId();
  const send = async () => {
    const text = body.trim();
    if (!text) return;
    await db.save<HiveComment>('comments', { id: db.uuid(), hive_id: hiveId, inspection_id: inspectionId || null, body: text.slice(0, 2000), author_name: await myDisplayName() });
    setBody('');
    toast(navigator.onLine ? 'Comment saved' : 'Comment saved. It goes when you have signal.');
  };
  return (
    <>
      <h3 className="h2">Comments</h3>
      <div className="stack">
        {list.map((c) => (
          <div key={c.id} className="card comment">
            <div className="row between small"><b>{!c.owner_id || c.owner_id === me ? 'You' : c.author_name || nameFor(c.owner_id, share)}</b><span className="muted">{fmtDate(c.created_at)}</span></div>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
            {(!c.owner_id || c.owner_id === me) && <button className="link-btn small" onClick={async () => { if (window.confirm('Delete this comment?')) await db.remove('comments', c.id); }}>Delete</button>}
          </div>
        ))}
        {list.length === 0 && <p className="muted" style={{ margin: 0 }}>No comments yet. A mentor or partner can leave advice here.</p>}
        {canComment && (
          <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
            <textarea className="input grow" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" aria-label="Comment" maxLength={2000} />
            <button className="btn small" onClick={send} aria-label="Send comment" disabled={!body.trim()}><LuSend /></button>
          </div>
        )}
      </div>
    </>
  );
}

/** "Shared by Lucille · you are a helper" or "Shared with Pieter", for apiary and hive pages. */
export function ShareNote({ apiary, hive, share }: { apiary?: Apiary; hive?: Hive; share?: ShareData }) {
  const me = myId();
  if (!share || !me) return null;
  const ownerId = apiary?.owner_id || hive?.owner_id;
  if (apiary && (!apiary.owner_id || apiary.owner_id === me)) {
    const groups = share.apiaries.filter((x) => x.apiary_id === apiary.id).map((x) => x.group_id);
    const people = share.members.filter((m) => groups.includes(m.group_id) && activeMember(m)).map((m) => m.display_name || 'a member');
    return people.length ? <p className="small muted row"><LuUsers /> Shared with {people.join(', ')}</p> : null;
  }
  const role = hiveRole(hive, apiary, share);
  if (!role || role === 'owner') return null;
  return <p className="small muted row"><LuUsers /> Shared by {nameFor(ownerId, share)} · you are a {ROLE_INFO[role].label.toLowerCase()}</p>;
}

export { access };
