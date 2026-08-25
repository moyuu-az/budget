import { describe, it, expect } from 'vitest';
import { balanceTone, nextIncome, runway, safeToSpend } from './runway';
import type { ForecastPoint } from '../types';

// ---------------------------------------------------------------------------
// These three functions turn a projection into an answer someone can act on
// today. Getting them wrong is not a display bug: 使っていい額 is a figure a
// household will SPEND against, so an over-generous answer takes them below the
// floor they asked the app to protect.
//
// The points are built by hand rather than through generateForecast, so each
// test states exactly the shape it is about.
// ---------------------------------------------------------------------------

interface Event {
  name: string;
  amount: number;
  type: 'income' | 'expense';
}

/** One day of a projection. Index 0 must be today; see the note in runway.ts. */
function point(date: string, balance: number, events: Event[] = [], isToday = false): ForecastPoint {
  return {
    date,
    balance,
    events: events.map((e) => e.name),
    eventDetails: events.map((e) => ({ ...e, categoryId: null })),
    isToday,
  };
}

/** Today, then `balances` as the following days. */
function projection(today: number, ...days: Array<[number, Event[]?]>): ForecastPoint[] {
  return [
    point('2026-06-01', today, [], true),
    ...days.map(([balance, events], i) =>
      point(`2026-06-${String(i + 2).padStart(2, '0')}`, balance, events),
    ),
  ];
}

describe('nextIncome', () => {
  it('finds the next day income lands', () => {
    const points = projection(
      100_000,
      [100_000],
      [400_000, [{ name: '給料', amount: 300_000, type: 'income' }]],
    );
    expect(nextIncome(points)).toEqual({
      date: '2026-06-03',
      daysUntil: 2,
      amount: 300_000,
      names: ['給料'],
    });
  });

  it('EXCLUDES today, because that money is already in the balance', () => {
    // generateForecast puts today's events in `eventDetails` for display but does
    // not apply them: the balance the household typed already reflects them.
    // Counting today's salary here would let them spend it twice.
    const points = [
      point('2026-06-01', 400_000, [{ name: '給料', amount: 300_000, type: 'income' }], true),
      point('2026-06-02', 400_000),
    ];
    expect(nextIncome(points)).toBeNull();
  });

  it('sums several incomes landing on the same day, largest first', () => {
    const points = projection(
      100_000,
      [
        250_000,
        [
          { name: '副業', amount: 50_000, type: 'income' },
          { name: '給料', amount: 100_000, type: 'income' },
        ],
      ],
    );
    expect(nextIncome(points)).toMatchObject({ amount: 150_000, names: ['給料', '副業'] });
  });

  it('ignores expenses', () => {
    const points = projection(100_000, [20_000, [{ name: '家賃', amount: 80_000, type: 'expense' }]]);
    expect(nextIncome(points)).toBeNull();
  });

  it('returns null for an empty projection', () => {
    expect(nextIncome([])).toBeNull();
  });
});

describe('safeToSpend', () => {
  it('is the balance minus committed spending minus the floor', () => {
    // ¥300,000 today, ¥100,000 of rent before payday, ¥50,000 floor.
    const points = projection(
      300_000,
      [200_000, [{ name: '家賃', amount: 100_000, type: 'expense' }]],
      [500_000, [{ name: '給料', amount: 300_000, type: 'income' }]],
    );

    const result = safeToSpend(points, 50_000);
    expect(result.amount).toBe(150_000);
    expect(result.shortfall).toBe(0);
    expect(result.until).toMatchObject({ daysUntil: 2, amount: 300_000 });
    expect(result.horizonDays).toBe(2);
  });

  it('uses the MINIMUM over the window, not the balance on payday', () => {
    // The dip matters. A household paid on the 25th with rent due on the 27th
    // has a low point between; an allowance computed from the payday balance
    // would fund a month whose rent has not left yet.
    const points = projection(
      300_000,
      [60_000, [{ name: '家賃', amount: 240_000, type: 'expense' }]],
      [260_000, [{ name: '給料', amount: 200_000, type: 'income' }]],
    );

    // Minimum over days 0..2 is 60,000; minus the 50,000 floor.
    expect(safeToSpend(points, 50_000).amount).toBe(10_000);
  });

  it('reports a shortfall rather than a negative allowance', () => {
    // 「-¥12,000 使えます」 is not a sentence. The sign lives in its own field so
    // a caller renders either 「使えます」 or 「足りません」.
    const points = projection(
      50_000,
      [38_000, [{ name: '家賃', amount: 12_000, type: 'expense' }]],
      [238_000, [{ name: '給料', amount: 200_000, type: 'income' }]],
    );

    const result = safeToSpend(points, 50_000);
    expect(result.amount).toBe(0);
    expect(result.shortfall).toBe(12_000);
  });

  it('covers the whole projection when no income is expected', () => {
    // A household with no recorded income still deserves an answer -- it just
    // means something different, and `until: null` is what says so.
    const points = projection(200_000, [190_000], [180_000]);

    const result = safeToSpend(points, 50_000);
    expect(result.until).toBeNull();
    expect(result.horizonDays).toBe(2);
    expect(result.amount).toBe(130_000);
  });

  it('subtracts nothing extra when the floor is zero', () => {
    const points = projection(200_000, [150_000]);
    expect(safeToSpend(points, 0).amount).toBe(150_000);
  });

  it('returns a zero answer for an empty projection rather than throwing', () => {
    expect(safeToSpend([], 50_000)).toEqual({
      amount: 0,
      shortfall: 0,
      until: null,
      horizonDays: 0,
    });
  });

  it('does not look past the next income', () => {
    // A large expense AFTER payday is not this question's business; it belongs to
    // the next window. Including it would make the allowance shrink for a bill
    // the next salary is there to cover.
    const points = projection(
      300_000,
      [500_000, [{ name: '給料', amount: 200_000, type: 'income' }]],
      [100_000, [{ name: '車検', amount: 400_000, type: 'expense' }]],
    );

    expect(safeToSpend(points, 50_000).amount).toBe(250_000);
  });
});

describe('balanceTone', () => {
  // One function, because this judgement used to live in three places -- the KPI
  // badge, the chart's minimum-point dot, and the 最低残高 card -- each with its
  // own copy of 50000. Making the floor configurable moved one and left two
  // behind: 「注意」 in the KPI row, a green dot directly below it.
  it('is danger below zero, whatever the floor', () => {
    expect(balanceTone(-1, 50_000)).toBe('danger');
    expect(balanceTone(-1, 0)).toBe('danger');
  });

  it('is warning between zero and the floor', () => {
    expect(balanceTone(0, 50_000)).toBe('warning');
    expect(balanceTone(49_999, 50_000)).toBe('warning');
  });

  it('treats exactly the floor as safe -- it is what the household wants to KEEP', () => {
    expect(balanceTone(50_000, 50_000)).toBe('safe');
  });

  it('follows the household’s own floor, not a constant', () => {
    expect(balanceTone(100_000, 50_000)).toBe('safe');
    expect(balanceTone(100_000, 300_000)).toBe('warning');
  });

  it('leaves only "negative" as a warning when the floor is zero', () => {
    expect(balanceTone(0, 0)).toBe('safe');
    expect(balanceTone(1, 0)).toBe('safe');
  });
});

describe('runway', () => {
  it('finds the first day the projection crosses the floor', () => {
    const points = projection(100_000, [80_000], [40_000], [30_000]);
    expect(runway(points, 50_000)).toEqual({ date: '2026-06-03', days: 2 });
  });

  it('returns null when the projection never crosses it', () => {
    // Null means "not within the window", NOT "never" -- the caller must say
    // 「90日以内には割りません」 rather than 「割りません」.
    const points = projection(100_000, [90_000], [80_000]);
    expect(runway(points, 50_000)).toBeNull();
  });

  it('reports zero days when the balance is ALREADY below the floor', () => {
    // Skipping straight to the future would answer 「90日以上」 for a household
    // that is under its floor right now -- beside a 使っていい額 card correctly
    // reporting a shortfall. Two contradictory statements in one row, and the
    // reassuring one is the wrong one.
    const points = projection(10_000, [100_000], [200_000]);
    expect(runway(points, 50_000)).toEqual({ date: '2026-06-01', days: 0 });
  });

  it('agrees with safeToSpend about whether there is a problem right now', () => {
    // The pair that contradicted each other. Whatever else they say, they must
    // not disagree about the present.
    const points = projection(10_000, [100_000], [200_000]);
    expect(safeToSpend(points, 50_000).shortfall).toBeGreaterThan(0);
    expect(runway(points, 50_000)).not.toBeNull();
  });

  it('treats exactly the threshold as still above it', () => {
    // The floor is what the household wants to KEEP, so landing on it is not
    // crossing it. Strict `<` rather than `<=`.
    const points = projection(100_000, [50_000], [49_999]);
    expect(runway(points, 50_000)).toEqual({ date: '2026-06-03', days: 2 });
  });

  it('returns null for an empty projection', () => {
    expect(runway([], 50_000)).toBeNull();
  });
});
