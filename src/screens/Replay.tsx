// Release 1.4: season replay. A year-in-review card to keep or share on WhatsApp. Made on the phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuShare2, LuDownload, LuMessageCircle } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Bloom, Harvest, Hive, Inspection, Profile, Trap } from '../db';
import { getPlant } from '../content/forage';
import { getProgress, snapshot } from '../progress';
import { myId } from '../share';
import { Seg, Topbar, toast } from '../ui';

export interface Replay {
  title: string;
  name?: string;
  hives: number;
  apiaries: number;
  inspections: number;
  honeyKg: number;
  swarms: number;
  blooms: number;
  losses: number;
  lessons: number;
  rank: string;
  bestHive?: { name: string; score: number };
  topPlant?: string;
}

export async function buildReplay(period: 'year' | 'calendar', now = new Date()): Promise<Replay> {
  const start = period === 'year' ? new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()) : new Date(now.getFullYear(), 0, 1);
  const inP = (iso?: string | null) => !!iso && new Date(iso) >= start && new Date(iso) <= now;
  const me = myId();
  const [apiaries, hives, inspections, harvests, traps, blooms, profiles, snap] = await Promise.all([
    db.all<Apiary>('apiaries'), db.all<Hive>('hives'), db.all<Inspection>('inspections'), db.all<Harvest>('harvests'),
    db.all<Trap>('traps'), db.all<Bloom>('blooms'), db.all<Profile>('profiles'), snapshot(now),
  ]);
  const mineA = apiaries.filter((a) => !a.owner_id || !me || a.owner_id === me);
  const ids = new Set(mineA.map((a) => a.id));
  const mineH = hives.filter((h) => ids.has(h.apiary_id));
  const hiveIds = new Set(mineH.map((h) => h.id));
  const insp = inspections.filter((i) => hiveIds.has(i.hive_id) && inP(i.inspected_at));
  const byHive = new Map<string, number[]>();
  insp.forEach((i) => i.score != null && byHive.set(i.hive_id, [...(byHive.get(i.hive_id) || []), i.score]));
  let bestHive: Replay['bestHive'];
  byHive.forEach((scores, id) => {
    if (scores.length < 2) return;
    const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
    if (!bestHive || avg > bestHive.score) bestHive = { name: mineH.find((h) => h.id === id)?.name || 'A hive', score: avg };
  });
  const bloomP = blooms.filter((b) => inP(b.seen_at));
  const count = new Map<string, number>();
  bloomP.forEach((b) => count.set(b.plant_id, (count.get(b.plant_id) || 0) + 1));
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const lessons = Object.values(getProgress().lessons).filter((l) => l.done).length;
  const label = period === 'year'
    ? `${start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} to ${now.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`
    : `${now.getFullYear()} so far`;
  return {
    title: label,
    name: profiles[0]?.display_name?.split(' ')[0],
    hives: mineH.filter((h) => !['dead', 'absconded', 'empty'].includes(h.status || 'active')).length,
    apiaries: mineA.length,
    inspections: insp.length,
    honeyKg: Math.round(harvests.filter((h) => hiveIds.has(h.hive_id) && inP(h.harvested_at)).reduce((s, h) => s + Number(h.kg), 0) * 10) / 10,
    swarms: traps.filter((t) => inP(t.caught_at)).length,
    blooms: count.size,
    losses: mineH.filter((h) => (h.status === 'dead' || h.status === 'absconded') && inP(h.lost_at)).length,
    lessons,
    rank: snap.rank.name,
    bestHive,
    topPlant: top ? getPlant(top[0])?.name : undefined,
  };
}

export function replayText(r: Replay) {
  const bits = [
    `${r.hives} hive${r.hives === 1 ? '' : 's'}`,
    r.honeyKg ? `${r.honeyKg} kg of honey` : null,
    r.swarms ? `${r.swarms} swarm${r.swarms === 1 ? '' : 's'} caught` : null,
    `${r.inspections} inspection${r.inspections === 1 ? '' : 's'}`,
    r.blooms ? `${r.blooms} plant${r.blooms === 1 ? '' : 's'} logged in bloom` : null,
  ].filter(Boolean);
  return `My beekeeping season (${r.title}): ${bits.join(', ')}.${r.bestHive ? ` Star hive: ${r.bestHive.name}.` : ''} Logged with Honeyguide.`;
}

const TILES = (r: Replay): [string, string][] => [
  [String(r.hives), r.hives === 1 ? 'hive' : 'hives'],
  [r.honeyKg ? `${r.honeyKg}` : '0', 'kg of honey'],
  [String(r.inspections), r.inspections === 1 ? 'inspection' : 'inspections'],
  [String(r.swarms), r.swarms === 1 ? 'swarm caught' : 'swarms caught'],
  [String(r.blooms), r.blooms === 1 ? 'plant in bloom' : 'plants in bloom'],
  [String(r.losses), r.losses === 1 ? 'colony lost' : 'colonies lost'],
];

/** Draw the card at 1080 × 1350 for sharing. */
export async function renderReplayPng(r: Replay): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FFD27A'); bg.addColorStop(1, '#F5A524');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // honeycomb in the corner
  const hex = (cx: number, cy: number, s: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; g.lineTo(cx + s * Math.cos(a), cy + s * Math.sin(a)); }
    g.closePath();
  };
  g.strokeStyle = 'rgba(107,68,35,.18)'; g.lineWidth = 6;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) { hex(760 + col * 104 + (row % 2) * 52, 60 + row * 90, 52); g.stroke(); }
  const serif = 'Georgia, "Iowan Old Style", serif';
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillStyle = '#1C1A17';
  g.font = `700 40px ${sans}`;
  g.fillText('HONEYGUIDE', 80, 120);
  g.font = `700 92px ${serif}`;
  g.fillText(r.name ? `${r.name}'s season` : 'My season', 80, 250);
  g.font = `500 40px ${sans}`;
  g.fillStyle = '#4A3A22';
  g.fillText(r.title, 80, 310);
  const tiles = TILES(r);
  tiles.forEach(([n, label], i) => {
    const x = 80 + (i % 2) * 470, y = 380 + Math.floor(i / 2) * 250;
    g.fillStyle = 'rgba(255,255,255,.72)';
    g.beginPath(); g.roundRect(x, y, 440, 220, 36); g.fill();
    g.fillStyle = '#1C1A17';
    g.font = `700 110px ${serif}`;
    g.fillText(n, x + 36, y + 130);
    g.font = `600 36px ${sans}`;
    g.fillStyle = '#4A3A22';
    g.fillText(label, x + 38, y + 185);
  });
  g.fillStyle = '#1C1A17';
  g.font = `600 38px ${sans}`;
  const extra = [r.bestHive && `Star hive: ${r.bestHive.name} (${r.bestHive.score}/100)`, r.topPlant && `Most logged bloom: ${r.topPlant}`, `Rank: ${r.rank}`].filter(Boolean) as string[];
  extra.forEach((t, i) => g.fillText(t, 80, 1150 + i * 52));
  g.font = `500 30px ${sans}`;
  g.fillStyle = '#4A3A22';
  g.fillText('Honeyguide: Beekeeping SA', 80, 1310);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the card'))), 'image/png'));
}

export function SeasonReplay() {
  const [period, setPeriod] = useState<'year' | 'calendar'>('year');
  const [r, setR] = useState<Replay>();
  const busy = useRef(false);
  useEffect(() => { buildReplay(period).then(setR); }, [period]);
  const tiles = useMemo(() => (r ? TILES(r) : []), [r]);
  if (!r) return <Topbar title="Season replay" backTo="/more" />;
  const file = async () => new File([await renderReplayPng(r)], 'honeyguide-season.png', { type: 'image/png' });
  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const f = await file();
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: replayText(r) });
      else { download(f); toast('Card saved. Share it from your gallery.'); }
    } catch { /* share closed */ } finally { busy.current = false; }
  };
  const download = (f: File) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <>
      <Topbar title="Season replay" backTo="/more" />
      <Seg label="Period" value={period} onChange={setPeriod} options={[{ value: 'year', label: 'Past 12 months' }, { value: 'calendar', label: `${new Date().getFullYear()} so far` }]} />
      <div className="replay" style={{ marginTop: 14 }}>
        <div className="replay-brand">HONEYGUIDE</div>
        <h2>{r.name ? `${r.name}'s season` : 'My season'}</h2>
        <div className="replay-sub">{r.title}</div>
        <div className="replay-grid">
          {tiles.map(([n, label]) => <div key={label} className="replay-tile"><b>{n}</b><span>{label}</span></div>)}
        </div>
        {r.bestHive && <p>Star hive: <b>{r.bestHive.name}</b> ({r.bestHive.score}/100)</p>}
        {r.topPlant && <p>Most logged bloom: <b>{r.topPlant}</b></p>}
        <p>Rank: <b>{r.rank}</b>{r.lessons ? ` · ${r.lessons} lesson${r.lessons === 1 ? '' : 's'} done` : ''}</p>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <button className="btn" onClick={share}><LuShare2 /> Share card</button>
        <a className="btn secondary" href={`https://wa.me/?text=${encodeURIComponent(replayText(r))}`} target="_blank" rel="noreferrer"><LuMessageCircle /> WhatsApp text</a>
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => download(await file())}><LuDownload /> Save the picture</button>
      <p className="small muted" style={{ marginTop: 12 }}>Made on your phone from your own hives. Nothing is uploaded unless you share it, and it never shows a location.</p>
    </>
  );
}
