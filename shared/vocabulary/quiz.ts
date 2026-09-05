import { QUIZ_DIRECTIONS, type QuizDirection, type VocabWord } from './types';

// ---------------------------------------------------------------------------
// BUILDING A QUESTION.
//
// The whole file exists for one rule, and it is not the shuffling:
//
//   A DISTRACTOR MUST NOT ALSO BE A CORRECT ANSWER.
//
// This book makes that a real hazard rather than a theoretical one. It prints
// 541 `be glad to do` and 542 `be happy to do` with the SAME Japanese
// (「〜してうれしい」), and does the same for 553/560 and 557/559. Ask
// 「〜してうれしい」→英語 with both twins in the choice list and the reader has
// two right answers, picks one, and is told they were wrong. That is worse than
// a missing feature: it teaches the wrong thing and it corrupts the study record
// the "wrong questions only" mode is built on.
//
// So `isEquallyCorrect` below is the load-bearing part. It refuses a candidate
// on FOUR grounds, and the redundancy is deliberate:
//
//   - the book's own ≒ cross-references (`synonymIds`), and
//   - the displayed texts being identical -- which catches the same twins
//     without depending on anyone having curated `synonymIds` correctly.
//
// The second is the safety net for the first. A synonym pair that someone
// forgets to declare still cannot produce an unanswerable question.
//
// DETERMINISM
//   Everything random here comes from one seeded generator. The same seed gives
//   the same quiz, which is what lets the tests assert on exact choice lists
//   rather than on "roughly four things", and what lets a session survive a
//   re-render without the choices dancing.
// ---------------------------------------------------------------------------

/**
 * What a question SHOWS for a word in a given direction.
 *
 * Defined HERE rather than in index.ts so that this module depends on nothing
 * that depends on it. The prompt and the choices both come from this pair, from
 * opposite ends, so the two can never disagree about which field is being asked
 * for: `en_to_ja` shows the English and expects the Japanese, `ja_to_en` is the
 * mirror.
 */
export const promptTextFor = (word: VocabWord, direction: QuizDirection): string =>
  direction === 'en_to_ja' ? word.en : word.ja;

export const answerTextFor = (word: VocabWord, direction: QuizDirection): string =>
  direction === 'en_to_ja' ? word.ja : word.en;

/**
 * What the reader picked in the direction control, as VALUES.
 *
 * 'both' first because it is the default: a session that only ever asks one way
 * round trains half a skill, and the reader who most needs the other half is the
 * one least likely to go looking for the switch.
 *
 * A tuple because the list is needed at runtime by the control itself and by the
 * validator for `?dir=`.
 */
export const QUIZ_DIRECTION_SETTINGS = ['both', ...QUIZ_DIRECTIONS] as const;

/** What the reader picked in the direction control. 'both' mixes per question. */
export type QuizDirectionSetting = QuizDirection | 'both';

export interface QuizChoice {
  wordId: string;
  text: string;
}

export interface QuizQuestion {
  /** The word being asked about. Also what an attempt is recorded against. */
  wordId: string;
  /**
   * Which way round THIS question is, even when the session was set to 'both'.
   *
   * Recorded with the attempt: 「英→日はできるが日→英が弱い」 is only visible if
   * the direction of each answer is kept.
   */
  direction: QuizDirection;
  prompt: string;
  choices: readonly QuizChoice[];
  /** Always the id of one of `choices`. */
  answerWordId: string;
}

export interface BuildQuizOptions {
  /** The words to ask about, in the order they should be asked before shuffling. */
  words: readonly VocabWord[];
  /**
   * Where distractors may be drawn from.
   *
   * Usually the whole Day: choices from one grammatical pattern make the
   * question about the meaning rather than about the shape. Falls back to the
   * rest of this list when a Day cannot supply enough distinguishable options.
   */
  distractorPool: readonly VocabWord[];
  direction: QuizDirectionSetting;
  /** How many options each question offers, including the answer. Default 4. */
  choiceCount?: number;
  /** Cap on the number of questions. Undefined asks about every word. */
  limit?: number;
  /** Anything integral. The same seed rebuilds exactly the same quiz. */
  seed: number;
}

/**
 * mulberry32 — small, fast, and good enough for shuffling a quiz.
 *
 * Deliberately NOT Math.random(): a quiz that cannot be reproduced cannot be
 * asserted on, and the choice list would change on every re-render of the same
 * question.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy. The input is never mutated. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Whether `candidate` would ALSO be right for a question whose answer is
 * `answer`, and therefore may never sit beside it in a choice list.
 *
 * Exported because the integrity tests assert on it directly: it is the rule
 * this module exists to enforce, and a rule only checked through the thing it
 * constrains is a rule that can be weakened without any test noticing.
 */
export function isEquallyCorrect(
  candidate: VocabWord,
  answer: VocabWord,
  direction: QuizDirection,
): boolean {
  if (candidate.id === answer.id) return true;
  // Two options rendering the same text: the reader cannot tell them apart, and
  // whichever they click, one of the two is marked wrong.
  if (answerTextFor(candidate, direction) === answerTextFor(answer, direction)) return true;
  // The candidate answers the same prompt. In ja_to_en this is the twin case:
  // 「〜してうれしい」 is asked, and both `be glad to do` and `be happy to do`
  // answer it.
  if (promptTextFor(candidate, direction) === promptTextFor(answer, direction)) return true;
  // And what the book says, in either direction. The list is asserted mutual by
  // the integrity tests, so one side would be enough -- both are checked because
  // relying on a test to keep a security-of-correctness property is thinner than
  // simply not depending on it.
  return (
    (answer.synonymIds?.includes(candidate.id) ?? false) ||
    (candidate.synonymIds?.includes(answer.id) ?? false)
  );
}

/**
 * Picks the options for one question.
 *
 * Preference order is same-Day first, then everything else, because a choice
 * list drawn from one grammatical pattern asks about the MEANING. A list mixing
 * `be full of` with `take A to B` can be answered from the shape alone.
 *
 * Returns fewer than `choiceCount` options when the pool cannot supply enough
 * distinguishable ones. That is the honest outcome: padding with a repeat, or
 * with something already rejected as equally correct, would make the question
 * broken rather than merely short.
 */
function buildChoices(
  answer: VocabWord,
  pool: readonly VocabWord[],
  direction: QuizDirection,
  choiceCount: number,
  rng: () => number,
): QuizChoice[] {
  const usedTexts = new Set<string>([answerTextFor(answer, direction)]);
  const distractors: VocabWord[] = [];

  const sameDay = pool.filter((w) => w.day === answer.day);
  const otherDays = pool.filter((w) => w.day !== answer.day);

  for (const group of [sameDay, otherDays]) {
    for (const candidate of shuffled(group, rng)) {
      if (distractors.length >= choiceCount - 1) break;
      if (isEquallyCorrect(candidate, answer, direction)) continue;
      const text = answerTextFor(candidate, direction);
      // Two DISTRACTORS sharing a text is the same defect as a distractor
      // sharing the answer's: the list shows one option twice.
      if (usedTexts.has(text)) continue;
      usedTexts.add(text);
      distractors.push(candidate);
    }
  }

  return shuffled(
    [answer, ...distractors].map((w) => ({ wordId: w.id, text: answerTextFor(w, direction) })),
    rng,
  );
}

/**
 * Turns a set of words into a quiz.
 *
 * The questions are shuffled, then capped by `limit` -- in that order, so a
 * capped quiz is a random sample of the set rather than always its first N
 * entries. Asking the same first ten words of a Day every time is how a reader
 * ends up knowing ten words and believing they know sixteen.
 */
export function buildQuiz({
  words,
  distractorPool,
  direction,
  choiceCount = 4,
  limit,
  seed,
}: BuildQuizOptions): QuizQuestion[] {
  const rng = createRng(seed);
  const order = shuffled(words, rng);
  const asked = limit === undefined ? order : order.slice(0, Math.max(0, limit));

  return asked.map((word) => {
    const questionDirection: QuizDirection =
      direction === 'both'
        ? QUIZ_DIRECTIONS[Math.floor(rng() * QUIZ_DIRECTIONS.length)]
        : direction;

    return {
      wordId: word.id,
      direction: questionDirection,
      prompt: promptTextFor(word, questionDirection),
      choices: buildChoices(word, distractorPool, questionDirection, choiceCount, rng),
      answerWordId: word.id,
    };
  });
}
