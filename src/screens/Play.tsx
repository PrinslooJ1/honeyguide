import { useMemo, useRef, useState } from 'react';
import { LuTrophy, LuFlower2, LuShieldCheck, LuCompass, LuCheck } from 'react-icons/lu';
import * as db from '../db';
import { MONTHS, PLANTS } from '../content/forage';
import { RANKS, getProgress as useProgressSnapshot, snapshot, updateProgress, useProgress } from '../progress';
import { ListLink, Topbar } from '../ui';
import { Quiz } from './Learn';
import type { Question } from '../content/lessons';

export function PlayHub() {
  useProgress();
  const s = db.useLive(() => snapshot());
  if (!s) return <Topbar title="Ranks and quests" backTo="/learn" />;
  const pct = s.next ? ((s.xp - s.rank.xp) / (s.next.xp - s.rank.xp)) * 100 : 100;
  return (
    <>
      <Topbar title="Ranks and quests" backTo="/learn" />
      <div className="card">
        <div className="row">
          <LuTrophy style={{ width: 40, height: 40, color: 'var(--primary-strong)' }} />
          <div className="grow">
            <div className="eyebrow">Your rank</div>
            <div className="h2" style={{ margin: 0 }}>{s.rank.name}</div>
            <div className="small muted">{s.xp} XP{s.next ? ` · ${s.next.xp - s.xp} to ${s.next.name}` : ' · top rank'}</div>
          </div>
        </div>
        <div className="xp-bar" style={{ marginTop: 12 }}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <div className="rank-steps">{RANKS.map((r) => <span key={r.name} className={s.xp >= r.xp ? 'on' : ''}>{r.name}</span>)}</div>
      </div>
      <p className="small muted">XP comes from lessons, well-timed inspections, useful notes and bloom sightings. Opening a hive more often never earns more: only one inspection per hive per week counts, and calm-weather inspections earn extra.</p>

      <h3 className="h2">Logbook rhythm</h3>
      <div className="card">
        <div className="rhythm" aria-label={`Records kept in ${s.rhythm.filter(Boolean).length} of the last 8 weeks`}>
          {s.rhythm.map((on, i) => <span key={i} className={on ? 'on' : ''} />)}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>The last eight weeks, one dot per week with any record. Not a streak: miss a week and nothing is lost.</p>
      </div>

      <h3 className="h2">Quests</h3>
      <div className="stack">
        {s.quests.map((q) => {
          const complete = q.done >= q.of;
          return (
            <div key={q.id} className="card">
              <div className="row between">
                <b>{q.title}</b>
                {q.seasonal && <span className="badge">{q.seasonal}</span>}
                {complete && <span className="badge good"><LuCheck /> Done</span>}
              </div>
              <p className="small" style={{ margin: '6px 0 8px' }}>{q.text}</p>
              <div className="xp-bar"><span style={{ width: `${Math.min(100, (q.done / q.of) * 100)}%` }} /></div>
              <div className="small muted" style={{ marginTop: 4 }}>{Math.min(q.done, q.of)} of {q.of}</div>
            </div>
          );
        })}
      </div>

      <h3 className="h2">Labs and games</h3>
      <div className="list">
        <ListLink href="/play/waggle" left={<LuCompass />} title="Waggle Dance Lab" sub="Move the flowers, watch the dance change" />
        <ListLink href="/play/flowers" left={<LuFlower2 />} title="Flower Match" sub="Plants, rewards and flowering months" />
        <ListLink href="/play/doctor" left={<LuShieldCheck />} title="Hive Doctor" sub="Six cases to practise on" />
      </div>

      <h3 className="h2">Where your XP came from</h3>
      {s.lines.length === 0 ? <p className="muted">Nothing yet. Start with lesson 1.</p> : (
        <div className="list">{s.lines.map((l) => <div key={l.label} className="list-item"><span className="grow">{l.label}</span><b>+{l.xp}</b></div>)}</div>
      )}
    </>
  );
}

// ---------------- Waggle Dance Lab ----------------
export function WaggleLab() {
  const [sun, setSun] = useState(45); // sun's compass bearing, degrees
  const [food, setFood] = useState({ x: 220, y: 90 }); // map coordinates; hive at 150,150
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const KM_PER_PX = 3 / 130;

  const dx = food.x - 150, dy = food.y - 150;
  const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const distKm = Math.hypot(dx, dy) * KM_PER_PX;
  let angle = bearing - sun;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  const waggleSec = Math.max(0.2, distKm); // roughly one second of waggling per kilometre
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const move = (e: React.PointerEvent) => {
    if (!dragging.current || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 300;
    const y = ((e.clientY - r.top) / r.height) * 300;
    const d = Math.hypot(x - 150, y - 150);
    const k = d > 135 ? 135 / d : 1;
    setFood({ x: 150 + (x - 150) * k, y: 150 + (y - 150) * k });
  };
  const start = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (!useProgressSnapshot().games.waggleTried) updateProgress((p) => ({ ...p, games: { ...p.games, waggleTried: true } }));
    move(e);
  };
  const sunX = 150 + Math.sin((sun * Math.PI) / 180) * 140, sunY = 150 - Math.cos((sun * Math.PI) / 180) * 140;
  const side = Math.abs(angle) < 3 ? 'straight up: fly towards the sun' : Math.abs(angle) > 177 ? 'straight down: fly away from the sun' : `${Math.abs(Math.round(angle))}° ${angle > 0 ? 'right' : 'left'} of straight up: fly ${Math.abs(Math.round(angle))}° ${angle > 0 ? 'right' : 'left'} of the sun`;

  return (
    <>
      <Topbar title="Waggle Dance Lab" backTo="/play" />
      <p className="muted" style={{ marginTop: 0 }}>A forager tells her sisters where food is by dancing on the comb. Drag the flower on the map and watch her dance change.</p>
      <div className="grid-2 waggle">
        <div className="card" style={{ padding: 8 }}>
          <div className="eyebrow" style={{ padding: '2px 6px' }}>Map (3 km radius)</div>
          <svg ref={svgRef} viewBox="0 0 300 300" style={{ width: '100%', touchAction: 'none' }} onPointerMove={move} onPointerUp={() => (dragging.current = false)} onPointerDown={start} role="img" aria-label={`Flowers ${distKm.toFixed(1)} km away at ${Math.round(bearing)} degrees`}>
            <circle cx="150" cy="150" r="135" fill="var(--surface-2)" />
            {[1, 2].map((k) => <circle key={k} cx="150" cy="150" r={k * 43.3} fill="none" stroke="var(--border)" strokeDasharray="3 4" />)}
            <text x="150" y="12" textAnchor="middle" fontSize="11" fill="var(--muted)">N</text>
            <line x1="150" y1="150" x2={sunX} y2={sunY} stroke="#F5C518" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx={sunX} cy={sunY} r="10" fill="#F5C518" />
            <line x1="150" y1="150" x2={food.x} y2={food.y} stroke="var(--primary-strong)" strokeWidth="2.5" />
            <path d="M150 140l9 5v10l-9 5-9-5v-10z" fill="var(--accent)" />
            <g transform={`translate(${food.x} ${food.y})`} style={{ cursor: 'grab' }}>
              <circle r="16" fill="transparent" />
              {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-7" rx="4" ry="7" fill="#C2447A" transform={`rotate(${a})`} />)}
              <circle r="4" fill="#F5C518" />
            </g>
          </svg>
        </div>
        <div className="card" style={{ padding: 8 }}>
          <div className="eyebrow" style={{ padding: '2px 6px' }}>On the comb (up = the sun)</div>
          <svg viewBox="0 0 300 300" style={{ width: '100%' }} role="img" aria-label={`Waggle run ${Math.round(angle)} degrees from vertical, ${waggleSec.toFixed(1)} seconds`}>
            <defs><pattern id="hexes" width="17.3" height="30" patternUnits="userSpaceOnUse"><path d="M8.66 0l8.66 5v10L8.66 20 0 15V5z M8.66 20v10" fill="none" stroke="var(--border)" strokeWidth="1" /></pattern></defs>
            <rect width="300" height="300" rx="12" fill="var(--surface-2)" />
            <rect width="300" height="300" rx="12" fill="url(#hexes)" />
            <path d="M150 18v26M142 28l8-10 8 10" stroke="#C99A00" strokeWidth="3" fill="none" />
            <g transform={`rotate(${angle} 150 150)`}>
              <path d="M150 210 C 95 200, 95 100, 150 90 M150 210 C 205 200, 205 100, 150 90" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
              <line x1="150" y1="210" x2="150" y2="90" stroke="var(--primary-strong)" strokeWidth="5" strokeLinecap="round" />
              <circle cx="150" cy="150" r="9" fill="var(--accent)">
                {!reduced && <animate attributeName="cy" values="210;90;210" keyTimes="0;0.5;1" dur={`${(waggleSec * 2 + 1).toFixed(2)}s`} repeatCount="indefinite" />}
              </circle>
            </g>
          </svg>
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}><span>Sun direction: {Math.round(sun)}° {sun < 23 || sun > 337 ? '(north)' : sun < 68 ? '(north-east)' : sun < 113 ? '(east)' : sun < 158 ? '(south-east)' : sun < 203 ? '(south)' : sun < 248 ? '(south-west)' : sun < 293 ? '(west)' : '(north-west)'}</span>
        <input type="range" min="0" max="359" value={sun} onChange={(e) => setSun(Number(e.target.value))} aria-label="Sun direction" />
        <span className="small muted">Over most of South Africa the midday sun is to the north. Through the day it moves from east to west, and the bees adjust their dance to match.</span>
      </div>
      <div className="card stack" style={{ marginTop: 12 }}>
        <div><b>Direction.</b> The waggle run points {side}.</div>
        <div><b>Distance.</b> About {distKm.toFixed(1)} km, so each waggle run lasts roughly {waggleSec.toFixed(1)} s. Longer waggling means farther food; the exact rate differs between bee races.</div>
      </div>
      <p className="small muted">Standard honeybee biology, first described by Karl von Frisch: roughly one second of waggling for each kilometre (University of Sussex LASI). Simplified for teaching.</p>
    </>
  );
}

// ---------------- Flower Match ----------------
const rangeLabel = (m: number[]) => `${MONTHS[m[0] - 1]} to ${MONTHS[m[m.length - 1] - 1]}`;
function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function flowerQuestions(): Question[] {
  const qs: Question[] = [];
  const pool = shuffle(PLANTS.filter((p) => !p.general));
  for (const p of pool.slice(0, 5)) {
    const correct = rangeLabel(p.months);
    const others = shuffle([...new Set(PLANTS.map((x) => rangeLabel(x.months)).filter((r) => r !== correct))]).slice(0, 2);
    const options = shuffle([correct, ...others]);
    qs.push({ q: `When do beekeepers report ${p.name} flowering?`, options, answer: options.indexOf(correct), why: `${p.name}: reported ${correct}.${p.monthsByProvince ? ' It varies a lot by province.' : ''}` });
  }
  const birdPlant = shuffle(PLANTS.filter((p) => p.birds))[0];
  const beePlants = shuffle(PLANTS.filter((p) => !p.birds)).slice(0, 2);
  const opts = shuffle([birdPlant, ...beePlants]);
  qs.push({ q: 'Which of these relies mainly on birds, not bees, for pollination?', options: opts.map((p) => p.name), answer: opts.indexOf(birdPlant), why: `${birdPlant.name} is mainly bird-pollinated. A showy flower is not always a bee flower.` });
  const inv = PLANTS.find((p) => p.invasive)!;
  const opts2 = shuffle([inv, ...shuffle(PLANTS.filter((p) => !p.invasive && p.group !== 'crop')).slice(0, 2)]);
  qs.push({ q: 'Which is a listed invasive exotic that you should never plant?', options: opts2.map((p) => p.name), answer: opts2.indexOf(inv), why: `${inv.name}: use existing stands for forage, but never plant it.` });
  const aloe = PLANTS.find((p) => p.id === 'aloe-spotted')!;
  qs.push({ q: `Why do northern beekeepers move hives to spotted aloe in winter?`, options: ['For build-up, queen rearing and honey', 'Because it repels beetles', 'For shade'], answer: 0, why: aloe.engage.split('. ').slice(0, 2).join('. ') + '.' });
  return shuffle(qs);
}

export function FlowerMatch() {
  const [round, setRound] = useState(0);
  const questions = useMemo(flowerQuestions, [round]);
  const p = useProgress();
  return (
    <>
      <Topbar title="Flower Match" backTo="/play" />
      <p className="muted" style={{ marginTop: 0 }}>Eight quick questions from the forage library.{p.games.flowerBest != null ? ` Best: ${p.games.flowerBest}/8.` : ''}</p>
      <Quiz key={round} questions={questions} onDone={(score) => updateProgress((prev) => ({ ...prev, games: { ...prev.games, flowerBest: Math.max(score, prev.games.flowerBest ?? 0) } }))} />
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setRound(round + 1)}>New questions</button>
    </>
  );
}

// ---------------- Hive Doctor ----------------
const CASES: Question[] = [
  { q: 'Brood cappings are sunken and greasy, there is a bad smell, and a dead larva pulls out like a brown thread. What do you do?', options: ['Swap in frames from a strong colony', 'Close the hive, leave it in place, clean your tools and report it', 'Shake the bees into a new box at another apiary'], answer: 1, why: 'These are signs of American foulbrood, a notifiable disease. Moving bees or frames spreads it. Report it to the provincial Department of Agriculture.' },
  { q: 'A colony absconded two weeks ago. The empty box now has larvae sliming the comb. Best move?', options: ['Leave it; bees may return', 'Remove and clean the box and comb quickly', 'Add it to a weak colony'], answer: 1, why: 'Small hive beetles exploit comb and stores left behind after absconding. Clear it before they spread.' },
  { q: 'There are several eggs per cell, drone brood in worker cells, and no queen. You are in the Cape. What now?', options: ['Ask your mentor; combining may be better than requeening', 'Do nothing, it will sort itself out', 'Add frames from a foulbrood hive'], answer: 0, why: 'These are laying workers, common in Cape bees after queen loss. Requeening is hard, so get experienced advice.' },
  { q: 'A friend in the Western Cape offers you Cape bee colonies for your Gauteng apiary. Do you accept?', options: ['Yes, free bees are free bees', 'No: Cape bees can take over African colonies in the north', 'Yes, but only in winter'], answer: 1, why: 'Moving Cape bees into African-bee country spreads capensis parasitism.' },
  { q: 'It is October. The colony is crowded and you see swarm cells along the bottom bars. Best move?', options: ['Add space or make a split', 'Close the entrance to stop swarming', 'Take all the honey'], answer: 0, why: 'Swarm cells and crowding in spring point to swarming. Give space or split while the bees are building.' },
  { q: 'You find chalky white mummified larvae at the entrance. What is a sensible first step?', options: ['Log it, keep the colony strong and the hive dry, and watch it', 'Burn the hive at once', 'Use the strongest chemical you can buy'], answer: 0, why: 'Chalkbrood is a fungal brood disease. Record it and ask your mentor if it gets worse. Honeyguide never gives chemical doses.' },
];
export function HiveDoctor() {
  const [round, setRound] = useState(0);
  const p = useProgress();
  return (
    <>
      <Topbar title="Hive Doctor" backTo="/play" />
      <p className="muted" style={{ marginTop: 0 }}>Six cases. Pick the best action and see why.{p.games.doctorBest != null ? ` Best: ${p.games.doctorBest}/6.` : ''}</p>
      <Quiz key={round} questions={CASES} onDone={(score) => updateProgress((prev) => ({ ...prev, games: { ...prev.games, doctorBest: Math.max(score, prev.games.doctorBest ?? 0) } }))} />
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setRound(round + 1)}>Start again</button>
      <p className="small muted">Cases follow Department of Agriculture guidance and South African research. Draft content, awaiting expert review.</p>
    </>
  );
}
