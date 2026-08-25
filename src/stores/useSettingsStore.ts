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
// BUT A USABLE VALUE IS NOT A TRUSTWORTHY ONE, and the difference decides who
// may read it without checking `status`:
//
//   DISPLAY may. Rendering the default for one round trip costs nothing.
//
//   JUDGEMENT may NOT. The default is only known to be right once the server has
//   confirmed that nothing was configured -- and `status: 'ready'` IS that
//   confirmation. A ledger whose floor is 300,000 and whose request failed would
//   otherwise have its 使っていい額 computed against 50,000: overstated by a
//   quarter of a million yen, indefinitely, with a green badge beside it. So
//   useDashboardKpis folds this status into its own.
//
//   FORMS may NOT either, for the mirror-image reason: a field pre-filled with
//   the default while the ledger's real figure is in flight would overwrite that
//   figure the moment someone saved.
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
