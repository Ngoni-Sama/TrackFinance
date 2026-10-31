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
