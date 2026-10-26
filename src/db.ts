// Tiny IndexedDB layer. Every record lives on the phone first; sync is a background extra.
import { useEffect, useState } from 'react';

export type Table = 'profiles' | 'apiaries' | 'hives' | 'inspections' | 'photos';
export const TABLES: Table[] = ['profiles', 'apiaries', 'hives', 'inspections', 'photos'];

export interface Base {
  id: string;
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

export interface Photo extends Base {
  hive_id?: string;
  inspection_id?: string | null;
  tag?: string;
  storage_path?: string | null;
  width?: number;
  height?: number;
  taken_at?: string;
}

const DB_NAME = 'honeyguide';
const DB_VERSION = 1;
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

export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of TABLES) n += await wrap((await store(t)).index('_dirty').count(1));
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
