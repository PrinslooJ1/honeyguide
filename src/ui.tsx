import { useEffect, useState, type ReactNode } from 'react';
import {
  LuChevronLeft, LuChevronRight, LuCloud, LuCloudOff, LuRefreshCw, LuMinus, LuPlus, LuHouse,
  LuMapPin, LuHexagon, LuGraduationCap, LuMenu, LuCheck, LuWifiOff,
} from 'react-icons/lu';
import * as db from './db';
import type { Photo } from './db';
import { currentSession, fetchPhotoBlob, onSync, syncNow, type SyncState, cloudConfigured } from './sync';

// ---------------- hash router ----------------
export function useRoute() {
  const read = () => (location.hash.replace(/^#/, '') || '/').split('?');
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => {
      setR(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return { path: r[0], query: new URLSearchParams(r[1] || '') };
}
export const go = (path: string, replace = false) => {
  if (replace) {
    // Swap the current entry (e.g. a finished form) so Back skips it.
    history.replaceState(null, '', `#${path}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else location.hash = path;
};
export const back = (fallback = '/') => {
  if (history.length > 1) history.back();
  else go(fallback);
};

// ---------------- toast ----------------
let toastFn: ((m: string) => void) | null = null;
export const toast = (m: string) => toastFn?.(m);
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: number;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 2600);
    };
    return () => {
      toastFn = null;
    };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

// ---------------- chrome ----------------
export function Logo({ size = 30 }: { size?: number }) {
  // A honeyguide in flight over a hexagon.
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 56 18v28L32 60 8 46V18z" fill="var(--primary)" />
      <path d="M17 35c6-1 10-4 13-9 2 4 6 6 11 6l7-3c-2 5-6 8-11 9l-6 7-2-6c-4 0-8-1-12-4z" fill="var(--on-primary)" />
      <circle cx="41" cy="29" r="1.6" fill="var(--primary)" />
    </svg>
  );
}

export function Topbar({ title, backTo, right, brand }: { title?: string; backTo?: string; right?: ReactNode; brand?: boolean }) {
  return (
    <header className="topbar">
      {backTo !== undefined && (
        <button className="icon-btn" aria-label="Back" onClick={() => back(backTo)}>
          <LuChevronLeft />
        </button>
      )}
      {brand ? (
        <div className="brand">
          <Logo />
          <h1>Honeyguide</h1>
        </div>
      ) : (
        <h1>{title}</h1>
      )}
      {right}
    </header>
  );
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    window.addEventListener('online', u);
    window.addEventListener('offline', u);
    return () => {
      window.removeEventListener('online', u);
      window.removeEventListener('offline', u);
    };
  }, []);
  return on;
}

export function useSync() {
  const [s, setS] = useState<SyncState>({ running: false, pending: 0 });
  useEffect(() => onSync(setS) as () => void, []);
  return s;
}

export function SyncChip() {
  const s = useSync();
  const online = useOnline();
  const signedIn = Boolean(currentSession());
  if (!cloudConfigured || !signedIn) {
    return (
      <button className="chip" onClick={() => go('/more')} aria-label="Saved on this phone. Sign in to back up.">
        <LuCloudOff /> On phone
      </button>
    );
  }
  if (s.running) return <span className="chip"><LuRefreshCw className="spin" /> Syncing</span>;
  if (!online) return <span className="chip warn"><LuWifiOff /> {s.pending ? `${s.pending} to sync` : 'Offline'}</span>;
  if (s.error) return <button className="chip bad" onClick={syncNow}><LuRefreshCw /> Retry sync</button>;
  if (s.pending) return <button className="chip warn" onClick={syncNow}><LuCloud /> {s.pending} to sync</button>;
  return <span className="chip good"><LuCheck /> Synced</span>;
}

export function OfflineStrip() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-strip" role="status">
      <LuWifiOff /> No signal. Everything you log is saved on this phone.
    </div>
  );
}

export function Nav({ path }: { path: string }) {
  const is = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  const item = (href: string, label: string, icon: ReactNode, match = href) => (
    <a href={`#${href}`} aria-current={is(match) ? 'page' : undefined}>
      {icon}
      {label}
    </a>
  );
  return (
    <nav className="nav" aria-label="Main">
      {item('/', 'Home', <LuHouse />)}
      {item('/apiaries', 'Apiaries', <LuMapPin />, '/apiar')}
      <a href="#/inspect" aria-label="Start an inspection">
        <span className="fab"><LuHexagon /></span>
      </a>
      {item('/learn', 'Learn', <LuGraduationCap />, '/learn')}
      {item('/more', 'More', <LuMenu />)}
    </nav>
  );
}

// ---------------- inputs ----------------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} {hint && <span className="hint">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value?: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pills({ options, value, onChange, label, single }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label: string; single?: boolean;
}) {
  const toggle = (v: string) => {
    if (single) return onChange(value[0] === v ? [] : [v]);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="pill" aria-pressed={value.includes(o.value)} onClick={() => toggle(o.value)}>
          {value.includes(o.value) && <LuCheck />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 40, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  const set = (v: number) => {
    const n = Math.max(min, Math.min(max, v));
    if (n !== value) navigator.vibrate?.(8);
    onChange(n);
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => set(value - 1)}><LuMinus /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label}`} onClick={() => set(value + 1)}><LuPlus /></button>
    </div>
  );
}

// ---------------- layout bits ----------------
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title && <h2 className="h2" style={{ marginTop: 4 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg className="art" viewBox="0 0 96 96" aria-hidden="true">
        <path d="M48 8 82 28v40L48 88 14 68V28z" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M48 30 63 39v18L48 66 33 57V39z" fill="var(--primary)" opacity=".35" />
      </svg>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ListLink({ href, title, sub, left, right }: { href: string; title: ReactNode; sub?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <a className="list-item" href={`#${href}`}>
      {left}
      <div className="grow">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
      <LuChevronRight className="chev" />
    </a>
  );
}

const toneVar: Record<string, string> = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', muted: 'var(--border)' };

export function Hex({ label, tone = 'muted', size = 72 }: { label: ReactNode; tone?: string; size?: number }) {
  return (
    <div className="hex" style={{ width: size, height: size * 1.11 }}>
      <svg className="hex-shape" viewBox="0 0 72 80" aria-hidden="true">
        <path d="M36 3 68 21.5v37L36 77 4 58.5v-37z" fill="var(--surface)" stroke={toneVar[tone]} strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <span className="hex-label">{label}</span>
    </div>
  );
}

export function Ring({ value, tone }: { value: number; tone: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(t);
  }, [value]);
  return (
    <div className="ring" role="img" aria-label={`Health score ${value} out of 100`}>
      <svg viewBox="0 0 132 132">
        <circle className="ring-track" cx="66" cy="66" r={r} fill="none" strokeWidth="12" />
        <circle className="ring-value" cx="66" cy="66" r={r} fill="none" stroke={toneVar[tone]} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="ring-label">
        <div><b>{value}</b><div className="small muted">health</div></div>
      </div>
    </div>
  );
}

// ---------------- photos ----------------
const urlCache = new Map<string, string>();
export function usePhotoUrl(p?: Photo) {
  const [url, setUrl] = useState<string | undefined>(p ? urlCache.get(p.id) : undefined);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    (async () => {
      if (urlCache.has(p.id)) return setUrl(urlCache.get(p.id));
      let blob = await db.getBlob(p.id);
      if (!blob && navigator.onLine) blob = await fetchPhotoBlob(p).catch(() => undefined);
      if (blob && alive) {
        const u = URL.createObjectURL(blob);
        urlCache.set(p.id, u);
        setUrl(u);
      }
    })();
    return () => {
      alive = false;
    };
  }, [p?.id, p?.storage_path]);
  return url;
}

export function PhotoThumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = usePhotoUrl(photo);
  return (
    <button className="ph" onClick={onOpen} aria-label={`Open ${photo.tag || 'photo'}`}>
      {url ? <img src={url} alt={photo.tag || 'Hive photo'} loading="lazy" /> : null}
      {photo.tag && <span className="tag">{photo.tag}</span>}
    </button>
  );
}

export function PhotoViewer({ photo, onClose, onDelete }: { photo: Photo | null; onClose: () => void; onDelete?: (p: Photo) => void }) {
  const url = usePhotoUrl(photo || undefined);
  if (!photo) return null;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="bar">
        <button className="icon-btn" onClick={onClose} aria-label="Close"><LuChevronLeft /></button>
        <span>{photo.tag}</span>
        {onDelete ? <button className="btn small danger" onClick={() => onDelete(photo)}>Delete</button> : <span />}
      </div>
      {url ? <img src={url} alt={photo.tag || 'Hive photo'} /> : <div />}
      <div className="bar small">{photo.taken_at && new Date(photo.taken_at).toLocaleString('en-ZA')}</div>
    </div>
  );
}
