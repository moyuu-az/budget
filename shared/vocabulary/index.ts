import { VOCAB_DAYS } from './days';
import { VOCAB_WORDS } from './words';
import type { VocabDay, VocabWord } from './types';

export { VOCAB_DAYS } from './days';
export { VOCAB_WORDS } from './words';
export { QUIZ_DIRECTIONS } from './types';
export type { QuizDirection, VocabDay, VocabWord } from './types';
export * from './quiz';
export * from './stats';
export * from './progress';
export * from './grading';

// ---------------------------------------------------------------------------
// The lookups every consumer needs, built once.
//
// WHY THE MAP IS BUILT HERE AND NOT AT EACH CALL SITE
//   `wordById` is read once per question rendered and once per stored attempt
//   reconciled -- a linear scan of 80 entries each time is not the problem. The
//   problem is that a second copy of "how do I find a word by id" is a second
//   place that can decide differently what to do when the id is unknown, and
//   unknown ids ARE expected: `vocab_attempts` holds rows written against a
//   version of the book that may since have lost an entry.
//
//   One lookup, one answer: `undefined`. Callers drop what they cannot resolve.
// ---------------------------------------------------------------------------

const BY_ID: ReadonlyMap<string, VocabWord> = new Map(
  VOCAB_WORDS.map((word) => [word.id, word]),
);

/** The word with this id, or undefined for an id the book no longer carries. */
export const wordById = (id: string): VocabWord | undefined => BY_ID.get(id);

const BY_DAY: ReadonlyMap<number, readonly VocabWord[]> = new Map(
  VOCAB_DAYS.map((day) => [day.id, VOCAB_WORDS.filter((word) => word.day === day.id)]),
);

/** Every word of one Day, in the book's order. Empty for an unknown Day. */
export const wordsForDay = (day: number): readonly VocabWord[] => BY_DAY.get(day) ?? [];

/** The Day metadata, or undefined when the id names no section. */
export const dayById = (id: number): VocabDay | undefined =>
  VOCAB_DAYS.find((day) => day.id === id);

/** Whether `?day=` named a real section. Used to validate the URL. */
export const isVocabDayId = (value: number): boolean => BY_DAY.has(value);
