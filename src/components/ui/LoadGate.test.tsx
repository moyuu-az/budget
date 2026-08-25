import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadGate } from './LoadGate';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useSessionStore } from '../../stores/useSessionStore';
import type { AppApi } from '../../types';

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useSessionStore.setState({ session: null, activeLedgerId: null });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('while waiting', () => {
  it('announces what it is waiting for AS TEXT', () => {
    // role="status" is a live region: it announces its CONTENT changing. An
    // aria-label alone names the region and gives a screen reader nothing to
    // read, and the skeleton beside it is aria-hidden -- so the region can be
    // silent while looking correct to `getByRole('status', { name })`, which
    // reads the label. This asserts the text instead, which is the thing that
    // is actually spoken.
    render(<LoadGate status="loading" height={100} label="残高" />);

    expect(screen.getByRole('status')).toHaveTextContent('残高を読み込み中');
  });

  it('shows none of the children', () => {
    render(
      <LoadGate status="loading" height={100} label="残高">
        <p>¥0</p>
      </LoadGate>,
    );

    expect(screen.queryByText('¥0')).not.toBeInTheDocument();
  });
});

describe('when the fetch failed', () => {
  it('says so rather than waiting forever', () => {
    render(<LoadGate status="error" height={100} label="残高" />);

    expect(screen.getByText('残高を読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('retries the whole ledger load, not just one panel', async () => {
    // The panels share their inputs, so repairing one alone would leave the
    // screen half-fresh -- two figures from different moments, side by side.
    const user = userEvent.setup();
    useSessionStore.setState({ activeLedgerId: 1 });
    render(<LoadGate status="error" height={100} label="残高" />);

    await user.click(screen.getByRole('button', { name: '再読み込み' }));

    expect(api.getAssetCategories).toHaveBeenCalled();
    expect(api.getTemplates).toHaveBeenCalled();
  });
});

describe('when ready', () => {
  it('gets out of the way entirely', () => {
    render(
      <LoadGate status="ready" height={100} label="残高">
        <p>¥280,000</p>
      </LoadGate>,
    );

    expect(screen.getByText('¥280,000')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument();
  });
});
