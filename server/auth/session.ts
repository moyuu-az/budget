import type { Pool, PoolClient } from '../db/pool';
import { withTransaction } from '../db/ledger-scope';
import { ForbiddenError } from '../http/errors';
import type { AuthenticatedUser, Ledger, Session } from '../../shared/types';
import type { VerifiedIdentity } from './identity';

// ---------------------------------------------------------------------------
// Turning a verified Google identity into a session.
//
// Accounts are provisioned just in time, on first successful sign-in. Nothing in
// this repository names a real person: the allow list is configuration, and the
// Google subject identifier only exists once someone has actually signed in.
// ---------------------------------------------------------------------------

/** Slug of the ledger both members share. Created on demand, once. */
const SHARED_LEDGER_SLUG = 'shared';

export interface SessionServiceOptions {
  /**
   * Email addresses permitted to create an account, lower-cased on load.
   *
   * This is the SECOND gate, not the first. IAP's IAM policy decides who may
   * reach this service at all; anyone it turns away never gets here. This list
   * exists so that a misconfigured IAP policy does not silently hand the
   * household's finances to whoever it let through.
   *
   * IT IS ALSO NOT A REVOCATION MECHANISM. It is consulted only when an account
   * does not yet exist -- an established user is recognised by their Google
   * subject id and is let in regardless of what this list says. That is
   * deliberate: matching on email would lock someone out of their own data the
   * day they change their Google address. To remove someone's access, remove
   * them from the IAP IAM policy.
   */
  allowedEmails: readonly string[];
  /** Display name for the shared ledger, e.g. '家計'. */
  sharedLedgerName: string;
}

export interface SessionService {
  /** Resolves (provisioning on first sight) the caller's session. */
  resolve(identity: VerifiedIdentity): Promise<Session>;
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
}

interface LedgerRow {
  id: number;
  slug: string;
  name: string;
  kind: 'shared' | 'personal';
}

/** IAP assertions carry no display name, so derive a readable one from the address. */
function displayNameFor(email: string): string {
  return email.split('@')[0] || email;
}

async function findByGoogleSub(client: PoolClient, googleSub: string): Promise<UserRow | null> {
  const { rows } = await client.query<UserRow>(
    'SELECT id, email, display_name FROM users WHERE google_sub = $1',
    [googleSub],
  );
  return rows[0] ?? null;
}

/**
 * Creates the shared ledger if it is not there yet and returns its id.
 *
 * ON CONFLICT rather than a check-then-insert: both members signing in for the
 * first time at once would otherwise race, and one of them would fail on the
 * unique slug.
 */
async function ensureSharedLedger(client: PoolClient, name: string): Promise<number> {
  // DO UPDATE rather than DO NOTHING purely so RETURNING yields the row in both
  // cases; the assignment is a deliberate no-op that leaves the name untouched.
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO ledgers (slug, name, kind) VALUES ($1, $2, 'shared')
       ON CONFLICT (slug) DO UPDATE SET name = ledgers.name
     RETURNING id`,
    [SHARED_LEDGER_SLUG, name],
  );
  return rows[0].id;
}

async function provision(
  client: PoolClient,
  identity: VerifiedIdentity,
  options: SessionServiceOptions,
): Promise<UserRow> {
  const email = identity.email.toLowerCase();
  if (!options.allowedEmails.includes(email)) {
    throw new ForbiddenError('このアカウントは許可されていません');
  }

  const displayName = displayNameFor(identity.email);
  const { rows } = await client.query<UserRow>(
    `INSERT INTO users (google_sub, email, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email
     RETURNING id, email, display_name`,
    [identity.googleSub, identity.email, displayName],
  );
  const user = rows[0];

  // Everyone joins the shared household ledger...
  const sharedId = await ensureSharedLedger(client, options.sharedLedgerName);
  await client.query(
    `INSERT INTO ledger_members (ledger_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (ledger_id, user_id) DO NOTHING`,
    [sharedId, user.id],
  );

  // ...and gets a private one of their own, owned solely by them. The slug is
  // derived from the user id so re-running provisioning is a no-op rather than a
  // second private ledger.
  const { rows: personal } = await client.query<{ id: number }>(
    `INSERT INTO ledgers (slug, name, kind) VALUES ($1, $2, 'personal')
       ON CONFLICT (slug) DO UPDATE SET name = ledgers.name
     RETURNING id`,
    [`personal:${user.id}`, displayName],
  );
  await client.query(
    `INSERT INTO ledger_members (ledger_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (ledger_id, user_id) DO NOTHING`,
    [personal[0].id, user.id],
  );

  return user;
}

async function ledgersFor(client: PoolClient, userId: number): Promise<Ledger[]> {
  // Membership is the ONLY thing consulted. `kind` appears solely in ORDER BY,
  // to put the household ledger first in the switcher.
  const { rows } = await client.query<LedgerRow>(
    `SELECT l.id, l.slug, l.name, l.kind
       FROM ledgers l
       JOIN ledger_members m ON m.ledger_id = l.id
      WHERE m.user_id = $1
      ORDER BY (l.kind = 'shared') DESC, l.name ASC`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, kind: row.kind }));
}

export function createSessionService(
  pool: Pool,
  options: SessionServiceOptions,
): SessionService {
  const normalised: SessionServiceOptions = {
    ...options,
    allowedEmails: options.allowedEmails.map((email) => email.toLowerCase()),
  };

  return {
    async resolve(identity) {
      return withTransaction(pool, async (client) => {
        // Look up by subject id first. An established user is recognised even if
        // their address has changed since they signed up.
        let row = await findByGoogleSub(client, identity.googleSub);

        if (row === null) {
          row = await provision(client, identity, normalised);
        } else if (row.email !== identity.email) {
          // Keep the stored address current for display; identity is unaffected.
          await client.query('UPDATE users SET email = $1 WHERE id = $2', [
            identity.email,
            row.id,
          ]);
          row = { ...row, email: identity.email };
        }

        const user: AuthenticatedUser = {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
        };
        return { user, ledgers: await ledgersFor(client, row.id) } satisfies Session;
      });
    },
  };
}
