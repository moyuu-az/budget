import type { PoolClient } from '../db/pool';
import type { MonthlyAmount } from '../../shared/types';
import type { MonthlyAmountRow } from './row-types';
import { rowToMonthlyAmount } from '../mappers';
import { lockOccurringIds, lockRecurrence, mayHoldAmount } from './occurrence-guard';
import { ForbiddenError, ValidationError } from '../http/errors';

export interface MonthlyAmountRepository {
  getForMonth(yearMonth: string): Promise<MonthlyAmount[]>;
  getForRange(startMonth: string, endMonth: string): Promise<MonthlyAmount[]>;
  set(templateId: number, yearMonth: string, amount: number): Promise<void>;
  remove(templateId: number, yearMonth: string): Promise<void>;
  copyMonth(fromMonth: string, toMonth: string): Promise<void>;
}

export function createMonthlyAmountRepository(
  client: PoolClient,
  ledgerId: number,
): MonthlyAmountRepository {
  return {
    async getForMonth(yearMonth) {
      const { rows } = await client.query<MonthlyAmountRow>(
        'SELECT * FROM monthly_amounts WHERE year_month = $1',
        [yearMonth],
      );
      return rows.map(rowToMonthlyAmount);
    },

    async getForRange(startMonth, endMonth) {
      const { rows } = await client.query<MonthlyAmountRow>(
        'SELECT * FROM monthly_amounts WHERE year_month >= $1 AND year_month <= $2',
        [startMonth, endMonth],
      );
      return rows.map(rowToMonthlyAmount);
    },

    // Upsert. Returns void: the renderer discards the row (no wasteful re-SELECT).
    //
    // The conflict target is (template_id, year_month) with no ledger_id, and
    // that is correct rather than an oversight -- template_id already determines
    // the ledger, so the key is transitively scoped.
    async set(templateId, yearMonth, amount) {
      // The entry must actually occur in that month. An override that does not
      // is invisible -- no screen shows it, no total reads it -- and it comes
      // back the day the recurrence changes to cover that month, silently
      // beating the default the household expects.
      //
      // Checked against the row under a lock rather than against anything the
      // caller said, and the lock is what stops this from racing a concurrent
      // recurrence change: see occurrence-guard.ts.
      const recurrence = await lockRecurrence(client, templateId);
      if (recurrence === null) {
        // FORBIDDEN, not NOT_FOUND, and the two are the same answer on purpose.
        //
        // Row-level security makes "no such entry" and "not yours" identical
        // from here: the row simply is not visible. Answering NOT_FOUND for one
        // and FORBIDDEN for the other would let a caller probe which ids exist
        // in someone else's ledger -- and it is the same reasoning
        // resolveLedgerId already applies to ledger ids.
        //
        // It is also the status this path returned BEFORE this guard existed
        // (RLS raised 42501 on the upsert), so nothing on the wire changed.
        throw new ForbiddenError('この項目を編集する権限がありません');
      }
      if (!mayHoldAmount(recurrence, yearMonth)) {
        throw new ValidationError('この項目はその月には発生しないため、金額を設定できません');
      }

      await client.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (template_id, year_month) DO UPDATE SET amount = excluded.amount`,
        [ledgerId, templateId, yearMonth, amount],
      );
    },

    async remove(templateId, yearMonth) {
      await client.query(
        'DELETE FROM monthly_amounts WHERE template_id = $1 AND year_month = $2',
        [templateId, yearMonth],
      );
    },

    /**
     * Copies the named entries' amounts from one month into another, leaving
     * existing target rows alone (DO NOTHING preserves what is already there).
     *
     * ONLY the entries that occur in the TARGET month, decided HERE from the
     * rows themselves rather than from anything the caller sent. Copying the
     * rest would store overrides for months their entries skip: invisible on
     * every screen, and silently in force the day the recurrence changes to
     * cover that month.
     *
     * An earlier version took the id list as an argument, which looked like it
     * kept the occurrence rule in one place and actually moved the ENFORCEMENT
     * to the client -- where a stale tab or another member's concurrent edit
     * makes the list wrong. The rule still lives in shared/recurrence.ts; the
     * server imports it. See occurrence-guard.ts.
     *
     * This is a single INSERT ... SELECT rather than the old read-then-loop.
     * Besides being one round trip instead of N, it means the source rows are
     * read and written under the same snapshot, so a concurrent edit cannot land
     * between the read and the write -- which matters now that two people can be
     * in the same ledger at once.
     *
     * The SELECT has no ledger predicate because row-level security supplies it,
     * and the inserted ledger_id is this repository's own -- so a row can only
     * ever be copied within one ledger.
     */
    async copyMonth(fromMonth, toMonth) {
      const templateIds = await lockOccurringIds(client, toMonth);
      // Nothing occurs in the target month. `= ANY('{}')` is false for every
      // row, so the statement would be a no-op anyway -- returning early keeps a
      // query log from suggesting otherwise.
      if (templateIds.length === 0) return;

      await client.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
           SELECT $1, template_id, $3, amount
             FROM monthly_amounts
            WHERE year_month = $2 AND template_id = ANY($4::BIGINT[])
         ON CONFLICT (template_id, year_month) DO NOTHING`,
        [ledgerId, fromMonth, toMonth, templateIds],
      );
    },
  };
}
