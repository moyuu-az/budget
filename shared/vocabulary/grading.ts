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

// What a bracket REPLACES, guessed two ways.
//
// Japanese is not spaced, so "the preceding word" cannot be read off the string.
// 「〜する準備［用意］ができている」 means 準備 or 用意 -- but the run of Japanese
// before the bracket is 「する準備」, and replacing all of it gives
// 「〜用意ができている」, which is not what anybody would type.
//
// So both readings are generated: the whole preceding run, and the preceding run
// of the same SCRIPT as the replacement (kanji for 用意, giving 「する用意…」).
// Over-generating is safe -- a variant nobody would type is simply never
// matched, and the "generosity has a limit" test proves none of them collides
// with another entry's answer.
const PRECEDING_RUN = /[぀-ヿ一-龯]+$/;
const PRECEDING_KANJI = /[一-龯]+$/;
const PRECEDING_KANA = /[぀-ヿ]+$/;

const isKanji = (ch: string): boolean => /[一-龯]/.test(ch);

/** Every guess at "the text this bracket stands in for", most specific first. */
function substitutions(before: string, inside: string): string[] {
  const first = inside.charAt(0);
  const sameScript = isKanji(first) ? PRECEDING_KANJI : PRECEDING_KANA;
  return [before.replace(sameScript, ''), before.replace(PRECEDING_RUN, '')];
}

/**
 * Expands a gloss with brackets into every form a reader might type.
 *
 * The book uses brackets two ways, and only the reader can tell which:
 *
 *   「〜する準備［用意］ができている」 -- 用意 REPLACES 準備, so both
 *                                        「〜する準備が…」 and 「〜する用意が…」
 *                                        are the same answer.
 *   「（買った商品）を（…に）返品する」 -- the parenthesis is a note, so the
 *                                          answer reads the same without it.
 *   「help A (to) do」                  -- `to` is optional in the phrase itself.
 *
 * So each group yields up to three readings -- dropped, kept, and substituted
 * for what precedes it -- and the caller accepts any of them. Over-accepting
 * here costs nothing: these are all things the reader would only type if they
 * knew the entry.
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
      // Substituted: 「する準備［用意］」 -> 「する用意」 and 「用意」.
      for (const stem of substitutions(before, inside)) next.add(stem + inside + after);
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
  return [
    before + after,
    before + inside + after,
    ...substitutions(before, inside).map((stem) => stem + inside + after),
  ];
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
  return [
    word.ja,
    ...word.jaFull
      .split(/[❶-❿➀-➓①-⑳❶❷❸❹❶❷❸❹]/u)
      .flatMap((sense) => sense.split('、'))
      .map((form) => form.trim())
      .filter((form) => form.length > 0),
  ];
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
