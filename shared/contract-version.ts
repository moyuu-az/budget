// ---------------------------------------------------------------------------
// THE WIRE CONTRACT'S VERSION.
//
// WHY THIS EXISTS
//   A deploy replaces the server while browser tabs are still open on the old
//   bundle. Until now that was harmless: every change had been additive, so an
//   old tab simply did not use the new field.
//
//   Migration 005 broke that. `EntryTemplate.dayOfMonth` became `recurrence`,
//   and an old tab reading a new response finds no `dayOfMonth` at all --
//   `undefined === date.getDate()` is never true, so EVERY planned entry
//   silently disappears from its forecast. The balance line goes flat, no
//   expenses land on it, and the projection says the household is fine.
//
//   That is the worst possible shape for a bug in this application: wrong, in
//   the reassuring direction, with nothing on screen to say so. The tab looks
//   like it is working.
//
// WHY A VERSION GATE RATHER THAN A COMPATIBILITY WINDOW
//   The obvious alternative is to keep sending `dayOfMonth` alongside
//   `recurrence` for one release. That is two ways to say the same thing --
//   exactly what removing `dayOfMonth` was for -- and a compatibility field
//   nobody is scheduled to delete becomes permanent. It also only helps THIS
//   change; the next incompatible one starts the argument again.
//
//   A version gate is the general answer. Every request states which contract
//   the caller was built against; a mismatch is refused with a code the client
//   turns into 「再読み込みしてください」. It costs one header, it works for
//   every future change, and it fails LOUDLY -- which is the property the
//   silent-flat-forecast failure lacks.
//
// WHEN TO BUMP IT
//   Whenever an existing field changes shape or disappears from `AppApi` or the
//   types it references.
//
//   AND WHENEVER A METHOD THE CLIENT REQUIRES IS ADDED. This one is easy to miss
//   because it LOOKS additive -- nothing existing changed. It is not: the new
//   bundle calls a method the old server has never heard of, and that server
//   answers 404 while stamping the version it does know. The stamp matches, the
//   skew goes undetected, and the client reports the failure as an ordinary
//   error -- which for `getLedgerSettings` stops the whole dashboard, because
//   its readiness depends on it.
//
//   NOT for a field added to a response, or a method the client can work without.
//   An old client ignoring a new field is fine, and bumping for those would force
//   a reload on every deploy.
//
//   HISTORY
//     1 -- the contract as of migration 004 (cash is an asset).
//     2 -- migration 005: EntryTemplate.dayOfMonth -> EntryTemplate.recurrence.
//     3 -- getLedgerSettings / updateLedgerSettings added, and the dashboard
//          cannot render its judgements without the first of them.
// ---------------------------------------------------------------------------

export const CONTRACT_VERSION = 3;

/**
 * Lower-cased because Hono's `c.req.header()` matches case-insensitively but the
 * tests read it verbatim; keeping one spelling avoids a mismatch that would only
 * show up as "the gate never fires".
 *
 * THE SAME HEADER TRAVELS BOTH WAYS, and both sides check it.
 *
 * Checking only the request closes half the door. The other half is a NEW tab
 * talking to an OLD server -- a revision rollback, or a traffic split during a
 * staged deploy. That server has no gate at all (it predates this file), so it
 * happily answers, and the new bundle reads a payload in the previous shape:
 * `template.recurrence` is `undefined`, and the first predicate to touch
 * `recurrence.kind` throws.
 *
 * So the server stamps every response, and the client refuses a body whose
 * stamp does not match -- including a body with NO stamp, which is exactly what
 * an old server sends. Symmetric, for the same reason the request side is: it
 * is not knowable in advance which side will be the older one.
 */
export const CONTRACT_VERSION_HEADER = 'x-contract-version';
