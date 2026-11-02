import { Model, Q } from '@nozbe/watermelondb';
import { categorise, normaliseMerchant } from '../core/categorise';
import { computeInvoiceTotals, LineItemInput, nextInvoiceNumber } from '../core/invoiceMath';
import { ExpenseLike, TxLike } from '../core/summaries';
import { crossSourceTwin, DedupeRow, DuplicateGroup, findDuplicateGroups, fingerprint } from '../core/dedupe';
import { ParsedTransaction } from '../sms/parsers/types';
import {
  Budget,
  BusinessProfile,
  Customer,
  database,
  Expense,
  Invoice,
  InvoiceItem,
  MerchantCategory,
  Transaction,
} from './db';

const transactions = () => database.get<Transaction>('transactions');
const expenses = () => database.get<Expense>('expenses');
const customers = () => database.get<Customer>('customers');
const invoices = () => database.get<Invoice>('invoices');
const invoiceItems = () => database.get<InvoiceItem>('invoice_items');
const profiles = () => database.get<BusinessProfile>('business_profile');
const merchants = () => database.get<MerchantCategory>('merchant_categories');
const budgets = () => database.get<Budget>('budgets');

// ── Queries (observe() these from screens) ────────────────────────────────

export const queries = {
  transactions: () => transactions().query(Q.sortBy('occurred_at', Q.desc)),
  expenses: () => expenses().query(Q.sortBy('occurred_at', Q.desc)),
  customers: () => customers().query(Q.sortBy('name', Q.asc)),
  invoices: () => invoices().query(Q.sortBy('issue_date', Q.desc)),
  invoiceItems: (invoiceId: string) => invoiceItems().query(Q.where('invoice_id', invoiceId), Q.sortBy('position', Q.asc)),
  budgets: () => budgets().query(),
  profile: () => profiles().query(),
  merchantMemory: () => merchants().query(),
};

export const find = {
  transaction: (id: string) => transactions().find(id),
  expense: (id: string) => expenses().find(id),
  customer: (id: string) => customers().find(id),
  invoice: (id: string) => invoices().find(id),
};

export function txToPlain(t: Transaction): TxLike {
  return {
    id: t.id,
    amount: t.amount,
    currency: t.currency,
    type: t.type,
    category: t.category,
    counterparty: t.counterparty,
    occurredAt: t.occurredAt,
    balanceAfter: t.balanceAfter,
    dueAt: t.dueAt,
    senderId: t.senderId,
    note: t.note,
    userCategorised: !!t.userCategorised,
  };
}

export function expenseToPlain(e: Expense): ExpenseLike {
  return {
    id: e.id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    occurredAt: e.occurredAt,
    transactionId: e.transactionId,
  };
}

// ── Transactions ──────────────────────────────────────────────────────────

/** Same SMS re-read during a rescan → same fingerprint, so it is inserted once. */
export function fingerprintOf(p: Pick<ParsedTransaction, 'senderId' | 'rawBody' | 'date' | 'reference'>): string {
  return fingerprint(p);
}

export async function loadMerchantMemory(): Promise<Map<string, string>> {
  const rows = await merchants().query().fetch();
  return new Map(rows.map((r) => [r.merchant, r.category]));
}

const toRow = (t: Transaction): DedupeRow => ({
  id: t.id,
  amount: t.amount,
  currency: t.currency,
  type: t.type,
  senderId: t.senderId,
  rawBody: t.rawBody,
  reference: t.reference,
  occurredAt: t.occurredAt,
  counterparty: t.counterparty,
});

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toUpperCase() === b.replace(/\s+/g, ' ').trim().toUpperCase();
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Insert parsed SMS, skipping ones already stored. Returns how many were new.
 *
 * The duplicate check and the insert run inside one database write, so the
 * live listener, startup sync and background sync can't both save the same SMS.
 * A payment reported by two senders (EcoCash + Omari, EcoCash + Kashagi) is
 * kept once, as the more specific savings/loan record.
 */
export async function insertParsedTransactions(parsed: ParsedTransaction[]): Promise<number> {
  if (!parsed.length) return 0;
  const memory = await loadMerchantMemory();

  return database.write(async () => {
    const fps = parsed.map(fingerprintOf);
    const seen = new Set((await transactions().query(Q.where('fingerprint', Q.oneOf(fps))).fetch()).map((t) => t.fingerprint));

    const times = parsed.map((p) => p.date.getTime());
    const nearby = await transactions()
      .query(Q.where('occurred_at', Q.between(Math.min(...times) - DAY_MS, Math.max(...times) + DAY_MS)))
      .fetch();
    const rows = nearby.map(toRow);
    const records = new Map(nearby.map((t) => [t.id, t]));

    // Decide everything first, then write each record exactly once: WatermelonDB won't let a
    // record created or updated earlier in the same batch be updated again.
    type Upgrade = Pick<ParsedTransaction, 'type' | 'counterparty' | 'balance' | 'dueAt' | 'category'>;
    const plans: { id: string; fp: string; p: ParsedTransaction }[] = [];
    const planById = new Map<string, ParsedTransaction>();
    const upgrades = new Map<string, Upgrade>(); // existing record id → savings/loan details to apply

    parsed.forEach((p, i) => {
      const fp = fps[i];
      if (seen.has(fp)) return;
      const at = p.date.getTime();
      // Saved before fingerprints were sender/time independent: same text within a day.
      // Different transaction IDs are always different payments.
      const sameSms = (r: DedupeRow) => !(r.reference && p.reference && r.reference !== p.reference) && sameText(r.rawBody, p.rawBody);
      if (rows.some((r) => Math.abs(r.occurredAt - at) <= DAY_MS && r.amount === p.amount && sameSms(r))) return;
      seen.add(fp);

      const candidate: DedupeRow = { id: `plan-${i}`, amount: p.amount, currency: p.currency, type: p.type, senderId: p.senderId, rawBody: p.rawBody, reference: p.reference, occurredAt: at, counterparty: p.counterparty };
      const twin = rows.map((r) => ({ r, t: crossSourceTwin(candidate, r) })).find((x) => x.t);
      if (twin?.t) {
        if (twin.t.keep === candidate) {
          // The new SMS is the specific one (Omari/Kashagi): give its meaning to the EcoCash record.
          const upgrade: Upgrade = { type: p.type, counterparty: p.counterparty, balance: p.balance, dueAt: p.dueAt, category: p.category };
          const planned = planById.get(twin.r.id);
          if (planned) Object.assign(planned, Object.fromEntries(Object.entries(upgrade).filter(([, v]) => v !== undefined)));
          else upgrades.set(twin.r.id, { ...upgrades.get(twin.r.id), ...upgrade });
          twin.r.type = p.type;
        }
        return;
      }

      const copy = { ...p };
      plans.push({ id: candidate.id, fp, p: copy });
      planById.set(candidate.id, copy);
      rows.push(candidate);
    });

    const ops: Transaction[] = [];
    for (const [id, u] of upgrades) {
      const existing = records.get(id);
      if (!existing) continue;
      ops.push(
        existing.prepareUpdate((t) => {
          t.type = u.type;
          t.category = categorise({ type: u.type, counterparty: u.counterparty ?? t.counterparty, category: u.category }, memory);
          t.counterparty = u.counterparty ?? t.counterparty;
          t.balanceAfter = u.balance ?? t.balanceAfter;
          t.dueAt = u.dueAt?.getTime() ?? t.dueAt;
        }),
      );
    }
    for (const { fp, p } of plans) {
      ops.push(
        transactions().prepareCreate((t) => {
          t.amount = p.amount;
          t.currency = p.currency;
          t.type = p.type;
          t.category = categorise(p, memory);
          t.counterparty = p.counterparty ?? null;
          t.reference = p.reference ?? null;
          t.balanceAfter = p.balance ?? null;
          t.charges = p.charges ?? null;
          t.dueAt = p.dueAt?.getTime() ?? null;
          t.senderId = p.senderId;
          t.rawBody = p.rawBody;
          t.source = 'sms';
          t.fingerprint = fp;
          t.occurredAt = p.date.getTime();
        }),
      );
    }

    if (ops.length) await database.batch(...ops);
    return plans.length;
  });
}

/** Duplicates already saved (before this fix), for the review screen. */
export async function loadDuplicateGroups(): Promise<DuplicateGroup[]> {
  const all = await transactions().query().fetch();
  const dismissed = new Set(JSON.parse((await database.localStorage.get<string>('dup_dismissed')) ?? '[]') as string[]);
  return findDuplicateGroups(all.map(toRow)).filter((g) => !dismissed.has(g.key));
}

export async function removeDuplicates(group: DuplicateGroup) {
  const recs = await transactions().query(Q.where('id', Q.oneOf(group.remove.map((r) => r.id)))).fetch();
  await database.write(() => database.batch(...recs.map((r) => r.prepareDestroyPermanently())));
}

export async function dismissDuplicate(group: DuplicateGroup) {
  const list = JSON.parse((await database.localStorage.get<string>('dup_dismissed')) ?? '[]') as string[];
  await database.localStorage.set('dup_dismissed', JSON.stringify([...new Set([...list, group.key])]));
}

export interface ClassifyOptions {
  /** Also file this merchant/person's other payments under the category, now and in future. Default true. */
  remember?: boolean;
  /** What the user says the payment was for. */
  note?: string | null;
}

/** Set a transaction's category (and note) as the user's own choice, optionally remembering it for the merchant. */
export async function recategoriseTransaction(tx: Transaction, category: string, opts: ClassifyOptions = {}) {
  const remember = opts.remember ?? true;
  await database.write(async () => {
    const ops: Model[] = [
      tx.prepareUpdate((t) => {
        t.category = category;
        t.userCategorised = true;
        if (opts.note !== undefined) t.note = opts.note?.trim() || null;
      }),
    ];
    if (remember && tx.counterparty) {
      const key = normaliseMerchant(tx.counterparty);
      const [mem] = await merchants().query(Q.where('merchant', key)).fetch();
      ops.push(
        mem
          ? mem.prepareUpdate((m) => (m.category = category))
          : merchants().prepareCreate((m) => {
              m.merchant = key;
              m.category = category;
            }),
      );
      // Only fill in ones the user hasn't sorted themselves.
      const same = await transactions().query(Q.where('counterparty', tx.counterparty), Q.where('id', Q.notEq(tx.id))).fetch();
      for (const s of same) if (!s.userCategorised) ops.push(s.prepareUpdate((x) => (x.category = category)));
    }
    await database.batch(...ops);
  });
}

export async function deleteTransaction(tx: Transaction) {
  await database.write(() => tx.destroyPermanently());
}

// ── Expenses ──────────────────────────────────────────────────────────────

export interface ExpenseInput {
  description: string;
  amount: number;
  currency: string;
  category: string;
  occurredAt: number;
  receiptPath?: string | null;
}

export async function saveExpense(input: ExpenseInput, existing?: Expense) {
  await database.write(async () => {
    const apply = (e: Expense) => {
      e.description = input.description;
      e.amount = input.amount;
      e.currency = input.currency;
      e.category = input.category;
      e.occurredAt = input.occurredAt;
      e.receiptPath = input.receiptPath ?? null;
    };
    if (existing) await existing.update(apply);
    else
      await expenses().create((e) => {
        apply(e);
        e.transactionId = null;
      });
  });
}

export async function deleteExpense(e: Expense) {
  await database.write(() => e.destroyPermanently());
}

// ── Business profile ──────────────────────────────────────────────────────

export const PROFILE_ID = 'default';

export interface ProfileInput {
  businessName: string;
  logoPath: string | null;
  email: string;
  phone: string;
  address: string;
  ecocashNumber: string;
  bankDetails: string;
  defaultCurrency: string;
  taxRate: number;
  invoicePrefix: string;
}

export async function getProfile(): Promise<BusinessProfile | null> {
  try {
    return await profiles().find(PROFILE_ID);
  } catch {
    return null;
  }
}

export async function saveProfile(input: ProfileInput) {
  const existing = await getProfile();
  await database.write(async () => {
    const apply = (p: BusinessProfile) => {
      p.businessName = input.businessName;
      p.logoPath = input.logoPath;
      p.email = input.email;
      p.phone = input.phone;
      p.address = input.address;
      p.ecocashNumber = input.ecocashNumber;
      p.bankDetails = input.bankDetails;
      p.defaultCurrency = input.defaultCurrency;
      p.taxRate = input.taxRate;
      p.invoicePrefix = input.invoicePrefix;
    };
    if (existing) await existing.update(apply);
    else
      await profiles().create((p) => {
        p._raw.id = PROFILE_ID;
        apply(p);
      });
  });
}

// ── Customers ─────────────────────────────────────────────────────────────

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export async function saveCustomer(input: CustomerInput, existing?: Customer): Promise<Customer> {
  return database.write(async () => {
    const apply = (c: Customer) => {
      c.name = input.name;
      c.email = input.email || null;
      c.phone = input.phone || null;
      c.address = input.address || null;
      c.notes = input.notes || null;
    };
    if (existing) {
      await existing.update(apply);
      return existing;
    }
    return customers().create(apply);
  });
}

export async function deleteCustomer(c: Customer) {
  const count = await invoices().query(Q.where('customer_id', c.id)).fetchCount();
  if (count > 0) throw new Error('This customer has invoices. Delete those first.');
  await database.write(() => c.destroyPermanently());
}

// ── Invoices ──────────────────────────────────────────────────────────────

export interface InvoiceInput {
  customerId: string;
  issueDate: number;
  dueDate: number;
  currency: string;
  taxRate: number;
  notes: string;
  items: LineItemInput[];
}

export async function saveInvoice(input: InvoiceInput, existing?: Invoice): Promise<Invoice> {
  const totals = computeInvoiceTotals(input.items, input.taxRate);
  if (!totals.lines.length) throw new Error('Add at least one line item.');
  const profile = await getProfile();
  const allNumbers = (await invoices().query().fetch()).map((i) => i.invoiceNumber);

  return database.write(async () => {
    const apply = (inv: Invoice) => {
      inv.customerId = input.customerId;
      inv.issueDate = input.issueDate;
      inv.dueDate = input.dueDate;
      inv.currency = input.currency;
      inv.taxRate = input.taxRate;
      inv.subtotal = totals.subtotal;
      inv.tax = totals.tax;
      inv.total = totals.total;
      inv.notes = input.notes || null;
      inv.pdfPath = null; // stale once edited
    };
    let invoice: Invoice;
    if (existing) {
      invoice = existing;
      await existing.update(apply);
      const old = await queries.invoiceItems(existing.id).fetch();
      await database.batch(...old.map((o) => o.prepareDestroyPermanently()));
    } else {
      invoice = await invoices().create((inv) => {
        apply(inv);
        inv.invoiceNumber = nextInvoiceNumber(profile?.invoicePrefix ?? 'INV', new Date(input.issueDate).getFullYear(), allNumbers);
        inv.status = 'draft';
      });
    }
    await database.batch(
      ...totals.lines.map((l, position) =>
        invoiceItems().prepareCreate((it) => {
          it.invoiceId = invoice.id;
          it.description = l.description;
          it.quantity = l.quantity;
          it.unitPrice = l.unitPrice;
          it.lineTotal = l.lineTotal;
          it.position = position;
        }),
      ),
    );
    return invoice;
  });
}

export async function setInvoiceStatus(inv: Invoice, status: 'draft' | 'sent' | 'paid') {
  await database.write(() =>
    inv.update((i) => {
      i.status = status;
      i.pdfPath = null; // the PDF shows a PAID stamp, so regenerate on next share
    }),
  );
}

export async function setInvoicePdf(inv: Invoice, path: string) {
  await database.write(() => inv.update((i) => (i.pdfPath = path)));
}

export async function deleteInvoice(inv: Invoice) {
  const items = await queries.invoiceItems(inv.id).fetch();
  await database.write(() => database.batch(...items.map((i) => i.prepareDestroyPermanently()), inv.prepareDestroyPermanently()));
}

// ── Budgets ───────────────────────────────────────────────────────────────

export async function setBudget(category: string, currency: string, amount: number | null) {
  const [existing] = await budgets().query(Q.where('category', category), Q.where('currency', currency)).fetch();
  await database.write(async () => {
    if (amount == null || amount <= 0) {
      if (existing) await existing.destroyPermanently();
    } else if (existing) await existing.update((b) => (b.amount = amount));
    else
      await budgets().create((b) => {
        b.category = category;
        b.currency = currency;
        b.amount = amount;
      });
  });
}

// ── Export ────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCsv(): Promise<string> {
  const [txs, exps] = await Promise.all([queries.transactions().fetch(), queries.expenses().fetch()]);
  const rows: unknown[][] = [['date', 'source', 'type', 'category', 'description', 'amount', 'currency', 'reference', 'balance_after']];
  for (const t of txs)
    rows.push([new Date(t.occurredAt).toISOString(), 'sms', t.type, t.category, t.counterparty, t.amount, t.currency, t.reference, t.balanceAfter]);
  for (const e of exps) rows.push([new Date(e.occurredAt).toISOString(), 'manual', 'debit', e.category, e.description, e.amount, e.currency, '', '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
