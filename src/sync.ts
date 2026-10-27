// Supabase over plain fetch: email sign-in, row sync, private photo storage.
// The app works fully without an account; signing in adds backup and multi-device.
import * as db from './db';
import type { Apiary, Base, Photo, Table } from './db';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { purgeLostAccess, purgeOthers, refreshShare } from './share';
import { VAULT, isCovered, openRow, sealRow, vaultState, type VaultState } from './vault';

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
  comments: ['id', 'hive_id', 'inspection_id', 'author_name', 'body', 'created_at', 'deleted'],
  agreements: ['id', 'apiary_id', 'landowner', 'phone', 'email', 'kind', 'starts_on', 'expires_on', 'remind_days', 'terms', 'notes', 'status', 'created_at', 'deleted'],
  site_events: ['id', 'agreement_id', 'apiary_id', 'happened_at', 'kind', 'person', 'body', 'resolved', 'created_at', 'deleted'],
  equipment: ['id', 'name', 'kind', 'qty', 'status', 'hive_id', 'source_hive_id', 'last_cleaned_at', 'clean_method', 'history', 'notes', 'created_at', 'deleted'],
};
// Parents before children, so foreign keys hold.
const PUSH_ORDER: Table[] = ['profiles', 'apiaries', 'hives', 'inspections', 'comments', 'jobs', 'incidents', 'photos', 'blooms', 'traps', 'weights',
  'moves', 'contracts', 'batches', 'harvests', 'agreements', 'site_events', 'equipment'];

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
  await purgeOthers(session?.user.id).catch(console.error);
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

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    let body: { code?: string; message?: string } = {};
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    // The message keeps the status and code (sync matches on them); userMessage is for people.
    throw Object.assign(new Error(`${res.status} ${body.code || ''} ${body.message || text.slice(0, 200)}`), {
      status: res.status, code: body.code, userMessage: body.message || `Request failed (${res.status})`,
    });
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

async function pick(table: Table, rec: Base, vault: VaultState) {
  const out: Record<string, unknown> = {};
  for (const c of COLUMNS[table]) out[c] = (rec as any)[c] ?? null;
  if (out.deleted === null) out.deleted = false;
  // The apiary row is what group members see: it carries the point rounded to about 1 km.
  // An exact pin goes to apiary_locations, which only the owner (and members they allow) can read.
  if (table === 'apiaries' && typeof out.lat === 'number' && typeof out.lng === 'number') {
    out.lat = round2(out.lat as number);
    out.lng = round2(out.lng as number);
  }
  if (table === 'profiles' && 'vault' in rec) out.vault = (rec as any).vault ?? null;
  // Vault: covered fields leave the phone encrypted; the server keeps placeholders.
  if (isCovered(table)) {
    if (vault === 'open') Object.assign(out, await sealRow(table, rec.id, rec as any));
    else if ((rec as any)._sealed) out.enc = null; // the Vault was turned off: drop the old ciphertext
  }
  return out;
}

/** PostgREST wants the same keys in every object of a batch. Only enc and vault vary. */
function sameKeys(rows: Record<string, unknown>[]) {
  for (const k of ['enc', 'vault']) {
    if (rows.some((r) => k in r)) for (const r of rows) if (!(k in r)) r[k] = null;
  }
  return rows;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

// The server refused a row (row-level security or an owner-only rule): retrying will not help.
const refused = (e: unknown) => /42501|row-level security|P0001|owner_id cannot be changed|Only the owner/.test(String((e as Error)?.message));
// The table is not on the server yet (the app is newer than the database): skip it for now.
const missingTable = (e: unknown) => /42P01|PGRST20[0-9]|Could not find the table|does not exist/.test(String((e as Error)?.message));

async function upsert(table: Table, rows: Base[], vault: VaultState): Promise<Base[]> {
  const body = sameKeys(await Promise.all(rows.map((r) => pick(table, r, vault))));
  const res = await api(`/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Learn from the server whether the Vault is on before sending anything it covers. Another phone
 * may have turned it on, and covered fields must never go up readable while it is.
 */
async function refreshVaultParams() {
  try {
    const rows: { id: string; vault?: unknown }[] = await (await api('/rest/v1/profiles?select=id,vault')).json();
    const server = rows.find((r) => r.vault)?.vault || null;
    const local = (await db.all<Base & { vault?: unknown }>('profiles'))[0];
    if (!local) return;
    if (local._dirty && 'vault' in local) return; // this phone just changed it; it goes up now
    if (JSON.stringify(local.vault ?? null) !== JSON.stringify(server)) await db.putRaw('profiles', { ...local, vault: server } as Base);
  } catch (e) {
    if (!missingTable(e)) throw e; // no vault column yet: the Vault cannot be on
  }
}

const mine = (r: Base) => !r.owner_id || r.owner_id === session?.user.id;

/** Exact pins for apiaries this user owns. With the Vault on, the pin goes up encrypted. */
async function pushLocations(sent: Apiary[], vault: VaultState) {
  for (const a of sent) {
    if (!mine(a)) continue;
    const local = (await db.getRaw('apiaries', a.id)) as (Apiary & { _loc?: number; _locSealed?: number }) | undefined;
    if (a.location_precision === 'precise' && !a.deleted && !db.hasExactPin(a)) continue; // only the rounded point here
    const exact = !a.deleted && db.hasExactPin(a);
    if (exact) {
      if (vault === 'locked') continue; // cannot seal it here yet; it goes once the Vault is unlocked
      const body: Record<string, unknown> = vault === 'open'
        ? { apiary_id: a.id, ...(await sealRow('apiary_locations', a.id, { lat: a.lat, lng: a.lng })) }
        : { apiary_id: a.id, lat: a.lat, lng: a.lng, ...(local?._locSealed ? { enc: null } : {}) };
      await api('/rest/v1/apiary_locations?on_conflict=apiary_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(body),
      });
      if (local) await db.putRaw('apiaries', { ...local, _loc: 1, _locSealed: vault === 'open' ? 1 : 0 } as Base);
    } else if (local?._loc) {
      await api(`/rest/v1/apiary_locations?apiary_id=eq.${a.id}`, { method: 'DELETE' });
      await db.putRaw('apiaries', { ...local, _loc: 0 } as Base);
    }
  }
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
  await refreshVaultParams();
  for (const table of PUSH_ORDER) {
    const vault = await vaultState();
    // Vault on but this phone has no key yet: covered records wait rather than go up readable.
    if (isCovered(table) && vault === 'locked') continue;
    // Rows the server turned away wait until the user retries or discards them; locked rows hold placeholders.
    let rows = (await db.dirty(table)).filter((r) => !(r as { _refused?: string })._refused && !(r as { _locked?: boolean })._locked);
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
      let saved: Base[] = [];
      const turnedAway: { row: Base; reason: string }[] = [];
      try {
        saved = await upsert(table, batch, vault);
      } catch (e) {
        if (missingTable(e)) break; // keep the rows; they go once the database is updated
        if (!refused(e)) throw e;
        // One bad row should not hold back the rest: send them one at a time.
        for (const r of batch) {
          try {
            saved.push(...(await upsert(table, [r], vault)));
          } catch (e2) {
            if (!refused(e2)) throw e2;
            turnedAway.push({ row: r, reason: refusalText(e2) });
          }
        }
      }
      for (const srv of saved) {
        const sent = batch.find((b) => b.id === srv.id)!;
        const local = await db.getRaw(table, srv.id);
        // Only mark clean if nobody edited the record while it was in flight.
        if (local && local._rev === sent._rev) {
          const merged: any = { ...local, ...srv, _rev: local._rev };
          if (table === 'apiaries') { merged.lat = (local as Apiary).lat; merged.lng = (local as Apiary).lng; } // keep the exact pin on the phone
          if (isCovered(table)) {
            // The server echoes placeholders; this phone keeps the real values.
            for (const f of VAULT[table]!.fields) merged[f] = (local as any)[f];
            merged._sealed = (srv as any).enc ? 1 : 0;
            merged._locked = false;
            delete merged.enc;
          }
          await db.putClean(table, merged);
        }
      }
      if (table === 'apiaries') await pushLocations(batch.filter((b) => saved.some((s) => s.id === b.id)) as Apiary[], vault);
      // Never drop the user's work: keep refused rows on the phone, flagged, for them to decide.
      for (const t of turnedAway) {
        const local = await db.getRaw(table, t.row.id);
        if (local) await db.putRaw(table, { ...local, _refused: t.reason } as Base);
      }
      if (turnedAway.length) db.notify();
    }
  }
}

function refusalText(e: unknown) {
  const m = String((e as Error)?.message);
  if (/Only the owner/.test(m)) return 'Only the owner can delete this record.';
  if (/owner_id/.test(m)) return 'Records cannot be handed to someone else.';
  return 'Your role does not allow this change, or your access has ended.';
}

async function pull() {
  for (const table of PUSH_ORDER) {
    let cursor = (await db.getMeta<string>(`cursor:${table}`)) || '1970-01-01T00:00:00Z';
    try {
      for (;;) {
        const res = await api(`/rest/v1/${table}?select=*&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc&limit=500`);
        const rows: Base[] = await res.json();
        for (const srv of rows) {
          const local = await db.getRaw(table, srv.id);
          if (local?._dirty) continue; // local edit wins; it will be pushed next
          const next: any = { ...srv, _rev: local?._rev || 0 };
          if (table === 'apiaries') {
            const l = local as (Apiary & { _loc?: number }) | undefined;
            const a = srv as Apiary;
            // The server row holds the rounded point; keep this phone's exact pin if it still matches.
            if (l && db.hasExactPin(l) && a.lat === round2(l.lat!) && a.lng === round2(l.lng!)) {
              next.lat = l.lat; next.lng = l.lng; next.location_precision = 'precise'; next._exact = 1;
            } else {
              next._exact = 0; // only the rounded point, until an exact pin arrives from apiary_locations
              if (a.location_precision === 'precise' && !mine(a)) next.location_precision = 'approximate';
            }
            next._loc = l?._loc;
            next._locSealed = (l as any)?._locSealed;
          }
          if (isCovered(table)) {
            const envelope = (srv as any).enc as string | null | undefined;
            if (envelope) {
              const plain = await openRow(table, srv.id, envelope);
              if (plain) { Object.assign(next, plain); next._locked = false; delete next.enc; }
              else next._locked = true; // keep enc until the Vault is unlocked on this phone
              next._sealed = 1;
            } else {
              next._sealed = 0;
              next._locked = false;
              delete next.enc;
            }
          }
          await db.putClean(table, next);
        }
        if (rows.length) {
          cursor = rows[rows.length - 1].updated_at!;
          await db.setMeta(`cursor:${table}`, cursor);
        }
        if (rows.length < 500) break;
      }
    } catch (e) {
      if (!missingTable(e)) throw e;
    }
  }
  await pullLocations();
}

/** Exact pins: the owner's own (from another phone), or a partner's when the owner allowed it. */
async function pullLocations() {
  const cursor = (await db.getMeta<string>('cursor:apiary_locations')) || '1970-01-01T00:00:00Z';
  const res = await api(`/rest/v1/apiary_locations?select=*&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc`);
  const rows: { apiary_id: string; lat: number | null; lng: number | null; enc?: string | null; updated_at: string }[] = await res.json();
  for (const r of rows) {
    const local = (await db.getRaw('apiaries', r.apiary_id)) as Apiary | undefined;
    if (!local || local._dirty) continue;
    let { lat, lng } = r;
    if (r.enc) {
      const plain = await openRow('apiary_locations', r.apiary_id, r.enc);
      if (!plain) continue; // in a Vault this phone cannot open: keep the rounded point
      lat = plain.lat as number;
      lng = plain.lng as number;
    }
    if (lat == null || lng == null) continue;
    await db.putClean('apiaries', { ...local, lat, lng, location_precision: 'precise', _exact: 1, _loc: mine(local) ? 1 : 0, _locSealed: r.enc ? 1 : 0 } as Base);
  }
  if (rows.length) await db.setMeta('cursor:apiary_locations', rows[rows.length - 1].updated_at);
}

/** fresh: also reload group membership now (a person pressed Sync), instead of at most once a minute. */
export async function syncNow(opts: { fresh?: boolean } = {}) {
  if (!cloudConfigured || !session || state.running || !navigator.onLine) return;
  await emitSync({ running: true, error: undefined });
  try {
    // Group membership first: it decides what this phone may hold and whether to pull from scratch.
    const share = await refreshShare(opts.fresh ? 0 : 60_000).catch((e) => (console.warn('Sharing not refreshed', e), null));
    await push();
    await pull();
    if (share) await purgeLostAccess(share);
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
