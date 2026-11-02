import { ChatMessage } from '../types';

/** Editable in Settings → AI provider; free keys from aistudio.google.com. */
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

async function call(apiKey: string, model: string, body: object): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (!res.ok) throw new Error(data.error?.message ?? `Gemini error (${res.status})`);
  if (data.promptFeedback?.blockReason) throw new Error('Gemini declined this request.');
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
}

const contents = (messages: ChatMessage[]) =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

export function geminiChat(apiKey: string, model: string, system: string, context: string, messages: ChatMessage[]) {
  return call(apiKey, model, {
    systemInstruction: { parts: [{ text: `${system}\n\nCONTEXT:\n${context}` }] },
    contents: contents(messages),
  });
}

/** Gemini's schema dialect has no additionalProperties; strip it. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) if (k !== 'additionalProperties') out[k] = toGeminiSchema(v);
    return out;
  }
  return schema;
}

export async function geminiJson<T>(apiKey: string, model: string, system: string, context: string, instruction: string, schema: object): Promise<T> {
  const out = await call(apiKey, model, {
    systemInstruction: { parts: [{ text: `${system}\n\nCONTEXT:\n${context}` }] },
    contents: [{ role: 'user', parts: [{ text: instruction }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
  });
  return JSON.parse(out) as T;
}

export async function geminiTest(apiKey: string, model: string) {
  await call(apiKey, model, { contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] });
}
