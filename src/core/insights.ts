import { addDays, addMonths, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { normaliseMerchant } from './categorise';
import { Entry, sumEntries } from './summaries';

// ── Recurring payments ────────────────────────────────────────────────────

export type Cadence = 'weekly' | 'fortnightly' | 'monthly';

export interface Recurring {
  merchant: string; // display name
  key: string; // normalised
  category: string;
  currency: string;
  cadence: Cadence;
  averageAmount: number;
  lastAt: number;
  nextAt: number;
  occurrences: number;
  /** 0–100: how regular the gaps and amounts are. */
  confidence: number;
  /** Monthly cost, so weekly and monthly items can be compared. */
  monthlyCost: number;
}

const CADENCES: { cadence: Cadence; days: number; tolerance: number; perMonth: number }[] = [
  { cadence: 'weekly', days: 7, tolerance: 2, perMonth: 52 / 12 },
  { cadence: 'fortnightly', days: 14, tolerance: 3, perMonth: 26 / 12 },
  { cadence: 'monthly', days: 30.4, tolerance: 5, perMonth: 1 },
];

/** Next occurrence: monthly bills keep their day of month (rent on the 1st stays on the 1st). */
function step(at: number | Date, cadence: Cadence): number {
  if (cadence === 'monthly') return addMonths(at, 1).getTime();
  return addDays(at, cadence === 'weekly' ? 7 : 14).getTime();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Find payments that repeat on a schedule: same merchant, similar amount,
 * regular gaps (weekly / fortnightly / monthly). Needs at least 2 payments;
 * confidence rises with more, steadier ones. Rent, DStv, ZESA top-ups, school
 * fees, subscriptions and loan repayments all show up here.
 */
export function detectRecurring(entries: Entry[], now = new Date()): Recurring[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.direction !== 'out' || !e.title) continue;
    const key = `${normaliseMerchant(e.title)}|${e.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.occurredAt - b.occurredAt);
    // Same-day duplicates (split payments) count once.
    const days = sorted.filter((e, i) => i === 0 || differenceInCalendarDays(e.occurredAt, sorted[i - 1].occurredAt) > 0);
    if (days.length < 2) continue;

    const gaps = days.slice(1).map((e, i) => differenceInCalendarDays(e.occurredAt, days[i].occurredAt));
    const gap = median(gaps);
    const match = CADENCES.find((c) => Math.abs(gap - c.days) <= c.tolerance);
    if (!match) continue;

    const amounts = days.map((e) => e.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountSpread = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg));
    if (amountSpread > 0.35) continue; // groceries at the same shop vary too much to call it a bill

    const gapSpread = Math.max(...gaps.map((g) => Math.abs(g - match.days)));
    const last = days[days.length - 1];
    // Stale: missed two cycles in a row, probably cancelled.
    if (differenceInCalendarDays(now, last.occurredAt) > match.days * 2 + match.tolerance) continue;

    const regularity = Math.max(0, 1 - gapSpread / (match.tolerance * 2));
    const steadiness = Math.max(0, 1 - amountSpread / 0.35);
    const evidence = Math.min(1, (days.length - 1) / 3);
    const confidence = Math.round(100 * (0.4 * regularity + 0.3 * steadiness + 0.3 * evidence));

    out.push({
      merchant: last.title,
      key: key.split('|')[0],
      category: last.category,
      currency: last.currency,
      cadence: match.cadence,
      averageAmount: Math.round(avg * 100) / 100,
      lastAt: last.occurredAt,
      nextAt: step(startOfDay(last.occurredAt), match.cadence),
      occurrences: days.length,
      confidence,
      monthlyCost: Math.round(avg * match.perMonth * 100) / 100,
    });
  }
  return out.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

// ── Upcoming payments ─────────────────────────────────────────────────────

export interface Upcoming {
  title: string;
  amount: number;
  currency: string;
  dueAt: number;
  kind: 'recurring' | 'loan' | 'invoice';
  category?: string;
  confidence?: number;
}

/** Everything expected in the next `days` days: predicted bills, loan due dates, invoices owed to you. */
export function upcomingPayments(
  recurring: Recurring[],
  extras: Upcoming[],
  now = new Date(),
  days = 31,
): Upcoming[] {
  const end = addDays(now, days).getTime();
  const out: Upcoming[] = [];
  for (const r of recurring) {
    // Roll forward past "now" so an overdue prediction shows its next date.
    let next = r.nextAt;
    while (next < startOfDay(now).getTime()) next = step(next, r.cadence);
    for (; next <= end; next = step(next, r.cadence)) {
      out.push({ title: r.merchant, amount: r.averageAmount, currency: r.currency, dueAt: next, kind: 'recurring', category: r.category, confidence: r.confidence });
    }
  }
  for (const x of extras) if (x.dueAt >= startOfDay(now).getTime() && x.dueAt <= end) out.push(x);
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

// ── Month-end forecast ────────────────────────────────────────────────────

export interface MonthForecast {
  spentSoFar: number;
  /** Predicted total spend by the last day of this month. */
  projected: number;
  /** Bills still expected before month end. */
  upcomingBills: number;
  /** Day-to-day (non-recurring) spend per day so far. */
  dailyRate: number;
  income: number;
  /** projected / income as a percentage (0 when no income). */
  projectedOfIncomePct: number;
  /** Average monthly spend over the previous 3 full months. */
  typicalMonth: number;
}

export function forecastMonth(entries: Entry[], recurring: Recurring[], currency: string, now = new Date()): MonthForecast {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const spentSoFar = sumEntries(entries, 'out', currency, monthStart, now);
  const income = sumEntries(entries, 'in', currency, monthStart, now);

  const recurringKeys = new Set(recurring.filter((r) => r.currency === currency).map((r) => r.key));
  const discretionary = entries
    .filter((e) => e.direction === 'out' && e.currency === currency && e.occurredAt >= monthStart.getTime() && e.occurredAt <= now.getTime())
    .filter((e) => !recurringKeys.has(normaliseMerchant(e.title)))
    .reduce((a, e) => a + e.amount, 0);
  const elapsed = Math.max(1, now.getDate());
  const remaining = monthEnd.getDate() - now.getDate();
  const dailyRate = discretionary / elapsed;

  const upcomingBills = upcomingPayments(recurring.filter((r) => r.currency === currency), [], now, remaining)
    .filter((u) => u.dueAt <= monthEnd.getTime() && u.dueAt > now.getTime())
    .reduce((a, u) => a + u.amount, 0);

  const projected = spentSoFar + dailyRate * remaining + upcomingBills;
  const typicalMonth =
    [1, 2, 3].map((i) => sumEntries(entries, 'out', currency, startOfMonth(subMonths(now, i)), endOfMonth(subMonths(now, i)))).reduce((a, b) => a + b, 0) / 3;

  return {
    spentSoFar,
    projected: Math.round(projected * 100) / 100,
    upcomingBills: Math.round(upcomingBills * 100) / 100,
    dailyRate: Math.round(dailyRate * 100) / 100,
    income,
    projectedOfIncomePct: income > 0 ? (projected / income) * 100 : 0,
    typicalMonth: Math.round(typicalMonth * 100) / 100,
  };
}

// ── Millionaire goal ──────────────────────────────────────────────────────

export interface GoalInput {
  target: number; // e.g. 1_000_000
  current: number; // savings + investments today
  monthlySaving: number; // what you put away each month
  annualReturn: number; // e.g. 8 for 8% a year
}

export interface GoalPlan {
  progressPct: number;
  /** Months until the target at the current saving rate; null if never (saving ≤ 0 and no growth). */
  monthsToGoal: number | null;
  /** Monthly saving needed to reach the target in `years`. */
  neededPerMonth: (years: number) => number;
}

/** Future value with monthly compounding: how long until current + monthly saving grows to target. */
export function planGoal({ target, current, monthlySaving, annualReturn }: GoalInput): GoalPlan {
  const r = annualReturn / 100 / 12;
  const progressPct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;

  let monthsToGoal: number | null = null;
  if (current >= target) monthsToGoal = 0;
  else if (r === 0) monthsToGoal = monthlySaving > 0 ? Math.ceil((target - current) / monthlySaving) : null;
  else {
    // FV = P(1+r)^n + S((1+r)^n − 1)/r  →  solve for n.
    const num = target * r + monthlySaving;
    const den = current * r + monthlySaving;
    monthsToGoal = den > 0 && num / den > 0 ? Math.ceil(Math.log(num / den) / Math.log(1 + r)) : null;
  }

  const neededPerMonth = (years: number) => {
    const n = years * 12;
    if (n <= 0) return Math.max(0, target - current);
    if (r === 0) return Math.max(0, (target - current) / n);
    const growth = Math.pow(1 + r, n);
    return Math.max(0, ((target - current * growth) * r) / (growth - 1));
  };

  return { progressPct, monthsToGoal, neededPerMonth };
}

/** Average monthly (income − spending) over the last `months` full months. */
export function averageMonthlySaving(entries: Entry[], currency: string, months = 3, now = new Date()): number {
  let total = 0;
  for (let i = 1; i <= months; i++) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(subMonths(now, i));
    total += sumEntries(entries, 'in', currency, s, e) - sumEntries(entries, 'out', currency, s, e);
  }
  return total / months;
}
