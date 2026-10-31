import Constants from 'expo-constants';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { GoalInput, MonthForecast, planGoal, Recurring, Upcoming } from '../core/insights';
import { BudgetUsage, categoryBreakdown, Entry, LoanStatus, sumEntries } from '../core/summaries';
import { database } from '../data/db';

const AI_URL: string = (Constants.expoConfig?.extra as { aiUrl?: string } | undefined)?.aiUrl ?? '';

export const isAssistantConfigured = AI_URL.length > 0;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Suggestion {
  id: string;
  category: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

/** Random per-install id, only used by the server's rate limiter. */
async function deviceId(): Promise<string> {
  const key = 'device_id';
  let id = await database.localStorage.get<string>(key);
  if (!id) {
    id = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    await database.localStorage.set(key, id);
  }
  return id;
}

async function call<T>(body: object): Promise<T> {
  if (!AI_URL) throw new Error('The assistant is not configured in this build.');
  const res = await fetch(`${AI_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': await deviceId() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `Assistant error (${res.status})`);
  return data;
}

export async function askAssistant(messages: ChatMessage[], context: string): Promise<string> {
  // The server accepts at most 16 messages; keep the latest turns.
  const { reply } = await call<{ reply: string }>({ mode: 'chat', messages: messages.slice(-12), context });
  return reply;
}

export async function explainPayments(context: string): Promise<Suggestion[]> {
  const { suggestions } = await call<{ suggestions: Suggestion[] }>({
    mode: 'reasons',
    messages: [{ role: 'user', content: 'Explain the payments in to_explain.' }],
    context,
  });
  return Array.isArray(suggestions) ? suggestions : [];
}

// ── Context snapshot ──────────────────────────────────────────────────────

export interface SnapshotInput {
  currency: string;
  entries: Entry[];
  /** Raw SMS text by transaction id, so the model can read the original wording. */
  smsById: Map<string, string>;
  recurring: Recurring[];
  upcoming: Upcoming[];
  forecast: MonthForecast;
  budgets: BudgetUsage[];
  loan: LoanStatus | null;
  savings: { balance: number; currency: string } | null;
  goal: GoalInput;
  /** Transaction ids to ask "what was this for?" about. */
  toExplain?: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const MAX_CHARS = 38_000;

/**
 * Builds the JSON the assistant sees. This is the only financial data that
 * leaves the phone, and only when the user has turned the assistant on and
 * asks it something.
 */
export function buildSnapshot(input: SnapshotInput, now = new Date()): string {
  const { currency, entries } = input;
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = subMonths(now, 5 - i);
    const s = startOfMonth(m);
    const e = i === 5 ? now : endOfMonth(m);
    return {
      month: format(m, 'yyyy-MM'),
      spent: r2(sumEntries(entries, 'out', currency, s, e)),
      received: r2(sumEntries(entries, 'in', currency, s, e)),
      by_category: Object.fromEntries(categoryBreakdown(entries, currency, s, e).map((c) => [c.category, r2(c.amount)])),
    };
  });

  const plan = planGoal(input.goal);
  const tx = (e: Entry) => ({
    id: e.id,
    date: format(e.occurredAt, 'yyyy-MM-dd HH:mm'),
    dir: e.direction,
    amount: e.amount,
    currency: e.currency,
    title: e.title,
    category: e.category,
    sms: input.smsById.get(e.id)?.slice(0, 220),
  });

  const recent = entries.filter((e) => e.currency === currency).slice(0, 80);
  const snapshot = {
    today: format(now, 'yyyy-MM-dd'),
    currency,
    months,
    forecast_this_month: input.forecast,
    budgets: input.budgets.map((b) => ({ category: b.category, limit: b.amount, spent: r2(b.spent), used_pct: Math.round(b.percentage) })),
    recurring: input.recurring.map((r) => ({
      merchant: r.merchant, cadence: r.cadence, average: r.averageAmount, monthly_cost: r.monthlyCost,
      category: r.category, next: format(r.nextAt, 'yyyy-MM-dd'), seen: r.occurrences, confidence_pct: r.confidence,
    })),
    upcoming_31_days: input.upcoming.map((u) => ({ title: u.title, amount: u.amount, due: format(u.dueAt, 'yyyy-MM-dd'), kind: u.kind })),
    kashagi_loan: input.loan,
    omari_savings: input.savings,
    goal: {
      ...input.goal,
      progress_pct: r2(plan.progressPct),
      years_at_current_rate: plan.monthsToGoal == null ? 'never at current rate' : r2(plan.monthsToGoal / 12),
      needed_per_month_10y: r2(plan.neededPerMonth(10)),
      needed_per_month_20y: r2(plan.neededPerMonth(20)),
    },
    to_explain: input.toExplain ? entries.filter((e) => input.toExplain!.includes(e.id)).map(tx) : undefined,
    recent_transactions: recent.map(tx),
  };

  // Trim the oldest transactions until it fits the server's size limit.
  let json = JSON.stringify(snapshot);
  while (json.length > MAX_CHARS && snapshot.recent_transactions.length > 10) {
    snapshot.recent_transactions = snapshot.recent_transactions.slice(0, Math.floor(snapshot.recent_transactions.length * 0.75));
    json = JSON.stringify(snapshot);
  }
  return json;
}
