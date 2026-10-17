import { BALANCE_RE, FAILED_RE, REF_RE, currencyFromSender, firstMoney, matchMoney, moneyAfter } from './common';
import { SmsParser, TxType } from './types';

const TO_SAVINGS_RE = /\b(to (?:your )?omari|deposit(?:ed)?|saved|top[- ]?up|transferred .* into)\b/i;
const FROM_SAVINGS_RE = /\b(from (?:your )?omari|withdr[ae]w[n]?|withdrawal|to (?:your )?ecocash)\b/i;
const INTEREST_RE = /\binterest\b/i;

/**
 * EcoCash Omari savings. Deposits and withdrawals are transfers between your
 * own wallets, so they never count as spending or income in daily totals.
 */
export const omariParser: SmsParser = {
  name: 'Omari',
  canParse(sender) {
    return sender.toUpperCase().includes('OMARI');
  },
  parse(sender, body, receivedAt) {
    if (!this.canParse(sender) || FAILED_RE.test(body)) return null;
    const currency = currencyFromSender(sender) ?? 'USD';

    let type: TxType | null = null;
    if (INTEREST_RE.test(body) && /credited|earned|paid/i.test(body)) type = TxType.Credit;
    else if (FROM_SAVINGS_RE.test(body)) type = TxType.TransferFromSavings;
    else if (TO_SAVINGS_RE.test(body)) type = TxType.TransferToSavings;
    if (!type) return null;

    const money =
      moneyAfter(body, ['transferred', 'deposited', 'deposit of', 'withdrawn', 'withdrawal of', 'interest of', 'saved', 'amount'], currency) ??
      firstMoney(body, currency);
    if (!money || money.amount <= 0) return null;

    return {
      amount: money.amount,
      currency: money.currency,
      type,
      counterparty: 'Omari',
      reference: body.match(REF_RE)?.[1],
      balance: matchMoney(body, BALANCE_RE),
      date: receivedAt,
      rawBody: body,
      senderId: sender,
      category: 'savings',
    };
  },
};
