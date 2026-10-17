import { readInbox, RawSms } from '../../modules/tf-sms';
import { insertParsedTransactions } from '../data/repositories';
import { getLastSyncAt, getSmsEnabled, setLastSyncAt } from '../data/settings';
import { parseSms } from './parsers/parserRegistry';
import { ParsedTransaction } from './parsers/types';
import { isRelevantSender } from './smsFilter';

/** Filter + parse a batch of raw SMS. Pure: no I/O, never throws. */
export function parseBatch(messages: RawSms[]): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const m of messages) {
    if (!m?.sender || !m.body || !isRelevantSender(m.sender)) continue;
    const tx = parseSms(m.sender, m.body, new Date(m.date));
    if (tx) out.push(tx);
  }
  return out;
}

export async function processIncoming(sms: RawSms): Promise<number> {
  return insertParsedTransactions(parseBatch([sms]));
}

const PAGE = 300;
/** First-run backfill window. */
export const BACKFILL_DAYS = 180;

export interface SyncProgress {
  scanned: number;
  added: number;
}

/**
 * Read inbox SMS newer than last_sync_at, parse, insert, advance last_sync_at.
 * Pages through the inbox so a first-time backfill of thousands of SMS
 * does not load them all at once.
 */
export async function syncSmsInbox(opts: { since?: number; onProgress?: (p: SyncProgress) => void } = {}): Promise<SyncProgress> {
  if (!(await getSmsEnabled())) return { scanned: 0, added: 0 };
  let since = opts.since ?? (await getLastSyncAt());
  if (!since) since = Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;

  const progress: SyncProgress = { scanned: 0, added: 0 };
  for (;;) {
    const page = await readInbox(since, PAGE);
    if (!page.length) break;
    progress.scanned += page.length;
    progress.added += await insertParsedTransactions(parseBatch(page));
    since = page[page.length - 1].date;
    await setLastSyncAt(since);
    opts.onProgress?.({ ...progress });
    if (page.length < PAGE) break;
  }
  return progress;
}
