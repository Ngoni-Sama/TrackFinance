export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Suggestion {
  id: string;
  category: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  /** A question for the user that would settle it; empty when confident. */
  question?: string;
}

export type AiProviderId = 'cloudflare' | 'claude' | 'openai' | 'gemini';
