// Domain knowledge and helpers for South African beekeeping.
import type { Inspection, Weather } from './db';

export const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
];

// Provinces where the African bee (A. m. scutellata) is the native bee.
// Cape bees moved here can cause the "capensis calamity" (laying-worker social parasitism).
export const SCUTELLATA_PROVINCES = ['Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West'];

export const HIVE_TYPES = ['Langstroth', 'Long Langstroth', 'Kenyan top-bar', 'Nucleus (nuc)', 'Swarm box', 'Other'];

export const SUBSPECIES = [
  { value: 'capensis', label: 'Cape bee', hint: 'A. m. capensis, south-western Cape' },
  { value: 'scutellata', label: 'African bee', hint: 'A. m. scutellata, north and east' },
  { value: 'unknown', label: 'Not sure', hint: 'Hybrid zone or unknown' },
];

export const HIVE_STATUS = [
  { value: 'active', label: 'Active', tone: 'good' },
  { value: 'weak', label: 'Weak', tone: 'warn' },
  { value: 'queenless', label: 'Queenless', tone: 'bad' },
  { value: 'swarmed', label: 'Swarmed', tone: 'warn' },
  { value: 'absconded', label: 'Absconded', tone: 'bad' },
  { value: 'dead', label: 'Dead out', tone: 'bad' },
  { value: 'empty', label: 'Empty box / bait hive', tone: 'muted' },
];

export const statusInfo = (v?: string) => HIVE_STATUS.find((s) => s.value === v) || HIVE_STATUS[0];

/** International queen-marking colours by the last digit of the year. */
export function queenColour(year?: number | null) {
  if (!year) return null;
  const d = year % 10;
  if (d === 0 || d === 5) return { name: 'Blue', hex: '#2F6FED' };
  if (d === 1 || d === 6) return { name: 'White', hex: '#F4F4F4' };
  if (d === 2 || d === 7) return { name: 'Yellow', hex: '#F5C518' };
  if (d === 3 || d === 8) return { name: 'Red', hex: '#D7263D' };
  return { name: 'Green', hex: '#2E9E5B' };
}

export const TEMPERAMENT = [
  { value: 'calm', label: 'Calm' },
  { value: 'nervous', label: 'Nervous' },
  { value: 'defensive', label: 'Defensive' },
];

export const QUEEN_SIGNS = [
  { value: 'queen_seen', label: 'Queen seen' },
  { value: 'eggs', label: 'Eggs seen' },
  { value: 'young_larvae', label: 'Young larvae' },
  { value: 'queen_cells', label: 'Swarm cells' },
  { value: 'supersedure', label: 'Supersedure cells' },
  { value: 'queenless', label: 'No queen signs' },
  { value: 'laying_workers', label: 'Laying workers' },
];

export const BROOD_PATTERN = [
  { value: 'solid', label: 'Solid' },
  { value: 'patchy', label: 'Patchy' },
  { value: 'none', label: 'No brood' },
];

export const SPACE = [
  { value: 'ok', label: 'Enough room' },
  { value: 'needs_super', label: 'Needs a super' },
  { value: 'crowded', label: 'Crowded, swarm risk' },
  { value: 'too_big', label: 'Too much space' },
];

export const PESTS = [
  { value: 'small_hive_beetle', label: 'Small hive beetle' },
  { value: 'varroa', label: 'Varroa' },
  { value: 'wax_moth', label: 'Wax moth' },
  { value: 'chalkbrood', label: 'Chalkbrood' },
  { value: 'ants', label: 'Ants' },
  { value: 'bee_pirate', label: 'Bee pirate wasp' },
  { value: 'honey_badger', label: 'Honey badger damage' },
];

export const ACTIONS = [
  { value: 'added_super', label: 'Added super' },
  { value: 'removed_super', label: 'Removed super' },
  { value: 'fed', label: 'Fed sugar syrup' },
  { value: 'split', label: 'Made a split' },
  { value: 'requeened', label: 'Requeened' },
  { value: 'reduced_entrance', label: 'Reduced entrance' },
  { value: 'cleaned_floor', label: 'Cleaned floor' },
  { value: 'harvested', label: 'Harvested' },
];

export const PHOTO_TAGS = ['General', 'Brood', 'Queen', 'Stores', 'Pest or disease', 'Site'];

/** Health score 0–100 from what was seen. A guide, not a diagnosis. */
export function healthScore(i: Partial<Inspection>): number {
  let s = 100;
  const q = i.queen_status || [];
  if (i.temperament === 'defensive') s -= 10;
  if (i.temperament === 'nervous') s -= 4;
  if (q.includes('laying_workers')) s -= 40;
  else if (q.includes('queenless')) s -= 30;
  else if (!q.includes('eggs') && !q.includes('queen_seen') && !q.includes('young_larvae')) s -= 10;
  if (q.includes('supersedure')) s -= 5;
  if (i.brood_pattern === 'patchy') s -= 12;
  if (i.brood_pattern === 'none') s -= 20;
  if ((i.honey_frames ?? 2) === 0) s -= 15;
  else if ((i.honey_frames ?? 2) === 1) s -= 6;
  if (i.space === 'crowded' || q.includes('queen_cells')) s -= 8;
  s -= (i.pests || []).length * 7;
  if (i.afb_suspect) s = Math.min(s, 20);
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function scoreTone(s?: number) {
  if (s == null) return 'muted';
  if (s >= 75) return 'good';
  if (s >= 50) return 'warn';
  return 'bad';
}

export function shortCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(4));
  return 'HG-' + Array.from(r, (b) => a[b % a.length]).join('');
}

// ---------------- dates ----------------
export function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function daysAgo(iso?: string) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
export function agoLabel(iso?: string) {
  const d = daysAgo(iso);
  if (d == null) return 'Never inspected';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

/** Southern-hemisphere season and what to focus on. Broad guide; local flows vary. */
export function seasonFocus(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 9 && m <= 11) return { season: 'Spring', tip: 'Build-up and swarm season. Check for swarm cells and add space before colonies get crowded.' };
  if (m === 12 || m <= 2) return { season: 'Summer', tip: 'Main flows in many areas. Keep supers on, watch for heat stress and make sure water is close by.' };
  if (m >= 3 && m <= 5) return { season: 'Autumn', tip: 'Check stores before the cold months and keep small hive beetle under control in weaker colonies.' };
  return { season: 'Winter', tip: 'Aloes and gums carry many colonies. Inspect less, on warm calm days, and check stores.' };
}

// ---------------- location ----------------
export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this phone.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}
/** Approximate rounds to 2 decimals, about 1 km, which is enough for weather and forage. */
export function roundCoord(v: number, precision: 'approximate' | 'precise') {
  const f = precision === 'approximate' ? 100 : 100000;
  return Math.round(v * f) / f;
}

// ---------------- weather (Open-Meteo, no key, approximate location only) ----------------
export async function fetchWeather(lat: number, lng: number): Promise<Weather | null> {
  try {
    const la = Math.round(lat * 100) / 100;
    const lo = Math.round(lng * 100) / 100;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,wind_speed_10m,precipitation,weather_code&timezone=auto`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const j = await res.json();
    const c = j.current || {};
    return { temp: c.temperature_2m, wind: c.wind_speed_10m, rain: c.precipitation, code: c.weather_code };
  } catch {
    return null;
  }
}
export function inspectionWeatherVerdict(w?: Weather | null) {
  if (!w || w.temp == null) return null;
  const issues: string[] = [];
  if (w.temp < 16) issues.push('cool');
  if ((w.wind ?? 0) > 25) issues.push('windy');
  if ((w.rain ?? 0) > 0.2 || (w.code ?? 0) >= 51) issues.push('wet');
  return issues.length
    ? { ok: false, text: `Not ideal: ${issues.join(', ')}. Keep it short or wait for a warm, calm, dry spell.` }
    : { ok: true, text: 'Good conditions for an inspection.' };
}

// ---------------- photos ----------------
/** Re-encode on the phone: max 1600 px, JPEG. Re-encoding drops EXIF, including any GPS tag. */
export async function processPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process photo'))), 'image/jpeg', 0.82));
  return { blob, width: w, height: h };
}

// ---------------- app lock ----------------
const enc = new TextEncoder();
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// ---------------- small storage helpers (per-device settings) ----------------
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable; settings then last for this session only */
  }
}
