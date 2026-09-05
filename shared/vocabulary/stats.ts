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
 *  - 'wrong' … only the ones whose MOST RECENT answer was wrong
 *  - 'weak'  … the ones missed most often, however they were answered last
 *
 * 'wrong' AND 'weak' ARE NOT THE SAME QUESTION, and the difference is the
 * reason 'weak' exists. 'wrong' empties the moment the reader revises: a word
 * missed four times and answered correctly just now leaves the set, which is
 * right for 「今なおできていないもの」 but wrong for 「いつも引っかかるもの」.
 * A reader who has revised everything has an empty 'wrong' set and can still
 * name the six phrases that keep catching them out. That is 'weak'.
 *
 * A tuple because the list is needed at runtime by the picker and by the
 * validator for `?scope=`.
 */
export const QUIZ_SCOPES = ['all', 'wrong', 'weak'] as const;
export type QuizScope = (typeof QUIZ_SCOPES)[number];

/**
 * How many questions the 'weak' scope asks at most.
 *
 * WHY THERE IS A CAP AT ALL
 *   Without one the mode degrades into 「一度でも間違えた問題ぜんぶ」 and the
 *   ranking does nothing -- every qualifying word is asked, so "most missed"
 *   describes no observable behaviour. The cap is what makes the mode mean
 *   「よく間違えるものから」 rather than 「間違えたことがあるもの」.
 *
 * WHY TEN
 *   A Day is sixteen words, so this is a session that is visibly shorter than
 *   'all' -- which is the point of opening a targeted mode rather than the whole
 *   Day. Ten is also about as many as anyone finishes in one sitting on a phone.
 *   The number is a judgement, not a measurement; what is NOT a judgement is
 *   that it must be smaller than a Day, or the mode has no reason to exist.
 */
export const WEAK_QUIZ_LIMIT = 10;

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

/**
 * How many times this word has been answered WRONG, across the directions being
 * practised.
 *
 * `attempts - correct` rather than a stored counter: the server ships totals per
 * (word, direction) and the difference is exact. A second counter would be a
 * copy that can drift from the rows it summarises.
 */
export function missesFor(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  setting: QuizDirectionSetting,
): number {
  return directionsOf(setting).reduce((total, direction) => {
    const stat = statFor(index, wordId, direction);
    return total + (stat.attempts - stat.correct);
  }, 0);
}

/** Answers given for this word, across the directions being practised. */
function attemptsFor(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  setting: QuizDirectionSetting,
): number {
  return directionsOf(setting).reduce(
    (total, direction) => total + statFor(index, wordId, direction).attempts,
    0,
  );
}

/**
 * How OFTEN this word is missed: misses over answers. Zero when never answered.
 *
 * WHY THE 'weak' SCOPE RANKS ON THIS AND NOT ON THE RAW COUNT
 *   The raw count only ever goes up. Answering a word correctly adds one to
 *   `attempts` and one to `correct`, so `misses` is unchanged -- which means a
 *   ranking by count can never be moved by revising. The ten worst words of a
 *   Day would stay the ten worst for ever, the mode would ask exactly those ten
 *   every time, and the words ranked eleventh onwards would never be asked, so
 *   they could never rise. That is the failure buildQuiz's own comment names:
 *   「asking the same first ten words of a Day every time is how a reader ends
 *   up knowing ten words and believing they know sixteen」.
 *
 *   A rate falls when the word is answered correctly, so a word that has been
 *   put right drops below the ones that have not, and the mode moves on. The set
 *   still concentrates on what is missed most -- it just stops being frozen.
 *
 *   The count has not been thrown away: it breaks ties, so between two words
 *   missed half the time the one missed more often is asked first. That is the
 *   half of 「ミスった回数が多い」 a rate cannot express on its own.
 */
export function missRateFor(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  setting: QuizDirectionSetting,
): number {
  const attempts = attemptsFor(index, wordId, setting);
  return attempts === 0 ? 0 : missesFor(index, wordId, setting) / attempts;
}

/**
 * Whether this word has ever been missed, in the directions being practised.
 *
 * Unlike `isWrong` this does NOT forget: revising a word correctly empties the
 * 'wrong' set but leaves the word here, because the history is the whole point.
 */
export function isWeak(
  index: ReadonlyMap<string, VocabWordStat>,
  wordId: string,
  setting: QuizDirectionSetting,
): boolean {
  return missesFor(index, wordId, setting) > 0;
}

/**
 * The words a quiz should ask about, given the scope the reader picked.
 *
 * 'weak' RANKS AND CAPS HERE, not through `buildQuiz`'s `limit`. That option
 * shuffles before it slices -- deliberately, so a capped quiz is a random sample
 * rather than always the same first N (see buildQuiz) -- which would hand back
 * ten arbitrary words out of the qualifying set and quietly discard the ranking
 * this mode is named after. Choosing WHICH words belongs to the scope; choosing
 * what order to ask them in belongs to the quiz builder.
 *
 * THE ORDER OF `words` MUST NOT CHANGE THE ANSWER. The sort is total -- rate,
 * then miss count, then id -- so the same record picks the same ten however the
 * caller happened to have the list arranged. (A stable sort alone would not give
 * this: it preserves the INPUT order among equals, which is exactly the
 * dependency being removed.) `selectWords([...day].reverse(), …)` in
 * stats.test.ts is what holds it.
 */
export function selectWords(
  words: readonly VocabWord[],
  progress: VocabProgress,
  scope: QuizScope,
  setting: QuizDirectionSetting,
): readonly VocabWord[] {
  const index = indexProgress(progress);

  switch (scope) {
    case 'all':
      return words;

    case 'wrong':
      return words.filter((word) => isWrong(index, word.id, setting));

    case 'weak':
      return words
        .map((word) => ({
          word,
          rate: missRateFor(index, word.id, setting),
          misses: missesFor(index, word.id, setting),
        }))
        .filter((entry) => entry.misses > 0)
        .sort(
          (a, b) =>
            b.rate - a.rate || b.misses - a.misses || a.word.id.localeCompare(b.word.id),
        )
        .slice(0, WEAK_QUIZ_LIMIT)
        .map((entry) => entry.word);

    default: {
      // A scope added to QUIZ_SCOPES and not handled here. Without this the
      // function would fall through and silently treat it as one of the cases
      // above -- a new mode that quietly asks somebody else's questions. The
      // label maps in VocabView are a tripwire for the same mistake, but they
      // are in another file and another layer.
      const exhaustive: never = scope;
      throw new Error(`unhandled quiz scope: ${String(exhaustive)}`);
    }
  }
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
   * Words missed at least once, ever, in any covered direction.
   *
   * The size of the pool the 'weak' scope draws from -- NOT the number of
   * questions it asks, which is capped at WEAK_QUIZ_LIMIT. The screen needs this
   * to know whether the mode has anything to offer at all; it must not present
   * it as a question count, because a reader told 「苦手 12語」 and then given a
   * ten-question quiz has been given two different facts under one name.
   */
  weak: number;
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
    weak: words.filter((word) => isWeak(index, word.id, setting)).length,
    mastered,
    retention: answered === 0 ? null : mastered / answered,
    unseen: words.filter((word) =>
      directions.every((d) => statFor(index, word.id, d).attempts === 0),
    ).length,
  };
}
