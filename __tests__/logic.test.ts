import { categorise } from '../src/core/categorise';
import { collectionRate, computeInvoiceTotals, nextInvoiceNumber } from '../src/core/invoiceMath';
import {
  budgetUsage,
  dashboardSummary,
  groupSpendingByDay,
  pendingLoan,
  toEntries,
  TxLike,
} from '../src/core/summaries';
import { percentChange, percentOf } from '../src/core/utils';
import { buildInvoiceHtml } from '../src/pdf/invoiceTemplate';
import { TxType } from '../src/sms/parsers/types';
import { parseBatch } from '../src/sms/smsProcessor';

jest.mock('../modules/tf-sms', () => ({ readInbox: jest.fn(), addSmsListener: jest.fn(), isAvailable: false }));
jest.mock('../src/data/repositories', () => ({ insertParsedTransactions: jest.fn() }));
jest.mock('../src/data/settings', () => ({}));

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const tx = (p: Partial<TxLike> & Pick<TxLike, 'amount' | 'type' | 'occurredAt'>): TxLike => ({
  id: Math.random().toString(36),
  currency: 'USD',
  ...p,
});

describe('percent helpers', () => {
  it('clamps and guards zero', () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(150, 100)).toBe(100);
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('toEntries', () => {
  it('does not double count an expense linked to a transaction', () => {
    const t = tx({ id: 't1', amount: 10, type: TxType.Debit, occurredAt: at(2026, 10, 16) });
    const entries = toEntries([t], [
      { id: 'e1', description: 'Lunch', amount: 10, currency: 'USD', category: 'food', occurredAt: t.occurredAt, transactionId: 't1' },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('manual');
  });
});

describe('dashboardSummary', () => {
  const now = new Date(2026, 9, 16, 18);
  const entries = toEntries(
    [
      tx({ amount: 10, type: TxType.Debit, category: 'food', occurredAt: at(2026, 10, 16) }),
      tx({ amount: 30, type: TxType.Debit, category: 'transport', occurredAt: at(2026, 10, 2) }),
      tx({ amount: 200, type: TxType.Credit, category: 'income', occurredAt: at(2026, 10, 1) }),
      tx({ amount: 50, type: TxType.TransferToSavings, category: 'savings', occurredAt: at(2026, 10, 3) }),
      tx({ amount: 99, type: TxType.LoanReminder, occurredAt: at(2026, 10, 4) }),
      tx({ amount: 20, type: TxType.Debit, category: 'food', occurredAt: at(2026, 9, 10) }),
      tx({ amount: 500, type: TxType.Debit, category: 'rent', occurredAt: at(2026, 9, 28) }), // after same-day cutoff
      tx({ amount: 7, type: TxType.Debit, category: 'food', currency: 'ZWG', occurredAt: at(2026, 10, 16) }),
    ],
    [{ id: 'e', description: 'Bread', amount: 2, currency: 'USD', category: 'food', occurredAt: at(2026, 10, 16, 9) }],
  );
  const s = dashboardSummary(entries, 'USD', now);

  it('sums today and month, ignoring transfers, reminders and other currencies', () => {
    expect(s.todaySpend).toBe(12);
    expect(s.monthSpend).toBe(42);
    expect(s.monthIncome).toBe(200);
  });

  it('compares month-to-date with the same span last month', () => {
    expect(s.lastMonthSpend).toBe(20);
    expect(s.monthChangePct).toBeCloseTo(110);
  });

  it('reports income spent and month elapsed as percentages', () => {
    expect(s.spentOfIncomePct).toBeCloseTo(21);
    expect(s.monthElapsedPct).toBeCloseTo((16 / 31) * 100);
  });

  it('splits spending by category summing to 100%', () => {
    expect(s.categories.map((c) => c.category)).toEqual(['transport', 'food']);
    expect(s.categories.reduce((a, c) => a + c.percentage, 0)).toBeCloseTo(100);
  });

  it('groups spending by day', () => {
    const days = groupSpendingByDay(entries, 'USD');
    expect(days[0].day).toBe('2026-10-16');
    expect(days[0].total).toBe(12);
  });

  it('measures budget usage', () => {
    const [u] = budgetUsage([{ category: 'food', amount: 8, currency: 'USD' }], entries, now);
    expect(u.spent).toBe(12);
    expect(u.percentage).toBe(100);
    expect(u.over).toBe(true);
  });
});

describe('pendingLoan', () => {
  it('tracks repayment progress against the disbursement', () => {
    const loan = pendingLoan([
      tx({ amount: 20, type: TxType.LoanDisbursement, balanceAfter: 22, dueAt: at(2026, 11, 15), occurredAt: at(2026, 10, 1) }),
      tx({ amount: 11, type: TxType.LoanRepayment, occurredAt: at(2026, 10, 10) }),
    ])!;
    expect(loan.outstanding).toBe(11);
    expect(loan.repaidPct).toBeCloseTo(50);
    expect(loan.dueAt).toBe(at(2026, 11, 15));
  });

  it('is null once repaid', () => {
    expect(
      pendingLoan([
        tx({ amount: 20, type: TxType.LoanDisbursement, balanceAfter: 22, occurredAt: at(2026, 10, 1) }),
        tx({ amount: 22, type: TxType.LoanRepayment, balanceAfter: 0, occurredAt: at(2026, 10, 10) }),
      ]),
    ).toBeNull();
  });
});

describe('categorise', () => {
  const memory = new Map([['tendai moyo', 'rent']]);
  it('uses type, then memory, then known merchants', () => {
    expect(categorise({ type: TxType.TransferToSavings }, memory)).toBe('savings');
    expect(categorise({ type: TxType.Debit, counterparty: 'TENDAI  MOYO' }, memory)).toBe('rent');
    expect(categorise({ type: TxType.Debit, counterparty: 'OK ZIMBABWE SAMORA' }, memory)).toBe('food');
    expect(categorise({ type: TxType.Debit, counterparty: 'ZESA PREPAID' }, memory)).toBe('utilities');
    expect(categorise({ type: TxType.Debit, counterparty: 'Somebody' }, memory)).toBe('other');
  });
});

describe('invoice maths', () => {
  it('computes totals with tax and rounding', () => {
    const t = computeInvoiceTotals(
      [
        { description: 'Design', quantity: 3, unitPrice: 33.333 },
        { description: '', quantity: 1, unitPrice: 999 }, // blank lines dropped
      ],
      15,
    );
    expect(t.lines).toHaveLength(1);
    expect(t.subtotal).toBe(100);
    expect(t.tax).toBe(15);
    expect(t.total).toBe(115);
  });

  it('numbers invoices per year', () => {
    expect(nextInvoiceNumber('INV', 2026, [])).toBe('INV-2026-001');
    expect(nextInvoiceNumber('INV', 2026, ['INV-2026-009', 'INV-2025-044'])).toBe('INV-2026-010');
  });

  it('computes the collection rate', () => {
    const r = collectionRate(
      [
        { total: 100, status: 'paid', currency: 'USD' },
        { total: 300, status: 'sent', currency: 'USD' },
        { total: 50, status: 'draft', currency: 'USD' },
      ],
      'USD',
    );
    expect(r.percentage).toBe(25);
    expect(r.outstanding).toBe(300);
  });
});

describe('invoice HTML', () => {
  it('escapes user content', () => {
    const html = buildInvoiceHtml(
      { invoiceNumber: 'INV-2026-001', issueDate: at(2026, 10, 16), dueDate: at(2026, 10, 30), currency: 'USD', taxRate: 15, subtotal: 10, tax: 1.5, total: 11.5, status: 'sent', items: [{ description: '<script>x</script>', quantity: 1, unitPrice: 10, lineTotal: 10 }] },
      { name: 'A&B <Pvt>' },
      { businessName: 'Ngoni Designs', ecocashNumber: '+263 77 123 4567' },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('A&amp;B &lt;Pvt&gt;');
    expect(html).toContain('$11.50');
    expect(html).toContain('Tax (15%)');
  });
});

describe('parseBatch', () => {
  it('drops noise senders and keeps money SMS', () => {
    const out = parseBatch([
      { sender: '+263143', body: 'You have bought USD 1.00 airtime bundle', date: at(2026, 10, 16) },
      { sender: '+263164USD', body: 'You have sent USD 5.00 to 0771234567 JOHN. Txn ID: X1.', date: at(2026, 10, 16) },
      { sender: '', body: '', date: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(5);
  });
});
