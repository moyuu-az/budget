import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, resetDb, createLedger, raw, type TestDb } from '../test/pg';
import { withLedgerRepositories, type Repositories } from './index';
import { buildSetClause } from './sql';

// ---------------------------------------------------------------------------
// Repository behaviour against a real PostgreSQL.
//
// Every test that involves two ledgers is really asking the same question: can
// one household's action reach the other's data? The answer has to stay "no"
// even for the operations that never mention a ledger -- ordering, upserts,
// bulk copies -- because those are where an implicit global scope would hide.
// ---------------------------------------------------------------------------

let db: TestDb;
let householdId: number;
let privateId: number;

/** Runs `fn` with repositories bound to the household ledger. */
const inHousehold = <T>(fn: (r: Repositories) => Promise<T>): Promise<T> =>
  withLedgerRepositories(db.pool, householdId, fn);

/** Runs `fn` with repositories bound to the private ledger. */
const inPrivate = <T>(fn: (r: Repositories) => Promise<T>): Promise<T> =>
  withLedgerRepositories(db.pool, privateId, fn);

beforeAll(async () => {
  db = await startTestDb();
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  await resetDb(db.adminPool);
  householdId = await createLedger(db.adminPool, 'household', 'shared');
  privateId = await createLedger(db.adminPool, 'private', 'personal');
});

describe('buildSetClause', () => {
  // Named so the generic binds to the whole shape. With an inline literal T
  // would be inferred from the patch alone, and `columns` would then reject any
  // field the patch happened not to mention.
  interface Patch { name: string; color: string | null }
  const COLUMNS: Partial<Record<keyof Patch, string>> = { name: 'name', color: 'color' };

  it('skips fields that were not supplied', () => {
    const { sets, params } = buildSetClause<Patch>({ name: 'x' }, COLUMNS);
    expect(sets).toEqual(['name = $1']);
    expect(params).toEqual(['x']);
  });

  it('treats null as a value to write, not as absence', () => {
    // Clearing a colour and detaching a category both travel as null. Folding
    // null in with undefined would silently drop those edits.
    const { sets, params } = buildSetClause<Patch>({ color: null }, COLUMNS);
    expect(sets).toEqual(['color = $1']);
    expect(params).toEqual([null]);
  });

  it('numbers placeholders from the given offset', () => {
    const { sets } = buildSetClause<Patch>({ name: 'x', color: 'y' }, COLUMNS, 3);
    expect(sets).toEqual(['name = $3', 'color = $4']);
  });

  it('produces nothing for an empty patch', () => {
    expect(buildSetClause<Patch>({}, COLUMNS)).toEqual({ sets: [], params: [] });
  });
});

describe('settings repository', () => {
  it('reports zero for a ledger that has never set a balance', async () => {
    expect(await inHousehold((r) => r.settings.getBalance())).toBe(0);
  });

  it('round-trips a balance', async () => {
    await inHousehold((r) => r.settings.setBalance(1_525_210));
    expect(await inHousehold((r) => r.settings.getBalance())).toBe(1_525_210);
  });

  it('keeps each ledger on its own balance', async () => {
    await inHousehold((r) => r.settings.setBalance(1_000_000));
    await inPrivate((r) => r.settings.setBalance(50_000));

    expect(await inHousehold((r) => r.settings.getBalance())).toBe(1_000_000);
    expect(await inPrivate((r) => r.settings.getBalance())).toBe(50_000);
  });

  it('overwrites rather than accumulating rows', async () => {
    await inHousehold((r) => r.settings.setBalance(1));
    await inHousehold((r) => r.settings.setBalance(2));
    expect(await raw(db.adminPool, 'SELECT 1 FROM settings')).toHaveLength(1);
  });
});

describe('category repository', () => {
  it('orders by type then sort order', async () => {
    await inHousehold(async (r) => {
      await r.category.add({ name: 'salary', type: 'income' });
      await r.category.add({ name: 'rent', type: 'expense' });
      await r.category.add({ name: 'food', type: 'expense' });
    });

    const names = (await inHousehold((r) => r.category.getAll())).map((c) => c.name);
    expect(names).toEqual(['rent', 'food', 'salary']);
  });

  it('numbers sort_order per ledger, not globally', async () => {
    // MAX(sort_order) is computed under row-level security. If the scope ever
    // stopped applying, the private ledger's first category would start at the
    // household's next number -- a quiet symptom of a serious leak.
    await inHousehold(async (r) => {
      await r.category.add({ name: 'a', type: 'expense' });
      await r.category.add({ name: 'b', type: 'expense' });
    });

    const first = await inPrivate((r) => r.category.add({ name: 'mine', type: 'expense' }));
    expect(first.sortOrder).toBe(0);
  });

  it('honours an explicit sort order', async () => {
    const created = await inHousehold((r) =>
      r.category.add({ name: 'a', type: 'expense', sortOrder: 42 }),
    );
    expect(created.sortOrder).toBe(42);
  });

  it('applies a partial update and leaves the rest alone', async () => {
    const created = await inHousehold((r) =>
      r.category.add({ name: 'old', type: 'expense', color: '#fff' }),
    );
    await inHousehold((r) => r.category.update(created.id, { name: 'new' }));

    const [after] = await inHousehold((r) => r.category.getAll());
    expect(after.name).toBe('new');
    expect(after.color).toBe('#fff');
  });

  it('can clear a colour with null', async () => {
    const created = await inHousehold((r) =>
      r.category.add({ name: 'a', type: 'expense', color: '#fff' }),
    );
    await inHousehold((r) => r.category.update(created.id, { color: null }));

    const [after] = await inHousehold((r) => r.category.getAll());
    expect(after.color).toBeNull();
  });

  it('does nothing for an empty patch', async () => {
    const created = await inHousehold((r) => r.category.add({ name: 'a', type: 'expense' }));
    await expect(inHousehold((r) => r.category.update(created.id, {}))).resolves.toBeUndefined();

    const [after] = await inHousehold((r) => r.category.getAll());
    expect(after.name).toBe('a');
  });

  it('cannot update a category in another ledger', async () => {
    const mine = await inPrivate((r) => r.category.add({ name: 'private', type: 'expense' }));
    await inHousehold((r) => r.category.update(mine.id, { name: 'hijacked' }));

    const [after] = await inPrivate((r) => r.category.getAll());
    expect(after.name).toBe('private');
  });

  it('cannot delete a category in another ledger', async () => {
    const mine = await inPrivate((r) => r.category.add({ name: 'private', type: 'expense' }));
    await inHousehold((r) => r.category.remove(mine.id));

    expect(await inPrivate((r) => r.category.getAll())).toHaveLength(1);
  });

  it('leaves templates uncategorised when their category is deleted', async () => {
    const { categoryId, templateId } = await inHousehold(async (r) => {
      const category = await r.category.add({ name: 'doomed', type: 'expense' });
      const template = await r.template.add({
        name: 't', dayOfMonth: 1, type: 'expense', categoryId: category.id,
      });
      return { categoryId: category.id, templateId: template.id };
    });

    await inHousehold((r) => r.category.remove(categoryId));

    const [template] = await inHousehold((r) => r.template.getAll());
    expect(template.id).toBe(templateId);
    expect(template.categoryId).toBeNull();
  });
});

describe('template repository', () => {
  it('round-trips every field', async () => {
    const created = await inHousehold(async (r) => {
      const category = await r.category.add({ name: 'rent', type: 'expense' });
      return r.template.add({
        name: 'Rent', dayOfMonth: 27, type: 'expense',
        categoryId: category.id, defaultAmount: 375_000,
      });
    });

    expect(created).toMatchObject({
      name: 'Rent', dayOfMonth: 27, type: 'expense',
      defaultAmount: 375_000, enabled: true, sortOrder: 0,
    });
    // BOOLEAN column, not the SQLite 0/1 integer the mapper used to convert.
    expect(typeof created.enabled).toBe('boolean');
  });

  it('defaults the amount to zero', async () => {
    const created = await inHousehold((r) =>
      r.template.add({ name: 't', dayOfMonth: 1, type: 'expense' }),
    );
    expect(created.defaultAmount).toBe(0);
    expect(created.categoryId).toBeNull();
  });

  it('refuses a category from another ledger', async () => {
    const foreign = await inPrivate((r) => r.category.add({ name: 'private', type: 'expense' }));

    await expect(
      inHousehold((r) =>
        r.template.add({ name: 'leaky', dayOfMonth: 1, type: 'expense', categoryId: foreign.id }),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('touches updated_at on update but not on a no-op patch', async () => {
    const created = await inHousehold((r) =>
      r.template.add({ name: 't', dayOfMonth: 1, type: 'expense' }),
    );

    await inHousehold((r) => r.template.update(created.id, {}));
    const [unchanged] = await inHousehold((r) => r.template.getAll());
    expect(unchanged.updatedAt).toBe(created.updatedAt);

    await inHousehold((r) => r.template.update(created.id, { name: 'renamed' }));
    const [changed] = await inHousehold((r) => r.template.getAll());
    expect(changed.name).toBe('renamed');
    expect(Date.parse(changed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it('toggles enabled', async () => {
    const created = await inHousehold((r) =>
      r.template.add({ name: 't', dayOfMonth: 1, type: 'expense' }),
    );
    await inHousehold((r) => r.template.toggle(created.id, false));

    const [after] = await inHousehold((r) => r.template.getAll());
    expect(after.enabled).toBe(false);
  });

  it('cannot toggle a template in another ledger', async () => {
    const mine = await inPrivate((r) =>
      r.template.add({ name: 'mine', dayOfMonth: 1, type: 'expense' }),
    );
    await inHousehold((r) => r.template.toggle(mine.id, false));

    const [after] = await inPrivate((r) => r.template.getAll());
    expect(after.enabled).toBe(true);
  });

  it('takes its planned and actual amounts with it when deleted', async () => {
    const templateId = await inHousehold(async (r) => {
      const t = await r.template.add({ name: 't', dayOfMonth: 1, type: 'expense' });
      await r.monthlyAmount.set(t.id, '2026-01', 100);
      await r.monthlyActual.set(t.id, '2026-01', 90);
      return t.id;
    });

    await inHousehold((r) => r.template.remove(templateId));

    expect(await raw(db.adminPool, 'SELECT 1 FROM monthly_amounts')).toHaveLength(0);
    expect(await raw(db.adminPool, 'SELECT 1 FROM monthly_actuals')).toHaveLength(0);
  });
});

describe('monthly amount repository', () => {
  async function seedTemplate(scope: typeof inHousehold, name = 't'): Promise<number> {
    const created = await scope((r) => r.template.add({ name, dayOfMonth: 1, type: 'expense' }));
    return created.id;
  }

  it('upserts rather than duplicating', async () => {
    const templateId = await seedTemplate(inHousehold);
    await inHousehold((r) => r.monthlyAmount.set(templateId, '2026-01', 100));
    await inHousehold((r) => r.monthlyAmount.set(templateId, '2026-01', 250));

    const rows = await inHousehold((r) => r.monthlyAmount.getForMonth('2026-01'));
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(250);
  });

  it('filters by month and by range', async () => {
    const templateId = await seedTemplate(inHousehold);
    await inHousehold(async (r) => {
      await r.monthlyAmount.set(templateId, '2026-01', 1);
      await r.monthlyAmount.set(templateId, '2026-02', 2);
      await r.monthlyAmount.set(templateId, '2026-03', 3);
    });

    expect(await inHousehold((r) => r.monthlyAmount.getForMonth('2026-02'))).toHaveLength(1);
    const range = await inHousehold((r) => r.monthlyAmount.getForRange('2026-01', '2026-02'));
    expect(range.map((a) => a.amount).sort()).toEqual([1, 2]);
  });

  it('sees only its own ledger, even with no month filter in play', async () => {
    const mine = await seedTemplate(inHousehold, 'household');
    const theirs = await seedTemplate(inPrivate, 'private');
    await inHousehold((r) => r.monthlyAmount.set(mine, '2026-01', 100));
    await inPrivate((r) => r.monthlyAmount.set(theirs, '2026-01', 999));

    const householdRows = await inHousehold((r) => r.monthlyAmount.getForMonth('2026-01'));
    expect(householdRows.map((a) => a.amount)).toEqual([100]);
  });

  it('copies a month, preserving amounts already in the target', async () => {
    const [a, b] = await inHousehold(async (r) => {
      const first = await r.template.add({ name: 'a', dayOfMonth: 1, type: 'expense' });
      const second = await r.template.add({ name: 'b', dayOfMonth: 2, type: 'expense' });
      await r.monthlyAmount.set(first.id, '2026-01', 100);
      await r.monthlyAmount.set(second.id, '2026-01', 200);
      // Already set in the target month: the copy must not clobber it.
      await r.monthlyAmount.set(second.id, '2026-02', 999);
      return [first.id, second.id];
    });

    await inHousehold((r) => r.monthlyAmount.copyMonth('2026-01', '2026-02'));

    const target = await inHousehold((r) => r.monthlyAmount.getForMonth('2026-02'));
    expect(
      Object.fromEntries(target.map((row) => [row.templateId, row.amount])),
    ).toEqual({ [a]: 100, [b]: 999 });
  });

  it('never copies another ledger\'s month into its own', async () => {
    // copyMonth is an INSERT ... SELECT with no ledger predicate on the SELECT.
    // If row-level security were not doing its job, this is where the other
    // household's figures would silently appear.
    const mine = await seedTemplate(inHousehold, 'household');
    const theirs = await seedTemplate(inPrivate, 'private');
    await inHousehold((r) => r.monthlyAmount.set(mine, '2026-01', 100));
    await inPrivate((r) => r.monthlyAmount.set(theirs, '2026-01', 999));

    await inHousehold((r) => r.monthlyAmount.copyMonth('2026-01', '2026-02'));

    const copied = await inHousehold((r) => r.monthlyAmount.getForMonth('2026-02'));
    expect(copied).toHaveLength(1);
    expect(copied[0].amount).toBe(100);
    expect(await inPrivate((r) => r.monthlyAmount.getForMonth('2026-02'))).toHaveLength(0);
  });

  it('removes one template-month pair', async () => {
    const templateId = await seedTemplate(inHousehold);
    await inHousehold(async (r) => {
      await r.monthlyAmount.set(templateId, '2026-01', 1);
      await r.monthlyAmount.set(templateId, '2026-02', 2);
      await r.monthlyAmount.remove(templateId, '2026-01');
    });

    const remaining = await inHousehold((r) => r.monthlyAmount.getForRange('2026-01', '2026-12'));
    expect(remaining.map((a) => a.yearMonth)).toEqual(['2026-02']);
  });
});

describe('monthly actual repository', () => {
  it('upserts and reads back a range in month order', async () => {
    const templateId = await inHousehold(async (r) => {
      const t = await r.template.add({ name: 't', dayOfMonth: 1, type: 'expense' });
      await r.monthlyActual.set(t.id, '2026-03', 30);
      await r.monthlyActual.set(t.id, '2026-01', 10);
      await r.monthlyActual.set(t.id, '2026-01', 15);
      return t.id;
    });

    const range = await inHousehold((r) => r.monthlyActual.getForRange('2026-01', '2026-12'));
    expect(range.map((a) => [a.yearMonth, a.actualAmount])).toEqual([
      ['2026-01', 15],
      ['2026-03', 30],
    ]);
    expect(range.every((a) => a.templateId === templateId)).toBe(true);
  });

  it('stays inside its ledger', async () => {
    const mine = await inHousehold((r) => r.template.add({ name: 'a', dayOfMonth: 1, type: 'expense' }));
    const theirs = await inPrivate((r) => r.template.add({ name: 'b', dayOfMonth: 1, type: 'expense' }));
    await inHousehold((r) => r.monthlyActual.set(mine.id, '2026-01', 10));
    await inPrivate((r) => r.monthlyActual.set(theirs.id, '2026-01', 99));

    expect(await inHousehold((r) => r.monthlyActual.getForMonth('2026-01'))).toHaveLength(1);
    expect(await inPrivate((r) => r.monthlyActual.getForMonth('2026-01'))).toHaveLength(1);
  });
});

describe('snapshot repository', () => {
  it('lists newest first', async () => {
    await inHousehold(async (r) => {
      await r.snapshot.add('2026-01-01', 100);
      await r.snapshot.add('2026-03-01', 300);
      await r.snapshot.add('2026-02-01', 200);
    });

    const dates = (await inHousehold((r) => r.snapshot.getAll())).map((s) => s.date);
    expect(dates).toEqual(['2026-03-01', '2026-02-01', '2026-01-01']);
  });

  it('upserts by date within the ledger', async () => {
    await inHousehold((r) => r.snapshot.add('2026-01-01', 100));
    const updated = await inHousehold((r) => r.snapshot.add('2026-01-01', 250));

    expect(updated.balance).toBe(250);
    expect(await inHousehold((r) => r.snapshot.getAll())).toHaveLength(1);
  });

  it('does NOT overwrite another ledger\'s snapshot for the same day', async () => {
    // The regression this whole schema change exists to prevent: with the old
    // `ON CONFLICT (date)` against a shared database, the second call would have
    // rewritten the household's balance.
    await inHousehold((r) => r.snapshot.add('2026-01-01', 1_000_000));
    await inPrivate((r) => r.snapshot.add('2026-01-01', 50_000));

    expect((await inHousehold((r) => r.snapshot.getAll()))[0].balance).toBe(1_000_000);
    expect((await inPrivate((r) => r.snapshot.getAll()))[0].balance).toBe(50_000);
  });

  it('filters a date range inclusively, ascending', async () => {
    await inHousehold(async (r) => {
      await r.snapshot.add('2026-01-01', 1);
      await r.snapshot.add('2026-02-01', 2);
      await r.snapshot.add('2026-03-01', 3);
    });

    const range = await inHousehold((r) => r.snapshot.getForRange('2026-01-01', '2026-02-01'));
    expect(range.map((s) => s.date)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('returns dates as plain strings, not zone-shifted Dates', async () => {
    const created = await inHousehold((r) => r.snapshot.add('2026-01-01', 1));
    expect(created.date).toBe('2026-01-01');
  });

  it('cannot delete another ledger\'s snapshot', async () => {
    const theirs = await inPrivate((r) => r.snapshot.add('2026-01-01', 50_000));
    await inHousehold((r) => r.snapshot.remove(theirs.id));

    expect(await inPrivate((r) => r.snapshot.getAll())).toHaveLength(1);
  });
});

describe('transaction behaviour', () => {
  it('rolls the whole unit of work back when a handler throws', async () => {
    // Every request runs inside one transaction, so a failure part way through
    // a multi-step operation cannot leave half of it behind.
    await expect(
      inHousehold(async (r) => {
        await r.category.add({ name: 'orphan', type: 'expense' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await raw(db.adminPool, 'SELECT 1 FROM categories')).toHaveLength(0);
  });

  it('does not let one ledger\'s scope bleed into the next call', async () => {
    await inHousehold((r) => r.category.add({ name: 'household', type: 'expense' }));
    // Runs on a recycled pooled connection; the previous scope must be gone.
    expect(await inPrivate((r) => r.category.getAll())).toEqual([]);
  });
});
