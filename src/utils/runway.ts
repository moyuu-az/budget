import type { ForecastPoint } from '../types';

// ---------------------------------------------------------------------------
// THE THREE QUESTIONS A HOUSEHOLD ACTUALLY ASKS.
//
// The dashboard already answered "what is the lowest the balance gets in 90
// days". That is the right thing to WORRY about and the wrong thing to open the
// app for: it does not tell anyone what to do today. These three do.
//
//   使っていい額  -- what is left after everything already committed before the
//                   next income arrives, and after the floor the household said
//                   it wants to keep
//   次の収入まで  -- when that next income is, because 「あと¥48,000」 means
//                   nothing without 「あと12日」 beside it
//   残高がもつ日  -- when the projection first crosses the floor, if it does
//
// ALL THREE ARE DERIVED FROM THE SAME `ForecastPoint[]` THE CHART DRAWS.
// Recomputing them from templates would be a second projection, and two
// projections is two answers to "when does the rent leave" -- see useForecast
// for why there is exactly one.
//
// EVERY FUNCTION HERE IS PURE. They take points and a threshold and return a
// value; nothing reads a store or a clock. The clock is already baked into the
// points (index 0 is today), and a function that read it again could disagree
// with the chart across midnight.
// ---------------------------------------------------------------------------

/**
 * The floor a household wants to keep, in yen.
 *
 * NOT a constant here. It was `50000` hard-coded in KpiHero, which made 「安全」
 * mean the same thing for every household -- and the figure is exactly the sort
 * a household has an opinion about. It now comes from ledger settings; this type
 * exists so the functions below say what the number IS rather than taking a bare
 * number nobody can identify at the call site.
 */
export type MinBalanceThreshold = number;

export interface NextIncome {
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Whole days from today. Always >= 1: today's events are already in the balance. */
  daysUntil: number;
  /** Total income landing that day, which may be several entries. */
  amount: number;
  /** What lands that day, for a caption. The largest first. */
  names: string[];
}

export interface SafeToSpend {
  /**
   * What is free to spend before the next income arrives.
   *
   * `balance today - expenses committed before that income - threshold`, floored
   * at zero. Negative would mean the household is already past the floor, which
   * is a DIFFERENT message ("you are short"), not a negative allowance -- so the
   * sign is carried in `shortfall` instead and this stays a spendable figure.
   */
  amount: number;
  /**
   * How far short of the floor the committed spending leaves the household, or 0.
   *
   * The other half of the same subtraction. Kept separate so a caller renders
   * either 「あと¥48,000 使えます」 or 「¥12,000 足りません」 -- one number that
   * flips sign would have to be re-explained at every call site.
   */
  shortfall: number;
  /** Null when no income is projected in the window; see `horizonDays`. */
  until: NextIncome | null;
  /**
   * The window the answer covers, in days.
   *
   * Equal to `until.daysUntil` when there is a next income. When there is NOT --
   * a household with no recorded income, or a projection that ends first -- it is
   * the length of the projection, and the answer means "for the rest of what is
   * projected" rather than "until payday". A caller must say which; the two read
   * identically as a number and mean very different things.
   */
  horizonDays: number;
}

/**
 * How a balance stands against the household's floor.
 *
 * ONE FUNCTION, because this judgement appeared in three places -- the KPI
 * badge, the forecast chart's minimum-point dot, and the 最低残高 card -- and
 * each held its own copy of `50000`. Making the floor configurable moved one of
 * them and left the other two behind, so a ledger with a 300,000 floor saw
 * 「注意」 in the KPI row and a green dot on the chart directly below it: two
 * answers to one question, on one screen.
 */
export type BalanceTone = 'safe' | 'warning' | 'danger';

export function balanceTone(balance: number, threshold: MinBalanceThreshold): BalanceTone {
  if (balance < 0) return 'danger';
  return balance < threshold ? 'warning' : 'safe';
}

export interface Runway {
  /** 'YYYY-MM-DD' of the first day the projection is below the threshold. */
  date: string;
  /** Whole days from today until that date. */
  days: number;
}

/**
 * The next day income lands, after today.
 *
 * TODAY IS EXCLUDED, matching generateForecast: index 0 carries today's events
 * for display but does not apply them to the balance, because the balance the
 * user entered already reflects them. Counting today's salary here would let a
 * household spend it twice.
 */
export function nextIncome(points: readonly ForecastPoint[]): NextIncome | null {
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const incomes = point.eventDetails.filter((detail) => detail.type === 'income');
    if (incomes.length === 0) continue;

    return {
      date: point.date,
      daysUntil: i,
      amount: incomes.reduce((sum, detail) => sum + detail.amount, 0),
      names: [...incomes].sort((a, b) => b.amount - a.amount).map((detail) => detail.name),
    };
  }
  return null;
}

/**
 * What is free to spend between now and the next income.
 *
 * WHY THIS IS THE NUMBER WORTH SHOWING
 *   「90日後の最小残高 ¥120,000」 is true and unactionable. 「次の給料まで12日、
 *   自由に使えるのは ¥48,000」 is the same projection asked as a question the
 *   household can answer today, which is the difference between a dashboard
 *   someone checks and one someone uses.
 *
 * WHY IT SUBTRACTS THE THRESHOLD
 *   Spending down to zero is not safe; the floor is the point. Leaving it out
 *   would produce an allowance that, if spent, lands exactly on the warning the
 *   rest of the dashboard is about to raise.
 *
 * WHY IT USES THE PROJECTED MINIMUM RATHER THAN THE END BALANCE
 *   The committed expenses do not all land on the last day. A household paid on
 *   the 25th with rent due on the 27th has a dip in between, and an allowance
 *   computed from the balance on the 25th would fund a month whose rent has not
 *   left yet. The minimum over the window is the only figure that survives every
 *   day in it.
 */
export function safeToSpend(
  points: readonly ForecastPoint[],
  threshold: MinBalanceThreshold,
): SafeToSpend {
  const income = nextIncome(points);
  // Without a next income the answer covers whatever is projected. `points` is
  // empty only when the forecast is not ready, and callers gate on that -- but
  // the guard keeps this function total rather than reading points[0] of [].
  const horizonDays = income?.daysUntil ?? Math.max(points.length - 1, 0);
  if (points.length === 0) {
    return { amount: 0, shortfall: 0, until: null, horizonDays: 0 };
  }

  // The lowest the balance gets at any point in the window, today included:
  // today's balance is itself a candidate, and for a household with no expenses
  // before payday it is the answer.
  let low = points[0].balance;
  for (let i = 1; i <= horizonDays && i < points.length; i++) {
    if (points[i].balance < low) low = points[i].balance;
  }

  const free = low - threshold;
  return {
    amount: Math.max(free, 0),
    shortfall: Math.max(-free, 0),
    until: income,
    horizonDays,
  };
}

/**
 * The first day the projection falls below the threshold, if it does.
 *
 * Null means "not within the projection", NOT "never" -- the window is however
 * many days the caller asked useForecast for. A caller must say 「90日以内には
 * 割りません」 rather than 「割りません」, because the second is a claim this
 * function cannot support.
 *
 * A household already below its floor gets `days: 0` rather than null -- see the
 * note in the body. Callers are expected to render that as 「すでに下回って
 * います」 rather than as 「あと0日」.
 */
export function runway(
  points: readonly ForecastPoint[],
  threshold: MinBalanceThreshold,
): Runway | null {
  // ALREADY BELOW IT counts, and counts as zero days.
  //
  // Skipping straight to the future would answer 「90日以上」 for a household
  // that is under its floor RIGHT NOW -- beside a 使っていい額 card correctly
  // reporting a shortfall. Two contradictory statements in one row, and the
  // reassuring one is the wrong one.
  if (points.length > 0 && points[0].balance < threshold) {
    return { date: points[0].date, days: 0 };
  }

  for (let i = 1; i < points.length; i++) {
    if (points[i].balance < threshold) {
      return { date: points[i].date, days: i };
    }
  }
  return null;
}
