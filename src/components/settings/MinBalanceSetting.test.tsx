import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MinBalanceSetting from './MinBalanceSetting';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useToastStore } from '../../stores/useToastStore';
import { DEFAULT_LEDGER_SETTINGS } from '../../../shared/ledger-settings';
import type { AppApi } from '../../types';

// ---------------------------------------------------------------------------
// The floor everything on the dashboard is measured against.
//
// It was `50000`, hard-coded in KpiHero: one household's comfortable floor was
// another household's rent, and nothing on screen said where the number came
// from. The risk in making it editable is the opposite one -- a form that saves
// the DEFAULT over a household's real figure while that figure is still loading.
// ---------------------------------------------------------------------------

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useSettingsStore.setState({ settings: { minBalanceThreshold: 300_000 }, status: 'ready' });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('before the settings arrive', () => {
  it('does NOT pre-fill with the default', () => {
    // The store starts at the default, which is right for READING and wrong for
    // a form: a field showing 50,000 while the ledger's real 300,000 is in
    // flight would overwrite it the moment someone pressed save.
    useSettingsStore.setState({ settings: DEFAULT_LEDGER_SETTINGS, status: 'loading' });
    render(<MinBalanceSetting />);

    expect(screen.queryByLabelText('金額')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('最低残高を読み込み中');
  });

  it('offers a retry when the fetch failed', () => {
    useSettingsStore.setState({ settings: DEFAULT_LEDGER_SETTINGS, status: 'error' });
    render(<MinBalanceSetting />);

    expect(screen.getByText('最低残高を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });
});

describe('once they have', () => {
  it('shows the ledger’s own figure', () => {
    render(<MinBalanceSetting />);
    expect(screen.getByLabelText('金額')).toHaveValue('300,000');
  });

  it('cannot be saved until something changes', () => {
    render(<MinBalanceSetting />);
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('saves the typed figure', async () => {
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 120_000 });
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '120000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(api.updateLedgerSettings).toHaveBeenCalledWith({ minBalanceThreshold: 120_000 });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('最低残高を保存しました');
  });

  it('shows what the SERVER answered, not what was typed', async () => {
    // The stored value is not always the requested one -- a figure written
    // around the schema is clamped on read. Keeping the draft would leave a
    // number on screen the database does not hold, and it would change on the
    // next reload.
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 99_999 });
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '120000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByLabelText('金額')).toHaveValue('99,999');
  });

  it('refuses a figure larger than the column can hold, before the round trip', async () => {
    // The bound is mirrored client-side so the message is immediate and written
    // for the user, rather than arriving as a rejection from the schema naming a
    // constraint they have never heard of.
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn();
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '9999999999999');

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(api.updateLedgerSettings).not.toHaveBeenCalled();
  });

  it('accepts zero, which means "warn me only if I would go negative"', async () => {
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn().mockResolvedValue({ minBalanceThreshold: 0 });
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '0');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(api.updateLedgerSettings).toHaveBeenCalledWith({ minBalanceThreshold: 0 });
  });

  it('refuses an empty field rather than saving it as zero', async () => {
    // 「保存」 on a blank box must not silently mean "warn me only when negative".
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn();
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('0 以上の金額を入力してください');
    expect(api.updateLedgerSettings).not.toHaveBeenCalled();
  });

  it('discards a half-typed figure when the ledger changes', async () => {
    // Editing ledger A's floor and switching to B before saving used to leave
    // the draft in place: the form is hidden while B loads, comes back holding
    // A's number, and 保存 writes it to B under B's header. SettingsView keys
    // this component by ledger so switching remounts it -- which is what this
    // simulates.
    const user = userEvent.setup();
    const { unmount } = render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '120000');
    expect(screen.getByLabelText('金額')).toHaveValue('120,000');

    unmount();
    useSettingsStore.setState({ settings: { minBalanceThreshold: 80_000 }, status: 'ready' });
    render(<MinBalanceSetting />);

    expect(screen.getByLabelText('金額')).toHaveValue('80,000');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('says nothing about success when the save failed', async () => {
    // The store swallows the throw (reportError has already raised the toast),
    // so a try/catch here could never run.
    const user = userEvent.setup();
    api.updateLedgerSettings = vi.fn().mockRejectedValue(new Error('nope'));
    render(<MinBalanceSetting />);

    await user.clear(screen.getByLabelText('金額'));
    await user.type(screen.getByLabelText('金額'), '120000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useToastStore.getState().toasts.map((t) => t.message)).not.toContain(
      '最低残高を保存しました',
    );
    // And the draft is kept, so the user does not have to retype it.
    expect(screen.getByLabelText('金額')).toHaveValue('120,000');
  });
});
