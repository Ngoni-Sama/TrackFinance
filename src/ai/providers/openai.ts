import { ChatMessage } from '../types';

/** Editable in Settings → AI provider; check platform.openai.com/docs/models for current names. */
export const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';

async function call(apiKey: string, body: object): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string; refusal?: string } }[];
  };
  if (!res.ok) throw new Error(data.error?.message ?? `OpenAI error (${res.status})`);
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) throw new Error('OpenAI declined this request.');
  return (msg?.content ?? '').trim();
}

export function openaiChat(apiKey: string, model: string, system: string, context: string, messages: ChatMessage[]) {
  return call(apiKey, {
    model,
    messages: [{ role: 'system', content: `${system}\n\nCONTEXT:\n${context}` }, ...messages],
  });
}

export async function openaiJson<T>(apiKey: string, model: string, system: string, context: string, instruction: string, schema: object): Promise<T> {
  const out = await call(apiKey, {
    model,
    messages: [
      { role: 'system', content: `${system}\n\nCONTEXT:\n${context}` },
      { role: 'user', content: instruction },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } },
  });
  return JSON.parse(out) as T;
}

export async function openaiTest(apiKey: string, model: string) {
  await call(apiKey, { model, messages: [{ role: 'user', content: 'Reply with OK.' }] });
}
