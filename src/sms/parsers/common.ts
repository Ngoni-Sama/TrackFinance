/**
 * Shared regex helpers for Zimbabwean mobile-money and bank SMS.
 *
 * Amounts appear as "$10.00", "USD 10.00", "USD10", "ZWG 1,250.50" — so every
 * money pattern accepts an optional currency token followed by a number.
 */

const NUM = '([\\d,]+(?:\\.\\d{1,2})?)';
const CUR = '(USD|ZWG|ZWL|RTGS|US\\$|\\$)';

/** A currency token and a number, e.g. "USD 10.00" → ['USD', '10.00']. */
export const MONEY_RE = new RegExp(`${CUR}\\s?${NUM}`, 'i');

export function toNumber(str: string | undefined | null): number | undefined {
  if (!str) return undefined;
  const n = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function normaliseCurrency(token: string | undefined, fallback = 'USD'): string {
  if (!token) return fallback;
  const t = token.toUpperCase();
  if (t === '$' || t === 'US$') return 'USD';
  if (t === 'RTGS' || t === 'ZWL') return 'ZWL';
  return t;
}

/** Sender IDs like "+263164USD" carry the wallet currency. */
export function currencyFromSender(sender: string): string | undefined {
  const m = sender.toUpperCase().match(/(USD|ZWG|ZWL)$/);
  return m?.[1];
}

export interface MoneyMatch {
  amount: number;
  currency: string;
  /** Index just after the match, so callers can look for "to X" / "from X" after the amount. */
  end: number;
}

/** Find a money amount right after one of the given lead-in phrases. */
export function moneyAfter(body: string, leadIns: string[], fallbackCurrency: string): MoneyMatch | undefined {
  const re = new RegExp(`(?:${leadIns.join('|')})[:\\s]*(?:of\\s+)?${CUR}?\\s?${NUM}`, 'i');
  const m = re.exec(body);
  if (!m) return undefined;
  const amount = toNumber(m[2]);
  if (amount === undefined) return undefined;
  return { amount, currency: normaliseCurrency(m[1], fallbackCurrency), end: m.index + m[0].length };
}

export function firstMoney(body: string, fallbackCurrency: string): MoneyMatch | undefined {
  const m = MONEY_RE.exec(body);
  if (!m) return undefined;
  const amount = toNumber(m[2]);
  if (amount === undefined) return undefined;
  return { amount, currency: normaliseCurrency(m[1], fallbackCurrency), end: m.index + m[0].length };
}

export function matchMoney(body: string, re: RegExp): number | undefined {
  const m = body.match(re);
  return toNumber(m?.[m.length - 1]);
}

export const BALANCE_RE = new RegExp(
  `(?:new (?:wallet |account |available )?balance|wallet balance|avail(?:able)?\\.? bal(?:ance)?|bal(?:ance)?)(?: is)?[:\\s]*${CUR}?\\s?${NUM}`,
  'i',
);
export const CHARGES_RE = new RegExp(`(?:charges?|fees?)(?: of)?[:\\s]*${CUR}?\\s?${NUM}`, 'i');
export const REF_RE =
  /(?:txn\s?id|transaction\s?id|trans(?:action)?\.?\s?ref|ref(?:erence)?(?:\s?no\.?)?|approval code)[:\s]+([A-Z0-9][A-Z0-9.\-]*[A-Z0-9])/i;
export const FAILED_RE = /\b(failed|unsuccessful|insufficient|declined|not successful|could not be|cancelled)\b/i;

/** Words that end a counterparty name in running SMS text. */
const STOP = '(?=\\s*[.,;]\\s|\\s*[.,;]?$|\\s+(?:was|is|has|have|successful|successfully|on|at|for|txn|ref|reference|new|approval|transaction|your|with|via)\\b)';

/** Pull "to NAME" or "from NAME" out of the text after the amount. */
export function counterpartyAfter(text: string, words: string[]): string | undefined {
  const re = new RegExp(`\\b(?:${words.join('|')})\\s+(.+?)${STOP}`, 'i');
  const m = re.exec(text);
  if (!m) return undefined;
  return cleanCounterparty(m[1]);
}

export function cleanCounterparty(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  // "263771234567 - JOHN DOE" / "0771234567 JOHN DOE" → "JOHN DOE"; a bare number is kept.
  const withoutPhone = s.replace(/^\+?\d{9,13}\s*[-–:]?\s*/, '');
  if (withoutPhone.length > 1) s = withoutPhone;
  s = s.replace(/[.,;:]+$/, '').trim();
  return s.length ? s : undefined;
}

/** Parse "15/11/2026", "15-11-26", "15.11.2026" as a local date (day-first, as used in Zimbabwe). */
export function parseDayFirstDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return d.getMonth() === month && d.getDate() === day ? d : undefined;
}
