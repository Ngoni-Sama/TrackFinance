export const CATEGORIES = [
  'food',
  'transport',
  'airtime',
  'utilities',
  'rent',
  'loan_repayment',
  'savings',
  'health',
  'education',
  'entertainment',
  'subscriptions',
  'family',
  'business',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CURRENCIES = ['USD', 'ZWG'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function categoryLabel(c: string): string {
  return c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
}
