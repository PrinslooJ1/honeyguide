// Supabase over plain fetch: email sign-in, row sync, private photo storage.
// The app works fully without an account; signing in adds backup and multi-device.
import * as db from './db';
import type { Base, Photo, Table } from './db';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch
  user: { id: string; email?: string };
}

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Columns the server accepts, per table. Local-only fields (_dirty, _rev) never leave the phone.
const COLUMNS: Record<Table, string[]> = {
  profiles: ['id', 'display_name', 'province', 'registration_number', 'invoice_details', 'public_contact', 'created_at', 'deleted'],
  apiaries: ['id', 'name', 'province', 'lat', 'lng', 'location_precision', 'landowner', 'permission_notes', 'forage_notes', 'access_notes', 'forage_plants', 'created_at', 'deleted'],
  hives: ['id', 'apiary_id', 'name', 'code', 'hive_type', 'subspecies', 'queen_year', 'queen_marked', 'status', 'notes', 'loss_cause', 'lost_at', 'created_at', 'deleted'],
  inspections: ['id', 'hive_id', 'inspected_at', 'temperament', 'queen_status', 'brood_frames', 'brood_pattern', 'honey_frames', 'pollen_frames', 'space', 'pests', 'afb_suspect', 'actions', 'notes', 'score', 'weather', 'created_at', 'deleted'],
  photos: ['id', 'hive_id', 'inspection_id', 'job_id', 'incident_id', 'tag', 'storage_path', 'width', 'height', 'taken_at', 'created_at', 'deleted'],
  blooms: ['id', 'plant_id', 'apiary_id', 'province', 'seen_at', 'note', 'created_at', 'deleted'],
  traps: ['id', 'name', 'apiary_id', 'location_note', 'lat', 'lng', 'lure', 'placed_at', 'check_every_days', 'last_checked_at', 'status', 'caught_at', 'hive_id', 'notes', 'created_at', 'deleted'],
  weights: ['id', 'hive_id', 'weighed_at', 'kg', 'lift', 'notes', 'created_at', 'deleted'],
  moves: ['id', 'from_apiary_id', 'to_apiary_id', 'hive_ids', 'planned_for', 'status', 'moved_at', 'distance_km', 'cost_per_km', 'other_costs', 'checklist', 'notes', 'created_at', 'deleted'],
  contracts: ['id', 'grower', 'farm', 'contact', 'crop', 'hives', 'fee_per_hive', 'starts_on', 'ends_on', 'apiary_id', 'spray_agreed', 'spray_notes', 'status', 'invoice_no', 'invoiced_at', 'paid_at', 'notes', 'created_at', 'deleted'],
  batches: ['id', 'code', 'name', 'forage', 'province', 'harvest_month', 'jars', 'jar_size_g', 'public', 'show_reg', 'show_contact', 'notes', 'created_at', 'deleted'],
  harvests: ['id', 'hive_id', 'harvested_at', 'kg', 'frames', 'forage', 'moisture', 'batch_id', 'notes', 'created_at', 'deleted'],
  jobs: ['id', 'client_name', 'client_phone', 'area', 'requested_at', 'done_at', 'outcome', 'fee', 'paid', 'invoice_no', 'hive_id', 'notes', 'created_at', 'deleted'],
  incidents: ['id', 'kind', 'occurred_at', 'apiary_id', 'hive_ids', 'description', 'saps_case_no', 'reported_at', 'notes', 'created_at', 'deleted'],
};
// Parents before children, so foreign keys hold.
const PUSH_ORDER: Table[] = ['profiles', 'apiaries', 'hives', 'inspections', 'jobs', 'incidents', 'photos', 'blooms', 'traps', 'weights', 'moves', 'contracts', 'batches', 'harvests'];

// ---------------- auth ----------------
let session: Session | null = null;
const authListeners = new Set<(s: Session | null) => void>();
export function onAuth(fn: (s: Session | null) => void) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}
function emitAuth() {
  authListeners.forEach((f) => f(session));
}
export function currentSession() {
  return session;
}

async function setSession(s: Session | null) {
  session = s;
  if (s) await db.setMeta('session', s);
  else await db.delMeta('session');
  emitAuth();
}

function toSession(r: any): Session {
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600),
    user: { id: r.user?.id, email: r.user?.email },
  };
}

async function authFetch(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || json.error_description || json.message || `Sign-in failed (${res.status})`);
  return json;
}

export async function initAuth() {
  session = (await db.getMeta<Session>('session')) || null;
  // Returning from an email link: tokens arrive in the URL fragment.
  const hash = location.hash;
  if (hash.includes('access_token=')) {
    const p = new URLSearchParams(hash.replace(/^#\/?/, ''));
    const access_token = p.get('access_token');
    const refresh_token = p.get('refresh_token');
    if (access_token && refresh_token) {
      const user = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access_token}` },
      }).then((r) => r.json());
      await setSession({
        access_token,
        refresh_token,
        expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + 3600,
        user: { id: user.id, email: user.email },
      });
    }
    history.replaceState(null, '', location.pathname + '#/more');
  }
  emitAuth();
}

/** Email + password: sign in, or create the account if it does not exist yet. */
export async function signUp(email: string, password: string) {
  const r = await authFetch('signup', { email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (r.access_token) {
    await setSession(toSession(r));
    return 'signed-in';
  }
  return 'confirm-email';
}

export async function signIn(email: string, password: string) {
  await setSession(toSession(await authFetch('token?grant_type=password', { email, password })));
}

export async function sendMagicLink(email: string) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  await authFetch(`otp?redirect_to=${redirect}`, { email, create_user: true });
}

export async function signOut() {
  if (session) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  await setSession(null);
  for (const t of db.TABLES) await db.delMeta(`cursor:${t}`);
}

async function token(): Promise<string> {
  if (!session) throw new Error('Not signed in');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      await setSession(toSession(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })));
    } catch (e) {
      await setSession(null);
      throw e;
    }
  }
  return session!.access_token;
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res;
}

// ---------------- sync ----------------
export type SyncState = { running: boolean; lastAt?: string; error?: string; pending: number };
let state: SyncState = { running: false, pending: 0 };
const syncListeners = new Set<(s: SyncState) => void>();
export function onSync(fn: (s: SyncState) => void) {
  syncListeners.add(fn);
  fn(state);
  return () => syncListeners.delete(fn);
}
async function emitSync(patch: Partial<SyncState>) {
  state = { ...state, ...patch, pending: await db.pendingCount() };
  syncListeners.forEach((f) => f(state));
}
db.subscribe(() => {
  emitSync({});
});

function pick(table: Table, rec: Base) {
  const out: Record<string, unknown> = {};
  for (const c of COLUMNS[table]) out[c] = (rec as any)[c] ?? null;
  if (out.deleted === null) out.deleted = false;
  return out;
}

async function uploadPhoto(p: Photo): Promise<Photo | null> {
  const blob = await db.getBlob(p.id);
  if (!blob) return p.storage_path ? p : null;
  const path = `${session!.user.id}/${p.id}.jpg`;
  await api(`/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  return { ...p, storage_path: path };
}

async function push() {
  for (const table of PUSH_ORDER) {
    let rows = await db.dirty(table);
    if (!rows.length) continue;
    if (table === 'photos') {
      const ready: Base[] = [];
      for (const p of rows as Photo[]) {
        // A photo taken mid-inspection waits until that inspection is saved.
        const parentMissing =
          (p.inspection_id && !(await db.getRaw('inspections', p.inspection_id))) ||
          (p.job_id && !(await db.getRaw('jobs', p.job_id))) ||
          (p.incident_id && !(await db.getRaw('incidents', p.incident_id)));
        if (parentMissing) {
          if (p.deleted) await db.putClean('photos', p); // draft was discarded: nothing to send
          continue;
        }
        if (p.deleted || p.storage_path) ready.push(p);
        else {
          const up = await uploadPhoto(p);
          if (up) ready.push(up);
        }
      }
      rows = ready;
    }
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const res = await api(`/rest/v1/${table}?on_conflict=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch.map((r) => pick(table, r))),
      });
      const saved: Base[] = await res.json();
      for (const srv of saved) {
        const sent = batch.find((b) => b.id === srv.id)!;
        const local = await db.getRaw(table, srv.id);
        // Only mark clean if nobody edited the record while it was in flight.
        if (local && local._rev === sent._rev) {
          await db.putClean(table, { ...local, ...srv, _rev: local._rev });
        }
      }
    }
  }
}

async function pull() {
  for (const table of PUSH_ORDER) {
    let cursor = (await db.getMeta<string>(`cursor:${table}`)) || '1970-01-01T00:00:00Z';
    for (;;) {
      const res = await api(`/rest/v1/${table}?select=*&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc&limit=500`);
      const rows: Base[] = await res.json();
      for (const srv of rows) {
        const local = await db.getRaw(table, srv.id);
        if (local?._dirty) continue; // local edit wins; it will be pushed next
        await db.putClean(table, { ...srv, _rev: local?._rev || 0 });
      }
      if (rows.length) {
        cursor = rows[rows.length - 1].updated_at!;
        await db.setMeta(`cursor:${table}`, cursor);
      }
      if (rows.length < 500) break;
    }
  }
}

export async function syncNow() {
  if (!cloudConfigured || !session || state.running || !navigator.onLine) return;
  await emitSync({ running: true, error: undefined });
  try {
    await push();
    await pull();
    await emitSync({ running: false, lastAt: new Date().toISOString() });
    db.notify();
  } catch (e: any) {
    await emitSync({ running: false, error: e.message || String(e) });
  }
}

/** Fetch a synced photo from private storage when it is not on this phone. */
export async function fetchPhotoBlob(p: Photo): Promise<Blob | undefined> {
  if (!p.storage_path || !session) return undefined;
  const res = await api(`/storage/v1/object/authenticated/photos/${p.storage_path}`);
  const blob = await res.blob();
  await db.putBlob(p.id, blob);
  return blob;
}

/** Google Play requirement: delete the account and every cloud copy. */
export async function deleteAccount() {
  if (!session) return;
  const photos = (await db.all<Photo>('photos', true)).filter((p) => p.storage_path);
  if (photos.length) {
    await api('/storage/v1/object/photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: photos.map((p) => p.storage_path) }),
    }).catch(() => {});
  }
  await api('/rest/v1/rpc/delete_my_account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await setSession(null);
}

let timer: number | undefined;
export function startAutoSync() {
  const kick = () => {
    clearTimeout(timer);
    timer = window.setTimeout(syncNow, 1500);
  };
  // Only local edits trigger a sync; the refresh after a sync leaves nothing pending, so no loop.
  db.subscribe(() => {
    db.pendingCount().then((n) => n > 0 && kick());
  });
  onAuth((s) => s && kick());
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick());
  setInterval(syncNow, 5 * 60 * 1000);
  kick();
}
