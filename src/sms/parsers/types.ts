export enum TxType {
  Debit = 'debit',
  Credit = 'credit',
  TransferToSavings = 'transfer_to_savings',
  TransferFromSavings = 'transfer_from_savings',
  LoanDisbursement = 'income_loan',
  LoanRepayment = 'expense_loan',
  /** "Repay $X by DD/MM/YYYY" — a future obligation, not money that moved. Excluded from totals. */
  LoanReminder = 'loan_reminder',
}

export interface ParsedTransaction {
  amount: number;
  currency: string; // 'USD' | 'ZWG' | 'ZWL'
  type: TxType;
  counterparty?: string;
  reference?: string;
  balance?: number;
  charges?: number;
  /** Loan due date, from Kashagi "repay ... by DD/MM/YYYY". */
  dueAt?: Date;
  date: Date;
  rawBody: string;
  senderId: string;
  category?: string;
}

export interface SmsParser {
  name: string;
  canParse(sender: string, body?: string): boolean;
  parse(sender: string, body: string, receivedAt: Date): ParsedTransaction | null;
}
