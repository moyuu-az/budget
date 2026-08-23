import { create } from 'zustand';
import type { Ledger, Session } from '../types';

// ---------------------------------------------------------------------------
// Who is signed in, and which ledger the app is currently showing.
//
// This is the ONE piece of state that decides what every other store sees: the
// HTTP client reads activeLedgerId on every request. Nothing else in the app
// needs to know about ledgers, which is why no other store or component takes a
// ledger argument.
// ---------------------------------------------------------------------------

/** Remembers the last ledger across reloads so a refresh does not jump back. */
const STORAGE_KEY = 'balance-forecast:active-ledger';

function readStoredLedgerId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Private browsing and blocked site data both throw here.
    return null;
  }
}

function storeLedgerId(id: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Remembering the choice is a convenience, not a requirement.
  }
}

interface SessionState {
  session: Session | null;
  activeLedgerId: number | null;
  setSession(session: Session): void;
  setActiveLedger(ledgerId: number): void;
  activeLedger(): Ledger | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  activeLedgerId: null,

  setSession(session) {
    // A remembered id is only honoured if the server still lists that ledger for
    // this user. Sending a stale one would be rejected as FORBIDDEN and greet
    // the user with an error on a page they have opened a hundred times.
    const remembered = readStoredLedgerId();
    const valid = session.ledgers.some((ledger) => ledger.id === remembered);
    const activeLedgerId = valid ? remembered : (session.ledgers[0]?.id ?? null);

    if (activeLedgerId !== null) storeLedgerId(activeLedgerId);
    set({ session, activeLedgerId });
  },

  setActiveLedger(ledgerId) {
    const session = get().session;
    if (!session?.ledgers.some((ledger) => ledger.id === ledgerId)) return;
    storeLedgerId(ledgerId);
    set({ activeLedgerId: ledgerId });
  },

  activeLedger() {
    const { session, activeLedgerId } = get();
    return session?.ledgers.find((ledger) => ledger.id === activeLedgerId) ?? null;
  },
}));
