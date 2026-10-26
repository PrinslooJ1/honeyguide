import { useState } from 'react';
import * as db from '../db';
import { fmtDateTime, scoreTone } from '../lib';
import { Empty, ListLink, Seg, SyncChip, Topbar } from '../ui';
import { loadSummaries } from './Home';

export function Log() {
  const data = db.useLive(loadSummaries);
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  if (!data) return null;
  const rows = data.inspections.filter((i) => filter === 'all' || i.afb_suspect || (i.score ?? 100) < 60 || (i.pests || []).length);
  return (
    <>
      <Topbar title="Inspection log" right={<SyncChip />} />
      <Seg label="Filter" options={[{ value: 'all', label: 'All' }, { value: 'flagged', label: 'Problems only' }]} value={filter} onChange={setFilter} />
      <div style={{ height: 12 }} />
      {rows.length === 0 ? (
        <Empty title={filter === 'all' ? 'No inspections yet' : 'No problems logged'} text={filter === 'all' ? 'Your inspections appear here, newest first.' : 'Inspections with pests, disease or a low score appear here.'} />
      ) : (
        <div className="list">
          {rows.map((i) => {
            const h = data.hives.find((x) => x.hive.id === i.hive_id);
            return (
              <ListLink key={i.id} href={`/inspection/${i.id}`} title={`${h?.hive.name || 'Hive'} · ${h?.apiary?.name || ''}`}
                sub={fmtDateTime(i.inspected_at) + (i._dirty ? ' · not synced yet' : '')}
                right={<span className={`badge ${i.afb_suspect ? 'bad' : scoreTone(i.score)}`}>{i.afb_suspect ? 'AFB?' : i.score}</span>} />
            );
          })}
        </div>
      )}
    </>
  );
}
