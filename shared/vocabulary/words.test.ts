import { describe, it, expect } from 'vitest';
import { VOCAB_DAYS } from './days';
import { VOCAB_WORDS } from './words';
import { wordById, wordsForDay } from './index';

// ---------------------------------------------------------------------------
// THE BOOK IS DATA, AND DATA GETS TESTED.
//
// Nothing here is about the quiz. These assertions protect the transcription
// itself, because the failure modes of a wrong entry are all quiet:
//
//   - a duplicate `id` silently merges two words' study records,
//   - an empty `ja` renders a blank choice that can still be clicked,
//   - a one-sided `synonymIds` lets a synonym appear as a distractor, and the
//     reader is marked wrong for a correct answer,
//   - a `day` that no Day lists makes a word unreachable from every screen.
//
// None of those throw. All of them teach the wrong thing.
// ---------------------------------------------------------------------------

describe('vocabulary data', () => {
  it('has the 80 entries of Day 31-35, numbered 481-560 without gaps', () => {
    expect(VOCAB_WORDS).toHaveLength(80);
    expect(VOCAB_WORDS.map((w) => w.number)).toEqual(
      Array.from({ length: 80 }, (_, i) => 481 + i),
    );
  });

  it('gives every word a unique id', () => {
    // A duplicate would not throw anywhere. It would make two words share one
    // row of the study record, so answering one would mark the other learned.
    const ids = VOCAB_WORDS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives the id from the printed number, so a typo fix cannot orphan a record', () => {
    // The ids are STORED KEYS (`vocab_attempts.word_id`). Deriving them from the
    // English would mean correcting a transcription typo silently resets that
    // word's history; deriving them from the number does not.
    for (const word of VOCAB_WORDS) {
      expect(word.id).toBe(`et-${word.number}`);
    }
  });

  it('fills every field a screen reads', () => {
    for (const word of VOCAB_WORDS) {
      // `ja` and `en` are the quiz's prompt and answer. An empty one renders a
      // blank, clickable choice.
      expect(word.en.trim(), `${word.id} en`).not.toBe('');
      expect(word.ja.trim(), `${word.id} ja`).not.toBe('');
      expect(word.jaFull.trim(), `${word.id} jaFull`).not.toBe('');
      // The three that make this a study tool rather than a flashcard app. A
      // question whose reveal is blank is worse than no reveal: it looks broken.
      expect(word.note.trim(), `${word.id} note`).not.toBe('');
      expect(word.tip.trim(), `${word.id} tip`).not.toBe('');
      expect(word.example.en.trim(), `${word.id} example.en`).not.toBe('');
      expect(word.example.ja.trim(), `${word.id} example.ja`).not.toBe('');
    }
  });

  it('keeps the choice texts short enough to compare four at a glance', () => {
    // `ja` is the book's own Quick Review wording, which is already terse. This
    // is a guard against someone "improving" it by pasting `jaFull` in, which
    // turns a choice list into four paragraphs on a phone.
    for (const word of VOCAB_WORDS) {
      expect(word.ja.length, `${word.id} ja is too long for a choice`).toBeLessThanOrEqual(24);
    }
  });

  it('puts every word in a Day that exists, and leaves no Day empty', () => {
    const dayIds = new Set(VOCAB_DAYS.map((d) => d.id));
    for (const word of VOCAB_WORDS) {
      expect(dayIds.has(word.day), `${word.id} is in unknown Day ${word.day}`).toBe(true);
    }
    for (const day of VOCAB_DAYS) {
      // A Day with no words is a dead option in the picker: it starts a quiz
      // with nothing in it.
      expect(wordsForDay(day.id).length, `Day ${day.id} has no words`).toBeGreaterThan(0);
    }
  });

  it('makes synonym references mutual and resolvable', () => {
    // The quiz refuses a distractor that is a synonym of the answer. A one-sided
    // reference means the rule only fires when the question happens to be asked
    // from one of the two sides -- and from the other, the reader is shown two
    // correct answers and marked wrong for picking one.
    for (const word of VOCAB_WORDS) {
      for (const id of word.synonymIds ?? []) {
        const other = wordById(id);
        expect(other, `${word.id} names unknown synonym ${id}`).toBeDefined();
        expect(
          other?.synonymIds?.includes(word.id),
          `${id} does not name ${word.id} back`,
        ).toBe(true);
      }
    }
  });

  it('declares a synonym for every pair that shares a Japanese meaning', () => {
    // The book prints three such pairs (541/542, 553/560, 557/559). This is the
    // assertion that would fail if a FOURTH arrived from a later Day and nobody
    // noticed: two words with the same `ja` are two correct answers to the same
    // ja_to_en prompt, and the quiz has to be told so.
    const byJa = new Map<string, string[]>();
    for (const word of VOCAB_WORDS) {
      byJa.set(word.ja, [...(byJa.get(word.ja) ?? []), word.id]);
    }

    for (const [ja, ids] of byJa) {
      if (ids.length === 1) continue;
      for (const id of ids) {
        const others = ids.filter((other) => other !== id);
        expect(
          others.every((other) => wordById(id)?.synonymIds?.includes(other)),
          `「${ja}」 is shared by ${ids.join(', ')} but they are not declared synonyms`,
        ).toBe(true);
      }
    }
  });

  it('keeps the English of every entry distinct', () => {
    // Unlike `ja`, two identical `en` values would be an outright transcription
    // mistake: the book has no two entries with the same headword.
    const en = VOCAB_WORDS.map((w) => w.en);
    expect(new Set(en).size).toBe(en.length);
  });

  it('resolves a known id and refuses an unknown one', () => {
    expect(wordById('et-481')?.en).toBe('come from');
    // Rows written against a word the book no longer carries have to resolve to
    // undefined rather than throwing: the study record outlives the content.
    expect(wordById('et-999')).toBeUndefined();
  });
});
