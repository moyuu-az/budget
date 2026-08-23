import pg from 'pg';

// ---------------------------------------------------------------------------
// Type parsers
//
// node-postgres decodes some types into shapes the API contract in
// shared/types.ts does not use. Registering the parsers here -- once, at module
// load, before any Pool is created -- keeps every repository free of casting
// and keeps mappers.ts the only place that renames columns.
//
// These are process-global in node-postgres. That is acceptable because this
// process talks to exactly one database with one schema.
// ---------------------------------------------------------------------------

// NUMERIC -> number.
//
// The default is a string, to protect arbitrary-precision values. Our money
// columns are NUMERIC(14,2), whose largest magnitude is 999999999999.99 (~1e12)
// -- three orders of magnitude below Number.MAX_SAFE_INTEGER (~9e15) -- so the
// round trip is lossless and the contract can keep using `number`.
//
// The reason money is NUMERIC rather than the old REAL is that PostgreSQL then
// does the *arithmetic* exactly; storing and summing no longer drifts.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

// BIGINT (int8) -> number. Identity columns for a two-person household will not
// approach 2^53. If that ever changes, the contract's `id: number` is the thing
// that has to change first, so failing here is not a silent risk.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

// DATE -> the raw 'YYYY-MM-DD' string. The default builds a JS Date at local
// midnight, which shifts the calendar day for anyone east or west of UTC --
// a snapshot saved on the 1st can come back as the 31st. The contract wants a
// plain date string, so hand it through untouched.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

// TIMESTAMPTZ -> ISO 8601 string, matching what the renderer already produces
// for optimistic updates (`new Date().toISOString()`).
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) =>
  new Date(value).toISOString(),
);

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export interface PoolOptions {
  connectionString: string;
  /** Cloud SQL's connector terminates TLS for us; local docker/dev has none. */
  ssl?: boolean;
  max?: number;
}

export function createPool({ connectionString, ssl = false, max = 5 }: PoolOptions): Pool {
  return new pg.Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max,
    // A Cloud Run instance that has been idle still holds pooled sockets that
    // Cloud SQL may have already dropped; recycle them rather than hand a dead
    // socket to the next request.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
