import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { database } from '../data/db';
import { CLAUDE_DEFAULT_MODEL } from './providers/claude';
import { GEMINI_DEFAULT_MODEL } from './providers/gemini';
import { OPENAI_DEFAULT_MODEL } from './providers/openai';
import { AiProviderId } from './types';

export interface ProviderInfo {
  id: AiProviderId;
  label: string;
  needsKey: boolean;
  defaultModel: string;
  keyUrl?: string;
  keyHint?: string;
  dataGoesTo: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'cloudflare', label: 'Free (Cloudflare)', needsKey: false, defaultModel: 'llama-3.3-70b', dataGoesTo: 'Cloudflare Workers AI, via TrackFinance’s server (which stores nothing)' },
  { id: 'claude', label: 'Claude', needsKey: true, defaultModel: CLAUDE_DEFAULT_MODEL, keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…', dataGoesTo: 'Anthropic, directly from your phone' },
  { id: 'openai', label: 'OpenAI', needsKey: true, defaultModel: OPENAI_DEFAULT_MODEL, keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…', dataGoesTo: 'OpenAI, directly from your phone' },
  { id: 'gemini', label: 'Gemini', needsKey: true, defaultModel: GEMINI_DEFAULT_MODEL, keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…', dataGoesTo: 'Google, directly from your phone' },
];

export const providerInfo = (id: AiProviderId) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export interface AiConfig {
  provider: AiProviderId;
  model: string;
  apiKey: string | null;
}

const keyName = (p: AiProviderId) => `tf_ai_key_${p}`;

// SecureStore is Android Keystore-backed; the web demo has no equivalent, so it uses the DB store.
export async function readKey(p: AiProviderId): Promise<string | null> {
  if (Platform.OS === 'web') return (await database.localStorage.get<string>(keyName(p))) ?? null;
  return SecureStore.getItemAsync(keyName(p));
}

async function writeKey(p: AiProviderId, key: string | null) {
  if (Platform.OS === 'web') {
    if (key) await database.localStorage.set(keyName(p), key);
    else await database.localStorage.remove(keyName(p));
    return;
  }
  if (key) await SecureStore.setItemAsync(keyName(p), key);
  else await SecureStore.deleteItemAsync(keyName(p));
}

export async function loadAiConfig(): Promise<AiConfig> {
  const provider = ((await database.localStorage.get<string>('ai_provider')) as AiProviderId) || 'cloudflare';
  const model = (await database.localStorage.get<string>(`ai_model_${provider}`)) || providerInfo(provider).defaultModel;
  return { provider, model, apiKey: providerInfo(provider).needsKey ? await readKey(provider) : null };
}

export async function loadProviderSettings(p: AiProviderId) {
  return {
    model: (await database.localStorage.get<string>(`ai_model_${p}`)) || providerInfo(p).defaultModel,
    hasKey: providerInfo(p).needsKey ? !!(await readKey(p)) : true,
  };
}

export async function saveAiConfig(p: AiProviderId, model: string, apiKey?: string | null) {
  await database.localStorage.set('ai_provider', p);
  await database.localStorage.set(`ai_model_${p}`, model.trim() || providerInfo(p).defaultModel);
  if (apiKey !== undefined) await writeKey(p, apiKey?.trim() || null);
}

export async function forgetKey(p: AiProviderId) {
  await writeKey(p, null);
}
