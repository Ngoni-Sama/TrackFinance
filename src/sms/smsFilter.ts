import { findBankRule } from './parsers/bankParser';

export enum SmsCategory {
  Transaction = 'transaction',
  Loan = 'loan',
  Savings = 'savings',
  Bank = 'bank',
  Noise = 'noise',
}

/**
 * Decide what kind of SMS a sender produces (see README §4). Econet airtime
 * (+263143) and network alerts (ECONET) fall through to Noise.
 */
export function classifySender(sender: string): SmsCategory {
  const s = sender.toUpperCase();
  if (s.includes('263165')) return SmsCategory.Loan;
  if (s.includes('263164')) return SmsCategory.Transaction;
  if (s.replace(/[\s_-]/g, '').includes('ONEMONEY')) return SmsCategory.Transaction;
  if (s.includes('OMARI')) return SmsCategory.Savings;
  if (findBankRule(sender)) return SmsCategory.Bank;
  return SmsCategory.Noise;
}

export function isRelevantSender(sender: string): boolean {
  return classifySender(sender) !== SmsCategory.Noise;
}
