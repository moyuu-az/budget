import { create } from 'zustand';
import type { LedgerSettings } from '../types';
import { DEFAULT_LEDGER_SETTINGS } from '../../shared/ledger-settings';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import type { LoadStatus } from './load-status';

// ---------------------------------------------------------------------------
// What this ledger has configured.
//
// WHY THE VALUE IS USABLE BEFORE THE FETCH LANDS
//   Unlike the balance, a setting has a meaningful answer with no data: the
//   default. `settings` therefore starts at DEFAULT_LEDGER_SETTINGS rather than
//   at null, and every reader can use it immediately.
//
//   That is NOT the same forgiving treatment `useAssetStore` refuses to give the
//   balance, and the difference is worth stating. A balance of ¥0 before the
//   fetch is a FIGURE ABOUT THE HOUSEHOLD, and a wrong one; the default
//   threshold is a policy the application supplies and is correct for any ledger
//   that has not overridden it. Showing 「注意」 against the default for one
//   round trip is at worst slightly early, never a fabricated warning.
//
//   `status` is still tracked, because the SETTINGS SCREEN needs it: a form
//   pre-filled with the default while the ledger's real figure is in flight
//   would overwrite that figure the moment someone saved.
// ---------------------------------------------------------------------------

interface SettingsState {
  settings: LedgerSettings;
  status: LoadStatus;
  reset: () => void;
  fetchSettings: () => Promise<void>;
  /** Saves a patch. Returns whether it was stored; see useAssetStore for why. */
  updateSettings: (patch: Partial<LedgerSettings>) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_LEDGER_SETTINGS,
  status: 'idle',

  /**
   * Back to the DEFAULTS on a ledger switch, not to the previous ledger's
   * values. One household's floor is not the other's, and carrying it over would
   * colour the new ledger's warnings with a figure nobody set for it.
   */
  reset: () => set({ settings: DEFAULT_LEDGER_SETTINGS, status: 'idle' }),

  fetchSettings: async () => {
    set({ status: 'loading' });
    try {
      set({ settings: await getApi().getLedgerSettings(), status: 'ready' });
    } catch (e) {
      set({ status: 'error' });
      reportError(e);
    }
  },

  updateSettings: async (patch) => {
    try {
      // The server's answer, not the patch. It clamps, and a form showing what
      // it asked for rather than what was kept would silently change on the
      // next reload.
      set({ settings: await getApi().updateLedgerSettings(patch), status: 'ready' });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },
}));

/** The floor this ledger wants to stay above, in yen. */
export function useMinBalanceThreshold(): number {
  return useSettingsStore((s) => s.settings.minBalanceThreshold);
}
