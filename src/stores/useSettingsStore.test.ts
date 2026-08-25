import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore } from './useSettingsStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { DEFAULT_LEDGER_SETTINGS } from '../../shared/ledger-settings';
import type { AppApi } from '../types';

// ---------------------------------------------------------------------------
// The one store whose value is USABLE before its fetch lands, and the reasoning
// for why that is safe here and is not for the balance:
//
//   A balance of ¥0 before the fetch is a FIGURE ABOUT THE HOUSEHOLD, and a
//   wrong one -- which is why useAssetStore refuses to let anything read it.
//   The default threshold is a POLICY the application supplies, correct for any
//   ledger that has not overridden it. Showing 「注意」 against it for one round
//   trip is at worst slightly early, never a fabricated warning.
// ---------------------------------------------------------------------------

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useSettingsStore.setState({ settings: DEFAULT_LEDGER_SETTINGS, status: 'idle' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('before anything is fetched', () => {
  it('reads as the defaults, not as null', () => {
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_LEDGER_SETTINGS);
  });
});

describe('fetchSettings', () => {
  it('replaces the defaults with the ledger’s own figures', async () => {
    api.getLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 300_000 });

    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().settings).toEqual({ minBalanceThreshold: 300_000 });
    expect(useSettingsStore.getState().status).toBe('ready');
  });

  it('reports an error as its own state, not as a longer wait', async () => {
    // The settings SCREEN needs the distinction: a form pre-filled with the
    // default while the real figure is in flight would overwrite that figure the
    // moment someone saved.
    api.getLedgerSettings = vi.fn().mockRejectedValue(new Error('nope'));

    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().status).toBe('error');
    // And the readable default is still there, so the dashboard keeps working.
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_LEDGER_SETTINGS);
  });
});

describe('updateSettings', () => {
  it('stores the SERVER’s answer, not the patch', async () => {
    // The server clamps. Storing the patch would leave a figure in the app the
    // database does not hold, which the next reload would silently change.
    api.updateLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 0 });

    const ok = await useSettingsStore.getState().updateSettings({ minBalanceThreshold: -5 });

    expect(ok).toBe(true);
    expect(useSettingsStore.getState().settings).toEqual({ minBalanceThreshold: 0 });
  });

  it('returns false and changes nothing when the save failed', async () => {
    api.updateLedgerSettings = vi.fn().mockRejectedValue(new Error('nope'));
    useSettingsStore.setState({ settings: { minBalanceThreshold: 300_000 }, status: 'ready' });

    const ok = await useSettingsStore.getState().updateSettings({ minBalanceThreshold: 1 });

    expect(ok).toBe(false);
    expect(useSettingsStore.getState().settings).toEqual({ minBalanceThreshold: 300_000 });
  });
});

describe('reset', () => {
  it('goes back to the DEFAULTS, not to the previous ledger’s values', async () => {
    // One household's floor is not the other's. Carrying it over would colour
    // the new ledger's warnings with a figure nobody set for it.
    useSettingsStore.setState({ settings: { minBalanceThreshold: 300_000 }, status: 'ready' });

    useSettingsStore.getState().reset();

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_LEDGER_SETTINGS);
    expect(useSettingsStore.getState().status).toBe('idle');
  });
});
