import { FAILED_RE, REF_RE, currencyFromSender, moneyAfter, parseDayFirstDate, toNumber } from './common';
import { SmsParser, TxType } from './types';

const REPAY_BY_RE = /repay(?:ment of)?[:\s]+(USD|ZWG|\$)?\s?([\d,]+(?:\.\d{1,2})?)\s+(?:on or )?by\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i;
const DUE_DATE_RE = /due(?: date)?(?: on| is|:)?\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i;
const OUTSTANDING_RE = /outstanding(?: loan)?(?: balance)?(?: is|:)?\s*(USD|ZWG|\$)?\s?([\d,]+(?:\.\d{1,2})?)/i;
const REPAID_RE = /\b(repaid|repayment of .* (?:received|successful)|you have paid|deducted)\b/i;
const DISBURSED_RE = /\b(loan of|disbursed|has been credited|approved)\b/i;

/** EcoCash Kashagi micro-loans, sender +263165. */
export const kashagiParser: SmsParser = {
  name: 'Kashagi',
  canParse(sender) {
    return sender.includes('263165');
  },
  parse(sender, body, receivedAt) {
    if (!this.canParse(sender) || FAILED_RE.test(body)) return null;
    const currency = currencyFromSender(sender) ?? 'USD';
    const repayBy = body.match(REPAY_BY_RE);
    const dueAt = parseDayFirstDate(repayBy?.[3] ?? body.match(DUE_DATE_RE)?.[1]);
    const outstanding = toNumber(body.match(OUTSTANDING_RE)?.[2]);
    const base = { rawBody: body, senderId: sender, date: receivedAt, reference: body.match(REF_RE)?.[1], counterparty: 'Kashagi' };

    if (REPAID_RE.test(body)) {
      const money = moneyAfter(body, ['repaid', 'repayment of', 'you have paid', 'deducted'], currency);
      if (!money) return null;
      return { ...base, amount: money.amount, currency: money.currency, type: TxType.LoanRepayment, balance: outstanding, dueAt };
    }

    if (DISBURSED_RE.test(body)) {
      const money = moneyAfter(body, ['loan of', 'disbursed', 'credited with', 'amount'], currency);
      if (!money) return null;
      // The amount owed is the repay amount if given, else the outstanding balance.
      const owed = toNumber(repayBy?.[2]) ?? outstanding;
      return { ...base, amount: money.amount, currency: money.currency, type: TxType.LoanDisbursement, balance: owed, dueAt };
    }

    if (repayBy) {
      const amount = toNumber(repayBy[2]);
      if (!amount) return null;
      return { ...base, amount, currency, type: TxType.LoanReminder, balance: outstanding ?? amount, dueAt };
    }

    return null;
  },
};
