import { answerTextFor, isEquallyCorrect } from './quiz';
import type { QuizDirection, VocabWord } from './types';
import { VOCAB_WORDS } from './words';

// ---------------------------------------------------------------------------
// MARKING A TYPED ANSWER.
//
// Typing is the point of the harder mode: recognising 「〜に由来する」 in a list
// of four is a different skill from producing `come from` from nothing, and only
// the second is what you need in order to actually use the phrase.
//
// It is also the mode that can be WRONG ABOUT THE READER, which a multiple
// choice cannot. Four options are unambiguous; free text is a string comparison,
// and every unnecessary rejection teaches the reader that they do not know
// something they do know -- then feeds that into 「間違えた問題だけ」, which is
// the list they trust. So this module is deliberately generous, and everything
// it accepts is derived from the book rather than invented:
//
//   - the entry's own short form (`ja`) and its full gloss (`jaFull`), including
//     the second sense the book prints as ❷ and the alternatives it prints in
//     brackets;
//   - every OTHER entry that would equally answer the same prompt -- which is
//     the same rule the choice builder uses to keep synonyms apart
//     (`isEquallyCorrect`). Asked 「〜してうれしい」, a reader who types
//     `be happy to do` when the recorded answer is `be glad to do` is right, and
//     being told otherwise would be indefensible.
//
// What it does NOT do is guess. A misspelling is a wrong answer; the reveal
// shows the correct form immediately afterwards, which is the moment it is
// worth seeing.
// ---------------------------------------------------------------------------

/** How the reader chose to answer. Not stored -- it is a per-question control. */
export const QUIZ_INPUT_MODES = ['typed', 'choice'] as const;
export type QuizInputMode = (typeof QUIZ_INPUT_MODES)[number];

/** Cap on the variants one gloss may expand into, so a pathological entry cannot blow up. */
const MAX_VARIANTS = 48;

const BRACKETS: readonly [string, string][] = [
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['［', '］'],
];

/**
 * Expands a gloss with brackets into the forms a reader might type.
 *
 * TWO READINGS ONLY: with the group, and without it.
 *
 *   「（買った商品）を（…に）返品する」 -- the parenthesis is a note, so the
 *                                          answer reads the same without it.
 *   「help A (to) do」                  -- `to` is optional in the phrase itself.
 *
 * IT DOES NOT TRY TO WORK OUT WHAT A BRACKET REPLACES. An earlier version did,
 * by stripping the text before the bracket with a regex. Japanese is not spaced,
 * so there is no such text to find: for 「〜を見て回る［歩く］」 it produced
 * nothing a reader would write, and 「〜を見て歩く」 -- the correct alternative --
 * was marked WRONG. It also over-reached in the other direction, collapsing
 * 「〜する準備［用意］…」 and 「〜の準備［用意］…」 to the same string so that
 * `be ready to do` and `be ready for` accepted each other's answer.
 *
 * The alternation is data now (`VocabWord.jaAlt`), which is the only place it
 * can be correct. See shared/vocabulary/types.ts.
 */
function expandBrackets(text: string): string[] {
  let forms = [text];

  for (const [open, close] of BRACKETS) {
    const next = new Set<string>();
    for (const form of forms) {
      const start = form.indexOf(open);
      const end = start === -1 ? -1 : form.indexOf(close, start + 1);
      if (start === -1 || end === -1) {
        next.add(form);
        continue;
      }
      const before = form.slice(0, start);
      const inside = form.slice(start + open.length, end);
      const after = form.slice(end + close.length);

      next.add(before + after); // dropped
      next.add(before + inside + after); // kept, delimiters gone
    }
    // Re-run until no group of this kind is left, so nested/repeated groups all
    // expand; bounded by MAX_VARIANTS so a malformed entry cannot loop forever.
    forms = [...next].slice(0, MAX_VARIANTS);
    if (forms.some((form) => form.includes(open))) {
      const again = new Set<string>();
      for (const form of forms) for (const f of expandOnce(form, open, close)) again.add(f);
      forms = [...again].slice(0, MAX_VARIANTS);
    }
  }

  return forms;
}

function expandOnce(form: string, open: string, close: string): string[] {
  const start = form.indexOf(open);
  const end = start === -1 ? -1 : form.indexOf(close, start + 1);
  if (start === -1 || end === -1) return [form];
  const before = form.slice(0, start);
  const inside = form.slice(start + open.length, end);
  const after = form.slice(end + close.length);
  return [before + after, before + inside + after];
}

/**
 * Everything the answer to this word could reasonably be written as, before
 * normalisation.
 *
 * `jaFull` is split on the book's own separators: ❶❷❸ for distinct senses and
 * 、 for near-equivalents. Both are real answers -- 「〜の出身である」 is what
 * `come from` means as often as 「〜に由来する」 is.
 */
function rawFormsFor(word: VocabWord, direction: QuizDirection): string[] {
  if (direction === 'ja_to_en') return [word.en];

  const senses = word.jaFull.split(/[❶-❿➀-➓①-⑳]/u);
  const forms: string[] = [word.ja, ...(word.jaAlt ?? [])];

  for (const sense of senses) {
    const segments = sense
      .split('、')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;

    // THE PARTICLE AT THE FRONT BELONGS TO THE WHOLE SENSE, NOT TO THE FIRST
    // VERB.
    //
    // 「〜を冷やす、冷ます」 is two readings of ONE frame: 「〜を冷やす」 and
    // 「〜を冷ます」. Splitting on 、 and stopping there accepts 「冷ます」 but
    // rejects 「〜を冷ます」 -- which is what a reader actually writes, and is
    // correct. Same for 「〜の世話をする、面倒を見る」 and
    // 「〜に飽きている、うんざりしている」.
    //
    // Unlike the bracket case this IS mechanical: the marker is literally 「〜」
    // followed by particles at the very start of the sense, so there is nothing
    // to guess about where it ends.
    const lead = /^[〜～][をにのがへとでからより]+/u.exec(segments[0])?.[0] ?? '';

    for (const [index, segment] of segments.entries()) {
      forms.push(segment);
      if (index > 0 && lead !== '' && !/^[〜～]/u.test(segment)) {
        forms.push(lead + segment);
      }
    }
  }

  return forms;
}

/**
 * Comparable form of an answer.
 *
 * Everything removed here is something a reader would reasonably leave out or
 * put in: the 〜 placeholder the book prints and nobody types, spacing of either
 * width, and sentence punctuation. Case is folded for the English.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\s　]/g, '')
    .replace(/[〜～~]/g, '')
    .replace(/[、。・,.!?;:]/g, '')
    .replace(/[（）()［］[\]「」【】]/g, '');
}

/** Every accepted spelling of this word's answer, normalised and deduplicated. */
export function acceptedAnswers(word: VocabWord, direction: QuizDirection): string[] {
  // Any OTHER entry that would equally answer this prompt is equally correct
  // when typed. Same rule as the choice builder, so the two can never disagree
  // about what counts as right.
  const alsoCorrect = VOCAB_WORDS.filter(
    (other) => other.id !== word.id && isEquallyCorrect(other, word, direction),
  );

  const accepted = new Set<string>();
  for (const source of [word, ...alsoCorrect]) {
    for (const raw of rawFormsFor(source, direction)) {
      for (const form of expandBrackets(raw)) {
        const normalised = normalizeAnswer(form);
        if (normalised.length > 0) accepted.add(normalised);
      }
    }
  }
  return [...accepted];
}

/**
 * Whether what the reader typed counts as the answer.
 *
 * Blank is never correct -- an empty submission is "I do not know", and marking
 * it right because it normalises to the same empty string as some malformed
 * gloss would be the worst possible failure of this module.
 */
export function isAcceptedAnswer(
  typed: string,
  word: VocabWord,
  direction: QuizDirection,
): boolean {
  const normalised = normalizeAnswer(typed);
  if (normalised.length === 0) return false;
  return acceptedAnswers(word, direction).includes(normalised);
}

/** The form shown as 「正解」 after a typed answer. Always the entry's own. */
export function canonicalAnswer(word: VocabWord, direction: QuizDirection): string {
  return answerTextFor(word, direction);
}
