import { round2 } from './currency';

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceTotals {
  lines: (LineItemInput & { lineTotal: number })[];
  subtotal: number;
  tax: number;
  total: number;
}

/** taxRate is a percentage, e.g. 15 for 15% VAT. */
export function computeInvoiceTotals(items: LineItemInput[], taxRate: number): InvoiceTotals {
  const lines = items
    .filter((i) => i.description.trim() && i.quantity > 0)
    .map((i) => ({ ...i, lineTotal: round2(i.quantity * i.unitPrice) }));
  const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
  const tax = round2((subtotal * (taxRate || 0)) / 100);
  return { lines, subtotal, tax, total: round2(subtotal + tax) };
}

/** Next number in the "INV-2026-001" sequence for the given year. */
export function nextInvoiceNumber(prefix: string, year: number, existing: string[]): string {
  const p = `${prefix || 'INV'}-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(p))
    .map((n) => parseInt(n.slice(p.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${p}${String(max + 1).padStart(3, '0')}`;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

/** Share of invoiced value that has been paid, for the invoices percentage view. */
export function collectionRate(invoices: { total: number; status: string; currency: string }[], currency: string) {
  const relevant = invoices.filter((i) => i.currency === currency && i.status !== 'draft');
  const billed = relevant.reduce((a, i) => a + i.total, 0);
  const paid = relevant.filter((i) => i.status === 'paid').reduce((a, i) => a + i.total, 0);
  return { billed, paid, outstanding: round2(billed - paid), percentage: billed ? (paid / billed) * 100 : 0 };
}
