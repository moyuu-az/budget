import { create } from 'zustand';

// ---------------------------------------------------------------------------
// "This tab is running an old build."
//
// The server refuses every request from a bundle built against a different wire
// contract (see shared/contract-version.ts). That refusal has to become
// something the user can act on, and a toast is not enough: toasts disappear,
// and every subsequent request fails the same way, so the tab would fill with
// them while remaining unusable.
//
// WHY NOT JUST RELOAD AUTOMATICALLY
//   A reload discards whatever is in the form the user is half-way through
//   filling in. They may have just typed an amount they were reading off a
//   statement. Asking costs one click and loses nothing; reloading for them
//   costs them the retyping and gives no explanation for why the page blinked.
//
// WHY A STORE RATHER THAN A RETURN VALUE
//   The refusal can arrive from ANY request -- a background refetch nobody is
//   watching, a ledger switch, a save. There is no single call site to return it
//   to. This is a one-way latch read by the shell.
// ---------------------------------------------------------------------------

interface StaleClientState {
  /**
   * True once the server has refused this bundle. Never goes back to false.
   *
   * A latch, not a toggle: once it is set, every request from this tab will be
   * refused, so there is no state in which clearing it would be honest. Only a
   * reload resolves it -- which is a new page, and a new store.
   */
  isStale: boolean;
  markStale: () => void;
}

export const useStaleClientStore = create<StaleClientState>((set) => ({
  isStale: false,
  markStale: () => set({ isStale: true }),
}));

/** Reloads the page, bypassing the bfcache so the new bundle is actually fetched. */
export function reloadForNewBuild(): void {
  window.location.reload();
}
