// Per-phone settings. Theme and lock live on the device and are never synced.
import { useEffect, useState } from 'react';
import { lsGet, lsSet } from './lib';

export type Theme = 'light' | 'dark' | 'sun' | 'night' | 'system';
export interface Settings {
  theme: Theme;
  locationMode: 'off' | 'approximate' | 'precise';
  onboarded: boolean;
  lock?: { salt: string; hash: string; afterMinutes: number } | null;
  weather: boolean;
}

const DEFAULTS: Settings = { theme: 'system', locationMode: 'approximate', onboarded: false, lock: null, weather: true };
let current: Settings = { ...DEFAULTS, ...lsGet<Partial<Settings>>('hg:settings', {}) };
const subs = new Set<(s: Settings) => void>();

export function getSettings() {
  return current;
}
export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  lsSet('hg:settings', current);
  applyTheme();
  subs.forEach((f) => f(current));
}
export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => {
    subs.add(setS);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

const THEME_COLOUR: Record<string, string> = { light: '#FFF8EA', dark: '#15130F', sun: '#FFFFFF', night: '#000000' };
export function resolvedTheme() {
  if (current.theme !== 'system') return current.theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOUR[t]);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
