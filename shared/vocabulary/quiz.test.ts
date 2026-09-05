import { describe, it, expect } from 'vitest';
import { VOCAB_WORDS } from './words';
import { wordById, wordsForDay } from './index';
import { QUIZ_DIRECTIONS } from './types';
import { answerTextFor, buildQuiz, isEquallyCorrect, promptTextFor } from './quiz';

// ---------------------------------------------------------------------------
// The rule this whole module exists for is asserted first, and it is asserted
// EXHAUSTIVELY -- over every word, in both directions, rather than over a
// hand-picked example.
//
// The reason is in the data: 541/542, 553/560 and 557/559 print the SAME
// Japanese for different English. A quiz that puts a twin beside its partner
// shows two correct answers, marks one of them wrong, and then feeds that wrong
// answer into 「間違えた問題だけ」 -- which is the mode the reader trusts most.
// A spot check would pass while one pair was broken.
// ---------------------------------------------------------------------------

const ALL = VOCAB_WORDS;

describe('a distractor is never also a correct answer', () => {
  it.each(QUIZ_DIRECTIONS)('holds for every word asked %s', (direction) => {
    for (let seed = 1; seed <= 20; seed++) {
      const quiz = buildQuiz({
        words: ALL,
        distractorPool: ALL,
        direction,
        seed,
      });

      for (const question of quiz) {
        const answer = wordById(question.answerWordId)!;
        for (const choice of question.choices) {
          if (choice.wordId === question.answerWordId) continue;
          const distractor = wordById(choice.wordId)!;
          expect(
            isEquallyCorrect(distractor, answer, direction),
            `${choice.wordId} would also answer ${question.prompt}`,
          ).toBe(false);
        }
      }
    }
  });

  it('refuses the twins the book prints with the same Japanese', () => {
    // Named explicitly, so that a change which loosened the rule fails with a
    // message pointing at the actual pairs rather than at "some seed".
    for (const [a, b] of [
      ['et-541', 'et-542'],
      ['et-553', 'et-560'],
      ['et-557', 'et-559'],
    ] as const) {
      for (const direction of QUIZ_DIRECTIONS) {
        expect(isEquallyCorrect(wordById(a)!, wordById(b)!, direction)).toBe(true);
        expect(isEquallyCorrect(wordById(b)!, wordById(a)!, direction)).toBe(true);
      }
    }
  });

  it('catches a twin even when nobody declared it a synonym', () => {
    // The text comparison is the SAFETY NET for `synonymIds`. Strip the
    // declaration and the pair must still be refused, or the rule would depend
    // on a human having curated the data correctly.
    const glad = { ...wordById('et-541')!, synonymIds: undefined };
    const happy = { ...wordById('et-542')!, synonymIds: undefined };
    expect(isEquallyCorrect(glad, happy, 'en_to_ja')).toBe(true);
    expect(isEquallyCorrect(glad, happy, 'ja_to_en')).toBe(true);
  });
});

describe('buildQuiz', () => {
  it('asks about every word given, exactly once', () => {
    const day = wordsForDay(31);
    const quiz = buildQuiz({ words: day, distractorPool: ALL, direction: 'en_to_ja', seed: 7 });
    expect(quiz.map((q) => q.wordId).sort()).toEqual(day.map((w) => w.id).sort());
  });

  it('always includes the answer among the choices', () => {
    const quiz = buildQuiz({ words: ALL, distractorPool: ALL, direction: 'ja_to_en', seed: 3 });
    for (const question of quiz) {
      expect(question.choices.some((c) => c.wordId === question.answerWordId)).toBe(true);
    }
  });

  it('shows the prompt and the choices from opposite sides', () => {
    const quiz = buildQuiz({ words: ALL, distractorPool: ALL, direction: 'en_to_ja', seed: 11 });
    for (const question of quiz) {
      const word = wordById(question.wordId)!;
      expect(question.prompt).toBe(promptTextFor(word, question.direction));
      for (const choice of question.choices) {
        expect(choice.text).toBe(answerTextFor(wordById(choice.wordId)!, question.direction));
      }
    }
  });

  it('never repeats a choice text within one question', () => {
    // Two options rendering the same string is the same defect as a distractor
    // that is also correct: the reader cannot tell them apart.
    for (let seed = 1; seed <= 20; seed++) {
      for (const direction of QUIZ_DIRECTIONS) {
        for (const question of buildQuiz({
          words: ALL,
          distractorPool: ALL,
          direction,
          seed,
        })) {
          const texts = question.choices.map((c) => c.text);
          expect(new Set(texts).size, `duplicate choice in ${question.prompt}`).toBe(texts.length);
        }
      }
    }
  });

  it('offers four choices whenever the pool can supply them', () => {
    const quiz = buildQuiz({ words: ALL, distractorPool: ALL, direction: 'en_to_ja', seed: 5 });
    for (const question of quiz) {
      expect(question.choices).toHaveLength(4);
    }
  });

  it('shortens the list rather than padding it with something also correct', () => {
    // A pool of exactly the two twins can supply no distractor at all. The
    // honest outcome is one choice; the dangerous one is a second choice that is
    // equally right.
    const twins = [wordById('et-541')!, wordById('et-542')!];
    const quiz = buildQuiz({
      words: [twins[0]],
      distractorPool: twins,
      direction: 'ja_to_en',
      seed: 1,
    });
    expect(quiz[0].choices).toHaveLength(1);
    expect(quiz[0].choices[0].wordId).toBe('et-541');
  });

  it('prefers distractors from the same Day', () => {
    // Choices drawn from one grammatical pattern make the question about the
    // MEANING. Mixing 「be full of」 into a Day of 「動詞＋A＋前置詞＋B」 lets the
    // answer be found from the shape alone.
    const day = wordsForDay(32);
    const quiz = buildQuiz({ words: day, distractorPool: ALL, direction: 'en_to_ja', seed: 9 });
    for (const question of quiz) {
      for (const choice of question.choices) {
        expect(wordById(choice.wordId)!.day, `${choice.wordId} came from another Day`).toBe(32);
      }
    }
  });

  it('is reproducible from its seed, and different between seeds', () => {
    const of = (seed: number) =>
      JSON.stringify(buildQuiz({ words: ALL, distractorPool: ALL, direction: 'en_to_ja', seed }));
    expect(of(42)).toBe(of(42));
    expect(of(42)).not.toBe(of(43));
  });

  it('samples randomly when limited, rather than always taking the first N', () => {
    const day = wordsForDay(31);
    const firstOf = (seed: number) =>
      buildQuiz({ words: day, distractorPool: day, direction: 'en_to_ja', limit: 5, seed })
        .map((q) => q.wordId)
        .join(',');

    const samples = new Set([1, 2, 3, 4, 5].map(firstOf));
    // Asking the same first five words of a Day every time is how a reader ends
    // up knowing five words and believing they know sixteen.
    expect(samples.size).toBeGreaterThan(1);
    for (const seed of [1, 2, 3]) expect(firstOf(seed).split(',')).toHaveLength(5);
  });

  it("mixes both directions when the setting is 'both'", () => {
    const quiz = buildQuiz({ words: ALL, distractorPool: ALL, direction: 'both', seed: 13 });
    expect(new Set(quiz.map((q) => q.direction))).toEqual(new Set(QUIZ_DIRECTIONS));
  });

  it('records the direction of each question, not the setting', () => {
    // The attempt is stored with THIS question's direction. Storing the setting
    // would make every answer of a mixed session count towards one direction,
    // and the per-direction breakdown would be fiction.
    const quiz = buildQuiz({ words: ALL, distractorPool: ALL, direction: 'both', seed: 17 });
    for (const question of quiz) {
      const word = wordById(question.wordId)!;
      expect(question.prompt).toBe(promptTextFor(word, question.direction));
    }
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(buildQuiz({ words: [], distractorPool: ALL, direction: 'en_to_ja', seed: 1 })).toEqual(
      [],
    );
  });
});
