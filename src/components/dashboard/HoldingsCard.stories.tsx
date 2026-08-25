import type { Meta, StoryObj } from '@storybook/react-vite';
import HoldingsCard from './HoldingsCard';
import { useAssetStore } from '../../stores/useAssetStore';
import { useUIStore } from '../../stores/useUIStore';
import { makeAsset, makeAssetCategory, makeCashAsset, makeCashCategory } from '../../test/factories';
import type { Asset, AssetCategory } from '../../types';
import type { HoldingsView } from '../../types/ui';

interface StoryArgs {
  categories: AssetCategory[];
  assets: Asset[];
  view: HoldingsView;
}

/**
 * Seeds the stores the card reads, since it takes no props of its own.
 *
 * Done in a loader rather than in the component: a loader runs BEFORE the story
 * renders, so the first paint is already correct. Setting the stores during
 * render would notify the already-mounted card mid-render, which React reports
 * as updating one component while rendering another; doing it in an effect
 * would show the previous story's state for a frame.
 */
const seed = async ({ args }: { args: StoryArgs }): Promise<Record<string, never>> => {
  useAssetStore.setState({ categories: args.categories, assets: args.assets, status: 'ready' });
  useUIStore.setState({ holdingsView: args.view });
  return {};
};

function Harness(_: StoryArgs) {
  return <HoldingsCard />;
}

const asset = (overrides: Partial<Asset>): Asset =>
  makeAsset({ name: 'つみたて投資枠', value: 1_250_000, ...overrides });

const NISA = makeAssetCategory({ id: 1, name: 'NISA' });
const CASH = makeCashCategory();

const meta = {
  title: 'Dashboard/HoldingsCard',
  component: Harness,
  parameters: { layout: 'padded' },
  loaders: [seed],
  args: {
    categories: [CASH, NISA],
    assets: [
      makeCashAsset({ name: '生活防衛資金', value: 1_525_210 }),
      asset({ id: 1 }),
    ],
    view: 'cash',
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: 現在の残高, which is what the forecast starts from. */
export const Cash: Story = {};

/** Net worth INCLUDES the cash -- the parts are shown so the sum can be checked. */
export const NetWorth: Story = { args: { view: 'netWorth' } };

/** A loan tracked as a negative asset, which is why the total may be below zero. */
export const WithLoan: Story = {
  args: {
    view: 'netWorth',
    categories: [CASH, makeAssetCategory({ id: 3, name: '住宅ローン', color: '#ef4444' })],
    assets: [
      makeCashAsset({ value: 1_525_210 }),
      asset({ id: 9, categoryId: 3, name: '残債', value: -28_000_000 }),
    ],
  },
};

/** Cash only: no toggle, because 現金 and 純資産 would be the same figure. */
export const CashOnly: Story = {
  args: { categories: [CASH], assets: [makeCashAsset({ value: 1_525_210 })] },
};

/** Renders nothing -- the categories have not arrived yet. */
export const Loading: Story = { args: { categories: [], assets: [] } };
