import type { PoolClient } from '../db/pool';
import type { VocabAttemptInput, VocabProgress, VocabWordStat } from '../../shared/types';
import { QUIZ_DIRECTIONS, type QuizDirection } from '../../shared/vocabulary/types';

// ---------------------------------------------------------------------------
// The study record.
//
// READS CARRY NO TENANT PREDICATE. DELETES DO. The asymmetry is deliberate, and
// it is about what happens when the policy is NOT there.
//
// THE READS
//   No `WHERE user_id = $1`, for the reason set out in repositories/index.ts:
//   the predicate belongs to the row-level security policy (migration 006), and
//   writing it out again here would mean the policy is never exercised -- every
//   query would pass whether or not it was doing anything. And if the policy
//   were missing, an unqualified SELECT fails CLOSED-ish: the worst outcome is a
//   wrong figure on a screen, recoverable by fixing the policy.
//
// THE DELETES
//   `DELETE FROM vocab_attempts` with no predicate is a different kind of
//   statement. If the policy is missing -- a restore from a database that
//   predates 006, an operator who ran DISABLE ROW LEVEL SECURITY during an
//   incident -- then one person pressing 「記録を消す」 erases EVERY person's
//   study record, with nothing to restore it from. The start-up guard does not
//   save us either: server/db/assert-isolation.ts checks the connecting role's
//   attributes, not whether the tables actually carry policies.
//
//   So the deletes name the user explicitly. This does not weaken the policy --
//   it is still what the reads depend on, and server/db/schema.test.ts proves it
//   works with raw SQL, independently of anything this file does. It only means
//   the one statement whose failure is unrecoverable does not rely on a single
//   layer.
//
// INSERTs are different again: `user_id` is NOT NULL, so a value has to be
// supplied. It comes from the same `userId` that stamped the transaction (see
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
  // COUNT() is BIGINT. node-postgres would hand that back as a STRING, but
  // server/db/pool.ts registers a process-wide INT8 parser that converts it, so
  // these arrive as numbers like every other count in this codebase.
  attempts: number;
  correct: number;
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
      attempts: row.attempts,
      correct: row.correct,
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
     *
     * BOTH STATEMENTS NAME THE USER, unlike the reads above. See the header: a
     * delete that loses its tenant predicate is unrecoverable, and the policy is
     * one incident-response `DISABLE ROW LEVEL SECURITY` away from not being
     * there.
     */
    async reset(wordIds) {
      if (wordIds === null) {
        await client.query('DELETE FROM vocab_attempts WHERE user_id = $1', [userId]);
      } else if (wordIds.length > 0) {
        await client.query(
          'DELETE FROM vocab_attempts WHERE user_id = $1 AND word_id = ANY($2::text[])',
          [userId, wordIds],
        );
      }
      return progress();
    },
  };
}
