import { format } from 'date-fns';
import { TxType } from '../sms/parsers/types';
import { hashString } from './utils';

/**
 * Duplicate detection for SMS transactions.
 *
 * The same SMS reaches the app twice: once from the live SMS listener and
 * again from the inbox scan. The two copies can differ in sender format
 * ("+263164USD" vs "263164USD") and timestamp (SMS-centre time vs receive
 * time), so neither may be part of the fingerprint as-is.
 */

export function normaliseSender(sender: string): string {
  return sender.toUpperCase().replace(/[\s+\-_.]/g, '');
}

export type SenderFamily = 'ecocash' | 'kashagi' | 'omari' | 'onemoney' | 'bank' | 'other';

export function senderFamily(sender: string): SenderFamily {
  const s = normaliseSender(sender);
  if (s.includes('263165')) return 'kashagi';
  if (s.includes('263164')) return 'ecocash';
  if (s.includes('OMARI')) return 'omari';
  if (s.includes('ONEMONEY')) return 'onemoney';
  if (/^(CBZ|STEWARD|FBC|ZB|NMB|STANBIC|BANCABC)/.test(s)) return 'bank';
  return 'other';
}

const normaliseBody = (body: string) => body.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Same SMS → same fingerprint, however it arrived. Uses the transaction
 * reference when the SMS has one; otherwise the sender family, the text and
 * the day (an identical money SMS, balance included, on the same day is the
 * same message).
 */
export function fingerprint(p: { senderId: string; rawBody: string; date: Date | number; reference?: string | null }): string {
  if (p.reference) return `ref:${p.reference.toUpperCase()}`;
  const day = format(p.date, 'yyyy-MM-dd');
  return `h2:${hashString(`${senderFamily(p.senderId)}|${day}|${normaliseBody(p.rawBody)}`)}`;
}

export interface DedupeRow {
  id: string;
  amount: number;
  currency: string;
  type: string;
  senderId: string;
  rawBody: string;
  reference?: string | null;
  occurredAt: number;
  counterparty?: string | null;
}

const TWIN_WINDOW_MS = 15 * 60 * 1000;
const isLoanType = (t: string) => t === TxType.LoanDisbursement || t === TxType.LoanRepayment;
const isSavingsType = (t: string) => t === TxType.TransferToSavings || t === TxType.TransferFromSavings;

/**
 * One payment reported by two senders: EcoCash ↔ Omari for savings moves,
 * EcoCash ↔ Kashagi for loans. Same amount and currency, minutes apart.
 * Returns which of the two to keep (the one from the specialised sender,
 * because it carries the savings/loan meaning), or null if not twins.
 */
export function crossSourceTwin(a: DedupeRow, b: DedupeRow): { keep: DedupeRow; drop: DedupeRow } | null {
  if (a.amount !== b.amount || a.currency !== b.currency) return null;
  if (Math.abs(a.occurredAt - b.occurredAt) > TWIN_WINDOW_MS) return null;
  const fa = senderFamily(a.senderId);
  const fb = senderFamily(b.senderId);
  if (fa === fb) return null;

  const pair = (special: SenderFamily, matches: (r: DedupeRow) => boolean) => {
    const [s, e] = fa === special && fb === 'ecocash' ? [a, b] : fb === special && fa === 'ecocash' ? [b, a] : [null, null];
    if (!s || !e) return null;
    // The EcoCash side must point at the same product, or already be typed like it.
    return matches(e) ? { keep: s, drop: e } : null;
  };

  return (
    pair('omari', (e) => isSavingsType(e.type) || /omari/i.test(e.counterparty ?? '') || /omari/i.test(e.rawBody)) ??
    pair('kashagi', (e) => isLoanType(e.type) || /kashagi/i.test(e.counterparty ?? '') || /kashagi|loan/i.test(e.rawBody))
  );
}

export interface DuplicateGroup {
  key: string;
  keep: DedupeRow;
  remove: DedupeRow[];
  reason: string;
}

/**
 * Duplicate groups already in the database (e.g. saved before this fix).
 * Keeps the earliest copy of a repeated SMS, and the specialised side of a
 * cross-source twin.
 */
export function findDuplicateGroups(rows: DedupeRow[]): DuplicateGroup[] {
  const sorted = [...rows].sort((a, b) => a.occurredAt - b.occurredAt);
  const used = new Set<string>();
  const groups: DuplicateGroup[] = [];

  const byFp = new Map<string, DedupeRow[]>();
  for (const r of sorted) {
    const fp = fingerprint({ ...r, date: r.occurredAt });
    byFp.set(fp, [...(byFp.get(fp) ?? []), r]);
  }
  for (const [fp, list] of byFp) {
    if (list.length < 2) continue;
    const [keep, ...remove] = list;
    list.forEach((r) => used.add(r.id));
    groups.push({
      key: fp,
      keep,
      remove,
      reason: fp.startsWith('ref:') ? `Same transaction ID (${keep.reference})` : 'Same SMS saved more than once',
    });
  }

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length && sorted[j].occurredAt - a.occurredAt <= TWIN_WINDOW_MS; j++) {
      const b = sorted[j];
      if (used.has(b.id)) continue;
      const twin = crossSourceTwin(a, b);
      if (!twin) continue;
      used.add(a.id).add(b.id);
      const product = senderFamily(twin.keep.senderId) === 'omari' ? 'Omari savings' : 'Kashagi loan';
      groups.push({ key: `twin:${twin.keep.id}:${twin.drop.id}`, keep: twin.keep, remove: [twin.drop], reason: `Same ${product} move, reported by EcoCash and ${product.split(' ')[0]}` });
      break;
    }
  }
  return groups;
}
