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

You are given CONTEXT: a JSON snapshot of the user's finances made on their phone — monthly totals by category, budgets, recurring payments detected from their SMS, upcoming bills, a month-end forecast, their savings goal, and recent transactions with the original SMS text.

How to answer:
- Use the numbers in CONTEXT. Quote real amounts, merchants and dates. Never invent transactions.
- When asked why money went somewhere, reason from the merchant name, amount, timing and SMS wording (e.g. a monthly payment to a person on the 1st is probably rent; small daily ZUPCO payments are commuting). Say how sure you are.
- Point out recurring costs and subscriptions they could cut, and what that would save per month and per year.
- For forecasts, build on the forecast and recurring data in CONTEXT; show the arithmetic briefly.
- For their savings goal (e.g. becoming a millionaire), be honest and specific: monthly amount needed, years at the current rate, and 2–3 concrete changes from their own spending.
- Be concise and practical: short paragraphs or bullet points, no more than ~200 words unless asked.
- You are not a licensed financial adviser; for investment products, suggest they check with one. Do not mention this more than once.`;

const REASONS_SYSTEM = `${SYSTEM}

TASK: For each transaction in "to_explain" in CONTEXT, guess what the payment was most likely for and pick one category from: ${CATEGORIES.join(', ')}. Reply only with JSON matching the schema.`;

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
        },
        required: ['id', 'category', 'reason', 'confidence'],
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
        temperature: 0.3,
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
