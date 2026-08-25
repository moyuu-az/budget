import type { Meta, StoryObj } from '@storybook/react-vite';
import AssetCategoryCard from './AssetCategoryCard';
import { makeAsset, makeAssetCategory, makeCashCategory } from '../../test/factories';
import type { Asset } from '../../types';

const nisa = makeAssetCategory({
  id: 1,
  name: 'NISA',
  fields: [
    { key: 'f1', label: '銘柄', type: 'text', required: true, unit: null },
    { key: 'f2', label: '証券会社', type: 'text', required: false, unit: null },
    { key: 'f3', label: '保有数量', type: 'number', required: false, unit: '口' },
    { key: 'f4', label: '取得単価', type: 'number', required: false, unit: '円' },
  ],
});

// kind: 'cash' -- so this story shows the 現在の残高 badge and NO delete button.
const cash = makeCashCategory({ id: 2 });

const asset = (overrides: Partial<Asset>): Asset =>
  makeAsset({ name: 'つみたて投資枠', value: 1_200_000, ...overrides });

const meta = {
  title: 'Assets/AssetCategoryCard',
  component: AssetCategoryCard,
  parameters: { layout: 'padded' },
  // Handlers are inert here: the stories exist to show how a category's own
  // field definitions shape the table, not to exercise the callbacks.
  args: {
    onAddAsset: () => {},
    onEditAsset: () => {},
    onDeleteAsset: () => {},
    onEditCategory: () => {},
    onDeleteCategory: () => {},
  },
} satisfies Meta<typeof AssetCategoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The columns come from the category's field definitions, not from a fixed list. */
export const Nisa: Story = {
  args: {
    category: nisa,
    assets: [
      asset({
        id: 1,
        fields: { f1: 'eMAXIS Slim 全世界株式', f2: 'SBI証券', f3: 340_000, f4: 21_500 },
      }),
      asset({
        id: 2,
        name: '成長投資枠',
        value: 800_000,
        fields: { f1: 'VTI', f2: '楽天証券', f3: 12, f4: 42_000 },
      }),
    ],
  },
};

/** The same component, a different shape: one column instead of four. */
export const Cash: Story = {
  args: {
    category: cash,
    assets: [
      asset({ id: 3, categoryId: 2, name: '生活防衛資金', value: 2_000_000, fields: { f1: '住信SBI' } }),
    ],
  },
};

/** A category may legitimately carry no parameters at all. */
export const NoParameters: Story = {
  args: {
    category: { ...cash, fields: [] },
    assets: [asset({ id: 4, categoryId: 2, name: '財布', value: 32_000, fields: {} })],
  },
};

export const Empty: Story = {
  args: { category: nisa, assets: [] },
};

/** A loan balance tracked as an asset: the total has to be able to go down. */
export const NegativeValue: Story = {
  args: {
    category: { ...cash, name: '住宅ローン' },
    assets: [asset({ id: 5, categoryId: 2, name: '残債', value: -28_000_000, fields: {} })],
  },
};
