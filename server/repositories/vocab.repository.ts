import type { PoolClient } from '../db/pool';
import type { VocabAttemptInput, VocabProgress, VocabWordStat } from '../../shared/types';
import { QUIZ_DIRECTIONS, type QuizDirection } from '../../shared/vocabulary/types';

// ---------------------------------------------------------------------------
// The study record.
//
// LIKE EVERY OTHER REPOSITORY HERE, THE READS CARRY NO TENANT PREDICATE.
//
// There is no `WHERE user_id = $1` below, and that is deliberate for exactly the
// reason set out in repositories/index.ts: the predicate belongs to the
// row-level security policy (migration 006), and writing it out again here would
// mean the policy is never exercised -- every query would pass whether or not it
// was doing anything, and the day someone disables it nothing would fail until
// one person's answers showed up in the other's accuracy.
//
// INSERTs are different: `user_id` is NOT NULL, so a value has to be supplied.
// It comes from the same `userId` that stamped the transaction (see
// withUserRepositories), so the two cannot disagree, and the policy's WITH CHECK
// rejects the row if they somehow did.
// ---------------------------------------------------------------------------

export interface VocabRepository {
  /** Every answered (word, direction), folded to counts. */
  getProgress(): Promise<VocabProgress>;
  /** Appends a finished run, in the order given, and returns the new progress. */
  record(attempts: readonly VocabAttemptInput[]): Promise<VocabProgress>;
  /** Deletes this person's answers for one Day, or all of them when null. */
  reset(wordIds: readonly string[] | null): Promise<VocabProgress>;
}

interface ProgressRow {
  word_id: string;
  direction: string;
  /** COUNT() is BIGINT, which node-postgres hands back as a string. */
  attempts: string;
  correct: string;
  last_correct: boolean;
  /**
   * ALREADY AN ISO STRING, not a Date.
   *
   * server/db/pool.ts registers a TIMESTAMPTZ parser that converts on the way
   * out, so every timestamp in this codebase arrives in the shape the contract
   * wants. Typing this as `Date` and calling `.toISOString()` on it is a
   * runtime TypeError that the compiler cannot see, because the row type is a
   * claim about untyped driver output rather than something it can check.
   */
  last_answered_at: string;
}

/**
 * One row per (word, direction).
 *
 * `ORDER BY answered_at DESC, id DESC` inside the aggregate is NOT decoration.
 * `answered_at` defaults to now(), which in PostgreSQL is TRANSACTION start
 * time, so every answer of one submitted quiz shares a timestamp -- ordering by
 * it alone leaves "the most recent answer" undefined within a run. The identity
 * column is monotonic in insert order, and the repository inserts in the order
 * the client sent (which is the order the questions were answered), so this
 * ordering is total and picks the answer the reader actually gave last.
 *
 * COUNT(*) and friends come back as strings from node-postgres (BIGINT does not
 * fit a JS number in general), so every count is parsed below rather than being
 * shipped as a string that the client would happily concatenate.
 */
const PROGRESS_SQL = `
  SELECT word_id,
         direction,
         COUNT(*)                                                    AS attempts,
         COUNT(*) FILTER (WHERE correct)                             AS correct,
         (ARRAY_AGG(correct ORDER BY answered_at DESC, id DESC))[1]  AS last_correct,
         MAX(answered_at)                                            AS last_answered_at
    FROM vocab_attempts
   GROUP BY word_id, direction
`;

/** A direction value the database holds but this build does not know about. */
const isKnownDirection = (value: string): value is QuizDirection =>
  (QUIZ_DIRECTIONS as readonly string[]).includes(value);

function rowsToProgress(rows: readonly ProgressRow[]): VocabProgress {
  const byWord = new Map<string, VocabWordStat>();

  for (const row of rows) {
    // A direction added by a NEWER build and read back by an older one. The
    // CHECK constraint keeps the set small, but "the deploy that added it is
    // rolled back" is a real sequence, and a stat keyed by a direction this
    // build has no slot for would either throw or land on `undefined`.
    // Dropping it is the honest answer: the counts it holds are for a question
    // shape this build cannot ask.
    if (!isKnownDirection(row.direction)) continue;

    let stat = byWord.get(row.word_id);
    if (!stat) {
      stat = {
        wordId: row.word_id,
        byDirection: {
          en_to_ja: { attempts: 0, correct: 0, lastCorrect: null, lastAnsweredAt: null },
          ja_to_en: { attempts: 0, correct: 0, lastCorrect: null, lastAnsweredAt: null },
        },
      };
      byWord.set(row.word_id, stat);
    }

    stat.byDirection[row.direction] = {
      attempts: Number(row.attempts),
      correct: Number(row.correct),
      lastCorrect: row.last_correct,
      lastAnsweredAt: row.last_answered_at,
    };
  }

  // Sorted so the payload is stable between identical requests, which is what
  // lets a test compare whole responses and stops a re-render from reordering a
  // list the screen renders in receipt order.
  return [...byWord.values()].sort((a, b) => a.wordId.localeCompare(b.wordId));
}

export function createVocabRepository(client: PoolClient, userId: number): VocabRepository {
  const progress = async (): Promise<VocabProgress> => {
    const { rows } = await client.query<ProgressRow>(PROGRESS_SQL);
    return rowsToProgress(rows);
  };

  return {
    getProgress: progress,

    /**
     * Inserts the whole run in ONE statement, preserving order.
     *
     * `unnest` over three arrays rather than a loop of INSERTs: the run is up to
     * sixteen answers and a round trip each on a phone is the difference between
     * a record that saves and one that does not. Order is preserved because
     * `unnest` of parallel arrays yields rows in array order, which is what
     * makes the identity column a usable tie-break for "most recent".
     */
    async record(attempts) {
      if (attempts.length > 0) {
        await client.query(
          `INSERT INTO vocab_attempts (user_id, word_id, direction, correct)
             SELECT $1, w, d, c
               FROM unnest($2::text[], $3::text[], $4::boolean[]) AS t(w, d, c)`,
          [
            userId,
            attempts.map((a) => a.wordId),
            attempts.map((a) => a.direction),
            attempts.map((a) => a.correct),
          ],
        );
      }
      return progress();
    },

    /**
     * `wordIds === null` clears everything; a list clears just those words.
     *
     * The caller resolves a Day to its word ids rather than passing the Day
     * number, because the Day a word belongs to is a fact about the BOOK
     * (shared/vocabulary), not about the database -- storing it in the row would
     * be a second copy that goes stale the moment the book is re-sectioned.
     *
     * An EMPTY list deletes nothing, and that is the correct reading: "reset the
     * words of a Day that has none" is a no-op, not "reset everything". Getting
     * this backwards would wipe a whole study record from a mis-typed `?day=`.
     */
    async reset(wordIds) {
      if (wordIds === null) {
        await client.query('DELETE FROM vocab_attempts');
      } else if (wordIds.length > 0) {
        await client.query('DELETE FROM vocab_attempts WHERE word_id = ANY($1::text[])', [
          wordIds,
        ]);
      }
      return progress();
    },
  };
}
