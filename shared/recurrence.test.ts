import { describe, it, expect } from 'vitest';
import {
  describeRecurrence,
  describeRecurrenceShort,
  isExpiredOnce,
  isIrregular,
  isIsoDate,
  isYearMonth,
  lastDayOfMonth,
  MAX_INTERVAL_MONTHS,
  MIN_INTERVAL_MONTHS,
  occurrenceDayInMonth,
  occursInMonth,
  occursOn,
  parseRecurrence,
  sortDay,
  toIsoDate,
  toYearMonth,
  type Recurrence,
} from './recurrence';

describe('occurrenceDayInMonth', () => {
  describe('monthly', () => {
    const rent: Recurrence = { kind: 'monthly', dayOfMonth: 25 };

    it('lands on its day in every month', () => {
      expect(occurrenceDayInMonth(rent, '2026-01')).toBe(25);
      expect(occurrenceDayInMonth(rent, '2026-02')).toBe(25);
      expect(occurrenceDayInMonth(rent, '2026-12')).toBe(25);
    });

    it('clamps to the last day of a short month rather than skipping it', () => {
      // A rent payment set to the 31st must still happen in February. Skipping
      // it would take the forecast with it -- the balance would show a month
      // where the largest outgoing simply did not occur.
      const lastDay: Recurrence = { kind: 'monthly', dayOfMonth: 31 };
      expect(occurrenceDayInMonth(lastDay, '2026-02')).toBe(28);
      expect(occurrenceDayInMonth(lastDay, '2026-04')).toBe(30);
      expect(occurrenceDayInMonth(lastDay, '2026-03')).toBe(31);
    });

    it('knows February 2028 has 29 days', () => {
      expect(occurrenceDayInMonth({ kind: 'monthly', dayOfMonth: 30 }, '2028-02')).toBe(29);
    });
  });

  describe('yearly', () => {
    const inspection: Recurrence = { kind: 'yearly', month: 3, dayOfMonth: 20 };

    it('occurs only in its month', () => {
      expect(occurrenceDayInMonth(inspection, '2026-03')).toBe(20);
      expect(occurrenceDayInMonth(inspection, '2026-04')).toBeNull();
      expect(occurrenceDayInMonth(inspection, '2026-02')).toBeNull();
    });

    it('occurs in PAST years too, because it has no start', () => {
      // This is the whole reason yearly is not `interval` with everyMonths: 12.
      // The analytics screens look back, and a household entering its car
      // inspection today expects last March to show it.
      expect(occurrenceDayInMonth(inspection, '2019-03')).toBe(20);
    });

    it('reads `month` as 1-12, not as a JS month index', () => {
      // month: 1 is January. If this ever reads as February the whole calendar
      // shifts by one and every yearly bill lands a month late.
      expect(occursInMonth({ kind: 'yearly', month: 1, dayOfMonth: 1 }, '2026-01')).toBe(true);
      expect(occursInMonth({ kind: 'yearly', month: 1, dayOfMonth: 1 }, '2026-02')).toBe(false);
    });

    it('clamps in its own month as well', () => {
      expect(occurrenceDayInMonth({ kind: 'yearly', month: 2, dayOfMonth: 31 }, '2026-02')).toBe(28);
    });
  });

  describe('interval', () => {
    const bimonthly: Recurrence = {
      kind: 'interval',
      everyMonths: 2,
      anchorMonth: '2026-03',
      dayOfMonth: 10,
    };

    it('lands on the anchor month and every nth month after', () => {
      expect(occurrenceDayInMonth(bimonthly, '2026-03')).toBe(10);
      expect(occurrenceDayInMonth(bimonthly, '2026-05')).toBe(10);
      expect(occurrenceDayInMonth(bimonthly, '2027-01')).toBe(10);
    });

    it('skips the months in between', () => {
      expect(occurrenceDayInMonth(bimonthly, '2026-04')).toBeNull();
      expect(occurrenceDayInMonth(bimonthly, '2026-06')).toBeNull();
    });

    it('does NOT occur before its anchor', () => {
      // JavaScript's % yields a negative result for a negative left operand, so
      // `elapsed % n === 0` alone would fire two months BEFORE the bill began --
      // putting an expense in a month the household had not started paying it.
      expect(occurrenceDayInMonth(bimonthly, '2026-01')).toBeNull();
      expect(occurrenceDayInMonth(bimonthly, '2025-11')).toBeNull();
      expect(occurrenceDayInMonth(bimonthly, '2026-02')).toBeNull();
    });

    it('crosses a year boundary by month arithmetic, not by day arithmetic', () => {
      const quarterly: Recurrence = {
        kind: 'interval',
        everyMonths: 3,
        anchorMonth: '2025-11',
        dayOfMonth: 5,
      };
      expect(occurrenceDayInMonth(quarterly, '2026-02')).toBe(5);
      expect(occurrenceDayInMonth(quarterly, '2026-05')).toBe(5);
      expect(occurrenceDayInMonth(quarterly, '2026-03')).toBeNull();
    });

    it('clamps like the others', () => {
      expect(
        occurrenceDayInMonth(
          { kind: 'interval', everyMonths: 2, anchorMonth: '2025-12', dayOfMonth: 31 },
          '2026-02',
        ),
      ).toBe(28);
    });

    it('returns null for a malformed anchor rather than guessing a phase', () => {
      expect(
        occurrenceDayInMonth(
          { kind: 'interval', everyMonths: 2, anchorMonth: 'nonsense', dayOfMonth: 1 },
          '2026-02',
        ),
      ).toBeNull();
    });
  });

  describe('once', () => {
    const trip: Recurrence = { kind: 'once', date: '2026-11-20' };

    it('occurs in exactly one month, on exactly its day', () => {
      expect(occurrenceDayInMonth(trip, '2026-11')).toBe(20);
      expect(occurrenceDayInMonth(trip, '2026-10')).toBeNull();
      expect(occurrenceDayInMonth(trip, '2026-12')).toBeNull();
      expect(occurrenceDayInMonth(trip, '2027-11')).toBeNull();
    });
  });

  it('returns null for a malformed month rather than throwing at a call site', () => {
    expect(occurrenceDayInMonth({ kind: 'monthly', dayOfMonth: 1 }, '2026-13')).toBeNull();
    expect(occurrenceDayInMonth({ kind: 'monthly', dayOfMonth: 1 }, '')).toBeNull();
  });
});

describe('occursOn', () => {
  it('agrees with occurrenceDayInMonth on a real Date', () => {
    // Constructed in local time, matching how the forecast walks days. Parsing
    // '2026-02-28' as UTC would make this the 27th anywhere east of Greenwich.
    const feb28 = new Date(2026, 1, 28);
    expect(occursOn({ kind: 'monthly', dayOfMonth: 31 }, feb28)).toBe(true);
    expect(occursOn({ kind: 'monthly', dayOfMonth: 28 }, feb28)).toBe(true);
    expect(occursOn({ kind: 'monthly', dayOfMonth: 27 }, feb28)).toBe(false);
  });

  it('fires a one-off on its date only', () => {
    expect(occursOn({ kind: 'once', date: '2026-11-20' }, new Date(2026, 10, 20))).toBe(true);
    expect(occursOn({ kind: 'once', date: '2026-11-20' }, new Date(2026, 10, 21))).toBe(false);
  });
});

describe('sortDay', () => {
  it('reads the day out of every variant', () => {
    expect(sortDay({ kind: 'monthly', dayOfMonth: 25 })).toBe(25);
    expect(sortDay({ kind: 'yearly', month: 3, dayOfMonth: 7 })).toBe(7);
    expect(sortDay({ kind: 'interval', everyMonths: 2, anchorMonth: '2026-01', dayOfMonth: 9 })).toBe(9);
    expect(sortDay({ kind: 'once', date: '2026-11-03' })).toBe(3);
  });
});

describe('describeRecurrence', () => {
  it('names each variant the way a person would say it', () => {
    expect(describeRecurrence({ kind: 'monthly', dayOfMonth: 25 })).toBe('毎月25日');
    expect(describeRecurrence({ kind: 'yearly', month: 3, dayOfMonth: 20 })).toBe('毎年3月20日');
    expect(
      describeRecurrence({ kind: 'interval', everyMonths: 3, anchorMonth: '2026-01', dayOfMonth: 5 }),
    ).toBe('3ヶ月ごと 5日');
    expect(describeRecurrence({ kind: 'once', date: '2026-11-03' })).toBe('2026年11月3日 (1回のみ)');
  });

  it('keeps the YEAR on a one-off, because that is part of the answer', () => {
    // 「11月3日 (1回のみ)」 in a list headed 「次に発生する時期」 reads as
    // upcoming. For a trip taken last November it is the opposite of true, and
    // the household budgets a spend it has already made.
    expect(describeRecurrence({ kind: 'once', date: '2025-11-03' })).toBe('2025年11月3日 (1回のみ)');
  });

  it('strips the leading zero a one-off date carries', () => {
    expect(describeRecurrence({ kind: 'once', date: '2026-03-05' })).toBe('2026年3月5日 (1回のみ)');
  });

  it('carries no year on the variants that genuinely have none', () => {
    // 「毎年3月20日」 means every March; a year on it would be a lie.
    expect(describeRecurrence({ kind: 'yearly', month: 3, dayOfMonth: 20 })).not.toContain('年2');
  });
});

describe('describeRecurrenceShort', () => {
  it('uses the CLAMPED day, so the row agrees with the forecast', () => {
    // The row says 「28日」 in February because that is when the money actually
    // moves. Printing the stored 31 would contradict the chart beside it.
    expect(describeRecurrenceShort({ kind: 'monthly', dayOfMonth: 31 }, '2026-02')).toBe('28日');
  });

  it('keeps saying it is irregular, because that is what the month total needs explaining by', () => {
    expect(describeRecurrenceShort({ kind: 'yearly', month: 3, dayOfMonth: 20 }, '2026-03')).toBe(
      '20日 (年1回)',
    );
    expect(
      describeRecurrenceShort({ kind: 'interval', everyMonths: 2, anchorMonth: '2026-01', dayOfMonth: 9 }, '2026-03'),
    ).toBe('9日 (2ヶ月ごと)');
  });

  it('falls back to the long form for a month it does not occur in', () => {
    expect(describeRecurrenceShort({ kind: 'yearly', month: 3, dayOfMonth: 20 }, '2026-04')).toBe(
      '毎年3月20日',
    );
  });
});

describe('isExpiredOnce', () => {
  it('is true for a one-off in a month before the one being viewed', () => {
    expect(isExpiredOnce({ kind: 'once', date: '2025-11-03' }, '2026-06')).toBe(true);
    expect(isExpiredOnce({ kind: 'once', date: '2026-05-31' }, '2026-06')).toBe(true);
  });

  it('is false for one still to come', () => {
    expect(isExpiredOnce({ kind: 'once', date: '2026-11-03' }, '2026-06')).toBe(false);
  });

  it('is false inside its own month, which is where it occurs', () => {
    expect(isExpiredOnce({ kind: 'once', date: '2026-06-01' }, '2026-06')).toBe(false);
  });

  it('is false for everything that recurs', () => {
    // Only a one-off can expire. For the rest, "past" is never the whole story.
    expect(isExpiredOnce({ kind: 'monthly', dayOfMonth: 1 }, '2026-06')).toBe(false);
    expect(isExpiredOnce({ kind: 'yearly', month: 1, dayOfMonth: 1 }, '2026-06')).toBe(false);
    expect(
      isExpiredOnce({ kind: 'interval', everyMonths: 2, anchorMonth: '2020-01', dayOfMonth: 1 }, '2026-06'),
    ).toBe(false);
  });
});

describe('isIrregular', () => {
  it('is true for everything that skips a month', () => {
    expect(isIrregular({ kind: 'monthly', dayOfMonth: 1 })).toBe(false);
    expect(isIrregular({ kind: 'yearly', month: 1, dayOfMonth: 1 })).toBe(true);
    expect(isIrregular({ kind: 'interval', everyMonths: 2, anchorMonth: '2026-01', dayOfMonth: 1 })).toBe(true);
    expect(isIrregular({ kind: 'once', date: '2026-01-01' })).toBe(true);
  });
});

describe('isIsoDate', () => {
  it('accepts real dates', () => {
    expect(isIsoDate('2026-11-20')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects dates that look right but do not exist', () => {
    // A one-off on the 31st of February would sit in the list, enabled, and
    // never occur -- the household budgets for something the forecast omits.
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isIsoDate('2026-11-20T00:00:00Z')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-11-20')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('isYearMonth', () => {
  it('accepts a padded calendar month and nothing else', () => {
    expect(isYearMonth('2026-01')).toBe(true);
    expect(isYearMonth('2026-12')).toBe(true);
    expect(isYearMonth('2026-00')).toBe(false);
    expect(isYearMonth('2026-13')).toBe(false);
    expect(isYearMonth('2026-1')).toBe(false);
  });
});

describe('lastDayOfMonth / toYearMonth / toIsoDate', () => {
  it('reports month lengths including leap February', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(28);
    expect(lastDayOfMonth(2028, 1)).toBe(29);
    expect(lastDayOfMonth(2026, 3)).toBe(30);
    expect(lastDayOfMonth(2026, 0)).toBe(31);
  });

  it('formats in LOCAL time', () => {
    // Constructed local; a UTC-based formatter would print the previous day for
    // any timezone ahead of Greenwich, which is where this app is used.
    const newYearsDay = new Date(2026, 0, 1);
    expect(toYearMonth(newYearsDay)).toBe('2026-01');
    expect(toIsoDate(newYearsDay)).toBe('2026-01-01');
  });
});

describe('parseRecurrence', () => {
  it('accepts each valid variant and returns it narrowed', () => {
    expect(parseRecurrence({ kind: 'monthly', dayOfMonth: 25 })).toEqual({
      ok: true,
      value: { kind: 'monthly', dayOfMonth: 25 },
    });
    expect(parseRecurrence({ kind: 'yearly', month: 3, dayOfMonth: 20 })).toEqual({
      ok: true,
      value: { kind: 'yearly', month: 3, dayOfMonth: 20 },
    });
    expect(
      parseRecurrence({ kind: 'interval', everyMonths: 2, anchorMonth: '2026-03', dayOfMonth: 10 }),
    ).toEqual({
      ok: true,
      value: { kind: 'interval', everyMonths: 2, anchorMonth: '2026-03', dayOfMonth: 10 },
    });
    expect(parseRecurrence({ kind: 'once', date: '2026-11-20' })).toEqual({
      ok: true,
      value: { kind: 'once', date: '2026-11-20' },
    });
  });

  it('drops fields that do not belong to the variant', () => {
    // The database CHECK forbids them, so accepting them here would turn a
    // readable validation message into a CONFLICT from the INSERT.
    const parsed = parseRecurrence({ kind: 'monthly', dayOfMonth: 5, month: 3, everyMonths: 12 });
    expect(parsed).toEqual({ ok: true, value: { kind: 'monthly', dayOfMonth: 5 } });
  });

  it('rejects an unknown kind', () => {
    expect(parseRecurrence({ kind: 'weekly', dayOfWeek: 1 })).toEqual({
      ok: false,
      error: '繰り返しの種類が不正です',
    });
  });

  it('rejects a day outside 1-31', () => {
    expect(parseRecurrence({ kind: 'monthly', dayOfMonth: 0 }).ok).toBe(false);
    expect(parseRecurrence({ kind: 'monthly', dayOfMonth: 32 }).ok).toBe(false);
    expect(parseRecurrence({ kind: 'monthly', dayOfMonth: 1.5 }).ok).toBe(false);
    expect(parseRecurrence({ kind: 'monthly', dayOfMonth: '5' }).ok).toBe(false);
  });

  it('rejects a month outside 1-12', () => {
    expect(parseRecurrence({ kind: 'yearly', month: 0, dayOfMonth: 1 }).ok).toBe(false);
    expect(parseRecurrence({ kind: 'yearly', month: 13, dayOfMonth: 1 }).ok).toBe(false);
  });

  it('rejects an interval of 1, which is `monthly` spelled twice', () => {
    expect(parseRecurrence({ kind: 'interval', everyMonths: 1, anchorMonth: '2026-01', dayOfMonth: 1 }).ok).toBe(
      false,
    );
    expect(
      parseRecurrence({ kind: 'interval', everyMonths: MIN_INTERVAL_MONTHS, anchorMonth: '2026-01', dayOfMonth: 1 }).ok,
    ).toBe(true);
    expect(
      parseRecurrence({
        kind: 'interval',
        everyMonths: MAX_INTERVAL_MONTHS + 1,
        anchorMonth: '2026-01',
        dayOfMonth: 1,
      }).ok,
    ).toBe(false);
  });

  it('rejects a malformed anchor month', () => {
    expect(parseRecurrence({ kind: 'interval', everyMonths: 2, anchorMonth: '2026-1', dayOfMonth: 1 }).ok).toBe(
      false,
    );
    expect(parseRecurrence({ kind: 'interval', everyMonths: 2, dayOfMonth: 1 }).ok).toBe(false);
  });

  it('rejects a one-off on a date that does not exist', () => {
    expect(parseRecurrence({ kind: 'once', date: '2026-02-31' }).ok).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(parseRecurrence(null).ok).toBe(false);
    expect(parseRecurrence('monthly').ok).toBe(false);
    expect(parseRecurrence(undefined).ok).toBe(false);
  });
});
