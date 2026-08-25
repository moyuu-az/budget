import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyIfCurrent, currentGeneration, invalidateInFlight } from './ledger-generation';
import { resetLedgerData } from './ledger';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { DEFAULT_LEDGER_SETTINGS } from '../../shared/ledger-settings';
import { makeTemplate } from '../test/factories';
import type { AppApi } from '../types';

// ---------------------------------------------------------------------------
// The window a ledger switch cannot close on its own.
//
// Switching clears every store and starts fresh requests. What it cannot do is
// un-send the requests already in flight for the PREVIOUS ledger -- and when one
// of those answers, its store writes it without knowing the question is no
// longer being asked.
//
// The result is a household budget showing another household's figures under the
// right household's name: not a leak (the server answered the right person) but
// wrong, silent, and sticky -- nothing refetches until the next switch.
// ---------------------------------------------------------------------------

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useSettingsStore.setState({ settings: DEFAULT_LEDGER_SETTINGS, status: 'idle' });
  useTemplateStore.setState({ templates: [], status: 'idle' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('applyIfCurrent', () => {
  it('runs the write when nothing has changed', () => {
    const tag = currentGeneration();
    const write = vi.fn();

    expect(applyIfCurrent(tag, write)).toBe(true);
    expect(write).toHaveBeenCalled();
  });

  it('refuses the write after an invalidation', () => {
    const tag = currentGeneration();
    invalidateInFlight();
    const write = vi.fn();

    expect(applyIfCurrent(tag, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses a response from A even after switching A -> B -> A', () => {
    // The case a ledger-id comparison would miss: the stale response still names
    // A, and A is active again -- but the data behind it has been reset twice.
    const tag = currentGeneration();
    invalidateInFlight(); // -> B
    invalidateInFlight(); // -> back to A

    expect(applyIfCurrent(tag, vi.fn())).toBe(false);
  });
});

describe('a settings response that arrives after a switch', () => {
  it('is discarded rather than shown under the new ledger’s name', async () => {
    let answer: (value: { minBalanceThreshold: number }) => void = () => {};
    api.getLedgerSettings = vi.fn().mockReturnValue(
      new Promise<{ minBalanceThreshold: number }>((resolve) => {
        answer = resolve;
      }),
    );

    const pending = useSettingsStore.getState().fetchSettings();

    // The user switches. resetLedgerData clears the stores AND disowns the
    // requests already out.
    resetLedgerData();

    answer({ minBalanceThreshold: 300_000 });
    await pending;

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_LEDGER_SETTINGS);
    // And it must NOT be marked ready: 'ready' is the claim that nothing was
    // configured, which this response cannot support for the ledger now on
    // screen. Left un-ready, the dashboard keeps waiting for the real answer.
    expect(useSettingsStore.getState().status).not.toBe('ready');
  });

  it('is kept when no switch happened', async () => {
    api.getLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 300_000 });

    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().settings).toEqual({ minBalanceThreshold: 300_000 });
    expect(useSettingsStore.getState().status).toBe('ready');
  });

  it('does not raise an error toast for a ledger nobody is looking at', async () => {
    // Nothing the user can act on, about a screen they have left.
    let fail: (reason: Error) => void = () => {};
    api.getLedgerSettings = vi.fn().mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );

    const pending = useSettingsStore.getState().fetchSettings();
    resetLedgerData();
    fail(new Error('nope'));
    await pending;

    expect(useSettingsStore.getState().status).not.toBe('error');
  });
});

describe('a template response that arrives after a switch', () => {
  it('is discarded, so one household’s entries never appear under the other’s name', async () => {
    let answer: (value: unknown[]) => void = () => {};
    api.getTemplates = vi.fn().mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        answer = resolve;
      }),
    );

    const pending = useTemplateStore.getState().fetchTemplates();
    resetLedgerData();
    answer([makeTemplate({ id: 1, name: '相手の家賃' })]);
    await pending;

    expect(useTemplateStore.getState().templates).toEqual([]);
  });
});
