import { bankParser } from './bankParser';
import { ecocashParser } from './ecocashParser';
import { kashagiParser } from './kashagiParser';
import { omariParser } from './omariParser';
import { onemoneyParser } from './onemoneyParser';
import { ParsedTransaction, SmsParser } from './types';

export const PARSERS: SmsParser[] = [ecocashParser, kashagiParser, omariParser, onemoneyParser, bankParser];

/** Run the first parser that owns this sender. Never throws: malformed SMS yield null. */
export function parseSms(sender: string, body: string, receivedAt: Date): ParsedTransaction | null {
  const parser = PARSERS.find((p) => p.canParse(sender, body));
  if (!parser) return null;
  try {
    return parser.parse(sender, body, receivedAt);
  } catch (e) {
    console.warn(`[TrackFinance] ${parser.name} parser failed`, e);
    return null;
  }
}
