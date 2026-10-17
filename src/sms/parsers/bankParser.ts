import { BALANCE_RE, CHARGES_RE, FAILED_RE, REF_RE, counterpartyAfter, firstMoney, matchMoney, moneyAfter } from './common';
import { SmsParser, TxType } from './types';

export interface BankRule {
  senderId: string;
  debitRe: RegExp;
  creditRe: RegExp;
  /** Phrases after which the transaction amount appears. */
  amountLeadIns: string[];
}

const DEFAULT_DEBIT = /\b(debit(?:ed)?|dr\b|withdrawal|withdrawn|purchase|pos\b|paid|payment to|transfer to|sent)\b/i;
const DEFAULT_CREDIT = /\b(credit(?:ed)?|cr\b|deposit(?:ed)?|received|transfer from)\b/i;
const DEFAULT_LEAD_INS = ['debited with', 'credited with', 'debited', 'credited', 'debit of', 'credit of', 'purchase of', 'withdrawal of', 'deposit of', 'amount', 'amt'];

const rule = (senderId: string, extra?: Partial<BankRule>): BankRule => ({
  senderId,
  debitRe: DEFAULT_DEBIT,
  creditRe: DEFAULT_CREDIT,
  amountLeadIns: DEFAULT_LEAD_INS,
  ...extra,
});

/** Add or tune a rule per bank as real samples are collected. */
export const RULES: BankRule[] = [
  rule('CBZ'),
  rule('STEWARD'),
  rule('FBC'),
  rule('ZB'),
  rule('NMB'),
  rule('STANBIC'),
  rule('BANCABC'),
];

export const BANK_SENDER_IDS = RULES.map((r) => r.senderId);

export function findBankRule(sender: string): BankRule | undefined {
  const s = sender.toUpperCase().replace(/[\s_-]/g, '');
  return RULES.find((r) => s === r.senderId || s.startsWith(r.senderId));
}

export const bankParser: SmsParser = {
  name: 'Bank',
  canParse(sender) {
    return !!findBankRule(sender);
  },
  parse(sender, body, receivedAt) {
    const r = findBankRule(sender);
    if (!r || FAILED_RE.test(body)) return null;

    // A "credited" SMS often also says "debited from <other account>", so test credit first only
    // when the credit keyword comes before any debit keyword.
    const ci = body.search(r.creditRe);
    const di = body.search(r.debitRe);
    let type: TxType | null = null;
    if (ci >= 0 && (di < 0 || ci < di)) type = TxType.Credit;
    else if (di >= 0) type = TxType.Debit;
    if (!type) return null;

    const money = moneyAfter(body, r.amountLeadIns, 'USD') ?? firstMoney(body, 'USD');
    if (!money || money.amount <= 0) return null;

    const after = body.slice(money.end);
    return {
      amount: money.amount,
      currency: money.currency,
      type,
      counterparty:
        type === TxType.Credit ? counterpartyAfter(after, ['from', 'by']) : counterpartyAfter(after, ['to', 'at']),
      reference: body.match(REF_RE)?.[1],
      balance: matchMoney(body, BALANCE_RE),
      charges: matchMoney(body, CHARGES_RE),
      date: receivedAt,
      rawBody: body,
      senderId: sender,
    };
  },
};
