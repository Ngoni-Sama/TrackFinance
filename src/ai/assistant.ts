import Constants from 'expo-constants';
import { format, startOfMonth, subMonths, endOfMonth, getDate } from 'date-fns';
import { normaliseMerchant } from '../core/categorise';
import { GoalInput, MonthForecast, planGoal, Recurring, Upcoming } from '../core/insights';
import { BudgetUsage, categoryBreakdown, Entry, LoanStatus, sumEntries } from '../core/summaries';
import { database } from '../data/db';
import { loadAiConfig } from './config';
import { COACH_SYSTEM, REASONS_SCHEMA, REASONS_SYSTEM } from './prompts';
import { claudeChat, claudeJson } from './providers/claude';
import { geminiChat, geminiJson } from './providers/gemini';
import { openaiChat, openaiJson } from './providers/openai';
import { ChatMessage, Suggestion } from './types';

export type { ChatMessage, Suggestion } from './types';

const AI_URL: string = (Constants.expoConfig?.extra as { aiUrl?: string } | undefined)?.aiUrl ?? '';

export const isAssistantConfigured = AI_URL.length > 0;

/** Random per-install id, only used by the free server's rate limiter. */
async function deviceId(): Promise<string> {
  const key = 'device_id';
  let id = await database.localStorage.get<string>(key);
  if (!id) {
    id = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    await database.localStorage.set(key, id);
  }
  return id;
}

async function callWorker<T>(body: object): Promise<T> {
  if (!AI_URL) throw new Error('The free assistant is not configured in this build.');
  const res = await fetch(`${AI_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': await deviceId() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `Assistant error (${res.status})`);
  return data;
}

async function withKey() {
  const cfg = await loadAiConfig();
  if (cfg.provider !== 'cloudflare' && !cfg.apiKey) throw new Error('Add your API key in Settings → AI provider.');
  return cfg as typeof cfg & { apiKey: string };
}

export async function askAssistant(messages: ChatMessage[], context: string): Promise<string> {
  const recent = messages.slice(-12);
  const cfg = await withKey();
  switch (cfg.provider) {
    case 'claude':
      return claudeChat(cfg.apiKey, cfg.model, COACH_SYSTEM, context, recent);
    case 'openai':
      return openaiChat(cfg.apiKey, cfg.model, COACH_SYSTEM, context, recent);
    case 'gemini':
      return geminiChat(cfg.apiKey, cfg.model, COACH_SYSTEM, context, recent);
    default:
      return (await callWorker<{ reply: string }>({ mode: 'chat', messages: recent, context })).reply;
  }
}

const EXPLAIN = 'Explain the payments in to_explain.';

export async function explainPayments(context: string): Promise<Suggestion[]> {
  const cfg = await withKey();
  let out: { suggestions?: Suggestion[] };
  switch (cfg.provider) {
    case 'claude':
      out = await claudeJson(cfg.apiKey, cfg.model, REASONS_SYSTEM, context, EXPLAIN, REASONS_SCHEMA);
      break;
    case 'openai':
      out = await openaiJson(cfg.apiKey, cfg.model, REASONS_SYSTEM, context, EXPLAIN, REASONS_SCHEMA);
      break;
    case 'gemini':
      out = await geminiJson(cfg.apiKey, cfg.model, REASONS_SYSTEM, context, EXPLAIN, REASONS_SCHEMA);
      break;
    default:
      out = await callWorker<{ suggestions: Suggestion[] }>({ mode: 'reasons', messages: [{ role: 'user', content: EXPLAIN }], context });
  }
  return Array.isArray(out.suggestions) ? out.suggestions : [];
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
  /** Payments the user classified themselves (ground truth for the model). */
  labelled?: { title: string; amount: number; currency: string; category: string; note?: string | null; occurredAt: number }[];
  /** Merchant/person → category the user chose before. */
  merchantMemory?: Record<string, string>;
}

/** How often, how much and when this merchant/person has been paid: evidence for guessing why. */
export function merchantHistory(entries: Entry[], title: string) {
  const key = normaliseMerchant(title);
  const paid = entries.filter((e) => e.direction === 'out' && normaliseMerchant(e.title) === key).sort((a, b) => a.occurredAt - b.occurredAt);
  if (!paid.length) return undefined;
  const amounts = paid.map((e) => e.amount).sort((a, b) => a - b);
  const days = paid.map((e) => getDate(e.occurredAt));
  const dayCounts = new Map<number, number>();
  days.forEach((d) => dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1));
  const [usualDay, usualDayCount] = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    times_paid: paid.length,
    total: r2(paid.reduce((a, e) => a + e.amount, 0)),
    typical_amount: amounts[Math.floor(amounts.length / 2)],
    smallest: amounts[0],
    largest: amounts[amounts.length - 1],
    first: format(paid[0].occurredAt, 'yyyy-MM-dd'),
    last: format(paid[paid.length - 1].occurredAt, 'yyyy-MM-dd'),
    usual_day_of_month: usualDayCount > 1 ? usualDay : undefined,
    looks_like: /^[A-Z][A-Z'-]+( [A-Z][A-Z'-]+){1,2}$/.test(title.trim()) && !/(LTD|PVT|INC|SHOP|STORE|BANK|ZIMBABWE|PHARMACY|SCHOOL)/i.test(title)
      ? 'a person'
      : 'a business or service',
  };
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
    user_labels: (input.labelled ?? []).slice(0, 60).map((l) => ({
      title: l.title, amount: l.amount, currency: l.currency, category: l.category, note: l.note || undefined, date: format(l.occurredAt, 'yyyy-MM-dd'),
    })),
    merchant_memory: input.merchantMemory,
    to_explain: input.toExplain
      ? entries.filter((e) => input.toExplain!.includes(e.id)).map((e) => ({ ...tx(e), history: merchantHistory(entries, e.title) }))
      : undefined,
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
