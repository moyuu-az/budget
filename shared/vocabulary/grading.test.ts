import { describe, it, expect } from 'vitest';
import { VOCAB_WORDS } from './words';
import { wordById } from './index';
import { QUIZ_DIRECTIONS } from './types';
import { answerTextFor, isEquallyCorrect } from './quiz';
import { acceptedAnswers, isAcceptedAnswer, normalizeAnswer } from './grading';

// ---------------------------------------------------------------------------
// Free text is the only place this app can be WRONG ABOUT THE READER.
//
// Four options are unambiguous. A string comparison is not, and every
// unnecessary rejection tells somebody they do not know a phrase they do know --
// then puts it in 「間違えた問題だけ」, the list they trust most.
//
// So the first two tests are exhaustive over all 80 entries in both directions,
// and the third is the one that stops the generosity going too far.
// ---------------------------------------------------------------------------

describe('every entry accepts its own answer', () => {
  it.each(QUIZ_DIRECTIONS)('%s', (direction) => {
    for (const word of VOCAB_WORDS) {
      expect(
        isAcceptedAnswer(answerTextFor(word, direction), word, direction),
        `${word.id} rejects its own answer 「${answerTextFor(word, direction)}」`,
      ).toBe(true);
    }
  });

  it('accepts the full gloss as well as the short form', () => {
    for (const word of VOCAB_WORDS) {
      // Someone typing what the reveal shows them must not be marked wrong the
      // next time round.
      // The book's FIRST sense: split on the ❶❷ sense markers before the 、
      // that separates near-equivalents within one sense.
      const primary = word.jaFull
        .split(/[❶-❿]/u)
        .map((sense) => sense.split('、')[0].trim())
        .filter((sense) => sense.length > 0)[0];
      expect(
        isAcceptedAnswer(primary, word, 'en_to_ja'),
        `${word.id} rejects its own full gloss 「${primary}」`,
      ).toBe(true);
    }
  });
});

describe('generosity has a limit', () => {
  it('never accepts another entry\'s answer unless it would equally answer the prompt', () => {
    // The failure this prevents: an over-eager normalisation collapsing two
    // different phrases to the same string, so the reader is marked right for
    // the wrong word -- and the word they actually got wrong never appears in
    // the review list.
    for (const direction of QUIZ_DIRECTIONS) {
      for (const word of VOCAB_WORDS) {
        for (const other of VOCAB_WORDS) {
          if (other.id === word.id) continue;
          if (isEquallyCorrect(other, word, direction)) continue;
          expect(
            isAcceptedAnswer(answerTextFor(other, direction), word, direction),
            `${word.id} accepted ${other.id}'s answer 「${answerTextFor(other, direction)}」`,
          ).toBe(false);
        }
      }
    }
  });

  it('never accepts a blank submission', () => {
    for (const word of VOCAB_WORDS) {
      for (const direction of QUIZ_DIRECTIONS) {
        expect(isAcceptedAnswer('', word, direction)).toBe(false);
        expect(isAcceptedAnswer('   ', word, direction)).toBe(false);
        expect(isAcceptedAnswer('〜', word, direction)).toBe(false);
      }
    }
  });

  it('rejects a misspelling', () => {
    expect(isAcceptedAnswer('come form', wordById('et-481')!, 'ja_to_en')).toBe(false);
    expect(isAcceptedAnswer('be intrested in', wordById('et-549')!, 'ja_to_en')).toBe(false);
  });
});

describe('what a reader may leave out', () => {
  const ja481 = wordById('et-481')!;
  const help = wordById('et-532')!;
  const ready = wordById('et-538')!;

  it('ignores case and stray spacing in English', () => {
    expect(isAcceptedAnswer('  Come   From ', ja481, 'ja_to_en')).toBe(true);
    expect(isAcceptedAnswer('COME FROM', ja481, 'ja_to_en')).toBe(true);
  });

  it("accepts a curly apostrophe, which is what a phone's keyboard produces", () => {
    expect(isAcceptedAnswer('can’t wait to do', wordById('et-526')!, 'ja_to_en')).toBe(true);
  });

  it('treats a bracketed word in the phrase as optional', () => {
    // `help A (to) do`: both readings are the phrase.
    expect(isAcceptedAnswer('help A to do', help, 'ja_to_en')).toBe(true);
    expect(isAcceptedAnswer('help A do', help, 'ja_to_en')).toBe(true);
  });

  it('accepts either word of a 「準備［用意］」 alternation', () => {
    expect(isAcceptedAnswer('〜する準備ができている', ready, 'en_to_ja')).toBe(true);
    expect(isAcceptedAnswer('〜する用意ができている', ready, 'en_to_ja')).toBe(true);
    // And without the 〜 the book prints but nobody types.
    expect(isAcceptedAnswer('する準備ができている', ready, 'en_to_ja')).toBe(true);
  });

  it("accepts the book's second sense", () => {
    // come from ❷〜の出身である. A reader who answers with the meaning they use
    // every day must not be told they are wrong.
    expect(isAcceptedAnswer('〜の出身である', ja481, 'en_to_ja')).toBe(true);
  });

  it('accepts a near-equivalent the book prints after 、', () => {
    // 484 get back: 「戻る、帰る」
    expect(isAcceptedAnswer('帰る', wordById('et-484')!, 'en_to_ja')).toBe(true);
  });

  it('does not require the parenthetical notes the book prints', () => {
    // 496 take back: 「（買った商品）を（…に）返品する（to …）」
    expect(isAcceptedAnswer('〜を返品する', wordById('et-496')!, 'en_to_ja')).toBe(true);
    // 494 look after: 「〜の世話をする、面倒を見る（≒ take care of）」 -- the ≒
    // note is not part of the answer.
    expect(isAcceptedAnswer('〜の世話をする', wordById('et-494')!, 'en_to_ja')).toBe(true);
    expect(isAcceptedAnswer('面倒を見る', wordById('et-494')!, 'en_to_ja')).toBe(true);
  });
});

describe('a synonym is a correct typed answer', () => {
  it.each([
    ['et-541', 'be happy to do'],
    ['et-542', 'be glad to do'],
    ['et-553', 'be filled with'],
    ['et-560', 'be full of'],
    ['et-557', 'be afraid of'],
    ['et-559', 'be scared of'],
  ])('%s accepts 「%s」', (id, typed) => {
    // The prompt 「〜してうれしい」 has two right answers. Marking one of them
    // wrong because it is not the row the quiz picked would be indefensible --
    // and the choice builder already refuses to show both, so the reader has no
    // way to know which one was meant.
    expect(isAcceptedAnswer(typed, wordById(id)!, 'ja_to_en')).toBe(true);
  });
});

describe('normalizeAnswer', () => {
  it('collapses the things that are not part of the answer', () => {
    expect(normalizeAnswer('  Be  Ready　For. ')).toBe('bereadyfor');
    expect(normalizeAnswer('〜の準備［用意］ができている')).toBe('の準備用意ができている');
  });

  it('produces a non-empty set for every entry', () => {
    for (const word of VOCAB_WORDS) {
      for (const direction of QUIZ_DIRECTIONS) {
        expect(acceptedAnswers(word, direction).length, `${word.id} ${direction}`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});
