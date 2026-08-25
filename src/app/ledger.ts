import { useCategoryStore } from '../stores/useCategoryStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useSnapshotStore } from '../stores/useSnapshotStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { useSessionStore } from '../stores/useSessionStore';
import { useAssetStore } from '../stores/useAssetStore';
import { useSettingsStore } from '../stores/useSettingsStore';

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
  useCategoryStore,
  useTemplateStore,
  useSnapshotStore,
  useMonthlyStore,
  useAssetStore,
  useSettingsStore,
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
    useCategoryStore.getState().fetchCategories(),
    useTemplateStore.getState().fetchTemplates(),
    useSnapshotStore.getState().fetchSnapshots(),
    // NOT optional, and not merely for the 資産 view: the cash category's
    // holdings ARE 現在の残高, so this fetch is what gives the dashboard its
    // headline figure and the forecast its starting point. If it is ever made
    // lazy, the balance goes with it.
    useAssetStore.getState().fetchAssets(),
    // The floor every 安全/注意 judgement is measured against, and the figure
    // 使っていい額 is what is left above. It has a usable default, so nothing
    // waits on it -- but a ledger that raised its floor must not be told
    // 「安全」 against the application's default for a round trip.
    useSettingsStore.getState().fetchSettings(),
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
