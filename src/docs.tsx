// Shared bits for business documents: rand formatting, invoice numbers and print-to-PDF.
import type { ReactNode } from 'react';
import * as db from './db';
import type { Contract, Job, Profile } from './db';

export const zar = (n?: number | null) =>
  n == null || Number.isNaN(n) ? '–' : `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Next invoice number for this year, e.g. INV-2026-007, counted across contracts and jobs on this phone. */
export async function nextInvoiceNo(now = new Date()) {
  const year = now.getFullYear();
  const [contracts, jobs] = await Promise.all([db.all<Contract>('contracts', true), db.all<Job>('jobs', true)]);
  const prefix = `INV-${year}-`;
  const used = [...contracts, ...jobs]
    .map((r) => r.invoice_no || '')
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)) || 0);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

/** Print the current screen's .print-doc on A4. */
export function printDoc() {
  let tag = document.getElementById('print-page-style');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'print-page-style';
    document.head.appendChild(tag);
  }
  tag.textContent = '@page { size: 210mm 297mm; margin: 16mm; }';
  document.body.classList.add('printing-doc');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-doc'), 500);
}

export interface InvoiceLine {
  description: string;
  qty: number;
  unit: number;
}

export function InvoiceDoc({ number, date, profile, to, lines, notes }: {
  number: string;
  date: string;
  profile?: Profile;
  to: { name: string; extra?: string };
  lines: InvoiceLine[];
  notes?: ReactNode;
}) {
  const total = lines.reduce((s, l) => s + l.qty * l.unit, 0);
  return (
    <div className="print-doc doc">
      <div className="doc-head">
        <div>
          <div className="doc-title">Invoice</div>
          <div className="doc-muted">{number} · {new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b>{profile?.display_name || 'Beekeeper'}</b>
          {profile?.registration_number && <div className="doc-muted">Beekeeper reg. {profile.registration_number}</div>}
          {profile?.invoice_details && <div className="doc-pre">{profile.invoice_details}</div>}
        </div>
      </div>
      <div className="doc-to"><div className="doc-muted">Bill to</div><b>{to.name}</b>{to.extra && <div className="doc-pre">{to.extra}</div>}</div>
      <table className="doc-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}><td>{l.description}</td><td>{l.qty}</td><td>{zar(l.unit)}</td><td>{zar(l.qty * l.unit)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total due</td><td>{zar(total)}</td></tr></tfoot>
      </table>
      {notes && <div className="doc-notes">{notes}</div>}
      <div className="doc-foot doc-muted">Made with Honeyguide. No VAT is charged unless a VAT number appears above.</div>
    </div>
  );
}

export async function getProfile() {
  return (await db.all<Profile>('profiles'))[0];
}
