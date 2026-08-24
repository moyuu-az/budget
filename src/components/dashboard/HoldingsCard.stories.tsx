import type { Meta, StoryObj } from '@storybook/react-vite';
import HoldingsCard from './HoldingsCard';
import { useAssetStore } from '../../stores/useAssetStore';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useUIStore } from '../../stores/useUIStore';
import type { Asset, AssetCategory } from '../../types';
import type { HoldingsView } from '../../types/ui';

interface StoryArgs {
  balance: number;
  categories: AssetCategory[];
  assets: Asset[];
  view: HoldingsView;
}

/**
 * Seeds the stores the card reads, since it takes no props of its own.
 *
 * Set during render rather than in an effect: an effect runs AFTER the first
 * paint, so switching stories would show the previous story's state for a frame.
 * The card is rendered below, so it mounts against state that is already correct.
 */
function Harness({ balance, categories, assets, view }: StoryArgs) {
  useBalanceStore.setState({ balance });
  useAssetStore.setState({ categories, assets, loading: false });
  useUIStore.setState({ holdingsView: view });

  return <HoldingsCard />;
}

const asset = (overrides: Partial<Asset>): Asset => ({
  id: 1,
  categoryId: 1,
  name: 'つみたて投資枠',
  value: 1_250_000,
  fields: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const NISA: AssetCategory = { id: 1, name: 'NISA', color: '#22c55e', sortOrder: 0, fields: [] };
const CASH: AssetCategory = { id: 2, name: '現金', color: '#38bdf8', sortOrder: 1, fields: [] };

const meta = {
  title: 'Dashboard/HoldingsCard',
  component: Harness,
  parameters: { layout: 'padded' },
  args: {
    balance: 1_525_210,
    categories: [NISA, CASH],
    assets: [asset({ id: 1 }), asset({ id: 2, categoryId: 2, name: '生活防衛資金', value: 800_000 })],
    view: 'cash',
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: the balance the forecast starts from. */
export const Cash: Story = {};

/** The total is never shown without its parts -- that is where a double entry becomes visible. */
export const NetWorth: Story = { args: { view: 'netWorth' } };

/** A loan tracked as a negative asset, which is why the total may be below zero. */
export const WithLoan: Story = {
  args: {
    view: 'netWorth',
    categories: [{ id: 3, name: '住宅ローン', color: '#ef4444', sortOrder: 0, fields: [] }],
    assets: [asset({ id: 9, categoryId: 3, name: '残債', value: -28_000_000 })],
  },
};

/** Renders nothing: asset tracking is optional and this ledger never opted in. */
export const NotTracked: Story = { args: { categories: [], assets: [] } };
