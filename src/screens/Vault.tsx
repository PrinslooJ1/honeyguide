// The Vault screen: turn end-to-end encryption on, unlock it on another phone, change the passphrase.
import { useState } from 'react';
import { LuLockKeyhole, LuKeyRound, LuTriangleAlert, LuShieldCheck, LuLock } from 'react-icons/lu';
import { cloudConfigured, currentSession, syncNow } from '../sync';
import { Field, Sheet, Topbar, toast } from '../ui';
import { changePassphrase, disableVault, enableVault, lockThisPhone, unlockVault, useVaultState, WrongPassphrase } from '../vault';

const COVERS = [
  'Exact apiary pins and swarm-trap pins',
  'Landowners: names, numbers, what you agreed, and the site log',
  'Pollination contracts: grower, contact and fee',
  'Bee-removal callouts: client, phone, area and fee',
  'Move costs, and the invoice details on your profile',
];

function Passphrase({ label, value, onChange, auto }: { label: string; value: string; onChange: (v: string) => void; auto?: string }) {
  return (
    <Field label={label}>
      <input className="input" type="password" autoComplete={auto || 'off'} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Shown on screens with Vault records when this phone has not been unlocked yet. */
export function VaultLockedBanner() {
  const state = useVaultState();
  if (state !== 'locked') return null;
  return (
    <a className="banner warn" href="#/vault" style={{ marginBottom: 12, textDecoration: 'none' }}>
      <LuLock />
      <div><b>Your Vault is locked on this phone</b><p>Some details show as 🔒. Tap to enter your passphrase and open them.</p></div>
    </a>
  );
}

/** For edit forms: a record that arrived locked cannot be edited until the Vault is open. */
export function lockedGuard(rec: unknown) {
  if ((rec as { _locked?: boolean } | undefined)?._locked) {
    toast('This record is in your Vault. Unlock the Vault on this phone first.');
    return true;
  }
  return false;
}

export function VaultScreen() {
  const state = useVaultState();
  const [sheet, setSheet] = useState<'on' | 'change' | 'off' | null>(null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [p3, setP3] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const session = currentSession();
  const reset = () => { setP1(''); setP2(''); setP3(''); setAgree(false); setErr(undefined); setSheet(null); };
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setErr(undefined);
    try {
      await fn();
      reset();
      toast(done);
      syncNow({ fresh: true });
    } catch (e: any) {
      setErr(e instanceof WrongPassphrase ? e.message : e?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!cloudConfigured) return (<><Topbar title="Vault" backTo="/more" /><p className="muted">Not available in this build.</p></>);
  if (!session) {
    return (
      <>
        <Topbar title="Vault" backTo="/more" />
        <div className="banner info"><LuLockKeyhole /><div><b>Sign in first</b><p>The Vault encrypts the copy of your records in the cloud backup. Without an account nothing leaves this phone, so there is nothing to lock.</p></div></div>
      </>
    );
  }
  if (!state) return <Topbar title="Vault" backTo="/more" />;

  return (
    <>
      <Topbar title="Vault" backTo="/more" />
      {state === 'off' && <p className="muted" style={{ marginTop: 0 }}>Optional extra privacy. With the Vault on, the details below are encrypted on your phone before they go to the cloud, with a passphrase only you know. Nobody else can read them there, not even Honeyguide.</p>}
      {state === 'open' && <div className="banner good"><LuShieldCheck /><div><b>The Vault is on</b><p>These details are encrypted before they leave this phone. On this phone they work as normal.</p></div></div>}
      {state === 'locked' && <div className="banner warn"><LuLock /><div><b>The Vault is on, and locked on this phone</b><p>Enter your passphrase to open your encrypted details here.</p></div></div>}

      <h3 className="h2">What it covers</h3>
      <div className="card stack" style={{ gap: 8 }}>
        {COVERS.map((c) => <div key={c} className="row small"><LuKeyRound style={{ flex: 'none' }} /> {c}</div>)}
      </div>
      <p className="small muted">Hive records, inspections and photos are not in the Vault, so the people you share an apiary with can still read them. While the Vault is on, partners you allow to see exact locations see the point rounded to about 1 km instead.</p>

      {state === 'off' && (
        <>
          <div className="banner bad" style={{ marginTop: 12 }}><LuTriangleAlert /><div><b>A forgotten passphrase cannot be recovered</b><p>If you lose it, what is in the Vault cannot be opened on a new phone, by you or by us. Write it down and keep it somewhere safe.</p></div></div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => setSheet('on')}><LuLockKeyhole /> Turn on the Vault</button>
        </>
      )}

      {state === 'locked' && (
        <div className="stack" style={{ marginTop: 14 }}>
          <Passphrase label="Vault passphrase" value={p1} onChange={setP1} auto="current-password" />
          {err && <p className="small tone-bad" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn" disabled={busy || !p1} onClick={() => run(() => unlockVault(p1), 'Vault opened on this phone')}>{busy ? 'Opening…' : 'Open the Vault'}</button>
        </div>
      )}

      {state === 'open' && (
        <div className="stack" style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={() => setSheet('change')}><LuKeyRound /> Change passphrase</button>
          <button className="btn ghost" onClick={async () => { try { await lockThisPhone(); toast('Locked on this phone'); syncNow(); } catch (e: any) { toast(e.message); } }}><LuLock /> Lock it on this phone</button>
          <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => setSheet('off')}>Turn off the Vault</button>
        </div>
      )}

      <Sheet open={sheet === 'on'} onClose={reset} title="Turn on the Vault">
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Choose a passphrase of at least 10 characters. A few unusual words work well, for example "aloe kettle rooibos tractor".</p>
          <Passphrase label="Passphrase" value={p1} onChange={setP1} auto="new-password" />
          <Passphrase label="Same passphrase again" value={p2} onChange={setP2} auto="new-password" />
          {p2 && p1 !== p2 && <p className="small tone-warn" style={{ margin: 0 }}>The two do not match yet.</p>}
          <label className="row small"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have written it down. I understand nobody can recover it for me.</label>
          {err && <p className="small tone-bad" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn" disabled={busy || p1.length < 10 || p1 !== p2 || !agree} onClick={() => run(() => enableVault(p1), 'The Vault is on')}>{busy ? 'Encrypting…' : 'Turn it on'}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'change'} onClose={reset} title="Change passphrase">
        <div className="stack">
          <Passphrase label="Current passphrase" value={p1} onChange={setP1} auto="current-password" />
          <Passphrase label="New passphrase" value={p2} onChange={setP2} auto="new-password" />
          <Passphrase label="New passphrase again" value={p3} onChange={setP3} auto="new-password" />
          {err && <p className="small tone-bad" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn" disabled={busy || !p1 || p2.length < 10 || p2 !== p3} onClick={() => run(() => changePassphrase(p1, p2), 'Passphrase changed')}>{busy ? 'Changing…' : 'Change it'}</button>
          <p className="small muted" style={{ margin: 0 }}>Your other phones stay unlocked. A new phone needs the new passphrase.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'off'} onClose={reset} title="Turn off the Vault">
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>Your details go back to the cloud backup readable by our systems, protected by the usual access rules.</p>
          <Passphrase label="Passphrase" value={p1} onChange={setP1} auto="current-password" />
          {err && <p className="small tone-bad" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn danger" disabled={busy || !p1} onClick={() => run(() => disableVault(p1), 'The Vault is off')}>{busy ? 'Turning off…' : 'Turn it off'}</button>
        </div>
      </Sheet>
    </>
  );
}
