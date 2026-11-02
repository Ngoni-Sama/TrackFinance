import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage } from '../types';

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5';

function client(apiKey: string) {
  // The app is the client here: the key is the user's own, stored in the phone's secure storage.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function text(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * fallbacks: "default" lets the API re-run a request a safety classifier declines
 * on a suitable model instead of failing (server-side fallback beta).
 */
async function create(apiKey: string, model: string, body: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model'>) {
  const res = await client(apiKey).beta.messages.create({
    model,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...body,
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  return res;
}

export async function claudeChat(apiKey: string, model: string, system: string, context: string, messages: ChatMessage[]): Promise<string> {
  const res = await create(apiKey, model, {
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: system },
      { type: 'text', text: `CONTEXT:\n${context}` },
    ],
    messages,
  });
  return text(res.content);
}

export async function claudeJson<T>(apiKey: string, model: string, system: string, context: string, instruction: string, schema: object): Promise<T> {
  const res = await create(apiKey, model, {
    max_tokens: 8000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
    system: [
      { type: 'text', text: system },
      { type: 'text', text: `CONTEXT:\n${context}` },
    ],
    messages: [{ role: 'user', content: instruction }],
  });
  return JSON.parse(text(res.content)) as T;
}

export async function claudeTest(apiKey: string, model: string) {
  await create(apiKey, model, { max_tokens: 50, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with OK.' }] });
}
