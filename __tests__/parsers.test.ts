import { bankParser } from '../src/sms/parsers/bankParser';
import { parseDayFirstDate } from '../src/sms/parsers/common';
import { ecocashParser } from '../src/sms/parsers/ecocashParser';
import { kashagiParser } from '../src/sms/parsers/kashagiParser';
import { omariParser } from '../src/sms/parsers/omariParser';
import { onemoneyParser } from '../src/sms/parsers/onemoneyParser';
import { parseSms } from '../src/sms/parsers/parserRegistry';
import { TxType } from '../src/sms/parsers/types';
import { SmsCategory, classifySender } from '../src/sms/smsFilter';

/**
 * Sample wording below is modelled on EcoCash/Kashagi/Omari formats but is
 * NOT a verified real-device corpus. Replace/extend with 20+ real samples
 * per provider before release (README §13).
 */
const now = new Date(2026, 9, 16, 12, 0);

describe('classifySender', () => {
  it.each([
    ['+263164USD', SmsCategory.Transaction],
    ['+263164994', SmsCategory.Transaction],
    ['+263164', SmsCategory.Transaction],
    ['+263165', SmsCategory.Loan],
    ['Omari', SmsCategory.Savings],
    ['OneMoney', SmsCategory.Transaction],
    ['CBZ', SmsCategory.Bank],
    ['+263143', SmsCategory.Noise],
    ['ECONET', SmsCategory.Noise],
    ['Econet', SmsCategory.Noise],
  ])('%s → %s', (sender, expected) => {
    expect(classifySender(sender)).toBe(expected);
  });
});

describe('EcoCash parser', () => {
  it('parses the spec sample debit', () => {
    const body =
      'EcoCash: You have sent $10.00 to John Doe. Charges: $0.50. Transaction Id: MP240101.1234.A1. New balance: $45.50.';
    const tx = ecocashParser.parse('+263164USD', body, now);
    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(10);
    expect(tx!.type).toBe(TxType.Debit);
    expect(tx!.currency).toBe('USD');
    expect(tx!.counterparty).toBe('John Doe');
    expect(tx!.reference).toBe('MP240101.1234.A1');
    expect(tx!.balance).toBe(45.5);
    expect(tx!.charges).toBe(0.5);
  });

  it('parses a transfer confirmation with phone + name', () => {
    const body =
      'Transfer Confirmation. Transfer of USD 25.00 to 0771234567 TENDAI MOYO successful. Txn ID: PP261016.1201.H12345. New wallet balance: USD 120.35.';
    const tx = ecocashParser.parse('+263164USD', body, now)!;
    expect(tx.amount).toBe(25);
    expect(tx.type).toBe(TxType.Debit);
    expect(tx.counterparty).toBe('TENDAI MOYO');
    expect(tx.reference).toBe('PP261016.1201.H12345');
    expect(tx.balance).toBe(120.35);
  });

  it('parses a received transfer', () => {
    const body =
      'You have received USD 1,250.00 from 263772000111 - FARAI CHIKOWORE. Approval Code: CO261016.0930.B7788. New wallet balance: USD 1,370.35.';
    const tx = ecocashParser.parse('+263164USD', body, now)!;
    expect(tx.type).toBe(TxType.Credit);
    expect(tx.amount).toBe(1250);
    expect(tx.counterparty).toBe('FARAI CHIKOWORE');
    expect(tx.balance).toBe(1370.35);
  });

  it('parses a merchant payment', () => {
    const body =
      'Payment of USD 12.40 to OK ZIMBABWE SAMORA was successful. Txn ID: MP261016.1500.C1. New wallet balance: USD 107.95.';
    const tx = ecocashParser.parse('+263164', body, now)!;
    expect(tx.type).toBe(TxType.Debit);
    expect(tx.amount).toBe(12.4);
    expect(tx.counterparty).toBe('OK ZIMBABWE SAMORA');
  });

  it('reads ZWG amounts', () => {
    const body = 'You have paid ZWG 350.00 to ZESA PREPAID. Txn ID: MP261016.1600.D9. New wallet balance: ZWG 1,020.00';
    const tx = ecocashParser.parse('+263164994', body, now)!;
    expect(tx.currency).toBe('ZWG');
    expect(tx.amount).toBe(350);
    expect(tx.counterparty).toBe('ZESA PREPAID');
  });

  it('treats a transfer to Omari as savings, not spending', () => {
    const body = 'You have sent USD 20.00 to Omari. Txn ID: OM261016.1. New wallet balance: USD 87.95';
    expect(ecocashParser.parse('+263164USD', body, now)!.type).toBe(TxType.TransferToSavings);
  });

  it('ignores failed transactions', () => {
    const body = 'Transfer of USD 50.00 to 0771234567 failed. Insufficient funds. Balance: USD 10.00';
    expect(ecocashParser.parse('+263164USD', body, now)).toBeNull();
  });

  it('ignores non-transaction SMS', () => {
    expect(ecocashParser.parse('+263143', 'Your bundle has been activated.', now)).toBeNull();
    expect(ecocashParser.parse('+263164', 'Dial *151# to get exciting offers!', now)).toBeNull();
  });

  it('rejects senders it does not own', () => {
    expect(ecocashParser.canParse('+263165')).toBe(false);
  });
});

describe('Kashagi parser', () => {
  it('parses a disbursement with repay-by date', () => {
    const body =
      'Your Kashagi loan of USD 20.00 has been credited to your EcoCash wallet. Please repay USD 22.00 by 15/11/2026.';
    const tx = kashagiParser.parse('+263165', body, now)!;
    expect(tx.type).toBe(TxType.LoanDisbursement);
    expect(tx.amount).toBe(20);
    expect(tx.balance).toBe(22);
    expect(tx.dueAt).toEqual(new Date(2026, 10, 15));
  });

  it('parses a repayment', () => {
    const body = 'You have repaid USD 22.00 for your Kashagi loan. Outstanding balance: USD 0.00.';
    const tx = kashagiParser.parse('+263165', body, now)!;
    expect(tx.type).toBe(TxType.LoanRepayment);
    expect(tx.amount).toBe(22);
    expect(tx.balance).toBe(0);
  });

  it('parses a reminder as a non-spending reminder', () => {
    const body = 'Reminder: repay USD 22.00 by 15/11/2026 to keep your Kashagi limit.';
    const tx = kashagiParser.parse('+263165', body, now)!;
    expect(tx.type).toBe(TxType.LoanReminder);
    expect(tx.amount).toBe(22);
  });
});

describe('Omari parser', () => {
  it('parses a deposit to savings', () => {
    const body = 'You have transferred USD 15.00 from EcoCash to your Omari account. New balance: USD 215.00.';
    const tx = omariParser.parse('Omari', body, now)!;
    expect(tx.type).toBe(TxType.TransferToSavings);
    expect(tx.amount).toBe(15);
    expect(tx.balance).toBe(215);
  });

  it('parses a withdrawal from savings', () => {
    const body = 'You have withdrawn USD 40.00 from your Omari account to EcoCash. New balance: USD 175.00.';
    expect(omariParser.parse('Omari', body, now)!.type).toBe(TxType.TransferFromSavings);
  });
});

describe('OneMoney parser', () => {
  it('defaults to ZWG when no currency is given', () => {
    const body = 'You have received 500.00 from 0712345678 RUDO NCUBE. Ref: OM1234. Balance 900.00';
    const tx = onemoneyParser.parse('OneMoney', body, now)!;
    expect(tx.amount).toBe(500);
    expect(tx.currency).toBe('ZWG');
    expect(tx.counterparty).toBe('RUDO NCUBE');
  });

  it('parses a USD send', () => {
    const tx = onemoneyParser.parse('OneMoney', 'You have sent USD 5.00 to 0712345678 RUDO NCUBE. Ref: OM99.', now)!;
    expect(tx.currency).toBe('USD');
    expect(tx.type).toBe(TxType.Debit);
  });
});

describe('Bank parser', () => {
  it('parses a CBZ debit', () => {
    const body = 'CBZ: Acc 01234XXXX debited with USD 50.00 on 16/10/26 POS purchase at SPAR BORROWDALE. Avail Bal USD 410.20';
    const tx = bankParser.parse('CBZ', body, now)!;
    expect(tx.type).toBe(TxType.Debit);
    expect(tx.amount).toBe(50);
    expect(tx.balance).toBe(410.2);
  });

  it('parses a credit', () => {
    const body = 'Your account 0123 has been credited with USD 800.00 from ACME PVT LTD. Bal: USD 1210.20';
    const tx = bankParser.parse('STANBIC', body, now)!;
    expect(tx.type).toBe(TxType.Credit);
    expect(tx.counterparty).toBe('ACME PVT LTD');
  });
});

describe('parseSms registry', () => {
  it('never throws on garbage', () => {
    expect(() => parseSms('+263164', '\u0000$$$ ;;; USD', now)).not.toThrow();
    expect(parseSms('RANDOM', 'hello', now)).toBeNull();
  });
});

describe('parseDayFirstDate', () => {
  it('rejects impossible dates', () => {
    expect(parseDayFirstDate('31/02/2026')).toBeUndefined();
    expect(parseDayFirstDate('01/12/26')).toEqual(new Date(2026, 11, 1));
  });
});
