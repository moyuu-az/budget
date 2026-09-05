import type { VocabDay } from './types';

// ---------------------------------------------------------------------------
// The Day sections, in the book's order.
//
// The list is the unit the reader picks from, so it is also what `?day=` in the
// address is validated against: a day that is not here is refused rather than
// rendering an empty quiz under a heading nobody wrote.
//
// A Day with no words would be a dead option in the picker, so an integrity
// test asserts that every Day here has words and that every word's `day` is
// listed here. Adding a Day means adding its words in the same change.
// ---------------------------------------------------------------------------

export const VOCAB_DAYS: readonly VocabDay[] = [
  { id: 31, title: '動詞句4', subtitle: '「動詞＋副詞［前置詞］」型4' },
  { id: 32, title: '動詞句5', subtitle: '「動詞＋A＋前置詞＋B」型' },
  { id: 33, title: '動詞句6', subtitle: '「動詞＋to do［doing］」型' },
  { id: 34, title: '動詞句7', subtitle: '「動詞＋A＋to do」「be動詞＋形容詞＋to do」型' },
  { id: 35, title: '動詞句8', subtitle: '「be動詞＋形容詞＋前置詞」型' },
];
