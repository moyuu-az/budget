import { useBalanceStore } from '../stores/useBalanceStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useSnapshotStore } from '../stores/useSnapshotStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { useSessionStore } from '../stores/useSessionStore';

// ---------------------------------------------------------------------------
// Everything that has to happen when the active ledger changes.
//
// Requests carry the ledger in a header read at call time, so switching is
// almost free -- but the stores still hold the previous ledger's data, and a
// component that renders before the refetch lands would show the wrong
// household's numbers under the right household's name.
//
// Keeping the clear and the reload in ONE place is what stops a future store
// from being added to the app and quietly missed here. If a store holds
// ledger-scoped data, it belongs in the list below and nowhere else.
// ---------------------------------------------------------------------------

/** Every store whose contents belong to a single ledger. */
const LEDGER_SCOPED_STORES: readonly { getState(): { reset(): void } }[] = [
  useBalanceStore,
  useCategoryStore,
  useTemplateStore,
  useSnapshotStore,
  useMonthlyStore,
];

export function resetLedgerData(): void {
  for (const store of LEDGER_SCOPED_STORES) store.getState().reset();
}

/**
 * Loads the data every view needs up front.
 *
 * Monthly amounts and actuals are deliberately absent: they are fetched per
 * month as the user navigates, and resetLedgerData() has already emptied their
 * caches.
 */
export async function loadLedgerData(): Promise<void> {
  await Promise.all([
    useBalanceStore.getState().fetchBalance(),
    useCategoryStore.getState().fetchCategories(),
    useTemplateStore.getState().fetchTemplates(),
    useSnapshotStore.getState().fetchSnapshots(),
  ]);
}

/**
 * Switches the app to another ledger.
 *
 * Order matters: clear first, then change the ledger, then load. Changing the
 * ledger first would leave a window where the switcher already shows the new
 * name while every panel still shows the old ledger's figures.
 */
export async function switchLedger(ledgerId: number): Promise<void> {
  const session = useSessionStore.getState();
  if (session.activeLedgerId === ledgerId) return;

  resetLedgerData();
  // Refuses an id the session does not list, leaving the current ledger active.
  session.setActiveLedger(ledgerId);
  // Reload whichever ledger is active now -- the new one, or the old one if the
  // switch was refused. Either way the stores must not be left empty.
  await loadLedgerData();
}
