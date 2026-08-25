import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsView from './SettingsView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { makeCashAsset, makeCashCategory } from '../../test/factories';

// ---------------------------------------------------------------------------
// 設定 has no other gate on it.
//
// The balance panel here IS the CashBalance card, so whatever that card decides
// to render is the entire screen. When it folded a failed fetch into "not ready
// yet", this was a pulsing bar with no explanation and no retry -- the dead end
// the status enum was introduced to remove, surviving in the one place nothing
// else covered.
// ---------------------------------------------------------------------------

beforeEach(() => {
  setApi(createMockApi());
  useCategoryStore.setState({ categories: [], loading: false });
  useAssetStore.setState({ categories: [], assets: [], status: 'loading' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('the balance panel', () => {
  it('claims nothing about the household while the figure is in flight', () => {
    render(<SettingsView />);

    expect(screen.queryByText('資産の「現金」に登録すると反映されます')).not.toBeInTheDocument();
    expect(screen.queryByText('¥0')).not.toBeInTheDocument();
  });

  it('offers a retry when the fetch failed', () => {
    useAssetStore.setState({ categories: [], assets: [], status: 'error' });
    render(<SettingsView />);

    expect(screen.getByText('残高を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });

  it('shows the figure and a way to edit it once it lands', () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 280_000 })],
      status: 'ready',
    });
    render(<SettingsView onNavigate={vi.fn()} />);

    expect(screen.getByText('¥280,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
  });
});
