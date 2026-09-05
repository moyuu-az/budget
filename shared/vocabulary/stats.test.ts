import { describe, it, expect } from 'vitest';
import type { VocabProgress } from './progress';
import { wordById, wordsForDay } from './index';
import { indexProgress, isWrong, selectWords, statFor, summarize } from './stats';

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

  it('ignores a row whose word the book no longer carries', () => {
    // `vocab_attempts` outlives the content it references, so this is a real
    // shape rather than a hypothetical one.
    const summary = summarize(DAY31, progress({ 'et-999': { en: [5, 5, true] } }));
    expect(summary.attempts).toBe(0);
  });
});
