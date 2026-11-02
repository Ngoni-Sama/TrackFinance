import { TxType } from '../src/sms/parsers/types';

/** Writes real records through the WatermelonDB models and repositories (in-memory LokiJS). */
jest.mock('../src/data/db', () => {
  const { Database } = require('@nozbe/watermelondb');
  const LokiJSAdapter = require('@nozbe/watermelondb/adapters/lokijs').default;
  const { schema } = require('../src/data/db/schema');
  const { migrations } = require('../src/data/db/migrations');
  const models = require('../src/data/db/models');
  const adapter = new LokiJSAdapter({ schema, migrations, useWebWorker: false, useIncrementalIndexedDB: false, extraLokiOptions: { autosave: false } });
  return { ...models, database: new Database({ adapter, modelClasses: models.modelClasses }) };
});

import { insertParsedTransactions, queries, recategoriseTransaction, saveCustomer, saveInvoice } from '../src/data/repositories';

const sms = {
  amount: 12.4,
  currency: 'USD',
  type: TxType.Debit,
  counterparty: 'SOME SHOP',
  reference: 'MP1',
  date: new Date(2026, 9, 16),
  rawBody: 'Payment of USD 12.40 to SOME SHOP was successful. Txn ID: MP1.',
  senderId: '+263164USD',
};

describe('database', () => {
  it('stores parsed SMS once, even when re-scanned', async () => {
    expect(await insertParsedTransactions([sms])).toBe(1);
    expect(await insertParsedTransactions([sms])).toBe(0);
    const [tx] = await queries.transactions().fetch();
    expect(tx.amount).toBe(12.4);
    expect(tx.category).toBe('other');
  });

  it('remembers a recategorised merchant for the next SMS', async () => {
    const [tx] = await queries.transactions().fetch();
    await recategoriseTransaction(tx, 'food');
    await insertParsedTransactions([{ ...sms, reference: 'MP2', date: new Date(2026, 9, 17) }]);
    const all = await queries.transactions().fetch();
    expect(all.map((t) => t.category)).toEqual(['food', 'food']);
  });

  it('saves an invoice with numbered items and totals', async () => {
    const c = await saveCustomer({ name: 'Rudo', email: '', phone: '', address: '', notes: '' });
    const inv = await saveInvoice({
      customerId: c.id,
      issueDate: Date.UTC(2026, 9, 16),
      dueDate: Date.UTC(2026, 9, 30),
      currency: 'USD',
      taxRate: 15,
      notes: '',
      items: [{ description: 'Logo', quantity: 1, unitPrice: 100 }],
    });
    expect(inv.invoiceNumber).toBe('INV-2026-001');
    expect(inv.total).toBe(115);
    expect(await queries.invoiceItems(inv.id).fetchCount()).toBe(1);
  });
});

describe('duplicate prevention', () => {
  const body = 'You have paid USD 5.00 to KOMBI RANK. New wallet balance: USD 90.00.'; // no transaction ID
  const live = { amount: 5, currency: 'USD', type: TxType.Debit, counterparty: 'KOMBI RANK', date: new Date(2026, 10, 1, 7, 30, 2), rawBody: body, senderId: '+263164USD' };
  // The inbox copy of the same SMS: different sender format, receive time a few seconds later.
  const inbox = { ...live, senderId: '263164USD', date: new Date(2026, 10, 1, 7, 30, 9) };

  it('saves an SMS once when both the live listener and the inbox scan see it', async () => {
    const before = await queries.transactions().fetchCount();
    await insertParsedTransactions([live]);
    await insertParsedTransactions([inbox]);
    expect((await queries.transactions().fetchCount()) - before).toBe(1);
  });

  it('saves once when two syncs run at the same time', async () => {
    const before = await queries.transactions().fetchCount();
    const sms = { ...live, rawBody: 'You have paid USD 7.00 to BREAD. New wallet balance: USD 83.00.', amount: 7 };
    await Promise.all([insertParsedTransactions([sms]), insertParsedTransactions([{ ...sms, senderId: '263164' }])]);
    expect((await queries.transactions().fetchCount()) - before).toBe(1);
  });

  it('keeps one record for an EcoCash + Omari pair, as savings', async () => {
    const before = await queries.transactions().fetchCount();
    const at = new Date(2026, 10, 1, 9, 0);
    await insertParsedTransactions([{ amount: 40, currency: 'USD', type: TxType.TransferToSavings, counterparty: 'Omari', date: at, rawBody: 'You have sent USD 40.00 to Omari. Txn ID: OMX1.', reference: 'OMX1', senderId: '+263164USD' }]);
    await insertParsedTransactions([{ amount: 40, currency: 'USD', type: TxType.TransferToSavings, counterparty: 'Omari', date: new Date(at.getTime() + 60_000), rawBody: 'You have transferred USD 40.00 from EcoCash to your Omari account. New balance: USD 355.00.', balance: 355, senderId: 'Omari' }]);
    const rows = (await queries.transactions().fetch()).filter((t) => t.amount === 40);
    expect((await queries.transactions().fetchCount()) - before).toBe(1);
    expect(rows[0].balanceAfter).toBe(355);
  });

  it('still saves two genuine payments of the same amount', async () => {
    const before = await queries.transactions().fetchCount();
    await insertParsedTransactions([
      { ...live, rawBody: 'You have paid USD 1.00 to ZUPCO. Txn ID: Z1. New wallet balance: USD 50.00.', reference: 'Z1', amount: 1 },
      { ...live, rawBody: 'You have paid USD 1.00 to ZUPCO. Txn ID: Z2. New wallet balance: USD 49.00.', reference: 'Z2', amount: 1 },
    ]);
    expect((await queries.transactions().fetchCount()) - before).toBe(2);
  });
});

describe('duplicate prevention in one batch', () => {
  it('handles an EcoCash + Omari pair arriving in the same inbox page', async () => {
    const before = await queries.transactions().fetchCount();
    const at = new Date(2026, 10, 2, 9, 0);
    const added = await insertParsedTransactions([
      { amount: 55, currency: 'USD', type: TxType.TransferToSavings, counterparty: 'Omari', date: at, rawBody: 'You have sent USD 55.00 to Omari. Txn ID: OMB1.', reference: 'OMB1', senderId: '+263164USD' },
      { amount: 55, currency: 'USD', type: TxType.TransferToSavings, counterparty: 'Omari', date: new Date(at.getTime() + 30_000), rawBody: 'You have transferred USD 55.00 from EcoCash to your Omari account. New balance: USD 410.00.', balance: 410, senderId: 'Omari' },
    ]);
    expect(added).toBe(1);
    expect((await queries.transactions().fetchCount()) - before).toBe(1);
    const row = (await queries.transactions().fetch()).find((t) => t.amount === 55)!;
    expect(row.balanceAfter).toBe(410);
  });
});
