import { averageMonthlySaving, detectRecurring, forecastMonth, planGoal, upcomingPayments } from '../src/core/insights';
import { Entry } from '../src/core/summaries';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).getTime();
let n = 0;
const out = (title: string, amount: number, at: number, category = 'other'): Entry => ({
  id: String(++n), kind: 'sms', amount, currency: 'USD', category, occurredAt: at, title, direction: 'out',
});
const inc = (amount: number, at: number): Entry => ({ ...out('Salary', amount, at, 'income'), direction: 'in' });

const now = new Date(2026, 9, 20, 12);

describe('detectRecurring', () => {
  const entries = [
    out('DSTV', 29, day(2026, 7, 5)), out('DSTV', 29, day(2026, 8, 5)), out('DSTV', 29, day(2026, 9, 4)), out('DSTV', 29, day(2026, 10, 5)),
    out('TENDAI MOYO', 250, day(2026, 8, 1)), out('TENDAI MOYO', 250, day(2026, 9, 1)), out('TENDAI MOYO', 250, day(2026, 10, 2)),
    out('ZUPCO', 3, day(2026, 10, 1)), out('ZUPCO', 3, day(2026, 10, 8)), out('ZUPCO', 3, day(2026, 10, 15)),
    // Groceries at the same shop with wild amounts: not a bill.
    out('OK ZIMBABWE', 12, day(2026, 8, 3)), out('OK ZIMBABWE', 80, day(2026, 9, 3)), out('OK ZIMBABWE', 35, day(2026, 10, 3)),
    // Cancelled long ago.
    out('NETFLIX', 10, day(2026, 3, 1)), out('NETFLIX', 10, day(2026, 4, 1)),
  ];
  const r = detectRecurring(entries, now);
  const byName = new Map(r.map((x) => [x.merchant, x]));

  it('finds monthly and weekly bills', () => {
    expect(byName.get('DSTV')?.cadence).toBe('monthly');
    expect(byName.get('TENDAI MOYO')?.cadence).toBe('monthly');
    expect(byName.get('ZUPCO')?.cadence).toBe('weekly');
  });

  it('ignores irregular amounts and stale subscriptions', () => {
    expect(byName.has('OK ZIMBABWE')).toBe(false);
    expect(byName.has('NETFLIX')).toBe(false);
  });

  it('predicts the next date and monthly cost', () => {
    const dstv = byName.get('DSTV')!;
    expect(new Date(dstv.nextAt).getMonth()).toBe(10); // November
    expect(dstv.monthlyCost).toBe(29);
    expect(byName.get('ZUPCO')!.monthlyCost).toBeCloseTo(13, 0);
    expect(dstv.confidence).toBeGreaterThan(byName.get('ZUPCO')!.confidence - 30);
  });

  it('lists upcoming payments in date order', () => {
    const up = upcomingPayments(r, [{ title: 'Kashagi', amount: 18, currency: 'USD', dueAt: day(2026, 10, 28), kind: 'loan' }], now, 31);
    expect(up.map((u) => u.dueAt)).toEqual([...up.map((u) => u.dueAt)].sort((a, b) => a - b));
    expect(up.some((u) => u.title === 'Kashagi')).toBe(true);
    expect(up.filter((u) => u.title === 'ZUPCO').length).toBeGreaterThanOrEqual(4);
  });
});

describe('forecastMonth', () => {
  it('adds day-to-day spending and remaining bills to what is spent', () => {
    const entries = [
      inc(1000, day(2026, 10, 1)),
      out('TENDAI MOYO', 250, day(2026, 9, 1)), out('TENDAI MOYO', 250, day(2026, 10, 1)),
      out('DSTV', 29, day(2026, 9, 25)), // due again 25 Oct, after "now"
      out('DSTV', 29, day(2026, 8, 26)),
      out('Lunch', 100, day(2026, 10, 10)), // 100 discretionary over 20 days = 5/day
    ];
    const f = forecastMonth(entries, detectRecurring(entries, now), 'USD', now);
    expect(f.spentSoFar).toBe(350);
    expect(f.dailyRate).toBe(5);
    expect(f.upcomingBills).toBe(29);
    expect(f.projected).toBe(350 + 5 * 11 + 29);
    expect(f.projectedOfIncomePct).toBeCloseTo(43.4);
  });
});

describe('planGoal', () => {
  it('reports progress and time to a million', () => {
    const p = planGoal({ target: 1_000_000, current: 10_000, monthlySaving: 1_000, annualReturn: 8 });
    expect(p.progressPct).toBe(1);
    expect(p.monthsToGoal! / 12).toBeGreaterThan(24); // ≈24.8 years at 8%
    expect(p.monthsToGoal! / 12).toBeLessThan(35);
  });

  it('computes the monthly saving needed for a deadline', () => {
    const p = planGoal({ target: 120, current: 0, monthlySaving: 0, annualReturn: 0 });
    expect(p.neededPerMonth(1)).toBe(10);
    expect(p.monthsToGoal).toBeNull();
  });

  it('averages saving over full months', () => {
    const e = [inc(1000, day(2026, 9, 1)), out('x', 600, day(2026, 9, 2))];
    expect(averageMonthlySaving(e, 'USD', 1, now)).toBe(400);
  });
});
