import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'type', type: 'string', isIndexed: true },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'counterparty', type: 'string', isOptional: true },
        { name: 'reference', type: 'string', isOptional: true },
        { name: 'balance_after', type: 'number', isOptional: true },
        { name: 'charges', type: 'number', isOptional: true },
        { name: 'due_at', type: 'number', isOptional: true },
        { name: 'sender_id', type: 'string' },
        { name: 'raw_body', type: 'string' },
        { name: 'source', type: 'string' }, // sms | manual
        { name: 'fingerprint', type: 'string', isIndexed: true }, // de-duplicates re-scanned SMS
        { name: 'occurred_at', type: 'number', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'note', type: 'string', isOptional: true }, // v2: what the user says it was for
        { name: 'user_categorised', type: 'boolean', isOptional: true }, // v2: category set by the user
      ],
    }),
    tableSchema({
      name: 'expenses',
      columns: [
        { name: 'description', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'receipt_path', type: 'string', isOptional: true },
        { name: 'occurred_at', type: 'number', isIndexed: true },
        { name: 'transaction_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'business_profile',
      columns: [
        { name: 'business_name', type: 'string' },
        { name: 'logo_path', type: 'string', isOptional: true },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'ecocash_number', type: 'string', isOptional: true },
        { name: 'bank_details', type: 'string', isOptional: true },
        { name: 'default_currency', type: 'string' },
        { name: 'tax_rate', type: 'number' },
        { name: 'invoice_prefix', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'invoices',
      columns: [
        { name: 'invoice_number', type: 'string', isIndexed: true },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'issue_date', type: 'number' },
        { name: 'due_date', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'subtotal', type: 'number' },
        { name: 'tax_rate', type: 'number' },
        { name: 'tax', type: 'number' },
        { name: 'total', type: 'number' },
        { name: 'status', type: 'string' }, // draft | sent | paid
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'pdf_path', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'invoice_items',
      columns: [
        { name: 'invoice_id', type: 'string', isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit_price', type: 'number' },
        { name: 'line_total', type: 'number' },
        { name: 'position', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'merchant_categories',
      columns: [
        { name: 'merchant', type: 'string', isIndexed: true }, // normalised counterparty
        { name: 'category', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'budgets',
      columns: [
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
      ],
    }),
  ],
});
