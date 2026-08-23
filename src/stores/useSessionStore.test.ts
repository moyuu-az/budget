import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from './useSessionStore';
import type { Session } from '../types';

const SESSION: Session = {
  user: { id: 1, email: 'alice@example.test', displayName: 'alice' },
  ledgers: [
    { id: 10, slug: 'shared', name: '家計', kind: 'shared' },
    { id: 20, slug: 'personal:1', name: 'alice', kind: 'personal' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ session: null, activeLedgerId: null });
});

describe('useSessionStore', () => {
  it('opens the first ledger when nothing was remembered', () => {
    // The server sorts the shared ledger first, so a new user lands on the
    // household budget rather than an empty private one.
    useSessionStore.getState().setSession(SESSION);
    expect(useSessionStore.getState().activeLedgerId).toBe(10);
  });

  it('reopens the ledger the user was last on', () => {
    useSessionStore.getState().setSession(SESSION);
    useSessionStore.getState().setActiveLedger(20);

    useSessionStore.setState({ session: null, activeLedgerId: null });
    useSessionStore.getState().setSession(SESSION);

    expect(useSessionStore.getState().activeLedgerId).toBe(20);
  });

  it('ignores a remembered ledger the session no longer lists', () => {
    // Access can be removed, or the browser can be carrying an id from another
    // deployment. Sending it would be refused as FORBIDDEN and greet the user
    // with an error on a page they open every day.
    localStorage.setItem('balance-forecast:active-ledger', '999');
    useSessionStore.getState().setSession(SESSION);

    expect(useSessionStore.getState().activeLedgerId).toBe(10);
  });

  it('ignores a corrupt remembered value', () => {
    localStorage.setItem('balance-forecast:active-ledger', 'not-a-number');
    useSessionStore.getState().setSession(SESSION);

    expect(useSessionStore.getState().activeLedgerId).toBe(10);
  });

  it('refuses to activate a ledger outside the session', () => {
    // The client cannot grant itself access by writing to its own store: the
    // server checks membership again on every request. This keeps the UI
    // honest rather than sending a request that is certain to fail.
    useSessionStore.getState().setSession(SESSION);
    useSessionStore.getState().setActiveLedger(999);

    expect(useSessionStore.getState().activeLedgerId).toBe(10);
  });

  it('survives a browser that refuses local storage', () => {
    // Private browsing and blocked site data both throw on access. Remembering
    // the choice is a convenience, never a requirement.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => useSessionStore.getState().setSession(SESSION)).not.toThrow();
    expect(useSessionStore.getState().activeLedgerId).toBe(10);

    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('resolves the active ledger object', () => {
    useSessionStore.getState().setSession(SESSION);
    expect(useSessionStore.getState().activeLedger()?.name).toBe('家計');

    useSessionStore.getState().setActiveLedger(20);
    expect(useSessionStore.getState().activeLedger()?.kind).toBe('personal');
  });
});
