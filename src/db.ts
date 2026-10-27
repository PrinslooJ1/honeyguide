// Tiny IndexedDB layer. Every record lives on the phone first; sync is a background extra.
import { useEffect, useState } from 'react';

export type Table = 'profiles' | 'apiaries' | 'hives' | 'inspections' | 'photos' | 'blooms' | 'traps' | 'weights'
  | 'moves' | 'contracts' | 'batches' | 'harvests' | 'jobs' | 'incidents' | 'comments' | 'agreements' | 'site_events' | 'equipment';
export const TABLES: Table[] = ['profiles', 'apiaries', 'hives', 'inspections', 'photos', 'blooms', 'traps', 'weights',
  'moves', 'contracts', 'batches', 'harvests', 'jobs', 'incidents', 'comments', 'agreements', 'site_events', 'equipment'];

export interface Base {
  id: string;
  owner_id?: string; // set by the server; absent on records not yet synced (those are always yours)
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  _dirty?: 0 | 1; // 1 = changed on this phone, not yet synced
  _rev?: number; // local edit counter, guards against overwriting edits made during a sync
}

export interface Profile extends Base {
  display_name?: string;
  province?: string;
  registration_number?: string;
  invoice_details?: string; // shown on invoices: trading name, address, phone, payment details
  public_contact?: string; // optional, shown on public honey passports
}

export interface Apiary extends Base {
  name: string;
  province?: string;
  lat?: number | null;
  lng?: number | null;
  location_precision?: 'off' | 'approximate' | 'precise';
  landowner?: string;
  permission_notes?: string;
  forage_notes?: string;
  access_notes?: string;
  forage_plants?: string[]; // plant ids from the forage library seen near this apiary
}

export interface Hive extends Base {
  apiary_id: string;
  name: string;
  code?: string;
  hive_type?: string;
  subspecies?: string;
  queen_year?: number | null;
  queen_marked?: boolean;
  status?: string;
  notes?: string;
  loss_cause?: string | null; // colony autopsy, when dead or absconded
  lost_at?: string | null;
}

export interface Weather {
  temp?: number;
  wind?: number;
  rain?: number;
  code?: number;
}

export interface Inspection extends Base {
  hive_id: string;
  inspected_at: string;
  temperament?: string;
  queen_status?: string[];
  brood_frames?: number;
  brood_pattern?: string;
  honey_frames?: number;
  pollen_frames?: number;
  space?: string;
  pests?: string[];
  afb_suspect?: boolean;
  actions?: string[];
  notes?: string;
  score?: number;
  weather?: Weather | null;
}

/** Swarm trap (bait box). Its location note and pin are private like an apiary's. */
export interface Trap extends Base {
  name: string;
  apiary_id?: string | null;
  location_note?: string;
  lat?: number | null;
  lng?: number | null;
  lure?: string;
  placed_at: string;
  check_every_days: number;
  last_checked_at?: string | null;
  status: 'set' | 'occupied' | 'collected' | 'removed';
  caught_at?: string | null;
  hive_id?: string | null;
  notes?: string;
}

/** Weekly weight from a hive scale, or a lift test when there is no scale. */
export interface Weight extends Base {
  hive_id: string;
  weighed_at: string;
  kg?: number | null;
  lift?: 'light' | 'medium' | 'heavy' | null;
  notes?: string;
}

/** A planned or completed move of hives between apiaries (also the movement record). */
export interface Move extends Base {
  from_apiary_id: string;
  to_apiary_id: string;
  hive_ids: string[];
  planned_for: string; // yyyy-mm-dd
  status: 'planned' | 'done' | 'cancelled';
  moved_at?: string | null;
  distance_km?: number | null;
  cost_per_km?: number | null;
  other_costs?: number | null;
  checklist?: string[];
  notes?: string;
}

export type ContractStatus = 'draft' | 'agreed' | 'placed' | 'completed' | 'invoiced' | 'paid';
/** Pollination contract. Private to the owner. */
export interface Contract extends Base {
  grower: string;
  farm?: string;
  contact?: string;
  crop: string;
  hives: number;
  fee_per_hive: number;
  starts_on?: string | null;
  ends_on?: string | null;
  apiary_id?: string | null;
  spray_agreed?: boolean;
  spray_notes?: string;
  status: ContractStatus;
  invoice_no?: string | null;
  invoiced_at?: string | null;
  paid_at?: string | null;
  notes?: string;
}

/** A jar batch. Public honey passport only when the owner switches it on; never GPS. */
export interface Batch extends Base {
  code: string; // HB-XXXX, printed as a QR on the jar label
  name: string;
  forage?: string;
  province?: string;
  harvest_month?: string | null; // yyyy-mm-01
  jars?: number | null;
  jar_size_g?: number | null;
  public?: boolean;
  show_reg?: boolean;
  show_contact?: boolean;
  notes?: string;
}

export interface Harvest extends Base {
  hive_id: string;
  harvested_at: string;
  kg: number;
  frames?: number | null;
  forage?: string;
  moisture?: number | null;
  batch_id?: string | null;
  notes?: string;
}

export type JobOutcome = 'removed_live' | 'relocated' | 'not_bees' | 'no_access' | 'referred' | 'other';
/** Bee-removal callout. Client details are private to the owner. */
export interface Job extends Base {
  client_name: string;
  client_phone?: string;
  area?: string;
  requested_at: string;
  done_at?: string | null;
  outcome?: JobOutcome | null;
  fee?: number | null;
  paid?: boolean;
  invoice_no?: string | null;
  hive_id?: string | null; // when a removed colony became one of your hives
  notes?: string;
}

export type IncidentKind = 'theft' | 'vandalism' | 'fire' | 'flood' | 'honey_badger' | 'other';
export interface Incident extends Base {
  kind: IncidentKind;
  occurred_at: string;
  apiary_id?: string | null;
  hive_ids?: string[];
  description?: string;
  saps_case_no?: string;
  reported_at?: string | null;
  notes?: string;
}

/** Bloom Watch: "in bloom here now". Holds the apiary (if any), never a fresh GPS point. */
export interface Bloom extends Base {
  plant_id: string;
  apiary_id?: string | null;
  province?: string;
  seen_at: string;
  note?: string;
}

/** A note from a mentor, partner or yourself on a hive, optionally about one inspection. */
export interface HiveComment extends Base {
  hive_id: string;
  inspection_id?: string | null;
  author_name?: string;
  body: string;
}

export type AgreementKind = 'verbal' | 'written' | 'lease' | 'pollination' | 'other';
/** Landowner permission for an apiary site. Private to the owner. */
export interface Agreement extends Base {
  apiary_id?: string | null;
  landowner: string;
  phone?: string;
  email?: string;
  kind: AgreementKind;
  starts_on?: string | null; // yyyy-mm-dd
  expires_on?: string | null;
  remind_days: number;
  terms?: string;
  notes?: string;
  status: 'active' | 'ended';
}

export type SiteEventKind = 'complaint' | 'visit' | 'payment' | 'renewal' | 'note';
/** Something that happened at a site: a neighbour's complaint, a visit, a payment in honey. */
export interface SiteEvent extends Base {
  agreement_id?: string | null;
  apiary_id?: string | null;
  happened_at: string;
  kind: SiteEventKind;
  person?: string;
  body?: string;
  resolved?: boolean;
}

export type EquipmentKind = 'brood_box' | 'super' | 'frames' | 'floor' | 'lid' | 'excluder' | 'feeder' | 'nuc_box' | 'smoker' | 'hive_tool' | 'suit' | 'extractor' | 'other';
export interface CleaningEntry { at: string; method: string; note?: string }
/** Boxes, frames and tools, with cleaning dates. Kit from a dead-out waits in quarantine until cleaned. */
export interface Equipment extends Base {
  name: string;
  kind: EquipmentKind;
  qty: number;
  status: 'in_use' | 'stored' | 'quarantine' | 'retired';
  hive_id?: string | null;
  source_hive_id?: string | null;
  last_cleaned_at?: string | null;
  clean_method?: string | null;
  history?: CleaningEntry[];
  notes?: string;
}

export interface Photo extends Base {
  hive_id?: string | null;
  inspection_id?: string | null;
  job_id?: string | null;
  incident_id?: string | null;
  tag?: string;
  storage_path?: string | null;
  width?: number;
  height?: number;
  taken_at?: string;
}

const DB_NAME = 'honeyguide';
const DB_VERSION = 5;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLES) {
        if (!db.objectStoreNames.contains(t)) {
          const s = db.createObjectStore(t, { keyPath: 'id' });
          s.createIndex('_dirty', '_dirty');
          if (t === 'hives') s.createIndex('apiary_id', 'apiary_id');
          if (t === 'inspections' || t === 'photos') s.createIndex('hive_id', 'hive_id');
          if (t === 'blooms') s.createIndex('plant_id', 'plant_id');
          if (t === 'weights' || t === 'harvests' || t === 'comments') s.createIndex('hive_id', 'hive_id');
          if (t === 'site_events') s.createIndex('agreement_id', 'agreement_id');
        }
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: string, mode: IDBTransactionMode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

// --- change notifications, so screens refresh when data changes ---
const listeners = new Set<() => void>();
export function notify() {
  listeners.forEach((l) => l());
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true;
    const run = () => query().then((v) => alive && setValue(v)).catch(console.error);
    run();
    const off = subscribe(run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

// --- records ---
export function uuid(): string {
  return crypto.randomUUID();
}

export async function all<T extends Base>(table: Table, includeDeleted = false): Promise<T[]> {
  const rows = (await wrap((await store(table)).getAll())) as T[];
  return includeDeleted ? rows : rows.filter((r) => !r.deleted);
}

export async function get<T extends Base>(table: Table, id: string): Promise<T | undefined> {
  const r = (await wrap((await store(table)).get(id))) as T | undefined;
  return r && !r.deleted ? r : undefined;
}

export async function byIndex<T extends Base>(table: Table, index: string, value: IDBValidKey): Promise<T[]> {
  const rows = (await wrap((await store(table)).index(index).getAll(value))) as T[];
  return rows.filter((r) => !r.deleted);
}

/** Save a record made or changed on this phone. Marks it for sync. */
export async function save<T extends Base>(table: Table, rec: T): Promise<T> {
  const s = await store(table, 'readwrite');
  const prev = (await wrap(s.get(rec.id))) as T | undefined;
  const now = new Date().toISOString();
  const next = {
    ...prev,
    ...rec,
    created_at: prev?.created_at || rec.created_at || now,
    updated_at: now,
    _dirty: 1 as const,
    _rev: (prev?._rev || 0) + 1,
  };
  const s2 = await store(table, 'readwrite');
  await wrap(s2.put(next));
  notify();
  return next;
}

/** Soft delete, so the deletion also reaches the cloud copy. */
export async function remove(table: Table, id: string) {
  const s = await store(table);
  const prev = (await wrap(s.get(id))) as Base | undefined;
  if (!prev) return;
  await save(table, { ...prev, deleted: true });
}

/** Remove a record from this phone only (lost access, or a record the server refused). Nothing is synced. */
export async function purge(table: Table, id: string) {
  await wrap((await store(table, 'readwrite')).delete(id));
}

/** Write a record exactly as given, flags included. */
export async function putRaw(table: Table, rec: Base) {
  await wrap((await store(table, 'readwrite')).put(rec));
}

/** Write a record that came from the server (no dirty flag). */
export async function putClean(table: Table, rec: Base) {
  const s = await store(table, 'readwrite');
  await wrap(s.put({ ...rec, _dirty: 0 }));
}

export async function getRaw(table: Table, id: string): Promise<Base | undefined> {
  return (await wrap((await store(table)).get(id))) as Base | undefined;
}

export async function dirty(table: Table): Promise<Base[]> {
  return (await wrap((await store(table)).index('_dirty').getAll(1))) as Base[];
}

/** Changes waiting to go, not counting ones the server turned away (those wait for the user). */
export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of TABLES) n += (await dirty(t)).filter((r) => !(r as { _refused?: string })._refused).length;
  return n;
}

// --- photo blobs, kept separately from the row ---
export async function putBlob(id: string, blob: Blob) {
  await wrap((await store('blobs', 'readwrite')).put(blob, id));
  notify();
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await wrap((await store('blobs')).get(id))) as Blob | undefined;
}

// --- key/value meta (session, sync cursors) ---
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await wrap((await store('meta')).get(key))) as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await wrap((await store('meta', 'readwrite')).put(value, key));
}
export async function delMeta(key: string) {
  await wrap((await store('meta', 'readwrite')).delete(key));
}

export async function exportAll() {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await all(t);
  return { app: 'Honeyguide', exported_at: new Date().toISOString(), ...out };
}

export async function wipeLocal() {
  const db = await open();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
  notify();
}
