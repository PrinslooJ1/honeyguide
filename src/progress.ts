// Ranks, XP, quests and the weekly logbook rhythm. Rules from the plan:
// reward calm timing and good records, never frequent hive-opening; no streaks, no countdowns.
import { useEffect, useState } from 'react';
import * as db from './db';
import type { Apiary, Bloom, Hive, Inspection, Profile } from './db';
import { LESSONS } from './content/lessons';
import { getPlant } from './content/forage';
import { inspectionWeatherVerdict, lsGet, lsSet } from './lib';

export interface Progress {
  lessons: Record<string, { done: boolean; best: number; at: string }>;
  labelsPrintedAt?: string;
  games: { flowerBest?: number; doctorBest?: number; waggleTried?: boolean };
}
const KEY = 'hg:progress';
let current: Progress = { lessons: {}, games: {}, ...lsGet<Partial<Progress>>(KEY, {}) };
const subs = new Set<(p: Progress) => void>();
export function getProgress() {
  return current;
}
export function updateProgress(fn: (p: Progress) => Progress) {
  current = fn(current);
  lsSet(KEY, current);
  subs.forEach((f) => f(current));
  db.notify();
}
export function useProgress() {
  const [p, setP] = useState(current);
  useEffect(() => {
    subs.add(setP);
    return () => {
      subs.delete(setP);
    };
  }, []);
  return p;
}

export const RANKS = [
  { name: 'Fledgling', xp: 0 },
  { name: 'Forager', xp: 150 },
  { name: 'Builder', xp: 500 },
  { name: 'Keeper', xp: 1200 },
  { name: 'Honeyguide', xp: 2500 },
];

export interface XpLine {
  label: string;
  xp: number;
}
export interface Quest {
  id: string;
  title: string;
  text: string;
  done: number;
  of: number;
  seasonal?: string;
}

const DAY = 86400000;
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t.getTime() - y.getTime()) / DAY + 1) / 7)}`;
}

/** Start of the current southern-hemisphere season. */
export function seasonStart(now = new Date()) {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m >= 9 && m <= 11) return { name: 'Spring', start: new Date(y, 8, 1) };
  if (m === 12) return { name: 'Summer', start: new Date(y, 11, 1) };
  if (m <= 2) return { name: 'Summer', start: new Date(y - 1, 11, 1) };
  if (m <= 5) return { name: 'Autumn', start: new Date(y, 2, 1) };
  return { name: 'Winter', start: new Date(y, 5, 1) };
}

export interface Snapshot {
  xp: number;
  lines: XpLine[];
  rank: (typeof RANKS)[number];
  next?: (typeof RANKS)[number];
  quests: Quest[];
  rhythm: boolean[]; // last 8 weeks, oldest first: did you keep the logbook?
}

export async function snapshot(now = new Date()): Promise<Snapshot> {
  const p = getProgress();
  const [apiaries, hives, inspections, blooms, profiles] = await Promise.all([
    db.all<Apiary>('apiaries'), db.all<Hive>('hives'), db.all<Inspection>('inspections'), db.all<Bloom>('blooms'), db.all<Profile>('profiles'),
  ]);
  const liveApiaries = new Set(apiaries.map((a) => a.id));
  const liveHives = hives.filter((h) => liveApiaries.has(h.apiary_id) && !['dead', 'absconded', 'empty'].includes(h.status || 'active'));
  const lines: XpLine[] = [];

  // Lessons
  const doneLessons = LESSONS.filter((l) => p.lessons[l.id]?.done);
  const perfect = LESSONS.filter((l) => p.lessons[l.id]?.best === l.quiz.length);
  if (doneLessons.length) lines.push({ label: `${doneLessons.length} lesson${doneLessons.length > 1 ? 's' : ''} completed`, xp: doneLessons.length * 50 });
  if (perfect.length) lines.push({ label: `${perfect.length} perfect quiz${perfect.length > 1 ? 'zes' : ''}`, xp: perfect.length * 25 });

  // Inspections: XP only when at least 7 days after the previous one on that hive.
  let counted = 0, calm = 0, noted = 0;
  const byHive = new Map<string, Inspection[]>();
  inspections.forEach((i) => byHive.set(i.hive_id, [...(byHive.get(i.hive_id) || []), i]));
  byHive.forEach((list) => {
    list.sort((a, b) => a.inspected_at.localeCompare(b.inspected_at));
    let lastCounted = 0;
    for (const i of list) {
      const t = new Date(i.inspected_at).getTime();
      if (t - lastCounted < 7 * DAY) continue;
      lastCounted = t;
      counted++;
      if (inspectionWeatherVerdict(i.weather)?.ok) calm++;
      if ((i.notes || '').trim().length >= 10) noted++;
    }
  });
  if (counted) lines.push({ label: `${counted} well-spaced inspection${counted > 1 ? 's' : ''}`, xp: counted * 10 });
  if (calm) lines.push({ label: `${calm} in good weather`, xp: calm * 10 });
  if (noted) lines.push({ label: `${noted} with useful notes`, xp: noted * 5 });

  // Bloom Watch: one per plant per week counts.
  const bloomKeys = new Set(blooms.map((b) => `${b.plant_id}:${isoWeek(new Date(b.seen_at))}`));
  if (bloomKeys.size) lines.push({ label: `${bloomKeys.size} bloom sighting${bloomKeys.size > 1 ? 's' : ''}`, xp: bloomKeys.size * 15 });

  // Records and games
  const reg = profiles[0]?.registration_number;
  if (reg) lines.push({ label: 'Registration number added', xp: 30 });
  if (p.labelsPrintedAt) lines.push({ label: 'Hive labels printed', xp: 20 });
  if ((p.games.flowerBest ?? 0) >= 6) lines.push({ label: 'Flower Match passed', xp: 30 });
  if ((p.games.doctorBest ?? 0) >= 5) lines.push({ label: 'Hive Doctor passed', xp: 40 });
  if (p.games.waggleTried) lines.push({ label: 'Waggle Dance Lab explored', xp: 20 });

  // Quests
  const season = seasonStart(now);
  const since = (iso: string) => new Date(iso) >= season.start;
  const seasonInsp = inspections.filter((i) => since(i.inspected_at));
  const seasonBlooms = blooms.filter((b) => since(b.seen_at));
  const inspectedHives = new Set(seasonInsp.map((i) => i.hive_id));
  const quests: Quest[] = [
    { id: 'first-steps', title: 'First Steps', text: 'Complete lessons 1 to 3 in the Academy.', done: ['l1', 'l2', 'l3'].filter((id) => p.lessons[id]?.done).length, of: 3 },
    { id: 'registration', title: 'Registration Hero', text: 'Add your registration number and print a label for your hives.', done: (reg ? 1 : 0) + (p.labelsPrintedAt ? 1 : 0), of: 2 },
  ];
  if (season.name === 'Winter') {
    const aloes = seasonBlooms.filter((b) => getPlant(b.plant_id)?.group === 'aloe').length;
    quests.push({ id: 'aloe', seasonal: 'Winter', title: 'Aloe Season', text: 'Log three aloe blooms and check stores in one hive.', done: Math.min(aloes, 3) + (seasonInsp.length ? 1 : 0), of: 4 });
  } else if (season.name === 'Spring') {
    quests.push({ id: 'spring', seasonal: 'Spring', title: 'Spring Build-up', text: 'Inspect every live hive this spring and look for swarm cells.', done: liveHives.filter((h) => inspectedHives.has(h.id)).length, of: Math.max(liveHives.length, 1) });
  } else if (season.name === 'Summer') {
    quests.push({ id: 'summer', seasonal: 'Summer', title: 'Summer Flow', text: 'Log three bloom sightings and record honey stores once.', done: Math.min(seasonBlooms.length, 3) + (seasonInsp.some((i) => (i.honey_frames ?? 0) > 0) ? 1 : 0), of: 4 });
  } else {
    quests.push({ id: 'autumn', seasonal: 'Autumn', title: 'Autumn Stores Check', text: 'Check the stores of every live hive before winter.', done: liveHives.filter((h) => inspectedHives.has(h.id)).length, of: Math.max(liveHives.length, 1) });
  }
  const completeQuests = quests.filter((q) => q.done >= q.of && q.of > 0);
  if (completeQuests.length) lines.push({ label: `${completeQuests.length} quest${completeQuests.length > 1 ? 's' : ''} complete`, xp: completeQuests.length * 100 });

  // Weekly logbook rhythm: any inspection, bloom or lesson in each of the last 8 weeks.
  const rhythm: boolean[] = [];
  const lessonDates = Object.values(p.lessons).map((l) => l.at);
  const allDates = [...inspections.map((i) => i.inspected_at), ...blooms.map((b) => b.seen_at), ...lessonDates];
  for (let w = 7; w >= 0; w--) {
    const end = now.getTime() - w * 7 * DAY;
    const start = end - 7 * DAY;
    rhythm.push(allDates.some((d) => {
      const t = new Date(d).getTime();
      return t > start && t <= end;
    }));
  }

  const xp = lines.reduce((s, l) => s + l.xp, 0);
  const rankIdx = RANKS.reduce((acc, r, i) => (xp >= r.xp ? i : acc), 0);
  return { xp, lines, rank: RANKS[rankIdx], next: RANKS[rankIdx + 1], quests, rhythm };
}
