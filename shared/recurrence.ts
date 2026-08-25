// ---------------------------------------------------------------------------
// WHEN A PLANNED ENTRY HAPPENS.
//
// Until migration 005 an `entry_templates` row carried a single `day_of_month`,
// so every planned entry was implicitly "every month, on that day". That covered
// rent and salary and nothing else. The expenses a household actually gets
// caught out by are the ones that DO NOT arrive every month -- 車検, 固定資産税,
// a year-paid insurance premium, a trip booked for March -- and a balance
// forecast that cannot represent them is not forecasting the thing that hurts.
//
// This module is the ONLY place that answers "does this entry happen on that
// day / in that month, and on which day". Every screen that projects, totals, or
// charts a month goes through the predicates below.
//
// WHY THAT MATTERS MORE THAN IT LOOKS
//   Before recurrence existed, "the entries of month M" was simply "the enabled
//   templates" -- the same list for every month -- and five call sites relied on
//   that (the forecast, the month totals, the 固定費/変動費 split, the Sankey
//   flow, the analytics fallback). The moment an entry can skip a month, each of
//   those five is a separate chance to count a yearly premium twelve times. A
//   shared predicate is not tidiness here; it is the difference between the
//   month totals and the chart beside them agreeing or not.
//
// WHY STRUCTURED VARIANTS AND NOT A JSONB BLOB
//   The database can only defend an invariant it can see. Each variant below
//   maps to a column set with a CHECK that admits exactly the fields that
//   variant needs and forbids the rest (migration 005), so a row asserting
//   "yearly" without a month cannot exist. A JSONB column would have moved that
//   guarantee into whichever code path happened to write it.
// ---------------------------------------------------------------------------

/** 'YYYY-MM'. */
export type YearMonth = string;
/** 'YYYY-MM-DD'. */
export type IsoDate = string;

/**
 * The four shapes a planned entry's timing can take.
 *
 * WHY 'yearly' IS NOT `interval` WITH everyMonths: 12
 *   It very nearly is, and collapsing them was tempting. It would be wrong in
 *   the past: `interval` is anchored to the month it started, and asking whether
 *   it occurred BEFORE that anchor answers no -- correctly, because it did not
 *   exist yet. 「毎年3月」 has no such start; a household entering its car
 *   inspection today expects last March to show it too, which is exactly what
 *   the analytics screens look back at. So `yearly` is year-agnostic on purpose,
 *   and `interval` deliberately is not.
 *
 * WHY 'interval' NEEDS AN ANCHOR
 *   "every two months" does not say WHICH two. Without a phase, a bimonthly bill
 *   would land in whichever months the renderer's arithmetic happened to pick,
 *   and would move the next time that arithmetic changed.
 */
export type Recurrence =
  | { kind: 'monthly'; dayOfMonth: number }
  /** `month` is 1-12, calendar style -- NOT the 0-11 a JS Date reports. */
  | { kind: 'yearly'; month: number; dayOfMonth: number }
  | { kind: 'interval'; everyMonths: number; anchorMonth: YearMonth; dayOfMonth: number }
  | { kind: 'once'; date: IsoDate };

export type RecurrenceKind = Recurrence['kind'];

export const RECURRENCE_KINDS: readonly RecurrenceKind[] = [
  'monthly',
  'yearly',
  'interval',
  'once',
] as const;

/**
 * Upper bound on `everyMonths`.
 *
 * 60 (five years) rather than unbounded: the value is a divisor in the occurrence
 * test, so it must be a positive integer, and anything longer than a few years is
 * better expressed as `once`. The database CHECK carries the same bound -- keep
 * them in step, or a value this module accepts fails at INSERT with a CONFLICT
 * instead of a readable validation message.
 *
 * 2 is the minimum: `everyMonths: 1` is `monthly` spelled a second way, and two
 * ways to say the same thing is two rows the UI has to explain.
 */
export const MIN_INTERVAL_MONTHS = 2;
export const MAX_INTERVAL_MONTHS = 60;

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_PATTERN.test(value);
}

/**
 * A real calendar date, not merely a well-shaped string.
 *
 * The pattern alone admits 2026-02-31 and 2027-02-29, and a one-off carrying one
 * of those would never occur: the forecast walks real days, so no day ever
 * equals the 31st of February and the entry would sit in the list, enabled,
 * silently never happening. That is worse than a rejected input -- the household
 * has budgeted for something the projection does not contain.
 *
 * Constructed in LOCAL time to match every other date in this module. Round-
 * tripping through the constructed Date is what rejects the impossible ones:
 * `new Date(2026, 1, 31)` rolls forward to 3 March and no longer matches.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

// --- Calendar helpers -------------------------------------------------------
//
// Local time throughout, deliberately. A household's 「25日」 is the 25th on the
// wall calendar in front of them; parsing dates as UTC turns it into the 24th for
// anyone east of Greenwich, which is every user of this application.

/** Last day of the month containing `date` (28-31). */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  // Day 0 of the NEXT month is the last day of this one, and this is the only
  // form that stays correct across leap years without a table.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** 'YYYY-MM' for a Date, in local time. */
export function toYearMonth(date: Date): YearMonth {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' for a Date, in local time. */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Splits 'YYYY-MM' into a 1-12 month. Returns null for anything malformed. */
function parseYearMonth(yearMonth: YearMonth): { year: number; month: number } | null {
  if (!isYearMonth(yearMonth)) return null;
  return { year: Number(yearMonth.slice(0, 4)), month: Number(yearMonth.slice(5, 7)) };
}

/**
 * Whole months from `from` to `to`. Negative when `to` precedes `from`.
 *
 * Month arithmetic, not day arithmetic: 'YYYY-MM' has no day, and subtracting
 * timestamps would make the answer depend on month lengths.
 */
function monthsBetween(from: { year: number; month: number }, to: { year: number; month: number }): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

// --- The predicates ---------------------------------------------------------

/**
 * The day of `yearMonth` this entry falls on, or null if it does not occur then.
 *
 * THE RETURN VALUE IS ALREADY CLAMPED. An entry on 「31日」 occurs on the 28th
 * of February, the 30th of April, and the 31st of March -- one rule, applied
 * here, rather than at each of the call sites that used to hold its own copy.
 * Clamping is not a rounding convenience: a rent payment set to the 31st that
 * silently skipped every short month would take the forecast with it.
 *
 * Returning the DAY rather than a boolean is what lets callers order a month's
 * entries chronologically without re-deriving the same clamp differently.
 */
export function occurrenceDayInMonth(recurrence: Recurrence, yearMonth: YearMonth): number | null {
  const target = parseYearMonth(yearMonth);
  if (!target) return null;

  const clamp = (day: number): number =>
    Math.min(day, lastDayOfMonth(target.year, target.month - 1));

  switch (recurrence.kind) {
    case 'monthly':
      return clamp(recurrence.dayOfMonth);

    case 'yearly':
      // Year-agnostic on purpose -- see the note on the Recurrence type.
      return recurrence.month === target.month ? clamp(recurrence.dayOfMonth) : null;

    case 'interval': {
      const anchor = parseYearMonth(recurrence.anchorMonth);
      if (!anchor) return null;
      const elapsed = monthsBetween(anchor, target);
      // Before the anchor it had not started yet. `%` on a negative left operand
      // yields a negative result in JavaScript, so `elapsed % n === 0` alone
      // would happily fire two months BEFORE a bimonthly bill began.
      if (elapsed < 0) return null;
      return elapsed % recurrence.everyMonths === 0 ? clamp(recurrence.dayOfMonth) : null;
    }

    case 'once':
      // No clamping: a one-off carries a real calendar date, so there is no
      // 「31日」 that has to be talked down to the 30th.
      return recurrence.date.slice(0, 7) === yearMonth ? Number(recurrence.date.slice(8, 10)) : null;
  }
}

/** Whether this entry happens at all in `yearMonth`. */
export function occursInMonth(recurrence: Recurrence, yearMonth: YearMonth): boolean {
  return occurrenceDayInMonth(recurrence, yearMonth) !== null;
}

/** Whether this entry happens on `date` (a Date, read in local time). */
export function occursOn(recurrence: Recurrence, date: Date): boolean {
  return occurrenceDayInMonth(recurrence, toYearMonth(date)) === date.getDate();
}

/**
 * A stable day-of-month for ordering a list that mixes recurrences.
 *
 * Used only for sort order, never for whether something occurs: a yearly entry
 * shown in a month it does not fall in has no day, and 0 puts it first rather
 * than throwing away the row.
 */
export function sortDay(recurrence: Recurrence): number {
  return recurrence.kind === 'once'
    ? Number(recurrence.date.slice(8, 10))
    : recurrence.dayOfMonth;
}

// --- Display ----------------------------------------------------------------

/**
 * The ONE place a recurrence becomes Japanese.
 *
 * Every list, row and dialog reads its label from here. The alternative -- each
 * component formatting the variant it happens to care about -- is how 「毎年3月
 * 25日」 ends up rendered three different ways on three screens, and how a fifth
 * variant added later reaches production still displayed as its raw kind.
 */
export function describeRecurrence(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'monthly':
      return `毎月${recurrence.dayOfMonth}日`;
    case 'yearly':
      return `毎年${recurrence.month}月${recurrence.dayOfMonth}日`;
    case 'interval':
      return `${recurrence.everyMonths}ヶ月ごと ${recurrence.dayOfMonth}日`;
    case 'once': {
      const [, month, day] = recurrence.date.split('-');
      return `${Number(month)}月${Number(day)}日 (1回のみ)`;
    }
  }
}

/** Short form for a dense row, where the month is already known from context. */
export function describeRecurrenceShort(recurrence: Recurrence, yearMonth: YearMonth): string {
  const day = occurrenceDayInMonth(recurrence, yearMonth);
  if (day === null) return describeRecurrence(recurrence);
  switch (recurrence.kind) {
    case 'monthly':
      return `${day}日`;
    case 'yearly':
      return `${day}日 (年1回)`;
    case 'interval':
      return `${day}日 (${recurrence.everyMonths}ヶ月ごと)`;
    case 'once':
      return `${day}日 (1回のみ)`;
  }
}

/**
 * True for recurrences that do NOT arrive every month.
 *
 * The point of surfacing this is the month it lands in: a household reading its
 * 収支 for March needs to see that the ¥120,000 in it is annual and will not be
 * there in April, or it reads March as a bad month rather than an ordinary one
 * carrying a yearly bill.
 */
export function isIrregular(recurrence: Recurrence): boolean {
  return recurrence.kind !== 'monthly';
}

// --- Validation -------------------------------------------------------------

/**
 * Narrows unknown input to a Recurrence, or explains why it is not one.
 *
 * Shared by the server's request validation and by any client code reading a
 * value it did not construct, so the two cannot drift into accepting different
 * things. Returns a message rather than throwing: both callers want to report it
 * to a person, and neither wants a stack trace.
 */
export function parseRecurrence(value: unknown): { ok: true; value: Recurrence } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, error: '繰り返しの指定が不正です' };
  const raw = value as Record<string, unknown>;

  const dayOfMonth = raw.dayOfMonth;
  const dayOk = typeof dayOfMonth === 'number' && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31;

  switch (raw.kind) {
    case 'monthly':
      if (!dayOk) return { ok: false, error: '日付は1〜31で指定してください' };
      return { ok: true, value: { kind: 'monthly', dayOfMonth: dayOfMonth as number } };

    case 'yearly': {
      if (!dayOk) return { ok: false, error: '日付は1〜31で指定してください' };
      const month = raw.month;
      if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
        return { ok: false, error: '月は1〜12で指定してください' };
      }
      return { ok: true, value: { kind: 'yearly', month, dayOfMonth: dayOfMonth as number } };
    }

    case 'interval': {
      if (!dayOk) return { ok: false, error: '日付は1〜31で指定してください' };
      const everyMonths = raw.everyMonths;
      if (
        typeof everyMonths !== 'number' ||
        !Number.isInteger(everyMonths) ||
        everyMonths < MIN_INTERVAL_MONTHS ||
        everyMonths > MAX_INTERVAL_MONTHS
      ) {
        return { ok: false, error: `間隔は${MIN_INTERVAL_MONTHS}〜${MAX_INTERVAL_MONTHS}ヶ月で指定してください` };
      }
      const anchorMonth = raw.anchorMonth;
      if (typeof anchorMonth !== 'string' || !isYearMonth(anchorMonth)) {
        return { ok: false, error: '起点の月の指定が不正です' };
      }
      return { ok: true, value: { kind: 'interval', everyMonths, anchorMonth, dayOfMonth: dayOfMonth as number } };
    }

    case 'once': {
      const date = raw.date;
      if (typeof date !== 'string' || !isIsoDate(date)) {
        return { ok: false, error: '日付の指定が不正です' };
      }
      return { ok: true, value: { kind: 'once', date } };
    }

    default:
      return { ok: false, error: '繰り返しの種類が不正です' };
  }
}
