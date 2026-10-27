// The Vault: optional end-to-end encryption for exact pins, landowner details and money.
//
// A random data key encrypts the covered fields with AES-GCM before they leave the phone. The data
// key is stored on the server only wrapped (encrypted) by a key derived from the beekeeper's
// passphrase with PBKDF2, so another phone can unlock it, and nobody else can, including us.
// Records stay readable on this phone; search and sorting work as before. A forgotten passphrase
// cannot be recovered.
import * as db from './db';
import type { Base, Profile, Table } from './db';

export type VaultTable = Table | 'apiary_locations';

/** Which fields the Vault covers, and what the server keeps in their place. */
export const VAULT: Partial<Record<VaultTable, { fields: string[]; placeholder?: Record<string, unknown> }>> = {
  apiary_locations: { fields: ['lat', 'lng'] },
  traps: { fields: ['lat', 'lng', 'location_note'] },
  agreements: { fields: ['landowner', 'phone', 'email', 'terms', 'notes'], placeholder: { landowner: '🔒' } },
  site_events: { fields: ['person', 'body'] },
  contracts: { fields: ['grower', 'farm', 'contact', 'fee_per_hive', 'spray_notes', 'notes'], placeholder: { grower: '🔒', fee_per_hive: 0 } },
  jobs: { fields: ['client_name', 'client_phone', 'area', 'fee', 'notes'], placeholder: { client_name: '🔒' } },
  moves: { fields: ['cost_per_km', 'other_costs', 'notes'] },
  profiles: { fields: ['invoice_details'] },
};
export const isCovered = (t: VaultTable) => !!VAULT[t];

export interface VaultParams {
  v: 1;
  kid: string; // identifies the data key, so a stale key is noticed
  salt: string;
  iter: number;
  iv: string;
  wrapped: string; // the data key, encrypted with the passphrase key
  at: string;
}

const ITERATIONS = 600_000; // PBKDF2-HMAC-SHA256, the OWASP figure for 2023 onwards
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s: string): Bytes => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
type Bytes = Uint8Array<ArrayBuffer>;
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

async function passphraseKey(passphrase: string, salt: Bytes, iter: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------------- state on this phone ----------------
interface LocalKey { kid: string; key: CryptoKey }
let cached: LocalKey | null | undefined;

async function localKey(): Promise<LocalKey | null> {
  if (cached === undefined) cached = (await db.getMeta<LocalKey>('vault:key')) || null;
  return cached;
}
async function storeKey(k: LocalKey | null) {
  cached = k;
  if (k) await db.setMeta('vault:key', k); // a non-extractable CryptoKey: the browser keeps the bytes
  else await db.delMeta('vault:key');
}

async function profile() {
  return (await db.all<Profile>('profiles'))[0];
}
export async function vaultParams(): Promise<VaultParams | null> {
  return ((await profile()) as Profile & { vault?: VaultParams | null })?.vault || null;
}

export type VaultState = 'off' | 'locked' | 'open';
/** off: not in use. locked: in use, but this phone has no key yet. open: in use and usable here. */
export async function vaultState(): Promise<VaultState> {
  const p = await vaultParams();
  if (!p) return 'off';
  const k = await localKey();
  return k && k.kid === p.kid ? 'open' : 'locked';
}
export const useVaultState = () => db.useLive(vaultState);

async function openKey(): Promise<LocalKey | null> {
  const p = await vaultParams();
  const k = await localKey();
  return p && k && k.kid === p.kid ? k : null;
}

// ---------------- fields ----------------
const aad = (table: VaultTable, id: string) => enc.encode(`honeyguide:${table}:${id}`);

/** Encrypt a row's covered fields. Returns the payload changes: placeholders plus `enc`. */
export async function sealRow(table: VaultTable, id: string, rec: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const spec = VAULT[table];
  if (!spec) return null;
  const k = await openKey();
  if (!k) return null;
  const secret: Record<string, unknown> = {};
  for (const f of spec.fields) secret[f] = rec[f] ?? null;
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(table, id) }, k.key, enc.encode(JSON.stringify(secret)));
  const out: Record<string, unknown> = { enc: `v1.${k.kid}.${b64(iv)}.${b64(ct)}` };
  for (const f of spec.fields) out[f] = spec.placeholder && f in spec.placeholder ? spec.placeholder[f] : null;
  return out;
}

/** Decrypt `enc` into the covered fields. Null when this phone cannot (locked, or another key). */
export async function openRow(table: VaultTable, id: string, envelope: string): Promise<Record<string, unknown> | null> {
  const k = await openKey();
  const [v, kid, iv, ct] = envelope.split('.');
  if (v !== 'v1' || !k || kid !== k.kid) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: aad(table, id) }, k.key, unb64(ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null; // tampered with, or moved to another row
  }
}

// ---------------- turning it on, unlocking, changing, off ----------------
export class WrongPassphrase extends Error {
  constructor() { super('That passphrase is not right.'); }
}

async function wrapKey(raw: Bytes, passphrase: string, kid: string): Promise<VaultParams> {
  const salt = random(16);
  const iv = random(12);
  const kek = await passphraseKey(passphrase, salt, ITERATIONS);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`honeyguide:vault:${kid}`) }, kek, raw);
  return { v: 1, kid, salt: b64(salt), iter: ITERATIONS, iv: b64(iv), wrapped: b64(wrapped), at: new Date().toISOString() };
}

async function unwrapRaw(p: VaultParams, passphrase: string): Promise<Bytes> {
  const kek = await passphraseKey(passphrase, unb64(p.salt), p.iter);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv), additionalData: enc.encode(`honeyguide:vault:${p.kid}`) }, kek, unb64(p.wrapped)));
  } catch {
    throw new WrongPassphrase();
  }
}

const importData = (raw: Bytes) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

async function saveParams(vault: VaultParams | null) {
  const p = await profile();
  await db.save<Profile>('profiles', { ...(p || { id: db.uuid() }), vault } as Profile);
}

/** Exact pins travel with their apiary: send own precise apiaries again. */
async function resendPins() {
  const me = (await db.getMeta<{ user: { id: string } }>('session'))?.user.id;
  for (const a of await db.all<Base & { location_precision?: 'off' | 'approximate' | 'precise' }>('apiaries', true)) {
    if (db.hasExactPin(a as never) && (!a.owner_id || a.owner_id === me)) await db.putRaw('apiaries', { ...a, _dirty: 1, _rev: (a._rev || 0) + 1 } as Base);
  }
}

/** Mark every covered record for sending again, so the server copy is replaced. */
async function resendCovered() {
  for (const t of Object.keys(VAULT) as VaultTable[]) {
    if (t === 'apiary_locations') continue;
    for (const r of await db.all<Base & { _locked?: boolean }>(t as Table, true)) {
      if (!r._locked) await db.putRaw(t as Table, { ...r, _dirty: 1, _rev: (r._rev || 0) + 1 } as Base);
    }
  }
  await resendPins();
  db.notify();
}

export async function enableVault(passphrase: string) {
  if (passphrase.length < 10) throw new Error('Use at least 10 characters.');
  const raw = random(32);
  const kid = b64(random(8));
  const params = await wrapKey(raw, passphrase, kid);
  await storeKey({ kid, key: await importData(raw) });
  raw.fill(0);
  await saveParams(params);
  await resendCovered();
}

/** On another phone: the passphrase unlocks the key, then the locked records open. */
export async function unlockVault(passphrase: string) {
  const p = await vaultParams();
  if (!p) throw new Error('The Vault is not on.');
  const raw = await unwrapRaw(p, passphrase);
  await storeKey({ kid: p.kid, key: await importData(raw) });
  raw.fill(0);
  await openLocked();
  await resendPins(); // pins made here while locked have not gone up yet
  db.notify();
}

export async function changePassphrase(current: string, next: string) {
  if (next.length < 10) throw new Error('Use at least 10 characters.');
  const p = await vaultParams();
  if (!p) throw new Error('The Vault is not on.');
  const raw = await unwrapRaw(p, current);
  const params = await wrapKey(raw, next, p.kid);
  raw.fill(0);
  await saveParams(params);
}

/**
 * Lock the Vault on this phone: forget the key and replace covered details with placeholders.
 * The encrypted copies come back with the next sync and open again with the passphrase.
 */
export async function lockThisPhone() {
  const tables = (Object.keys(VAULT) as VaultTable[]).filter((t) => t !== 'apiary_locations') as Table[];
  for (const t of tables) {
    if ((await db.dirty(t)).length) throw new Error('Some changes have not been sent yet. Sync first, then lock.');
  }
  for (const t of tables) {
    const spec = VAULT[t]!;
    for (const r of await db.all<Base>(t, true)) {
      const blank: Record<string, unknown> = {};
      for (const f of spec.fields) blank[f] = spec.placeholder && f in spec.placeholder ? spec.placeholder[f] : null;
      await db.putRaw(t, { ...r, ...blank, _locked: true } as Base);
    }
    await db.delMeta(`cursor:${t}`);
  }
  const me = (await db.getMeta<{ user: { id: string } }>('session'))?.user.id;
  for (const a of await db.all<Base & { lat?: number | null; lng?: number | null; location_precision?: string }>('apiaries', true)) {
    if (a.location_precision === 'precise' && a.lat != null && a.lng != null && (!a.owner_id || a.owner_id === me) && !a._dirty) {
      await db.putRaw('apiaries', { ...a, lat: Math.round(a.lat * 100) / 100, lng: Math.round(a.lng * 100) / 100, _exact: 0 } as Base);
    }
  }
  await db.delMeta('cursor:apiary_locations');
  await storeKey(null);
  db.notify();
}

/** Turn the Vault off: records go back to the server readable, and the key is forgotten. */
export async function disableVault(passphrase: string) {
  const p = await vaultParams();
  if (!p) return;
  await unwrapRaw(p, passphrase); // proves it is the owner
  if (await anyLocked()) throw new Error('Some records are still locked on this phone. Unlock first.');
  await saveParams(null);
  await storeKey(null);
  await resendCovered();
}

// ---------------- records that arrived locked ----------------
export async function anyLocked() {
  for (const t of Object.keys(VAULT) as VaultTable[]) {
    if (t === 'apiary_locations') continue;
    if ((await db.all<Base & { _locked?: boolean }>(t as Table, true)).some((r) => r._locked)) return true;
  }
  return false;
}

/** After unlocking: decrypt rows that came from the server while this phone had no key. */
export async function openLocked() {
  for (const t of Object.keys(VAULT) as VaultTable[]) {
    if (t === 'apiary_locations') continue;
    for (const r of await db.all<Base & { _locked?: boolean; enc?: string | null }>(t as Table, true)) {
      if (!r._locked || !r.enc) continue;
      const plain = await openRow(t, r.id, r.enc);
      if (plain) await db.putRaw(t as Table, { ...r, ...plain, _locked: false } as Base);
    }
  }
  // Exact pins are fetched again with the next sync.
  await db.delMeta('cursor:apiary_locations');
  db.notify();
}
