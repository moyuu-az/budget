import type { PoolClient } from '../db/pool';
import type { Recurrence } from '../../shared/types';
import { occursInMonth } from '../../shared/recurrence';
import { rowToTemplate } from '../mappers';
import type { TemplateRow } from './row-types';

// ---------------------------------------------------------------------------
// ONE RULE, ENFORCED IN ONE PLACE:
//
//   A per-month amount may only exist for a month its entry actually occurs in.
//
// WHY THIS FILE EXISTS INSTEAD OF MORE CLEANUP
//   The first three attempts at this were CLEANUPS -- filter what `copyMonth`
//   copies, delete what a recurrence change orphans -- and each one left a
//   different gap, because each one guarded a different write path. Guards
//   multiply; the gaps between them multiply with them.
//
//   The invariant is not "tidy up afterwards". It is "an override that does not
//   occur cannot be written". Stated that way there are exactly two writers
//   (setting an amount, and changing a recurrence), and both go through here.
//
// WHY IT LOCKS
//   The two writers race. Without a lock, an amount save that read the OLD
//   recurrence can commit AFTER a recurrence change has already pruned, leaving
//   precisely the row the prune existed to remove -- and that row is invisible
//   until the recurrence changes back, at which point a figure from months ago
//   silently overrides today's default.
//
//   `FOR UPDATE` on the entry's own row serialises them. It is one lock on one
//   indexed primary key, taken by both writers in ASCENDING ID ORDER (the
//   multi-row case orders explicitly), so there is no cycle to deadlock on.
//
// WHY `FOR NO KEY UPDATE` AND NOT `FOR UPDATE`
//   The two writers must exclude each other, and NO KEY UPDATE conflicts with
//   itself, so they still do. What it does NOT conflict with is `FOR KEY SHARE`
//   -- and that is the lock PostgreSQL takes on this table on behalf of every
//   monthly_amounts and monthly_actuals row that references it through the
//   composite foreign key.
//
//   With `FOR UPDATE`, locking the ledger's whole template list (which
//   copyMonth does) blocked every amount and actual write in that ledger for
//   the duration -- far beyond the two writers this guard is about. Two people
//   in a household would rarely notice; the reason to fix it is that the
//   comment above describes a narrow lock, and it was not one.
//
// WHY THE RECURRENCE IS RE-READ FROM THE DATABASE
//   Never from the caller. A client that says which entries occur is a client
//   that can be wrong -- stale by one edit, or simply another tab. The row under
//   the lock is the only version that is true for the duration of the write.
// ---------------------------------------------------------------------------

/**
 * Reads one entry's recurrence and holds its row until the transaction ends.
 *
 * Returns null when there is no such entry IN THIS LEDGER -- row-level security
 * makes "someone else's" and "nonexistent" the same answer, which is the answer
 * the caller wants either way.
 */
export async function lockRecurrence(
  client: PoolClient,
  templateId: number,
): Promise<Recurrence | null> {
  const { rows } = await client.query<TemplateRow>(
    'SELECT * FROM entry_templates WHERE id = $1 FOR NO KEY UPDATE',
    [templateId],
  );
  return rows.length === 0 ? null : rowToTemplate(rows[0]).recurrence;
}

/**
 * Reads every entry in the ledger, holding all their rows, and returns the ids
 * of the ones that occur in `yearMonth`.
 *
 * ORDER BY id is not cosmetic: it is what stops this from deadlocking against a
 * concurrent single-row lock taken by `lockRecurrence`. Two transactions taking
 * the same locks in the same order can wait, but cannot wait on each other.
 */
export async function lockOccurringIds(
  client: PoolClient,
  yearMonth: string,
): Promise<number[]> {
  const { rows } = await client.query<TemplateRow>(
    'SELECT * FROM entry_templates ORDER BY id FOR NO KEY UPDATE',
  );
  return rows
    .filter((row) => occursInMonth(rowToTemplate(row).recurrence, yearMonth))
    .map((row) => row.id);
}

/** Whether an override for `yearMonth` is meaningful for this recurrence. */
export function mayHoldAmount(recurrence: Recurrence, yearMonth: string): boolean {
  return occursInMonth(recurrence, yearMonth);
}
