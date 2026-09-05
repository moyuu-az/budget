import { describe, it, expect } from 'vitest';
import { VOCAB_WORDS } from './words';
import { wordById, wordsForDay } from './index';
import { QUIZ_DIRECTIONS, type VocabWord } from './types';
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

describe('出題順', () => {
  const DAY = wordsForDay(32);
  const BOOK_ORDER = [...DAY].sort((a, b) => a.number - b.number).map((w) => w.id);

  const askedIds = (options: Partial<Parameters<typeof buildQuiz>[0]> = {}) =>
    buildQuiz({
      words: DAY,
      distractorPool: DAY,
      direction: 'ja_to_en',
      seed: 7,
      ...options,
    }).map((q) => q.wordId);

  it("asks in the book's No. order when told to", () => {
    expect(askedIds({ order: 'number' })).toEqual(BOOK_ORDER);
  });

  it('does not depend on the order the caller happened to hand the words over', () => {
    // The caller IS a scope selector with an order of its own: 'weak' hands over
    // its words ranked by how often each is missed. 「No.順」 that came out
    // differently depending on which range was chosen would not be an order the
    // reader could predict.
    //
    // What holds this today is the No. being unique, NOT the tie-break -- with
    // distinct numbers the first term of the comparator already decides. The
    // tie-break has its own test below, because a defence nothing exercises is
    // a defence nobody can tell has stopped working.
    expect(askedIds({ words: [...DAY].reverse(), order: 'number' })).toEqual(BOOK_ORDER);
  });

  it('breaks a tie on the id, so equal numbers still come out in one order', () => {
    // UNREACHABLE WITH THE BOOK AS PRINTED, and asserted anyway.
    //
    // `words.test.ts` pins 481-560 as a gapless ascending run and pins `id` as
    // `et-<number>`, so two entries cannot share a number today. That is a
    // property of the transcription, not of the comparator -- and the failure it
    // would cause is invisible on screen: `Array.prototype.sort` is stable, so a
    // comparator that returned 0 would hand the CALLER's order through, and the
    // caller's order at that point is a SHUFFLE. 「No.順」 would silently come
    // out differently on every run.
    //
    // The two calls below get the same permutation from the same seed, so
    // without the tie-break they land on opposite orders and one of them fails.
    const twin = (id: string): VocabWord => ({ ...wordById('et-481')!, id, number: 999 });
    const a = twin('et-999a');
    const b = twin('et-999b');
    const order = (words: readonly VocabWord[]) =>
      askedIds({ words, distractorPool: words, order: 'number', seed: 3 });

    expect(order([a, b])).toEqual(['et-999a', 'et-999b']);
    expect(order([b, a])).toEqual(['et-999a', 'et-999b']);
  });

  it('defaults to random, which is what every caller had before the option existed', () => {
    const of = (options: Parameters<typeof askedIds>[0]) => askedIds(options).join(',');
    expect(of({})).toBe(of({ order: 'random' }));
    // And random is genuinely not the book's order. Sixteen words shuffled land
    // on the printed sequence once in 16!, so a single seed is enough; several
    // are used so the assertion does not rest on one draw.
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(askedIds({ seed })).not.toEqual(BOOK_ORDER);
    }
  });

  it('asks the same questions either way, and only changes the order', () => {
    // THE LIMIT IS THE WHOLE TEST. Uncapped, both settings ask about every word
    // handed over and the assertion is just 「buildQuiz drops nothing」 -- which
    // another test already covers, and which no ordering mutation can break.
    //
    // Capped, the two must agree on WHICH five, and that only holds because the
    // shuffle runs for both settings. Skip it for 'number' and the generator
    // sits at a different position, so the cap selects a different five.
    expect(new Set(askedIds({ order: 'number', limit: 5 }))).toEqual(
      new Set(askedIds({ order: 'random', limit: 5 })),
    );
  });

  it('still samples when limited, rather than always asking the first five of the book', () => {
    // THE TRAP THIS PINS. Sorting the words and slicing THAT would make 「No.順」
    // mean 「常に No.481〜485」, and the reader would end up knowing five words
    // and believing they knew sixteen -- the exact defect buildQuiz shuffles
    // before it slices to avoid.
    const runs = [1, 2, 3, 4, 5].map((seed) =>
      buildQuiz({
        words: DAY,
        distractorPool: DAY,
        direction: 'ja_to_en',
        order: 'number',
        limit: 5,
        seed,
      }).map((q) => wordById(q.wordId)!.number),
    );

    expect(new Set(runs.map((numbers) => numbers.join(','))).size).toBeGreaterThan(1);
    for (const numbers of runs) {
      expect(numbers).toHaveLength(5);
      // Each run is still ASKED in ascending No., which is what was chosen.
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it('leaves the words it was given alone', () => {
    // `words` is `readonly`, but a sort in place would still mutate the array
    // behind it -- and the array the screen hands over is memoised from
    // `wordsForDay`, i.e. the module-level book itself.
    //
    // WHAT ACTUALLY HOLDS THIS is `shuffled()` copying its input; the
    // `capped.slice()` in front of the sort is a second, currently unreachable
    // guard (`capped` is always a fresh array by then). Removing that `.slice()`
    // does NOT fail this test, and the comment used to imply it would. Removing
    // the copy inside `shuffled()` does.
    const before = DAY.map((w) => w.id);
    buildQuiz({ words: DAY, distractorPool: DAY, direction: 'ja_to_en', order: 'number', seed: 1 });
    expect(DAY.map((w) => w.id)).toEqual(before);
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(
      buildQuiz({ words: [], distractorPool: DAY, direction: 'ja_to_en', order: 'number', seed: 1 }),
    ).toEqual([]);
  });
});
