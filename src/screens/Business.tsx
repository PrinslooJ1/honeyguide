// Business hub: money in, honey out, moves, callouts and incidents. Private to the owner.
import { LuHandshake, LuDroplet, LuTruck, LuBriefcase, LuShieldAlert, LuWallet } from 'react-icons/lu';
import * as db from '../db';
import type { Batch, Contract, Harvest, Incident, Job, Move } from '../db';
import { zar } from '../docs';
import { ListLink, Topbar } from '../ui';
import { contractTotal } from './Contracts';

export function BusinessHub() {
  const data = db.useLive(async () => ({
    contracts: await db.all<Contract>('contracts'), jobs: await db.all<Job>('jobs'), harvests: await db.all<Harvest>('harvests'),
    batches: await db.all<Batch>('batches'), moves: await db.all<Move>('moves'), incidents: await db.all<Incident>('incidents'),
  }));
  if (!data) return <Topbar title="Business" backTo="/more" />;
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const inYear = (iso?: string | null) => !!iso && new Date(iso) >= yearStart;
  const paid = data.contracts.filter((c) => c.status === 'paid' && inYear(c.paid_at)).reduce((s, c) => s + contractTotal(c), 0)
    + data.jobs.filter((j) => j.paid && inYear(j.done_at)).reduce((s, j) => s + (j.fee || 0), 0);
  const owed = data.contracts.filter((c) => c.status === 'invoiced').reduce((s, c) => s + contractTotal(c), 0)
    + data.jobs.filter((j) => j.done_at && !j.paid).reduce((s, j) => s + (j.fee || 0), 0);
  const kg = data.harvests.filter((h) => inYear(h.harvested_at)).reduce((s, h) => s + Number(h.kg), 0);
  const plannedMoves = data.moves.filter((m) => m.status === 'planned').length;
  const openJobs = data.jobs.filter((j) => !j.done_at).length;
  return (
    <>
      <Topbar title="Business" backTo="/more" />
      <p className="muted" style={{ marginTop: 0 }}>Contracts, honey, moves, callouts and incidents. These records are private to you, even in a shared apiary.</p>
      <div className="grid-2">
        <div className="card stat"><div className="big-num" style={{ fontSize: 24 }}>{zar(paid)}</div><div className="label">Paid to you this year</div></div>
        <div className="card stat"><div className="big-num" style={{ fontSize: 24 }}>{zar(owed)}</div><div className="label">Still owed</div></div>
      </div>
      <div className="list" style={{ marginTop: 14 }}>
        <ListLink href="/contracts" left={<LuHandshake />} title="Pollination contracts" sub={`${data.contracts.filter((c) => c.status !== 'paid').length} open`} />
        <ListLink href="/harvests" left={<LuDroplet />} title="Honey: harvests and jar batches" sub={`${kg.toFixed(1)} kg this year · ${data.batches.length} batch${data.batches.length === 1 ? '' : 'es'}`} />
        <ListLink href="/moves" left={<LuTruck />} title="Hive moves" sub={plannedMoves ? `${plannedMoves} planned` : 'Plan a move and keep the movement record'} />
        <ListLink href="/jobs" left={<LuBriefcase />} title="Bee-removal jobs" sub={openJobs ? `${openJobs} open` : 'Callouts, photos, fees and invoices'} />
        <ListLink href="/incidents" left={<LuShieldAlert />} title="Theft and incidents" sub={data.incidents.length ? `${data.incidents.length} logged` : 'Report pack for the police or insurer'} />
      </div>
      <p className="small muted" style={{ marginTop: 14 }}><LuWallet style={{ verticalAlign: -2 }} /> Totals count contracts and callouts only. Honeyguide is not accounting software: keep your own books for tax.</p>
    </>
  );
}
