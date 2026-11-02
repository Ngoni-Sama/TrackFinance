/**
 * TrackFinance AI assistant — a thin, rate-limited proxy to Cloudflare Workers AI.
 *
 * The app sends a compact JSON snapshot of the user's finances (built on the
 * phone, only after the user opts in) plus the chat so far. Nothing is stored
 * here: no logging of request bodies, no database of conversations.
 */

export interface Env {
  AI: Ai;
  /** Per-device + per-IP burst limit (Workers rate limiting binding). */
  LIMITER: RateLimit;
  /** Daily request counter, a hard cap so the free Workers AI allowance can't be drained. */
  USAGE: KVNamespace;
  MODEL: string;
  DAILY_LIMIT: string;
}

const CATEGORIES = [
  'food', 'transport', 'airtime', 'utilities', 'rent', 'loan_repayment', 'savings',
  'health', 'education', 'entertainment', 'subscriptions', 'family', 'business', 'other',
];

const MAX_CONTEXT_CHARS = 40_000;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 2_000;

const SYSTEM = `You are the money coach inside TrackFinance, a budgeting app for people in Zimbabwe who are paid and pay through EcoCash, OneMoney, Kashagi micro-loans, Omari savings and local banks. Amounts are USD unless marked ZWG.

You get CONTEXT: a JSON snapshot of the user's finances made on their phone — monthly totals by category, budgets, recurring payments detected from their SMS, upcoming bills, a month-end forecast, their savings goal, recent transactions with the original SMS text, and "user_labels": payments the user has classified themselves, with their own notes.

How to answer:
- Use only the numbers in CONTEXT. Quote real amounts, merchants and dates. Never invent transactions or purposes.
- The user's own labels and notes are ground truth. When a payment matches a labelled one (same person or merchant, similar amount), say so and use their label.
- When asked why money went somewhere, reason from evidence: who was paid (a business name vs a person's name), the SMS wording, the amount, how often and on which day it repeats, and the user's labels. Say how sure you are, and say plainly when the evidence isn't enough.
- Point out recurring costs and subscriptions they could cut, with the monthly and yearly saving.
- For forecasts, build on the forecast and recurring data in CONTEXT and show the arithmetic briefly.
- For their savings goal (e.g. becoming a millionaire), be honest and specific: monthly amount needed, years at the current rate, and 2–3 concrete changes from their own spending.
- Be concise and practical: short paragraphs or bullet points, about 200 words unless asked for more.
- You are not a licensed financial adviser; for investment products suggest they check with one. Mention this at most once.`;

const REASONS_SYSTEM = `${SYSTEM}

TASK: For each item in CONTEXT.to_explain, decide what the payment was most likely for, and pick one category from: ${CATEGORIES.join(', ')}.

Rules for accuracy:
- First check CONTEXT.user_labels and CONTEXT.merchant_memory: if the user already labelled this person/merchant (or a near-identical payment), use their category and say "you labelled ... as ...".
- Use the item's history (times paid, typical amount, usual day of month, cadence). A person paid a similar large amount around the same day each month is likely rent or school fees; a person paid small irregular amounts is usually family support or personal; a business name points to what that business sells.
- Do not guess a specific purpose the evidence doesn't show. If unsure, use category "other", confidence "low", and in "reason" state what is known (e.g. "regular payment to a person, purpose unknown").
- Always fill "question": one short question the user can answer to settle it (e.g. "Is the monthly $250 to Tendai Moyo your rent?"). Use "" only when confidence is high.
Reply only with JSON matching the schema.`;

const REASONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          reason: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          question: { type: 'string' },
        },
        required: ['id', 'category', 'reason', 'confidence', 'question'],
      },
    },
  },
  required: ['suggestions'],
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  mode?: 'chat' | 'reasons';
  messages: ChatMessage[];
  context: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function validate(body: unknown): ChatRequest | string {
  if (!body || typeof body !== 'object') return 'Body must be JSON.';
  const b = body as Partial<ChatRequest>;
  if (b.mode && b.mode !== 'chat' && b.mode !== 'reasons') return 'Unknown mode.';
  if (typeof b.context !== 'string') return 'Missing context.';
  if (b.context.length > MAX_CONTEXT_CHARS) return 'Context too large.';
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return 'Bad messages.';
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return 'Bad message.';
    if (m.content.length > MAX_MESSAGE_CHARS) return 'Message too long.';
  }
  return b as ChatRequest;
}

/** Counts today's requests in KV; KV is eventually consistent, so the cap is approximate (fine for a budget guard). */
async function underDailyCap(env: Env): Promise<boolean> {
  const key = `day:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.USAGE.get(key)) ?? 0);
  if (used >= Number(env.DAILY_LIMIT || 300)) return false;
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'trackfinance-ai' });
    if (request.method !== 'POST' || url.pathname !== '/v1/chat') return json({ error: 'Not found' }, 404);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const device = (request.headers.get('X-Device-Id') ?? '').slice(0, 64);
    const [ipOk, deviceOk] = await Promise.all([
      env.LIMITER.limit({ key: `ip:${ip}` }),
      device ? env.LIMITER.limit({ key: `dev:${device}` }) : Promise.resolve({ success: true }),
    ]);
    if (!ipOk.success || !deviceOk.success) return json({ error: 'Slow down — too many questions in a minute.' }, 429);

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return json({ error: 'Body must be JSON.' }, 400);
    }
    const req = validate(parsed);
    if (typeof req === 'string') return json({ error: req }, 400);

    if (!(await underDailyCap(env))) return json({ error: 'The assistant has reached today’s free limit. Try again tomorrow.' }, 429);

    const reasons = req.mode === 'reasons';
    const messages = [
      { role: 'system', content: reasons ? REASONS_SYSTEM : SYSTEM },
      { role: 'system', content: `CONTEXT:\n${req.context}` },
      ...req.messages,
    ];

    try {
      const result = (await env.AI.run(env.MODEL as keyof AiModels, {
        messages,
        max_tokens: reasons ? 1200 : 700,
        temperature: reasons ? 0.1 : 0.3,
        ...(reasons ? { response_format: { type: 'json_schema', json_schema: REASONS_SCHEMA } } : {}),
      } as never)) as { response?: unknown };

      if (reasons) {
        const raw = result.response;
        const data = typeof raw === 'string' ? safeParse(raw) : raw;
        return json({ suggestions: (data as { suggestions?: unknown[] } | undefined)?.suggestions ?? [] });
      }
      return json({ reply: String(result.response ?? '').trim() });
    } catch (e) {
      console.error('AI error', (e as Error).message);
      return json({ error: 'The assistant is unavailable right now.' }, 502);
    }
  },
} satisfies ExportedHandler<Env>;

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : undefined;
    } catch {
      return undefined;
    }
  }
}
