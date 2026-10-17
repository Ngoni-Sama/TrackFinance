import { TxType } from '../sms/parsers/types';

/** Known Zimbabwean merchants → category. Lower-case substrings, first match wins. */
export const KNOWN_MERCHANTS: [string, string][] = [
  ['kashagi', 'loan_repayment'],
  ['omari', 'savings'],
  ['ok zimbabwe', 'food'],
  ['ok mart', 'food'],
  ['pick n pay', 'food'],
  ['tm pick', 'food'],
  ['spar', 'food'],
  ['food lovers', 'food'],
  ['chicken inn', 'food'],
  ['pizza inn', 'food'],
  ['bakers inn', 'food'],
  ['simbisa', 'food'],
  ['zesa', 'utilities'],
  ['zetdc', 'utilities'],
  ['city of harare', 'utilities'],
  ['council', 'utilities'],
  ['liquid', 'utilities'],
  ['zol', 'utilities'],
  ['dstv', 'entertainment'],
  ['multichoice', 'entertainment'],
  ['econet', 'airtime'],
  ['netone', 'airtime'],
  ['telecel', 'airtime'],
  ['airtime', 'airtime'],
  ['bundle', 'airtime'],
  ['zupco', 'transport'],
  ['zinara', 'transport'],
  ['puma', 'transport'],
  ['total energies', 'transport'],
  ['zuva', 'transport'],
  ['redan', 'transport'],
  ['vaya', 'transport'],
  ['pharmacy', 'health'],
  ['hospital', 'health'],
  ['clinic', 'health'],
  ['cimas', 'health'],
  ['psmas', 'health'],
  ['school', 'education'],
  ['university', 'education'],
  ['college', 'education'],
];

export function normaliseMerchant(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Auto-categorisation (README §8.4): transaction type first, then the
 * user's own past choices for this counterparty, then the known-merchant list.
 */
export function categorise(
  tx: { type: string; counterparty?: string | null; category?: string | null },
  memory: Map<string, string>,
): string {
  if (tx.category) return tx.category;
  switch (tx.type) {
    case TxType.LoanRepayment:
    case TxType.LoanReminder:
      return 'loan_repayment';
    case TxType.LoanDisbursement:
      return 'loan';
    case TxType.TransferToSavings:
    case TxType.TransferFromSavings:
      return 'savings';
    case TxType.Credit:
      return 'income';
  }
  const cp = tx.counterparty ? normaliseMerchant(tx.counterparty) : '';
  if (!cp) return 'other';
  const remembered = memory.get(cp);
  if (remembered) return remembered;
  const known = KNOWN_MERCHANTS.find(([needle]) => cp.includes(needle));
  return known ? known[1] : 'other';
}
