import type { QuizDirection } from './types';

// ---------------------------------------------------------------------------
// WHAT THE SERVER STORES, AND WHAT IT SHIPS.
//
// The database keeps one row per ANSWER (`vocab_attempts`). What travels to the
// browser is that history folded down to per (word, direction) facts -- counts
// plus the most recent outcome. Nothing here is a percentage: percentages are
// DERIVED, once, in stats.ts, so the screen and any future summary cannot come
// to different figures from the same rows.
//
// WHY THE BREAKDOWN IS PER DIRECTION AND NOT PER WORD
//   Recognising 「come from」→「〜に由来する」 and producing 「〜に由来する」→
//   「come from」 are different skills, and the second is reliably the weaker
//   one. Collapsing them would average a strength with a weakness and report a
//   number that describes neither -- and, worse, would make 「間違えた問題だけ」
//   re-ask questions the reader already answers correctly.
// ---------------------------------------------------------------------------

/** What one person has done with one word, asked one way round. */
export interface VocabDirectionStat {
  /** How many times it has been answered. Zero means never asked. */
  attempts: number;
  /** How many of those were right. */
  correct: number;
  /**
   * Whether the MOST RECENT answer was right; null when never answered.
   *
   * This -- not the ratio -- is what 「間違えた問題だけ」 selects on. A word
   * answered wrong four times and right once most recently has been learned;
   * one answered right four times and wrong just now has not.
   */
  lastCorrect: boolean | null;
  /** ISO timestamp of the most recent answer, or null. */
  lastAnsweredAt: string | null;
}

/** One word's record, both directions. */
export interface VocabWordStat {
  wordId: string;
  byDirection: Record<QuizDirection, VocabDirectionStat>;
}

/**
 * Everything one person's study record contains.
 *
 * An array rather than a keyed object because it crosses the wire as JSON and
 * an array of records is the shape that survives a `word_id` the current book
 * no longer carries: the client drops what it cannot resolve (see `wordById`)
 * instead of rendering a row with no word attached.
 */
export type VocabProgress = readonly VocabWordStat[];

/** One answer, as the client reports it. */
export interface VocabAttemptInput {
  wordId: string;
  direction: QuizDirection;
  correct: boolean;
}
