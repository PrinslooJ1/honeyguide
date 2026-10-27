import { useEffect, useState } from 'react';
import { LuBriefcase, LuBox, LuSiren, LuFlower2, LuGraduationCap, LuHistory, LuQrCode, LuScanQrCode, LuCloud, LuDownload, LuLock, LuLogOut, LuRefreshCw, LuShieldCheck, LuTrash2, LuUser, LuPhone, LuMail, LuUsers, LuHouse, LuPackage, LuSparkles, LuClipboardList } from 'react-icons/lu';
import * as db from '../db';
import type { Profile } from '../db';
import { APP_VERSION } from '../config';
import { PROVINCES, fmtDateTime, hashPin } from '../lib';
import { setSettings, useSettings, type Theme } from '../settings';
import { cloudConfigured, currentSession, deleteAccount, sendMagicLink, signIn, signOut, signUp, syncNow } from '../sync';
import { Field, ListLink, Seg, Sheet, Topbar, toast, useSync } from '../ui';
import { useShare } from '../share';
import { PinPad } from './Lock';

export function Account() {
  const session = currentSession();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  if (!cloudConfigured) return <p className="muted">Cloud backup is not configured in this build.</p>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(undefined);
    try { await fn(); } catch (e: any) { setMsg(e.message || 'Something went wrong'); } finally { setBusy(false); }
  };

  if (session) {
    return (
      <div className="card stack">
        <div className="row"><LuUser /><div className="grow"><b>{session.user.email}</b><div className="small muted">{sync.lastAt ? `Last synced ${fmtDateTime(sync.lastAt)}` : 'Not synced yet'}{sync.pending ? ` · ${sync.pending} change${sync.pending > 1 ? 's' : ''} waiting` : ''}</div></div></div>
        {sync.error && <p className="small tone-bad" style={{ margin: 0 }}>Last sync failed: {sync.error}</p>}
        <div className="grid-2">
          <button className="btn secondary" disabled={sync.running} onClick={() => syncNow({ fresh: true })}><LuRefreshCw /> {sync.running ? 'Syncing…' : 'Sync now'}</button>
          <button className="btn ghost" onClick={() => run(async () => { await signOut(); toast('Signed out. Your records stay on this phone.'); })}><LuLogOut /> Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack">
      <p className="small muted" style={{ margin: 0 }}>Optional. Signing in backs up your records and lets you use more than one phone. Without it, everything stays on this phone only.</p>
      <Field label="Email"><input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password" hint="8 characters or more"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {msg && <p className="small" role="alert" style={{ margin: 0 }}>{msg}</p>}
      <div className="grid-2">
        <button className="btn" disabled={busy || !email || password.length < 8} onClick={() => run(async () => { await signIn(email, password); toast('Signed in. Syncing your records.'); })}>Sign in</button>
        <button className="btn secondary" disabled={busy || !email || password.length < 8} onClick={() => run(async () => {
          const r = await signUp(email, password);
          if (r === 'confirm-email') setMsg('Check your email and tap the link to confirm, then sign in here.');
          else toast('Account created. Syncing your records.');
        })}>Create account</button>
      </div>
      <button className="btn ghost" disabled={busy || !email} onClick={() => run(async () => { await sendMagicLink(email); setMsg('Sign-in link sent. Open it on this phone.'); })}><LuMail /> Email me a sign-in link instead</button>
    </div>
  );
}

function ProfileCard() {
  const p = db.useLive(async () => (await db.all<Profile>('profiles'))[0]);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  useEffect(() => { if (p) setDraft(p); }, [p?.id, p?.updated_at]);
  const save = async () => {
    await db.save<Profile>('profiles', { ...(draft as Profile), id: draft.id || db.uuid() });
    toast('Profile saved');
  };
  return (
    <div className="card stack">
      <Field label="Name"><input className="input" value={draft.display_name || ''} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field>
      <Field label="Home province">
        <select className="input" value={draft.province || ''} onChange={(e) => setDraft({ ...draft, province: e.target.value })}>
          <option value="">Choose province</option>
          {PROVINCES.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Beekeeper registration number"><input className="input" value={draft.registration_number || ''} onChange={(e) => setDraft({ ...draft, registration_number: e.target.value })} /></Field>
      <Field label="Invoice details" hint="trading name, address, phone, payment details"><textarea className="input" value={draft.invoice_details || ''} onChange={(e) => setDraft({ ...draft, invoice_details: e.target.value })} /></Field>
      <Field label="Public contact" hint="optional, only on honey passports you make public"><input className="input" value={draft.public_contact || ''} onChange={(e) => setDraft({ ...draft, public_contact: e.target.value })} placeholder="e.g. Lucille · honey@example.co.za" /></Field>
      <button className="btn secondary" onClick={save}>Save profile</button>
    </div>
  );
}

function LockSetup() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<string>();
  const [err, setErr] = useState<string>();
  const done = async (pin: string) => {
    if (!first) { setFirst(pin); setErr(undefined); return; }
    if (pin !== first) { setFirst(undefined); setErr('PINs did not match. Start again.'); return; }
    const salt = crypto.randomUUID();
    setSettings({ lock: { salt, hash: await hashPin(pin, salt), afterMinutes: 2 } });
    setOpen(false); setFirst(undefined);
    toast('App lock is on');
  };
  return (
    <>
      {s.lock ? (
        <div className="stack">
          <div className="field"><span>Lock again after</span>
            <Seg label="Lock delay" options={[{ value: '0', label: 'At once' }, { value: '2', label: '2 min' }, { value: '10', label: '10 min' }]} value={String(s.lock.afterMinutes)} onChange={(v) => setSettings({ lock: { ...s.lock!, afterMinutes: Number(v) } })} />
          </div>
          <button className="btn ghost" onClick={() => { setSettings({ lock: null }); toast('App lock is off'); }}>Turn off app lock</button>
        </div>
      ) : (
        <button className="btn secondary" onClick={() => setOpen(true)}><LuLock /> Set a 4-digit PIN</button>
      )}
      <Sheet open={open} onClose={() => { setOpen(false); setFirst(undefined); }}>
        <PinPad title={first ? 'Enter it again' : 'Choose a PIN'} sub="Keeps your records private if someone picks up your phone" onDone={done} error={err} />
      </Sheet>
    </>
  );
}

export function More() {
  const s = useSettings();
  const session = currentSession();
  const share = useShare();
  const groups = share?.groups.length || 0;

  const exportData = async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `honeyguide-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const wipe = async () => {
    if (!window.confirm(session ? 'Remove all records from this phone? Your cloud backup is kept, and comes back when you sign in again.' : 'Delete every record on this phone? You are not signed in, so this cannot be undone.')) return;
    await signOut();
    await db.wipeLocal();
    setSettings({ onboarded: false, lock: null });
    location.hash = '/';
    location.reload();
  };

  const delAccount = async () => {
    if (!window.confirm('Permanently delete your Honeyguide account and every record and photo stored in the cloud? This cannot be undone.')) return;
    try {
      await deleteAccount();
      toast('Account deleted. Records on this phone are kept until you remove them.');
    } catch (e: any) {
      toast(`Could not delete the account: ${e.message}`);
    }
  };

  return (
    <>
      <Topbar title="More" />

      <h3 className="h2"><LuCloud style={{ verticalAlign: -3 }} /> Account and backup</h3>
      <Account />
      <div className="list" style={{ marginTop: 12 }}>
        <ListLink href="/sharing" left={<LuUsers />} title="Sharing" sub={groups ? `${groups} group${groups > 1 ? 's' : ''} · partners, cover and mentors` : 'Share apiaries with a partner, cover or a mentor'} />
      </div>

      <h3 className="h2">Display</h3>
      <div className="stack">
        <Seg<Theme> label="Theme" value={s.theme} onChange={(v) => setSettings({ theme: v })}
          options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'sun', label: 'Sun' }, { value: 'night', label: 'Night' }]} />
        <p className="small muted" style={{ margin: 0 }}>
          {s.theme === 'sun' && 'Sun mode: maximum contrast for bright light. '}
          {s.theme === 'night' && 'Night mode: red on black for moving and closing hives after dark. Turn screen brightness down too. '}
          {(s.theme === 'system' || s.theme === 'light' || s.theme === 'dark') && 'Sun mode is for bright light outdoors. Night mode is red on black for work after dark.'}
        </p>
      </div>

      <h3 className="h2"><LuShieldCheck style={{ verticalAlign: -3 }} /> Privacy and safety</h3>
      <div className="card stack">
        <div className="field"><span>Location</span>
          <Seg label="Location" value={s.locationMode} onChange={(v) => setSettings({ locationMode: v })}
            options={[{ value: 'off', label: 'Off' }, { value: 'approximate', label: 'Approximate' }, { value: 'precise', label: 'Precise' }]} />
          <span className="small muted">Approximate rounds an apiary pin to about 1 km, enough for weather. Location is only read when you tap a button, never in the background.</span>
        </div>
        <div className="field"><span>Weather at inspections</span>
          <Seg label="Weather" value={s.weather ? 'on' : 'off'} onChange={(v) => setSettings({ weather: v === 'on' })}
            options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          <span className="small muted">Sends the apiary's approximate position to Open-Meteo for a forecast. Nothing else is shared.</span>
        </div>
        <div className="field"><span>App lock</span><LockSetup /></div>
      </div>
      <p className="small muted">Photos are shrunk and cleaned of their GPS tag before they are saved. Your records are visible only to you and the people you share an apiary or hive with, limited by their role.</p>

      <h3 className="h2">Profile</h3>
      <ProfileCard />

      <h3 className="h2">Sting emergency</h3>
      <div className="card stack">
        <p style={{ margin: 0 }}>Trouble breathing, swelling of the face or throat, dizziness or a spreading rash after a sting can be anaphylaxis. Call for help at once.</p>
        <div className="sos">
          <a className="btn danger" href="tel:10177"><LuPhone /> Ambulance 10177</a>
          <a className="btn danger" href="tel:112"><LuPhone /> Mobile 112</a>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Scrape the sting out with a fingernail or card. Move away from the hive first.</p>
      </div>

      <h3 className="h2">Tools</h3>
      <div className="grid-2">
        <a className="btn secondary" href="#/safety"><LuSiren /> Safety</a>
        <a className="btn secondary" href="#/forage"><LuFlower2 /> Forage</a>
        <a className="btn secondary" href="#/learn"><LuGraduationCap /> Academy</a>
        <a className="btn secondary" href="#/log"><LuHistory /> Inspection log</a>
        <a className="btn secondary" href="#/traps"><LuBox /> Swarm traps</a>
        <a className="btn secondary" href="#/business"><LuBriefcase /> Business</a>
        <a className="btn secondary" href="#/landowners"><LuHouse /> Landowners</a>
        <a className="btn secondary" href="#/equipment"><LuPackage /> Equipment</a>
        <a className="btn secondary" href="#/replay"><LuSparkles /> Season replay</a>
        <a className="btn secondary" href="#/survey"><LuClipboardList /> Loss survey</a>
      </div>

      <h3 className="h2">Hive labels</h3>
      <div className="grid-2">
        <a className="btn secondary" href="#/labels"><LuQrCode /> Print labels</a>
        <a className="btn secondary" href="#/scan"><LuScanQrCode /> Scan label</a>
      </div>

      <h3 className="h2">Your data</h3>
      <div className="stack">
        <button className="btn secondary" onClick={exportData}><LuDownload /> Export all records (JSON)</button>
        <button className="btn ghost" onClick={wipe}><LuTrash2 /> Remove all data from this phone</button>
        {session && <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={delAccount}><LuTrash2 /> Delete my account and cloud data</button>}
      </div>

      <p className="small muted" style={{ marginTop: 24, textAlign: 'center' }}>Honeyguide {APP_VERSION} · beta<br />Guidance in this app is general information, not veterinary or legal advice.<br /><a href="privacy.html" target="_blank" rel="noreferrer">Privacy policy</a> · <a href="delete-account.html" target="_blank" rel="noreferrer">Delete account on the web</a></p>
    </>
  );
}
