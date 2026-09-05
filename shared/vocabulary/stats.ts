import { QUIZ_DIRECTIONS, type QuizDirection, type VocabWord } from './types';
import type { VocabDirectionStat, VocabProgress, VocabWordStat } from './progress';
import type { QuizDirectionSetting } from './quiz';

// ---------------------------------------------------------------------------
// EVERY FIGURE THE STUDY SCREENS SHOW IS COMPUTED HERE.
//
// The server ships counts (progress.ts); this is the only place they become
// percentages, "words still wrong", or a per-Day summary. One implementation
// rather than one per screen, for the ordinary reason: two implementations of
// 正答率 eventually disagree, and there is no way to tell from the screen which
// of the two is the wrong one.
//
// Nothing here reaches for the network or the store. Pure functions over
// (words, progress), which is also what makes them testable without a database.
// ---------------------------------------------------------------------------

/** The record of a word that has never been answered. */
export const EMPTY_DIRECTION_STAT: VocabDirectionStat = {
  attempts: 0,
  correct: 0,
  lastCorrect: null,
  lastAnsweredAt: null,
};

/**
 * Which words a quiz should ask about, as VALUES.
 *
 *  - 'all'   … every word of the chosen Day
 *  - 'wrong' … only the ones whose most recent answer was wrong
 *
 * A tuple because the list is needed at runtime by the picker and by the
 * validator for `?scope=`.
 */
export const QUIZ_SCOPES = ['all', 'wrong'] as const;
export type QuizScope = (typeof QUIZ_SCOPES)[number];

/** A lookup over a progress list. Built once per render that needs it. */
export function indexProgress(progress: VocabProgress): ReadonlyMap<string, VocabWordStat> {
  return new Map(progress.map((stat) => [stat.wordId, stat]));
}

/** One word's record in one direction, with "never answered" as the default. */
export function statFor(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  direction: QuizDirection,
): VocabDirectionStat {
  return index.get(wordId)?.byDirection[direction] ?? EMPTY_DIRECTION_STAT;
}

/** The directions a setting covers. 'both' covers all of them. */
export function directionsOf(setting: QuizDirectionSetting): readonly QuizDirection[] {
  return setting === 'both' ? QUIZ_DIRECTIONS : [setting];
}

/**
 * Whether this word still counts as unlearned in the directions being practised.
 *
 * Wrong in EITHER direction is wrong. A reader who can recognise a phrase but
 * not produce it has not finished with it, and dropping it from the review set
 * because one of the two halves is green is exactly how the weaker half stays
 * weak.
 *
 * A word never answered is NOT wrong -- it is unseen. 「間違えた問題だけ」 has
 * to mean the ones that were actually got wrong, or the mode is just 「全部」
 * under another name.
 */
export function isWrong(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  setting: QuizDirectionSetting,
): boolean {
  return directionsOf(setting).some((d) => statFor(index, wordId, d).lastCorrect === false);
}

/** The words a quiz should ask about, given the scope the reader picked. */
export function selectWords(
  words: readonly VocabWord[],
  progress: VocabProgress,
  scope: QuizScope,
  setting: QuizDirectionSetting,
): readonly VocabWord[] {
  if (scope === 'all') return words;
  const index = indexProgress(progress);
  return words.filter((word) => isWrong(index, word.id, setting));
}

export interface VocabSummary {
  /** Words in scope. */
  total: number;
  /** How many of them have been answered at least once, in any covered direction. */
  answered: number;
  /** Answers given, and how many were right. Totals, not per word. */
  attempts: number;
  correct: number;
  /**
   * correct / attempts, or null when nothing has been answered yet -- the
   * LIFETIME ratio, counting every answer ever given.
   *
   * DO NOT LEAD A STUDY SCREEN WITH THIS. It answers "how often were you right
   * while learning", which is a fact about the past: it can only fall as the
   * reader practises, and once a word has been missed it can never return to
   * 100% however well they know it now. Pairing it with 「間違えた問題だけ」
   * produced a screen nobody could reconcile -- 90.6% at the top, and the
   * review control greyed out because every word's most recent answer was
   * right. That is what `retention` below is for.
   *
   * NULL, NOT ZERO. A 0% accuracy and "not started" look identical as a number
   * and are opposite facts; showing 0% for an untouched Day would tell the
   * reader they had failed everything they have never seen.
   */
  accuracy: number | null;
  /** Words whose most recent answer was wrong, in any covered direction. */
  wrong: number;
  /**
   * Words answered at least once whose most recent answer was RIGHT.
   *
   * `mastered + wrong === answered`, always. That identity is what lets the
   * headline figure and the 「間違えた問題だけ」 control describe one situation
   * instead of two, and stats.test.ts pins it.
   */
  mastered: number;
  /**
   * mastered / answered, or null when nothing has been answered yet.
   *
   * THE FIGURE A STUDY SCREEN SHOULD LEAD WITH, because it is computed on the
   * same basis as the review set: 100% means exactly 「間違えたままの問題は無い」
   * and nothing else. It goes UP when the reader fixes a word, which is the
   * behaviour they expect from a number that is meant to reward revision.
   *
   * Denominator is `answered`, not `total`: a Day half-opened would otherwise
   * read as half-forgotten, when the untouched half is merely unseen (`unseen`
   * is the figure for that).
   */
  retention: number | null;
  /** Words never answered in any covered direction. */
  unseen: number;
}

/** Rolls a set of words up into the figures the screens display. */
export function summarize(
  words: readonly VocabWord[],
  progress: VocabProgress,
  setting: QuizDirectionSetting = 'both',
): VocabSummary {
  const index = indexProgress(progress);
  const directions = directionsOf(setting);

  let attempts = 0;
  let correct = 0;
  let answered = 0;
  let mastered = 0;

  for (const word of words) {
    let touched = false;
    for (const direction of directions) {
      const stat = statFor(index, word.id, direction);
      attempts += stat.attempts;
      correct += stat.correct;
      if (stat.attempts > 0) touched = true;
    }
    if (touched) {
      answered += 1;
      // Derived from isWrong rather than from `answered - wrong`, so that the
      // identity the two figures are supposed to satisfy is something a test
      // can actually check instead of something arithmetic makes true.
      if (!isWrong(index, word.id, setting)) mastered += 1;
    }
  }

  return {
    total: words.length,
    answered,
    attempts,
    correct,
    accuracy: attempts === 0 ? null : correct / attempts,
    // Counted per WORD, not per (word, direction): a phrase failed both ways is
    // ONE phrase to revise, and counting it twice would make 「残り」 disagree
    // with the number of questions the 'wrong' scope actually produces.
    wrong: words.filter((word) => isWrong(index, word.id, setting)).length,
    mastered,
    retention: answered === 0 ? null : mastered / answered,
    unseen: words.filter((word) =>
      directions.every((d) => statFor(index, word.id, d).attempts === 0),
    ).length,
  };
}
