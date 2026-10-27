import { LuHexagon, LuMapPin, LuPhone, LuTriangleAlert, LuLeaf, LuScanQrCode } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Inspection, Profile } from '../db';
import { agoLabel, daysAgo, fmtDateTime, scoreTone, seasonFocus, statusInfo } from '../lib';
import { Empty, Hex, ListLink, SyncChip, Topbar } from '../ui';
import { snapshot } from '../progress';
import { LuTrophy, LuFlower2, LuGraduationCap } from 'react-icons/lu';
import { plantsForProvince, plantMonths } from '../content/forage';

export interface HiveSummary {
  hive: Hive;
  apiary?: Apiary;
  last?: Inspection;
  reasons: string[];
}

export async function loadSummaries(): Promise<{ apiaries: Apiary[]; hives: HiveSummary[]; inspections: Inspection[]; profile?: Profile }> {
  let [apiaries, hives, inspections, profiles] = await Promise.all([
    db.all<Apiary>('apiaries'),
    db.all<Hive>('hives'),
    db.all<Inspection>('inspections'),
    db.all<Profile>('profiles'),
  ]);
  const live = new Set(apiaries.map((a) => a.id));
  const liveHives = new Set(hives.filter((h) => live.has(h.apiary_id)).map((h) => h.id));
  inspections = inspections.filter((i) => liveHives.has(i.hive_id));
  inspections.sort((a, b) => b.inspected_at.localeCompare(a.inspected_at));
  const lastBy = new Map<string, Inspection>();
  for (const i of inspections) if (!lastBy.has(i.hive_id)) lastBy.set(i.hive_id, i);
  const summaries = hives
    .filter((h) => live.has(h.apiary_id))
    .map((hive) => {
      const last = lastBy.get(hive.id);
      const reasons: string[] = [];
      const active = !['dead', 'absconded', 'empty'].includes(hive.status || 'active');
      if (last?.afb_suspect) reasons.push('AFB suspected: isolate and report');
      if (hive.status === 'queenless' || last?.queen_status?.includes('queenless')) reasons.push('No queen signs');
      if (last?.queen_status?.includes('laying_workers')) reasons.push('Laying workers');
      if (last?.queen_status?.includes('queen_cells') || last?.space === 'crowded') reasons.push('Swarm risk');
      if (last && (last.honey_frames ?? 2) === 0) reasons.push('No honey stores');
      if (active && !last) reasons.push('Not inspected yet');
      else if (active && (daysAgo(last?.inspected_at) ?? 0) > 21) reasons.push(`Last inspected ${agoLabel(last?.inspected_at).toLowerCase()}`);
      return { hive, apiary: apiaries.find((a) => a.id === hive.apiary_id), last, reasons };
    });
  return { apiaries, hives: summaries, inspections, profile: profiles[0] };
}

export function Home() {
  const data = db.useLive(loadSummaries);
  const season = seasonFocus();
  if (!data) return <Topbar brand right={<SyncChip />} />;
  const { apiaries, hives, inspections, profile } = data;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = inspections.filter((i) => new Date(i.inspected_at) >= monthStart).length;
  const attention = hives.filter((h) => h.reasons.length).sort((a, b) => (a.last?.afb_suspect ? -1 : 0) - (b.last?.afb_suspect ? -1 : 0));
  const name = profile?.display_name?.split(' ')[0];

  return (
    <>
      <Topbar brand right={<><a className="icon-btn" href="#/scan" aria-label="Scan a hive label"><LuScanQrCode /></a><SyncChip /></>} />
      <p className="eyebrow" style={{ marginTop: 4 }}>{season.season} · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h2 className="h2" style={{ marginTop: 4, fontSize: 26 }}>{name ? `Hello, ${name}` : 'Your apiaries'}</h2>

      {apiaries.length === 0 ? (
        <div className="card">
          <Empty
            title="Start with an apiary"
            text="An apiary is a site where your hives stand. Add one, then add your hives to it."
            action={<a className="btn" href="#/apiary/new"><LuMapPin /> Add your first apiary</a>}
          />
        </div>
      ) : (
        <>
          <div className="grid-3">
            <div className="card stat"><div className="big-num">{apiaries.length}</div><div className="label">Apiaries</div></div>
            <div className="card stat"><div className="big-num">{hives.filter((h) => !['dead', 'absconded', 'empty'].includes(h.hive.status || 'active')).length}</div><div className="label">Live hives</div></div>
            <div className="card stat"><div className="big-num">{thisMonth}</div><div className="label">Inspections this month</div></div>
          </div>

          {hives.length > 0 && (
            <a className="btn" href="#/inspect" style={{ marginTop: 14 }}><LuHexagon /> Start an inspection</a>
          )}

          <h3 className="h2">Needs attention</h3>
          {attention.length === 0 ? (
            <div className="banner good"><LuLeaf /><div><b>All clear</b><p>{hives.length ? 'No hive needs attention right now.' : 'Add hives to an apiary to see their status here.'}</p></div></div>
          ) : (
            <div className="list">
              {attention.slice(0, 6).map(({ hive, apiary, last, reasons }) => (
                <ListLink
                  key={hive.id}
                  href={`/hive/${hive.id}`}
                  left={<Hex size={44} label={<span style={{ fontSize: 13 }}>{last?.score ?? '–'}</span>} tone={last?.afb_suspect ? 'bad' : scoreTone(last?.score)} />}
                  title={hive.name}
                  sub={<><span className={last?.afb_suspect ? 'tone-bad' : 'tone-warn'}>{reasons[0]}</span> · {apiary?.name}</>}
                />
              ))}
            </div>
          )}

          <div className="row between"><h3 className="h2">Recent inspections</h3>{inspections.length > 0 && <a className="small" href="#/log">See all</a>}</div>
          {inspections.length === 0 ? (
            <p className="muted">No inspections yet. Tap the hexagon below to log your first.</p>
          ) : (
            <div className="list">
              {inspections.slice(0, 5).map((i) => {
                const h = hives.find((x) => x.hive.id === i.hive_id);
                return (
                  <ListLink key={i.id} href={`/inspection/${i.id}`} title={h?.hive.name || 'Hive'}
                    sub={`${fmtDateTime(i.inspected_at)} · ${statusInfo(h?.hive.status).label}`}
                    right={<span className={`badge ${scoreTone(i.score)}`}>{i.score}</span>} />
                );
              })}
            </div>
          )}
        </>
      )}

      <h3 className="h2">This season</h3>
      <div className="card"><div className="eyebrow">{season.season} focus</div><p style={{ margin: '6px 0 0' }}>{season.tip}</p></div>
      <HomeForage province={profile?.province} />
      <RankCard />

      <div className="row between"><h3 className="h2">Safety</h3><a className="small" href="#/safety">Safety centre</a></div>
      <div className="banner bad">
        <LuTriangleAlert />
        <div>
          <b>Stung and short of breath, swelling in the face or throat, or feeling faint?</b>
          <p>That can be anaphylaxis. Call for help now and use an adrenaline auto-injector if one has been prescribed.</p>
          <div className="sos" style={{ marginTop: 10 }}>
            <a className="btn danger small" href="tel:10177"><LuPhone /> 10177</a>
            <a className="btn danger small" href="tel:112"><LuPhone /> 112</a>
          </div>
        </div>
      </div>
    </>
  );
}

function HomeForage({ province }: { province?: string }) {
  const m = new Date().getMonth() + 1;
  const now = plantsForProvince(province).filter((p) => plantMonths(p, province).includes(m));
  return (
    <a className="card row" href="#/forage" style={{ marginTop: 12, textDecoration: 'none' }}>
      <LuFlower2 style={{ width: 28, height: 28, color: 'var(--primary-strong)', flex: 'none' }} />
      <div className="grow">
        <b>In bloom {province ? `in ${province}` : 'now'}</b>
        <div className="small muted">{now.length ? now.map((p) => p.name).join(', ') : 'Little reported in bloom this month: a likely dearth.'}</div>
      </div>
    </a>
  );
}

function RankCard() {
  const s = db.useLive(() => snapshot());
  if (!s) return null;
  const pct = s.next ? ((s.xp - s.rank.xp) / (s.next.xp - s.rank.xp)) * 100 : 100;
  const quest = s.quests.find((q) => q.done < q.of);
  return (
    <a className="card" href="#/play" style={{ marginTop: 12, display: 'block', textDecoration: 'none' }}>
      <div className="row">
        <LuTrophy style={{ width: 28, height: 28, color: 'var(--primary-strong)', flex: 'none' }} />
        <div className="grow"><b>{s.rank.name}</b> <span className="small muted">· {s.xp} XP</span>
          <div className="xp-bar" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>
      </div>
      {quest && <div className="small" style={{ marginTop: 8 }}><LuGraduationCap style={{ verticalAlign: -2 }} /> Quest: <b>{quest.title}</b> · {quest.done}/{quest.of}</div>}
    </a>
  );
}
