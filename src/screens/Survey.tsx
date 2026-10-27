// Release 1.4: opt-in, anonymous end-of-season loss survey.
// Totals only: no name, account, apiary or location below province. Sent once a season, if you choose.
import { useEffect, useMemo, useState } from 'react';
import { LuClipboardList, LuCheck, LuShieldCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Job, Move, Profile, Trap } from '../db';
import { APP_VERSION, SUPABASE_KEY, SUPABASE_URL } from '../config';
import { PROVINCES } from '../lib';
import { cloudConfigured } from '../sync';
import { myId } from '../share';
import { Field, Seg, Topbar, toast, useOnline } from '../ui';
import { LOSS_CAUSES } from './Field';

/** The survey covers the 12 months before today, labelled by the year it started: e.g. 2025-26. */
export function surveySeason(now = new Date()) {
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 1);
  const y = start.getFullYear();
  return { label: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, start };
}

export interface SurveyAnswer {
  season: string;
  province: string | null;
  operation: 'stationary' | 'migratory' | 'both';
  years_keeping: '0-2' | '3-5' | '6-10' | '10+' | null;
  colonies_start: number;
  colonies_end: number;
  colonies_lost: number;
  swarms_caught: number;
  causes: Record<string, number>;
}

/** A first guess from the records on this phone. The beekeeper checks and corrects it. */
export async function draftAnswer(now = new Date()): Promise<SurveyAnswer> {
  const { label, start } = surveySeason(now);
  const [hives, apiaries, traps, moves, jobs, profiles] = await Promise.all([
    db.all<Hive>('hives'), db.all<Apiary>('apiaries'), db.all<Trap>('traps'), db.all<Move>('moves'), db.all<Job>('jobs'), db.all<Profile>('profiles'),
  ]);
  const me = myId();
  const mineA = new Set(apiaries.filter((a) => !a.owner_id || !me || a.owner_id === me).map((a) => a.id));
  const mine = hives.filter((h) => mineA.has(h.apiary_id));
  const inPeriod = (iso?: string | null) => !!iso && new Date(iso) >= start && new Date(iso) <= now;
  const lostList = mine.filter((h) => (h.status === 'dead' || h.status === 'absconded') && (inPeriod(h.lost_at) || (!h.lost_at && inPeriod(h.updated_at))));
  const alive = mine.filter((h) => !['dead', 'absconded', 'empty'].includes(h.status || 'active')).length;
  const causes: Record<string, number> = {};
  for (const h of lostList) {
    const c = h.loss_cause || (h.status === 'absconded' ? 'absconding' : 'unknown');
    causes[c] = (causes[c] || 0) + 1;
  }
  const swarms = traps.filter((t) => inPeriod(t.caught_at)).length + jobs.filter((j) => j.hive_id && inPeriod(j.done_at)).length;
  const moved = moves.some((m) => m.status === 'done' && inPeriod(m.moved_at || m.planned_for));
  const province = profiles[0]?.province || apiaries.find((a) => mineA.has(a.id))?.province || null;
  return {
    season: label, province, operation: moved ? 'migratory' : 'stationary', years_keeping: null,
    colonies_start: Math.max(0, alive + lostList.length - swarms), colonies_end: alive, colonies_lost: lostList.length, swarms_caught: swarms, causes,
  };
}

function NumberField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" inputMode="numeric" value={String(value)} onChange={(e) => onChange(Math.max(0, Math.min(100000, Number(e.target.value.replace(/\D/g, '')) || 0)))} />
    </Field>
  );
}

export function LossSurvey() {
  const online = useOnline();
  const [a, setA] = useState<SurveyAnswer | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const season = surveySeason();
  const sent = db.useLive(() => db.getMeta<string>(`survey:${season.label}`), [season.label]);
  useEffect(() => { draftAnswer().then(setA); }, []);
  const lossRate = useMemo(() => (a && a.colonies_start + a.swarms_caught > 0 ? Math.round((a.colonies_lost / (a.colonies_start + a.swarms_caught)) * 100) : null), [a]);
  if (!a) return <Topbar title="Loss survey" backTo="/more" />;
  const set = (p: Partial<SurveyAnswer>) => setA({ ...a, ...p });
  const causeTotal = Object.values(a.causes).reduce((s, n) => s + n, 0);

  const send = async () => {
    if (!consent) return toast('Tick the box to agree first');
    if (!online) return toast('Sending needs signal');
    if (a.colonies_lost > a.colonies_start + a.swarms_caught) return toast('More colonies lost than you had: check the numbers');
    setBusy(true);
    try {
      // Sent with the app's public key only, not your sign-in, so the answer is not linked to your account.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_loss_survey`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: { ...a, app_version: APP_VERSION } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await db.setMeta(`survey:${season.label}`, new Date().toISOString());
      db.notify();
      toast('Sent. Thank you!');
    } catch {
      toast('Could not send. Try again later.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <Topbar title="Loss survey" backTo="/more" />
        <div className="banner good"><LuCheck /><div><b>Thank you</b><p>Your {season.label} answers were sent on {new Date(sent).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}. The survey opens again in a year.</p></div></div>
        <p className="small muted">The answer is not linked to you, so it cannot be changed or withdrawn later.</p>
      </>
    );
  }

  return (
    <>
      <Topbar title="Loss survey" backTo="/more" />
      <div className="banner info"><LuClipboardList /><div><b>Help South African bee research</b><p>Once a season, send your colony totals for the past 12 months: how many you had, lost and caught, and why they were lost. Researchers use these numbers to track colony losses across the country. It takes a minute.</p></div></div>

      <h3 className="h2">Your season {season.label}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>Worked out from your records. Check each number and correct it.</p>
      <div className="stack">
        <div className="grid-2">
          <NumberField label="Colonies a year ago" value={a.colonies_start} onChange={(n) => set({ colonies_start: n })} />
          <NumberField label="Colonies now" value={a.colonies_end} onChange={(n) => set({ colonies_end: n })} />
          <NumberField label="Lost or absconded" value={a.colonies_lost} onChange={(n) => set({ colonies_lost: n })} />
          <NumberField label="Swarms caught" hint="and removals kept" value={a.swarms_caught} onChange={(n) => set({ swarms_caught: n })} />
        </div>
        {lossRate != null && <p className="small" style={{ margin: 0 }}>That is a loss of about <b>{lossRate}%</b>.</p>}

        <div className="field"><span>Why were they lost? <span className="hint">· your best guess for each</span></span>
          <div className="card stack" style={{ gap: 8 }}>
            {LOSS_CAUSES.map((c) => (
              <div key={c.value} className="row between">
                <span className="small">{c.label}</span>
                <input className="input" style={{ width: 80, textAlign: 'center' }} inputMode="numeric" aria-label={`${c.label}: colonies`} value={a.causes[c.value] || ''} placeholder="0"
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(100000, Number(e.target.value.replace(/\D/g, '')) || 0));
                    const causes = { ...a.causes };
                    if (n) causes[c.value] = n; else delete causes[c.value];
                    set({ causes });
                  }} />
              </div>
            ))}
          </div>
          {causeTotal !== a.colonies_lost && <span className="small tone-warn">The causes add up to {causeTotal}, but {a.colonies_lost} colonies were lost.</span>}
        </div>

        <div className="field"><span>Do you move hives?</span>
          <Seg label="Operation" value={a.operation} onChange={(v) => set({ operation: v })} options={[{ value: 'stationary', label: 'Never' }, { value: 'migratory', label: 'Often' }, { value: 'both', label: 'Some' }]} />
        </div>
        <div className="field"><span>Years keeping bees</span>
          <Seg label="Years" value={a.years_keeping || undefined} onChange={(v) => set({ years_keeping: v })} options={[{ value: '0-2', label: '0–2' }, { value: '3-5', label: '3–5' }, { value: '6-10', label: '6–10' }, { value: '10+', label: '10+' }]} />
        </div>
        <Field label="Province">
          <select className="input" value={a.province || ''} onChange={(e) => set({ province: e.target.value || null })}>
            <option value="">Rather not say</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>

        <div className="card stack">
          <b className="row"><LuShieldCheck /> What is sent</b>
          <p className="small" style={{ margin: 0 }}>Only the numbers and choices above, the season, the app version and the date. Not your name, email, account, apiaries, locations or photos. It is sent with the app's public key rather than your sign-in, so it is not linked to you. Because of that it cannot be withdrawn afterwards.</p>
          <p className="small muted" style={{ margin: 0 }}>Answers are kept by Honeyguide and shared only as anonymous totals, for example with South African bee researchers.</p>
          <label className="row small"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to send these anonymous answers</label>
        </div>
        {!cloudConfigured ? <p className="small muted">Sending is not available in this build.</p> : <button className="btn" disabled={busy || !consent} onClick={send}>{busy ? 'Sending…' : 'Send anonymously'}</button>}
      </div>
    </>
  );
}
