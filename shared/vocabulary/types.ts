// ---------------------------------------------------------------------------
// THE SHAPE OF THE STUDY MATERIAL.
//
// WHY THE WORDS LIVE IN SOURCE AND NOT IN THE DATABASE
//   They are a printed book transcribed once. Nobody edits them from the UI,
//   they are the same for every user, and they have to be reviewable -- a wrong
//   meaning is a wrong answer marked correct, which is worse than no quiz at
//   all. Keeping them in TypeScript means a change to a meaning shows up in a
//   diff, is covered by the integrity tests next to them, and cannot disagree
//   between two databases.
//
//   What DOES belong in the database is what differs per person: which
//   questions they got right. That is the only vocabulary table
//   (`vocab_attempts`), and it references a word by `VocabWord.id`.
//
// WHICH MEANS `VocabWord.id` IS A STORED KEY.
//   It appears in rows that outlive any edit to this file. Renaming one orphans
//   every attempt recorded against it -- the study record silently resets. Fix
//   a typo in `ja`, add a `tip`, reword a `note`: all fine. NEVER change an
//   `id`, and never reuse one for a different word.
// ---------------------------------------------------------------------------

/**
 * Which way round a question is asked, as VALUES.
 *
 * A tuple rather than a bare union because the list is needed at runtime in
 * three places -- the direction picker, the statistics that break results down
 * per direction, and the validator that decides whether `?dir=` in the address
 * means anything. Deriving the type from the tuple keeps those from drifting.
 *
 *  - 'en_to_ja' … 「come from」と見せて意味を選ばせる（認識できるか）
 *  - 'ja_to_en' … 「〜に由来する」と見せて英語を選ばせる（産出できるか）
 *
 * THESE ARE STORED STRINGS. `vocab_attempts.direction` holds them verbatim and
 * a CHECK constraint lists them, so a value added here needs a migration.
 */
export const QUIZ_DIRECTIONS = ['en_to_ja', 'ja_to_en'] as const;
export type QuizDirection = (typeof QUIZ_DIRECTIONS)[number];

/** One entry of the book. */
export interface VocabWord {
  /**
   * Stable key. `et-<the book's number>`.
   *
   * Derived from the printed number rather than from the English, so fixing a
   * transcription typo in `en` does not orphan the attempts recorded against
   * it. See the note at the top of this file.
   */
  id: string;
  /** The number printed beside the entry. Display and ordering only. */
  number: number;
  /** Which Day section it belongs to. See `days.ts`. */
  day: number;
  /**
   * The English, in the form a QUIZ CHOICE shows.
   *
   * The book prints alternatives in brackets -- `knock on [at]`,
   * `love doing [to do]`. Those are NOT stored here: a choice list is read at a
   * glance and a bracket in one option makes it the odd one out, which is a
   * free hint. The alternative form is explained in `tip` instead, where it is
   * read at the moment it matters.
   */
  en: string;
  /**
   * The Japanese, in the form a QUIZ CHOICE shows -- short enough that four of
   * them can be compared.
   *
   * This is the book's own Quick Review wording, not an abbreviation invented
   * here, so it is the phrasing the reader has already been drilled on.
   */
  ja: string;
  /**
   * The full gloss, shown once the answer is revealed.
   *
   * Everything `ja` had to drop: the second meaning, the particles, the
   * cross-references the book prints with ≒.
   */
  jaFull: string;
  /**
   * Other Japanese wordings that are the SAME answer.
   *
   * The book prints an alternation in brackets -- 「〜する準備［用意］ができている」
   * means 準備 OR 用意 -- and a reader who types the second one is right.
   *
   * WHY THIS IS DATA AND NOT A RULE
   *   An earlier version derived these by regex: find the bracket, replace the
   *   text before it. Japanese is not spaced, so "the text before it" cannot be
   *   read off the string, and the guess was wrong wherever the stem ended in
   *   kana -- 「〜を見て回る［歩く］」 produced nothing usable, so 「〜を見て歩く」
   *   was marked WRONG. Four entries were affected, and the failure was exactly
   *   the one shared/vocabulary/grading.ts exists to prevent.
   *
   *   An integrity test requires this field on every entry whose `jaFull`
   *   carries a bracket alternation, so a new one cannot arrive unnoticed.
   */
  jaAlt?: readonly string[];
  /** Why the phrase means what it means. Shown after answering. */
  note: string;
  /** The thing that actually catches people out. Shown after answering. */
  tip: string;
  /** One sentence using it, with a translation. */
  example: { en: string; ja: string };
  /**
   * Words that would ALSO be a correct answer to this word's prompt.
   *
   * NOT decoration, and not the same thing as "related words". This drives a
   * rule in the quiz builder: a synonym may never appear as a distractor,
   * because a distractor that is also correct makes the question unanswerable
   * and then marks the reader wrong for choosing it.
   *
   * The book states these itself with ≒ (`be glad to do ≒ be happy to do`),
   * and they are always mutual -- an integrity test asserts that, so a
   * one-sided entry cannot ship.
   */
  synonymIds?: readonly string[];
}

/** One Day of the book: the unit the reader picks when starting a quiz. */
export interface VocabDay {
  /** The number printed on the tab. Also the value carried in `?day=`. */
  id: number;
  /** 「動詞句4」 */
  title: string;
  /** 「「動詞＋副詞［前置詞］」型4」 */
  subtitle: string;
}
