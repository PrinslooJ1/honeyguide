// Colony growth and health engine. Every rule here is a DRAFT: a South African beekeeper or
// ARC contact must confirm each one before release. Advice only identifies, protects and refers;
// it never gives chemical doses.
import type { Apiary, Hive, Inspection } from './db';
import { getPlant, outlookFor, plantsForProvince, type Plant } from './content/forage';
import { beeZone, zonesForProvince } from './region';

export type Stage = 'nuc' | 'building' | 'strong' | 'flow-ready' | 'harvest' | 'dearth' | 'unknown';
export const STAGE_LABEL: Record<Stage, string> = {
  nuc: 'Nucleus', building: 'Building', strong: 'Strong', 'flow-ready': 'Flow-ready', harvest: 'Harvest', dearth: 'Dearth', unknown: 'Not enough data',
};

export interface Flag {
  id: string;
  text: string;
  tone: 'bad' | 'warn';
}
export interface Action {
  id: string;
  title: string;
  why: string;
  tone: 'bad' | 'warn' | 'good' | 'info';
}
export interface ColonyView {
  strength: number | null; // 0–100
  trend: number[]; // last health scores, oldest first
  stage: Stage;
  flags: Flag[];
  action: Action;
  outlook: ReturnType<typeof outlookFor> | null;
}

const DAY = 86400000;

/** Strength from what was counted: brood, stores and queen state. Separate from the health score. */
export function strengthScore(i?: Inspection): number | null {
  if (!i) return null;
  const brood = Math.min(i.brood_frames ?? 0, 8) / 8; // 8+ brood frames = full strength for a Langstroth brood box
  const stores = Math.min((i.honey_frames ?? 0) + (i.pollen_frames ?? 0) * 0.5, 6) / 6;
  const q = i.queen_status || [];
  const queen = q.includes('laying_workers') || q.includes('queenless') ? 0 : q.includes('eggs') || q.includes('queen_seen') || q.includes('young_larvae') ? 1 : 0.6;
  return Math.round((brood * 0.5 + stores * 0.3 + queen * 0.2) * 100);
}

export function colonyView(hive: Hive, apiary: Apiary | undefined, inspections: Inspection[], now = new Date()): ColonyView {
  const list = [...inspections].sort((a, b) => a.inspected_at.localeCompare(b.inspected_at));
  const last = list[list.length - 1];
  const recent = (days: number) => list.filter((i) => now.getTime() - new Date(i.inspected_at).getTime() < days * DAY);

  const tagged = (apiary?.forage_plants || []).map(getPlant).filter(Boolean) as Plant[];
  const plants = tagged.length ? tagged : plantsForProvince(apiary?.province);
  const outlook = plants.length ? outlookFor(plants, apiary?.province, now) : null;

  const strength = strengthScore(last);
  const trend = list.slice(-6).map((i) => i.score ?? 0);

  // ---- stage ----
  let stage: Stage = 'unknown';
  if (last) {
    const brood = last.brood_frames ?? 0;
    if ((last.honey_frames ?? 0) >= 6) stage = 'harvest';
    else if (outlook?.now.kind === 'dearth' && brood >= 3) stage = 'dearth';
    else if (brood <= 2 || /nuc/i.test(hive.hive_type || '')) stage = 'nuc';
    else if (brood <= 5) stage = 'building';
    else stage = outlook?.flowAhead ? 'flow-ready' : 'strong';
  }

  // ---- risk flags ----
  const flags: Flag[] = [];
  const zone = apiary?.lat != null && apiary.lng != null ? beeZone(apiary.lat, apiary.lng) : zonesForProvince(apiary?.province).beeZone;
  if (hive.subspecies === 'capensis' && zone === 'african') flags.push({ id: 'capensis', tone: 'bad', text: 'Cape bees in African-bee country: risk of capensis parasitism' });
  if (last?.afb_suspect) flags.push({ id: 'afb', tone: 'bad', text: 'American foulbrood suspected' });
  if (recent(30).some((i) => i.pests?.includes('small_hive_beetle'))) flags.push({ id: 'shb', tone: 'warn', text: 'Small hive beetle seen in the last month' });
  if (recent(60).some((i) => i.pests?.includes('chalkbrood'))) flags.push({ id: 'chalk', tone: 'warn', text: 'Chalkbrood seen recently' });
  if (recent(14).length >= 3) flags.push({ id: 'disturb', tone: 'warn', text: `Opened ${recent(14).length} times in 14 days` });
  if (last && (last.honey_frames ?? 0) <= 1 && outlook?.dearthAhead) flags.push({ id: 'stores', tone: 'warn', text: 'Low stores with a dearth ahead' });
  if (hive.status === 'absconded') flags.push({ id: 'absconded', tone: 'warn', text: 'Absconded: empty comb attracts beetles and wax moth' });

  // ---- next-best action: one card, most urgent first ----
  const q = last?.queen_status || [];
  const daysSince = last ? Math.floor((now.getTime() - new Date(last.inspected_at).getTime()) / DAY) : null;
  const month = now.getMonth() + 1;
  const activeSeason = month >= 8 || month <= 3; // southern spring and summer, broadly
  let action: Action;
  if (last?.afb_suspect) action = { id: 'afb', tone: 'bad', title: 'Keep the hive closed and report it', why: 'Suspected American foulbrood is notifiable. Do not move it or swap any frames, and clean your tools before touching another hive.' };
  else if (hive.status === 'absconded') action = { id: 'cleanup', tone: 'warn', title: 'Clear the empty box soon', why: 'Small hive beetles and wax moth exploit comb and stores left behind after absconding.' };
  else if (flags.some((f) => f.id === 'capensis')) action = { id: 'capensis', tone: 'bad', title: 'Talk to your provincial office about these Cape bees', why: 'Cape workers can take over African colonies nearby. People spread it by moving bees and used equipment.' };
  else if (q.includes('laying_workers')) action = { id: 'lw', tone: 'warn', title: 'Get advice on the laying workers', why: 'Requeening a laying-worker colony is hard; combining or other options may be better. Ask your mentor or club.' };
  else if (q.includes('queenless')) action = { id: 'queenless', tone: 'warn', title: 'Check for eggs again in about a week', why: 'No queen signs were seen. If there are still no eggs, the colony needs a queen or to be combined.' };
  else if (flags.some((f) => f.id === 'disturb')) action = { id: 'rest', tone: 'warn', title: 'Give this colony a rest', why: 'Frequent opening disturbs a colony, and disturbance is linked to absconding.' };
  else if ((q.includes('queen_cells') || last?.space === 'crowded' || last?.space === 'needs_super') && (outlook?.flowAhead || activeSeason)) action = { id: 'space', tone: 'info', title: 'Give space before the flow', why: 'Crowding and swarm cells point to swarming. Add a super or make a split while the bees are building.' };
  else if (flags.some((f) => f.id === 'stores')) action = { id: 'stores', tone: 'warn', title: 'Plan for the dearth', why: 'Stores are low and little is in bloom ahead. Discuss feeding with your mentor, and log it if you feed so you can see what works.' };
  else if (flags.some((f) => f.id === 'shb')) action = { id: 'shb', tone: 'info', title: 'Keep the colony tight against beetles', why: 'Beetles take advantage of weak colonies and empty space. Remove unused boxes and keep the floor clean.' };
  else if (!last) action = { id: 'first', tone: 'info', title: 'Log a first inspection', why: 'One inspection on a warm, calm day starts this hive\'s record.' };
  else if (daysSince! > 21 && activeSeason) action = { id: 'due', tone: 'info', title: 'Due for a check on the next warm, calm day', why: `The last inspection was ${daysSince} days ago, in the active season.` };
  else if (outlook?.now.kind === 'dearth') action = { id: 'quiet', tone: 'info', title: 'Inspect only if you need to', why: 'Little is flowering, so open briefly and avoid spilling honey, which can start robbing.' };
  else action = { id: 'ok', tone: 'good', title: 'On track', why: activeSeason ? 'Next check in two to three weeks.' : 'Check stores on a warm, calm day; inspect less in the cold months.' };

  return { strength, trend, stage, flags, action, outlook };
}
