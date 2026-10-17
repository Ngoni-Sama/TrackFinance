import { Model, Query, Relation } from '@nozbe/watermelondb';
import { Associations } from '@nozbe/watermelondb/Model';
import { children, field, readonly, date, relation, text } from '@nozbe/watermelondb/decorators';

export class Transaction extends Model {
  static table = 'transactions';

  @field('amount') amount!: number;
  @text('currency') currency!: string;
  @text('type') type!: string;
  @text('category') category!: string | null;
  @text('counterparty') counterparty!: string | null;
  @text('reference') reference!: string | null;
  @field('balance_after') balanceAfter!: number | null;
  @field('charges') charges!: number | null;
  @field('due_at') dueAt!: number | null;
  @text('sender_id') senderId!: string;
  @field('raw_body') rawBody!: string;
  @text('source') source!: string;
  @field('fingerprint') fingerprint!: string;
  @field('occurred_at') occurredAt!: number;
  @readonly @date('created_at') createdAt!: Date;
}

export class Expense extends Model {
  static table = 'expenses';

  @text('description') description!: string;
  @field('amount') amount!: number;
  @text('currency') currency!: string;
  @text('category') category!: string;
  @field('receipt_path') receiptPath!: string | null;
  @field('occurred_at') occurredAt!: number;
  @field('transaction_id') transactionId!: string | null;
  @readonly @date('created_at') createdAt!: Date;
}

export class Customer extends Model {
  static table = 'customers';
  static associations: Associations = { invoices: { type: 'has_many', foreignKey: 'customer_id' } };

  @text('name') name!: string;
  @text('email') email!: string | null;
  @text('phone') phone!: string | null;
  @text('address') address!: string | null;
  @text('notes') notes!: string | null;
  @readonly @date('created_at') createdAt!: Date;
}

export class BusinessProfile extends Model {
  static table = 'business_profile';

  @text('business_name') businessName!: string;
  @field('logo_path') logoPath!: string | null;
  @text('email') email!: string | null;
  @text('phone') phone!: string | null;
  @text('address') address!: string | null;
  @text('ecocash_number') ecocashNumber!: string | null;
  @text('bank_details') bankDetails!: string | null;
  @text('default_currency') defaultCurrency!: string;
  @field('tax_rate') taxRate!: number;
  @text('invoice_prefix') invoicePrefix!: string;
}

export class Invoice extends Model {
  static table = 'invoices';
  static associations: Associations = {
    customers: { type: 'belongs_to', key: 'customer_id' },
    invoice_items: { type: 'has_many', foreignKey: 'invoice_id' },
  };

  @text('invoice_number') invoiceNumber!: string;
  @field('customer_id') customerId!: string;
  @field('issue_date') issueDate!: number;
  @field('due_date') dueDate!: number;
  @text('currency') currency!: string;
  @field('subtotal') subtotal!: number;
  @field('tax_rate') taxRate!: number;
  @field('tax') tax!: number;
  @field('total') total!: number;
  @text('status') status!: string;
  @text('notes') notes!: string | null;
  @field('pdf_path') pdfPath!: string | null;
  @readonly @date('created_at') createdAt!: Date;

  @relation('customers', 'customer_id') customer!: Relation<Customer>;
  @children('invoice_items') items!: Query<InvoiceItem>;
}

export class InvoiceItem extends Model {
  static table = 'invoice_items';
  static associations: Associations = { invoices: { type: 'belongs_to', key: 'invoice_id' } };

  @field('invoice_id') invoiceId!: string;
  @text('description') description!: string;
  @field('quantity') quantity!: number;
  @field('unit_price') unitPrice!: number;
  @field('line_total') lineTotal!: number;
  @field('position') position!: number;
}

export class MerchantCategory extends Model {
  static table = 'merchant_categories';

  @field('merchant') merchant!: string;
  @text('category') category!: string;
}

export class Budget extends Model {
  static table = 'budgets';

  @text('category') category!: string;
  @field('amount') amount!: number;
  @text('currency') currency!: string;
}

export const modelClasses = [Transaction, Expense, Customer, BusinessProfile, Invoice, InvoiceItem, MerchantCategory, Budget];
