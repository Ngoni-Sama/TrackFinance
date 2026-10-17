const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency = 'USD'): string {
  let f = formatters.get(currency);
  if (!f) {
    // ZWG is not in every Intl build, so format the number and prefix the code ourselves.
    f = new Intl.NumberFormat('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency === 'USD' ? '$' : currency + ' '}${f.format(Math.abs(amount))}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
