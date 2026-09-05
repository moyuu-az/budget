import { describe, it, expect } from 'vitest';
import type { VocabProgress } from './progress';
import { wordById, wordsForDay } from './index';
import {
  WEAK_QUIZ_LIMIT,
  indexProgress,
  isWeak,
  isWrong,
  missesFor,
  selectWords,
  statFor,
  summarize,
} from './stats';

// ---------------------------------------------------------------------------
// These functions decide two things the reader acts on directly: which questions
// 「間違えた問題だけ」 asks, and what 正答率 says. Both are easy to get subtly
// wrong in a way nothing on screen would reveal.
// ---------------------------------------------------------------------------

const stat = (
  attempts: number,
  correct: number,
  lastCorrect: boolean | null,
): { attempts: number; correct: number; lastCorrect: boolean | null; lastAnsweredAt: string | null } => ({
  attempts,
  correct,
  lastCorrect,
  lastAnsweredAt: lastCorrect === null ? null : '2026-09-05T00:00:00.000Z',
});

const progress = (
  entries: Record<string, { en?: [number, number, boolean | null]; ja?: [number, number, boolean | null] }>,
): VocabProgress =>
  Object.entries(entries).map(([wordId, { en, ja }]) => ({
    wordId,
    byDirection: {
      en_to_ja: en ? stat(...en) : stat(0, 0, null),
      ja_to_en: ja ? stat(...ja) : stat(0, 0, null),
    },
  }));

const DAY31 = wordsForDay(31);

describe('statFor', () => {
  it('treats a word with no row as never answered, not as zero percent', () => {
    const index = indexProgress([]);
    expect(statFor(index, 'et-481', 'en_to_ja')).toEqual({
      attempts: 0,
      correct: 0,
      lastCorrect: null,
      lastAnsweredAt: null,
    });
  });
});

describe('isWrong', () => {
  const index = indexProgress(
    progress({
      // Answered wrong most recently in en_to_ja, right in ja_to_en.
      'et-481': { en: [3, 2, false], ja: [1, 1, true] },
      // Wrong four times, right just now. LEARNED -- the ratio is 20%, the
      // outcome is what matters.
      'et-482': { en: [5, 1, true] },
      // Never answered. Unseen is not wrong.
      'et-483': {},
    }),
  );

  it('reads the most recent outcome, not the ratio', () => {
    expect(isWrong(index, 'et-482', 'en_to_ja')).toBe(false);
  });

  it('does not call an unanswered word wrong', () => {
    // Otherwise 「間違えた問題だけ」 is 「全部」 under another name on a fresh
    // account.
    expect(isWrong(index, 'et-483', 'both')).toBe(false);
  });

  it('is per direction, so one weak half is enough', () => {
    expect(isWrong(index, 'et-481', 'en_to_ja')).toBe(true);
    expect(isWrong(index, 'et-481', 'ja_to_en')).toBe(false);
    // Recognising a phrase but not producing it is not finished with.
    expect(isWrong(index, 'et-481', 'both')).toBe(true);
  });
});

describe('selectWords', () => {
  it("returns everything for 'all'", () => {
    expect(selectWords(DAY31, [], 'all', 'both')).toEqual(DAY31);
  });

  it("returns only the failed ones for 'wrong'", () => {
    const chosen = selectWords(
      DAY31,
      progress({ 'et-481': { en: [1, 0, false] }, 'et-482': { en: [1, 1, true] } }),
      'wrong',
      'both',
    );
    expect(chosen.map((w) => w.id)).toEqual(['et-481']);
  });

  it("returns nothing when nothing is wrong, rather than falling back to 'all'", () => {
    // Silently widening an empty review set to the whole Day would tell the
    // reader they still have sixteen words to fix when they have none.
    expect(selectWords(DAY31, [], 'wrong', 'both')).toEqual([]);
  });
});

describe('missesFor / isWeak', () => {
  const index = indexProgress(
    progress({
      // Missed twice, revised correctly. `isWrong` has forgotten; this has not.
      'et-481': { ja: [5, 3, true] },
      // Never missed.
      'et-482': { ja: [3, 3, true] },
      // Missed in the direction NOT being practised.
      'et-483': { en: [4, 1, false] },
    }),
  );

  it('counts every wrong answer, not just the most recent one', () => {
    expect(missesFor(index, 'et-481', 'ja_to_en')).toBe(2);
    expect(isWeak(index, 'et-481', 'ja_to_en')).toBe(true);
    // …while the review set has already let it go. This divergence is why
    // 'weak' exists as a separate scope.
    expect(isWrong(index, 'et-481', 'ja_to_en')).toBe(false);
  });

  it('is zero for a word that has never been missed', () => {
    expect(missesFor(index, 'et-482', 'ja_to_en')).toBe(0);
    expect(isWeak(index, 'et-482', 'ja_to_en')).toBe(false);
  });

  it('is zero for a word missed only in another direction', () => {
    // The quiz asks one way round; a phrase failed the other way is not the
    // question being practised.
    expect(missesFor(index, 'et-483', 'ja_to_en')).toBe(0);
    expect(missesFor(index, 'et-483', 'en_to_ja')).toBe(3);
    expect(missesFor(index, 'et-483', 'both')).toBe(3);
  });

  it('is zero for a word never answered at all', () => {
    expect(missesFor(index, 'et-499', 'both')).toBe(0);
  });
});

describe("selectWords('weak')", () => {
  it('keeps a word that was missed and then revised correctly', () => {
    // THE WHOLE REASON THIS SCOPE EXISTS. Everything revised means an empty
    // 'wrong' set, and a reader in that state still has phrases that keep
    // catching them out.
    const revised = progress({ 'et-481': { ja: [5, 3, true] } });
    expect(selectWords(DAY31, revised, 'wrong', 'ja_to_en')).toEqual([]);
    expect(selectWords(DAY31, revised, 'weak', 'ja_to_en').map((w) => w.id)).toEqual(['et-481']);
  });

  it('excludes words that have never been missed', () => {
    // Otherwise the mode is 「すべて」 wearing a different name.
    const clean = progress({ 'et-481': { ja: [3, 3, true] }, 'et-482': { ja: [1, 1, true] } });
    expect(selectWords(DAY31, clean, 'weak', 'ja_to_en')).toEqual([]);
  });

  it('asks the MOST-missed words when more qualify than it will ask', () => {
    // The cap is what makes 「苦手」 mean 「よく間違えるものから」 rather than
    // 「間違えたことがあるものぜんぶ」. Every word of Day 31 has been missed here,
    // so the ranking is the only thing deciding which ten are asked.
    //
    // THE MISS COUNTS RUN AGAINST THE BOOK'S ORDER ON PURPOSE. Ranked ascending
    // they would coincide with the order the words arrive in, and dropping the
    // sort entirely would still pass -- the test would be checking the slice and
    // nothing else. Here the ten that must come back are the LAST ten of the Day.
    const day = wordsForDay(31);
    const entries: Record<string, { ja: [number, number, boolean | null] }> = {};
    day.forEach((word, i) => {
      // et-481 missed once, et-482 twice, … et-496 sixteen times.
      const misses = i + 1;
      entries[word.id] = { ja: [misses + 1, 1, true] };
    });

    const picked = selectWords(day, progress(entries), 'weak', 'ja_to_en').map((w) => w.id);

    expect(picked).toHaveLength(WEAK_QUIZ_LIMIT);
    expect(picked).toEqual(
      day
        .slice(-WEAK_QUIZ_LIMIT)
        .reverse()
        .map((w) => w.id),
    );
    // The least-missed word is the one left out, not an arbitrary one.
    expect(picked).not.toContain('et-481');
  });

  it('asks fewer than the cap when fewer qualify', () => {
    const some = progress({
      'et-481': { ja: [2, 1, true] },
      'et-482': { ja: [3, 1, false] },
    });
    expect(selectWords(DAY31, some, 'weak', 'ja_to_en')).toHaveLength(2);
  });

  it('breaks a tie on miss count by id, so the same record always asks the same ten', () => {
    // Every word tied, so ONLY the tie-break decides which ten are asked.
    // The words are handed over in reverse: without the tie-break the slice
    // would take them in the order they arrived, and the ten asked would depend
    // on how the caller happened to have the list. The reader would see the
    // question count hold at ten while the questions behind it moved.
    const day = wordsForDay(31);
    const tied: Record<string, { ja: [number, number, boolean | null] }> = {};
    for (const word of day) tied[word.id] = { ja: [2, 1, true] };
    const record = progress(tied);

    const picked = selectWords([...day].reverse(), record, 'weak', 'ja_to_en').map((w) => w.id);

    expect(picked).toHaveLength(WEAK_QUIZ_LIMIT);
    expect(picked).toEqual([...picked].sort());
    expect(picked).toEqual(day.slice(0, WEAK_QUIZ_LIMIT).map((w) => w.id));
  });

  it('ignores misses in a direction that is not being practised', () => {
    const other = progress({ 'et-481': { en: [4, 0, false] } });
    expect(selectWords(DAY31, other, 'weak', 'ja_to_en')).toEqual([]);
    expect(selectWords(DAY31, other, 'weak', 'en_to_ja').map((w) => w.id)).toEqual(['et-481']);
  });
});

describe('summarize', () => {
  it('reports null accuracy before anything has been answered', () => {
    // NOT 0%. "You have failed everything you have never seen" is a lie the
    // reader has no reason to doubt.
    const summary = summarize(DAY31, []);
    expect(summary).toMatchObject({ total: 16, answered: 0, attempts: 0, accuracy: null });
  });

  it('divides correct answers by ANSWERS, not by words', () => {
    const summary = summarize(
      [wordById('et-481')!],
      progress({ 'et-481': { en: [4, 3, true] } }),
    );
    expect(summary.attempts).toBe(4);
    expect(summary.correct).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0.75);
  });

  it('counts a word failed both ways once', () => {
    // Counted per (word, direction) this would be 2, and 「残り2問」 would
    // disagree with the one question the 'wrong' scope actually produces.
    const summary = summarize(
      [wordById('et-481')!],
      progress({ 'et-481': { en: [1, 0, false], ja: [1, 0, false] } }),
      'both',
    );
    expect(summary.wrong).toBe(1);
  });

  it('counts a word as answered once, however many directions it was asked in', () => {
    const summary = summarize(
      [wordById('et-481')!],
      progress({ 'et-481': { en: [1, 1, true], ja: [2, 2, true] } }),
      'both',
    );
    expect(summary.answered).toBe(1);
    expect(summary.attempts).toBe(3);
    expect(summary.unseen).toBe(0);
  });

  it('restricts every figure to the direction being practised', () => {
    const one = progress({ 'et-481': { en: [2, 2, true], ja: [2, 0, false] } });
    expect(summarize([wordById('et-481')!], one, 'en_to_ja')).toMatchObject({
      attempts: 2,
      correct: 2,
      accuracy: 1,
      wrong: 0,
    });
    expect(summarize([wordById('et-481')!], one, 'ja_to_en')).toMatchObject({
      attempts: 2,
      correct: 0,
      accuracy: 0,
      wrong: 1,
    });
  });

  it('ignores rows for words outside the set being summarised', () => {
    // The study record spans the whole book; a Day's figures must not pick up
    // another Day's answers.
    const summary = summarize(
      wordsForDay(31),
      progress({ 'et-497': { en: [10, 10, true] } }),
    );
    expect(summary.attempts).toBe(0);
    expect(summary.accuracy).toBeNull();
  });

  it('counts the 苦手 POOL, not the number of questions 苦手 would ask', () => {
    // `weak` is how the screen knows whether the mode has anything to offer.
    // It must not be shown as a question count: the scope caps at
    // WEAK_QUIZ_LIMIT, so on a Day where everything has been missed the two
    // numbers differ, and one label over two facts is how a reader stops
    // trusting both.
    const day = wordsForDay(31);
    const entries: Record<string, { ja: [number, number, boolean | null] }> = {};
    for (const word of day) entries[word.id] = { ja: [2, 1, true] };

    const summary = summarize(day, progress(entries), 'ja_to_en');
    expect(summary.weak).toBe(day.length);
    expect(selectWords(day, progress(entries), 'weak', 'ja_to_en')).toHaveLength(WEAK_QUIZ_LIMIT);
  });

  it('reports null retention before anything has been answered', () => {
    // Same reason accuracy is null: 0% 定着 and 「まだ解いていない」 look the
    // same and mean opposite things.
    expect(summarize(DAY31, []).retention).toBeNull();
  });

  it('keeps 定着 and 要復習 describing one situation, never two', () => {
    // THE POINT OF `mastered`/`retention` EXISTING.
    //
    // `accuracy` counts every answer ever given, so it falls when a word is
    // missed and can never climb back to 100%. `wrong` counts the words whose
    // MOST RECENT answer was wrong, so it empties as soon as they are revised.
    // Leading the screen with the first while gating 「間違えた問題だけ」 on the
    // second produced 「正答率 67%」 above a greyed-out review control, with
    // nothing to explain the gap. This is that exact history.
    const revised = summarize(
      [wordById('et-481')!, wordById('et-482')!],
      progress({
        // Missed twice, then revised correctly.
        'et-481': { ja: [3, 1, true] },
        'et-482': { ja: [1, 1, true] },
      }),
      'ja_to_en',
    );

    expect(revised.accuracy).toBeCloseTo(0.5); // 2 of 4 answers
    expect(revised.wrong).toBe(0);
    // The figure the screen leads with agrees with the empty review set.
    expect(revised.retention).toBe(1);
    expect(revised.mastered).toBe(2);
  });

  it('splits every answered word into mastered or wrong, and nothing else', () => {
    // The identity the screen depends on: 定着 and 要復習 partition 解答した単語.
    // Computed independently in summarize (not as `answered - wrong`), so this
    // can fail.
    const summary = summarize(
      DAY31,
      progress({
        'et-481': { ja: [2, 1, true] },
        'et-482': { ja: [1, 0, false] },
        'et-483': { ja: [4, 4, true] },
        'et-484': { ja: [2, 0, false] },
        // Answered in the OTHER direction only -- still an answered word.
        'et-485': { en: [1, 1, true] },
      }),
      'both',
    );

    expect(summary.answered).toBe(5);
    expect(summary.mastered + summary.wrong).toBe(summary.answered);
    expect(summary.mastered).toBe(3);
    expect(summary.wrong).toBe(2);
    expect(summary.retention).toBeCloseTo(3 / 5);
  });

  it('measures 定着 against the words ANSWERED, not the whole Day', () => {
    // A Day one question in is not 「94% 忘れている」. What has not been opened is
    // unseen, which is what `unseen` reports.
    const summary = summarize(DAY31, progress({ 'et-481': { ja: [1, 1, true] } }), 'ja_to_en');
    expect(summary.answered).toBe(1);
    expect(summary.retention).toBe(1);
    expect(summary.unseen).toBe(15);
  });

  it('ignores a row whose word the book no longer carries', () => {
    // `vocab_attempts` outlives the content it references, so this is a real
    // shape rather than a hypothetical one.
    const summary = summarize(DAY31, progress({ 'et-999': { en: [5, 5, true] } }));
    expect(summary.attempts).toBe(0);
  });
});
