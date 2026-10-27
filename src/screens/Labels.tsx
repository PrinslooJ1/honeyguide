import { useEffect, useMemo, useState } from 'react';
import { LuPrinter, LuTriangleAlert, LuCheck } from 'react-icons/lu';
import * as db from '../db';
import type { Apiary, Hive, Profile } from '../db';
import { lsGet, lsSet, queenColour, shortCode } from '../lib';
import { updateProgress } from '../progress';
import { qrSvg, type Ecc } from '../qr';
import { Empty, Field, Pills, Seg, Stepper, Topbar, toast } from '../ui';

// Label stock. Sheet sizes match common A4 label sheets sold in South Africa (Avery/Tower style codes).
export interface Stock {
  id: string;
  name: string;
  w: number; // mm
  h: number;
  sheet?: { cols: number; rows: number; top: number; left: number; gapX: number; gapY: number };
}
export const STOCKS: Stock[] = [
  { id: 'a4-21', name: 'A4 sheet, 21 labels (63.5 × 38.1 mm)', w: 63.5, h: 38.1, sheet: { cols: 3, rows: 7, top: 15.15, left: 7.2, gapX: 2.5, gapY: 0 } },
  { id: 'a4-24', name: 'A4 sheet, 24 labels (70 × 37 mm)', w: 70, h: 37, sheet: { cols: 3, rows: 8, top: 0.5, left: 0, gapX: 0, gapY: 0 } },
  { id: 'a4-8', name: 'A4 sheet, 8 labels (99.1 × 67.7 mm)', w: 99.1, h: 67.7, sheet: { cols: 2, rows: 4, top: 13.1, left: 4.65, gapX: 2.5, gapY: 0 } },
  { id: 'roll-50', name: 'Label printer roll, 50 × 30 mm', w: 50, h: 30 },
  { id: 'roll-100', name: 'Label printer roll, 100 × 50 mm', w: 100, h: 50 },
];

type FieldKey = 'name' | 'apiary' | 'code' | 'reg' | 'queen' | 'hint';
const FIELDS: { value: FieldKey; label: string }[] = [
  { value: 'name', label: 'Hive name' },
  { value: 'apiary', label: 'Apiary' },
  { value: 'code', label: 'Hive code' },
  { value: 'reg', label: 'Registration no.' },
  { value: 'queen', label: 'Queen colour' },
  { value: 'hint', label: '"Scan to log"' },
];

interface Prefs {
  stock: string;
  fields: FieldKey[];
  ecc: Ecc;
  copies: number;
  skip: number;
}
const DEFAULT_PREFS: Prefs = { stock: 'a4-21', fields: ['name', 'apiary', 'code', 'reg', 'queen'], ecc: 'Q', copies: 1, skip: 0 };

export function labelUrl(code: string) {
  return `${location.origin}${location.pathname}#/h/${code}`;
}

/** One label, sized in millimetres so it prints at true size. */
function Label({ hive, apiary, reg, stock, prefs }: { hive: Hive; apiary?: Apiary; reg?: string; stock: Stock; prefs: Prefs }) {
  const pad = Math.min(3, stock.h * 0.08);
  const qrSide = Math.min(stock.h - pad * 2, stock.w * 0.48);
  const svg = useMemo(() => qrSvg(labelUrl(hive.code!), prefs.ecc, 4), [hive.code, prefs.ecc]);
  const qc = queenColour(hive.queen_year);
  const f = new Set(prefs.fields);
  const scale = stock.h / 38; // text scales with label height
  return (
    <div className="label" style={{ width: `${stock.w}mm`, height: `${stock.h}mm`, padding: `${pad}mm`, gap: `${pad}mm` }}>
      <div className="label-qr" style={{ width: `${qrSide}mm`, height: `${qrSide}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="label-text" style={{ fontSize: `${2.6 * scale}mm` }}>
        {f.has('name') && <div className="label-name" style={{ fontSize: `${4.2 * scale}mm` }}>{hive.name}</div>}
        {f.has('apiary') && apiary && <div>{apiary.name}</div>}
        {f.has('code') && <div className="label-code">{hive.code}</div>}
        {f.has('reg') && reg && <div>Reg. {reg}</div>}
        {f.has('queen') && qc && (
          <div className="label-queen"><span style={{ background: qc.hex, width: `${3 * scale}mm`, height: `${3 * scale}mm` }} /> Queen {hive.queen_year}</div>
        )}
        {f.has('hint') && <div className="label-hint">Scan to log</div>}
      </div>
    </div>
  );
}

export function Labels({ hiveId, apiaryId }: { hiveId?: string; apiaryId?: string }) {
  const data = db.useLive(async () => {
    const [apiaries, hives, profiles] = await Promise.all([db.all<Apiary>('apiaries'), db.all<Hive>('hives'), db.all<Profile>('profiles')]);
    const live = new Set(apiaries.map((a) => a.id));
    return { apiaries, hives: hives.filter((h) => live.has(h.apiary_id)), reg: profiles[0]?.registration_number };
  });
  const [prefs, setPrefsState] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...lsGet<Partial<Prefs>>('hg:labelPrefs', {}), skip: 0 }));
  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    lsSet('hg:labelPrefs', { ...next, skip: 0 });
  };
  const [selected, setSelected] = useState<string[] | null>(null);

  // Pre-select from where the studio was opened; give older hives a code if they lack one.
  useEffect(() => {
    if (!data || selected) return;
    (async () => {
      for (const h of data.hives) if (!h.code) await db.save<Hive>('hives', { ...h, code: shortCode() });
    })();
    if (hiveId) setSelected([hiveId]);
    else if (apiaryId) setSelected(data.hives.filter((h) => h.apiary_id === apiaryId).map((h) => h.id));
    else setSelected(data.hives.map((h) => h.id));
  }, [data, hiveId, apiaryId, selected]);

  if (!data || !selected) return null;
  if (!data.hives.length) {
    return (<><Topbar title="Hive labels" backTo="/more" /><Empty title="No hives yet" text="Add hives first, then print a QR label for each box." action={<a className="btn" href="#/apiaries">Go to apiaries</a>} /></>);
  }

  const stock = STOCKS.find((s) => s.id === prefs.stock) || STOCKS[0];
  const apiaryName = (h: Hive) => data.apiaries.find((a) => a.id === h.apiary_id)?.name || '';
  const chosen = data.hives
    .filter((h) => selected.includes(h.id) && h.code)
    .sort((a, b) => apiaryName(a).localeCompare(apiaryName(b)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const labels = chosen.flatMap((h) => Array.from({ length: prefs.copies }, () => h));
  const qrMm = Math.min(stock.h - Math.min(3, stock.h * 0.08) * 2, stock.w * 0.48);
  const perSheet = stock.sheet ? stock.sheet.cols * stock.sheet.rows : 1;
  const skip = stock.sheet ? Math.min(prefs.skip, perSheet - 1) : 0;
  const slots: (Hive | null)[] = [...Array(skip).fill(null), ...labels];
  const pages: (Hive | null)[][] = [];
  for (let i = 0; i < slots.length; i += perSheet) pages.push(slots.slice(i, i + perSheet));

  const print = () => {
    if (!labels.length) return toast('Choose at least one hive');
    // @page cannot read CSS variables, so write the page size into a style tag.
    let tag = document.getElementById('print-page-style');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'print-page-style';
      document.head.appendChild(tag);
    }
    tag.textContent = `@page { size: ${stock.sheet ? '210mm 297mm' : `${stock.w}mm ${stock.h}mm`}; margin: 0; }`;
    window.print();
    updateProgress((p) => ({ ...p, labelsPrintedAt: p.labelsPrintedAt || new Date().toISOString() }));
  };

  const toggleApiary = (a: Apiary) => {
    const ids = data.hives.filter((h) => h.apiary_id === a.id).map((h) => h.id);
    const allOn = ids.every((id) => selected.includes(id));
    setSelected(allOn ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };

  return (
    <>
      <div className="no-print">
        <Topbar title="Hive labels" backTo="/more" />
        <p className="muted" style={{ marginTop: 0 }}>Each label carries a QR code for that hive. Scan it in Honeyguide to open the hive or start an inspection. The code holds only the hive code, never your location.</p>

        <h3 className="h2">Hives</h3>
        {data.apiaries.map((a) => {
          const hs = data.hives.filter((h) => h.apiary_id === a.id).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
          if (!hs.length) return null;
          return (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <button className="btn ghost small" onClick={() => toggleApiary(a)} style={{ marginBottom: 8 }}>
                {hs.every((h) => selected.includes(h.id)) && <LuCheck />} {a.name}
              </button>
              <Pills label={`Hives at ${a.name}`} options={hs.map((h) => ({ value: h.id, label: h.name }))} value={selected} onChange={setSelected} />
            </div>
          );
        })}

        <h3 className="h2">Label stock</h3>
        <div className="stack">
          <Field label="Size">
            <select className="input" value={stock.id} onChange={(e) => setPrefs({ stock: e.target.value })}>
              {STOCKS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="field"><span>Show on the label</span>
            <Pills label="Label fields" options={FIELDS} value={prefs.fields} onChange={(v) => setPrefs({ fields: v as FieldKey[] })} />
            {prefs.fields.includes('reg') && !data.reg && <span className="small muted">Add your registration number in More › Profile to print it.</span>}
          </div>
          <div className="field"><span>Damage tolerance</span>
            <Seg<Ecc> label="Error correction" value={prefs.ecc} onChange={(v) => setPrefs({ ecc: v })}
              options={[{ value: 'M', label: 'Standard' }, { value: 'Q', label: 'Outdoor' }, { value: 'H', label: 'Rugged' }]} />
            <span className="small muted">Higher tolerance still scans when propolis, dirt or scratches cover part of the code, but the code gets denser.</span>
          </div>
          <div className="grid-2">
            <Field label="Copies per hive"><Stepper label="copies" min={1} max={6} value={prefs.copies} onChange={(v) => setPrefs({ copies: v })} /></Field>
            {stock.sheet && <Field label="Skip used labels" hint="part sheet"><Stepper label="labels to skip" min={0} max={perSheet - 1} value={skip} onChange={(v) => setPrefs({ skip: v })} /></Field>}
          </div>
          {qrMm < 20 ? (
            <div className="banner warn"><LuTriangleAlert /><div><b>Small code</b><p>The QR code will be {qrMm.toFixed(0)} mm. Codes under 20 mm can be hard to scan with gloves on. Choose a bigger label.</p></div></div>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>QR code {qrMm.toFixed(0)} mm wide: scans from about {Math.round(qrMm)} cm away (roughly 10× its width) in good light.</p>
          )}
        </div>

        <h3 className="h2">Preview</h3>
        <p className="small muted" style={{ marginTop: -4 }}>{labels.length} label{labels.length === 1 ? '' : 's'} · {pages.length} {stock.sheet ? `A4 sheet${pages.length === 1 ? '' : 's'}` : 'labels on the roll'}</p>
        <div className="label-preview">
          <div className="label-preview-inner">
            {labels.slice(0, 4).map((h, i) => (
              <Label key={i} hive={h} apiary={data.apiaries.find((a) => a.id === h.apiary_id)} reg={data.reg} stock={stock} prefs={prefs} />
            ))}
          </div>
        </div>
        <button className="btn" style={{ marginTop: 14 }} onClick={print}><LuPrinter /> Print labels</button>
        <p className="small muted">In the print dialog, set scale to 100% (or "Actual size") and margins to none. For outdoor hives, print on weatherproof vinyl labels or cover paper labels with clear tape.</p>
      </div>

      {/* Print-only output: true-size pages */}
      <div className="print-only">
        {pages.map((page, pi) => (
          <div key={pi} className={stock.sheet ? 'print-sheet' : 'print-roll'}
            style={stock.sheet ? {
              paddingTop: `${stock.sheet.top}mm`, paddingLeft: `${stock.sheet.left}mm`,
              gridTemplateColumns: `repeat(${stock.sheet.cols}, ${stock.w}mm)`, gridAutoRows: `${stock.h}mm`,
              columnGap: `${stock.sheet.gapX}mm`, rowGap: `${stock.sheet.gapY}mm`,
            } : undefined}>
            {page.map((h, i) => h
              ? <Label key={i} hive={h} apiary={data.apiaries.find((a) => a.id === h.apiary_id)} reg={data.reg} stock={stock} prefs={prefs} />
              : <div key={i} style={{ width: `${stock.w}mm`, height: `${stock.h}mm` }} />)}
          </div>
        ))}
      </div>
    </>
  );
}
