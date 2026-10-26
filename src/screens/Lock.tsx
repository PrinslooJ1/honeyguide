import { useState } from 'react';
import { LuDelete, LuLock } from 'react-icons/lu';
import { hashPin } from '../lib';
import { getSettings } from '../settings';
import { Logo } from '../ui';

export function PinPad({ title, sub, onDone, error }: { title: string; sub?: string; onDone: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState('');
  const press = (k: string) => {
    if (pin.length >= 4) return;
    const next = pin + k;
    navigator.vibrate?.(6);
    setPin(next);
    if (next.length === 4) setTimeout(() => { onDone(next); setPin(''); }, 120);
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 className="h2" style={{ marginTop: 0 }}>{title}</h2>
      {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
      <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      {error && <p className="tone-bad" role="alert" style={{ marginTop: -10 }}>{error}</p>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button key={k} onClick={() => press(k)}>{k}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button aria-label="Delete digit" onClick={() => setPin(pin.slice(0, -1))}><LuDelete /></button>
      </div>
    </div>
  );
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [error, setError] = useState<string>();
  const [tries, setTries] = useState(0);
  const check = async (pin: string) => {
    const lock = getSettings().lock;
    if (!lock) return onUnlock();
    if ((await hashPin(pin, lock.salt)) === lock.hash) onUnlock();
    else {
      setTries(tries + 1);
      setError(tries >= 2 ? 'Wrong PIN. Forgot it? Clear the app\'s storage in Android settings; synced data comes back when you sign in.' : 'Wrong PIN, try again');
    }
  };
  return (
    <div className="lock">
      <div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Logo size={36} /><LuLock />
        </div>
        <PinPad title="Honeyguide is locked" sub="Enter your 4-digit PIN" onDone={check} error={error} />
      </div>
    </div>
  );
}
