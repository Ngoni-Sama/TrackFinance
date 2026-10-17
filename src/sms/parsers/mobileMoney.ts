import {
  BALANCE_RE,
  CHARGES_RE,
  FAILED_RE,
  REF_RE,
  counterpartyAfter,
  currencyFromSender,
  firstMoney,
  matchMoney,
  moneyAfter,
  MoneyMatch,
} from './common';
import { ParsedTransaction, TxType } from './types';

/**
 * Wording shared by EcoCash and OneMoney. Credit phrases are checked first
 * because they are unambiguous ("you have received"); debit wording varies more.
 */
const CREDIT_LEAD_INS = [
  'you have received',
  'received',
  'credited with',
  'credited',
  'cash[- ]?in of',
  'deposit of',
  'reversal of',
  'refund of',
];
const DEBIT_LEAD_INS = [
  'you have sent',
  'you have paid',
  'you have bought',
  'transfer of',
  'payment of',
  'paid',
  'sent',
  'debited with',
  'debited',
  'withdrawal of',
  'cash[- ]?out of',
  'purchase of',
  'bought',
];
const GENERIC_LEAD_INS = ['transaction amount', 'amount'];

const CREDIT_HINT_RE = /\b(you have received|received from|credited|cash[- ]?in|deposit of|reversal|refund)\b/i;
const DEBIT_HINT_RE =
  /\b(you have sent|you have paid|paid to|sent to|debited|transfer of|payment of|withdrawal|cash[- ]?out|purchase|bought)\b/i;

export function detectDirection(body: string): TxType | null {
  if (CREDIT_HINT_RE.test(body)) return TxType.Credit;
  if (DEBIT_HINT_RE.test(body)) return TxType.Debit;
  return null;
}

export function parseMobileMoney(sender: string, body: string, receivedAt: Date): ParsedTransaction | null {
  if (FAILED_RE.test(body)) return null;
  const direction = detectDirection(body);
  if (!direction) return null;

  const fallbackCurrency = currencyFromSender(sender) ?? 'USD';
  const leadIns = direction === TxType.Credit ? CREDIT_LEAD_INS : DEBIT_LEAD_INS;
  const money: MoneyMatch | undefined =
    moneyAfter(body, GENERIC_LEAD_INS, fallbackCurrency) ??
    moneyAfter(body, leadIns, fallbackCurrency) ??
    firstMoney(body, fallbackCurrency);
  if (!money || money.amount <= 0) return null;

  const afterAmount = body.slice(money.end);
  const counterparty =
    explicitCompany(body) ??
    (direction === TxType.Credit
      ? counterpartyAfter(afterAmount, ['received from', 'from']) ?? counterpartyAfter(body, ['received from', 'from'])
      : counterpartyAfter(afterAmount, ['sent to', 'paid to', 'payment to', 'to', 'at']) ??
        counterpartyAfter(body, ['sent to', 'paid to', 'payment to']));

  let type = direction;
  // EcoCash ↔ Omari moves are savings transfers, not spending or income.
  if (/omari/i.test(counterparty ?? '') || /\bto (?:your )?omari\b/i.test(body)) {
    type = direction === TxType.Debit ? TxType.TransferToSavings : TxType.TransferFromSavings;
  } else if (/kashagi/i.test(counterparty ?? '') && direction === TxType.Debit) {
    type = TxType.LoanRepayment;
  }

  return {
    amount: money.amount,
    currency: money.currency,
    type,
    counterparty,
    reference: body.match(REF_RE)?.[1],
    balance: matchMoney(body, BALANCE_RE),
    charges: matchMoney(body, CHARGES_RE),
    date: receivedAt,
    rawBody: body,
    senderId: sender,
  };
}

function explicitCompany(body: string): string | undefined {
  const m = body.match(/(?:company name|merchant(?: name)?)[:\s]+(.+?)(?:\n|\.\s|,|$)/i);
  return m?.[1]?.trim() || undefined;
}
