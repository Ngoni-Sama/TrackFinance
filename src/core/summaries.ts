import { addDays, endOfDay, endOfMonth, format, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { TxType } from '../sms/parsers/types';
import { percentChange, percentOf } from './utils';

/** Plain shapes so the maths is testable without the database. */
export interface TxLike {
  id: string;
  amount: number;
  currency: string;
  type: string;
  category?: string | null;
  counterparty?: string | null;
  occurredAt: number;
  balanceAfter?: number | null;
  dueAt?: number | null;
  senderId?: string;
}

export interface ExpenseLike {
  id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  occurredAt: number;
  transactionId?: string | null;
}

export type Direction = 'out' | 'in' | 'neutral';

export interface Entry {
  id: string;
  kind: 'sms' | 'manual';
  amount: number;
  currency: string;
  category: string;
  occurredAt: number;
  title: string;
  direction: Direction;
  type?: string;
}

export function directionOf(type: string): Direction {
  switch (type) {
    case TxType.Debit:
    case TxType.LoanRepayment:
      return 'out';
    case TxType.Credit:
    case TxType.LoanDisbursement:
      return 'in';
    default:
      // Savings transfers and loan reminders are not spending or income.
      return 'neutral';
  }
}

/** Merge SMS transactions with manual expenses; expenses linked to a transaction are not counted twice. */
export function toEntries(txs: TxLike[], expenses: ExpenseLike[]): Entry[] {
  const linked = new Set(expenses.filter((e) => e.transactionId).map((e) => e.transactionId));
  const fromTx: Entry[] = txs
    .filter((t) => !linked.has(t.id))
    .map((t) => ({
      id: t.id,
      kind: 'sms',
      amount: t.amount,
      currency: t.currency,
      category: t.category ?? 'other',
      occurredAt: t.occurredAt,
      title: t.counterparty || defaultTitle(t.type),
      direction: directionOf(t.type),
      type: t.type,
    }));
  const fromExp: Entry[] = expenses.map((e) => ({
    id: e.id,
    kind: 'manual',
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    occurredAt: e.occurredAt,
    title: e.description,
    direction: 'out',
  }));
  return [...fromTx, ...fromExp].sort((a, b) => b.occurredAt - a.occurredAt);
}

function defaultTitle(type: string): string {
  switch (type) {
    case TxType.Credit:
      return 'Money received';
    case TxType.Debit:
      return 'Payment';
    case TxType.TransferToSavings:
      return 'To savings';
    case TxType.TransferFromSavings:
      return 'From savings';
    case TxType.LoanDisbursement:
      return 'Loan received';
    case TxType.LoanRepayment:
      return 'Loan repayment';
    case TxType.LoanReminder:
      return 'Loan reminder';
    default:
      return 'Transaction';
  }
}

export function sumEntries(entries: Entry[], dir: Direction, currency: string, start: Date, end: Date): number {
  const s = start.getTime();
  const e = end.getTime();
  return entries
    .filter((x) => x.direction === dir && x.currency === currency && x.occurredAt >= s && x.occurredAt <= e)
    .reduce((acc, x) => acc + x.amount, 0);
}

export interface CategoryShare {
  category: string;
  amount: number;
  percentage: number;
}

export function categoryBreakdown(entries: Entry[], currency: string, start: Date, end: Date): CategoryShare[] {
  const totals = new Map<string, number>();
  const s = start.getTime();
  const e = end.getTime();
  for (const x of entries) {
    if (x.direction !== 'out' || x.currency !== currency || x.occurredAt < s || x.occurredAt > e) continue;
    totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount);
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, percentage: percentOf(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

export interface DashboardSummary {
  todaySpend: number;
  monthSpend: number;
  lastMonthSpend: number;
  /** Signed % change vs the same span of last month; null when last month had no spending. */
  monthChangePct: number | null;
  monthIncome: number;
  /** Share of this month's income already spent. */
  spentOfIncomePct: number;
  /** Elapsed share of the month — compare against spentOfIncomePct. */
  monthElapsedPct: number;
  categories: CategoryShare[];
  monthlyTrend: { label: string; spend: number; income: number }[];
}

export function dashboardSummary(entries: Entry[], currency: string, now = new Date()): DashboardSummary {
  const monthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  // Compare month-to-date with the same number of days last month, not the full month.
  const lastMonthSameDay = endOfDay(new Date(Math.min(addDays(lastMonthStart, now.getDate() - 1).getTime(), endOfMonth(lastMonthStart).getTime())));

  const monthSpend = sumEntries(entries, 'out', currency, monthStart, now);
  const lastMonthSpend = sumEntries(entries, 'out', currency, lastMonthStart, lastMonthSameDay);
  const monthIncome = sumEntries(entries, 'in', currency, monthStart, now);
  const daysInMonth = endOfMonth(now).getDate();

  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(now, i);
    const s = startOfMonth(m);
    const e = endOfMonth(m);
    monthlyTrend.push({
      label: format(m, 'MMM'),
      spend: sumEntries(entries, 'out', currency, s, e),
      income: sumEntries(entries, 'in', currency, s, e),
    });
  }

  return {
    todaySpend: sumEntries(entries, 'out', currency, startOfDay(now), endOfDay(now)),
    monthSpend,
    lastMonthSpend,
    monthChangePct: percentChange(monthSpend, lastMonthSpend),
    monthIncome,
    spentOfIncomePct: percentOf(monthSpend, monthIncome),
    monthElapsedPct: percentOf(now.getDate(), daysInMonth),
    categories: categoryBreakdown(entries, currency, monthStart, now),
    monthlyTrend,
  };
}

export interface DayGroup {
  day: string; // yyyy-MM-dd
  date: Date;
  total: number;
  byCategory: CategoryShare[];
  entries: Entry[];
}

/** Spending grouped per day (newest first), each with its category split. */
export function groupSpendingByDay(entries: Entry[], currency: string): DayGroup[] {
  const groups = new Map<string, Entry[]>();
  for (const x of entries) {
    if (x.direction !== 'out' || x.currency !== currency) continue;
    const key = format(x.occurredAt, 'yyyy-MM-dd');
    const list = groups.get(key) ?? [];
    list.push(x);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([day, list]) => {
      const date = startOfDay(list[0].occurredAt);
      return {
        day,
        date,
        total: list.reduce((a, b) => a + b.amount, 0),
        byCategory: categoryBreakdown(list, currency, date, endOfDay(date)),
        entries: list.sort((a, b) => b.occurredAt - a.occurredAt),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface LoanStatus {
  /** Amount still owed. */
  outstanding: number;
  currency: string;
  dueAt?: number;
  /** Total owed on the current loan (from the disbursement SMS). */
  owedTotal?: number;
  /** Share of owedTotal repaid so far. */
  repaidPct?: number;
}

/** Current Kashagi position from the latest loan-related SMS; null when nothing is owed. */
export function pendingLoan(txs: TxLike[]): LoanStatus | null {
  const loanTypes = [TxType.LoanDisbursement, TxType.LoanRepayment, TxType.LoanReminder] as string[];
  const loans = txs.filter((t) => loanTypes.includes(t.type)).sort((a, b) => a.occurredAt - b.occurredAt);
  if (!loans.length) return null;

  const lastDisbursement = [...loans].reverse().find((t) => t.type === TxType.LoanDisbursement);
  const owedTotal = lastDisbursement?.balanceAfter ?? undefined;
  const since = lastDisbursement?.occurredAt ?? 0;
  const repaid = loans
    .filter((t) => t.type === TxType.LoanRepayment && t.occurredAt >= since)
    .reduce((a, t) => a + t.amount, 0);

  const latest = loans[loans.length - 1];
  let outstanding: number;
  if (latest.balanceAfter != null) outstanding = latest.balanceAfter;
  else if (owedTotal != null) outstanding = Math.max(0, owedTotal - repaid);
  else outstanding = latest.type === TxType.LoanRepayment ? 0 : latest.amount;

  if (outstanding <= 0) return null;
  const dueAt = [...loans].reverse().find((t) => t.dueAt)?.dueAt ?? undefined;
  return {
    outstanding,
    currency: latest.currency,
    dueAt,
    owedTotal,
    repaidPct: owedTotal ? percentOf(owedTotal - outstanding, owedTotal) : undefined,
  };
}

/** Latest savings balance reported by an Omari SMS. */
export function savingsBalance(txs: TxLike[]): { balance: number; currency: string } | null {
  const s = txs
    .filter((t) => (t.type === TxType.TransferToSavings || t.type === TxType.TransferFromSavings) && /omari/i.test(t.senderId ?? '') && t.balanceAfter != null)
    .sort((a, b) => b.occurredAt - a.occurredAt)[0];
  return s ? { balance: s.balanceAfter!, currency: s.currency } : null;
}

export interface BudgetLike {
  category: string;
  amount: number;
  currency: string;
}

export interface BudgetUsage extends BudgetLike {
  spent: number;
  percentage: number;
  over: boolean;
}

export function budgetUsage(budgets: BudgetLike[], entries: Entry[], now = new Date()): BudgetUsage[] {
  return budgets.map((b) => {
    const spent = entries
      .filter((x) => x.direction === 'out' && x.currency === b.currency && x.category === b.category && x.occurredAt >= startOfMonth(now).getTime() && x.occurredAt <= now.getTime())
      .reduce((a, x) => a + x.amount, 0);
    return { ...b, spent, percentage: percentOf(spent, b.amount), over: spent > b.amount };
  });
}
