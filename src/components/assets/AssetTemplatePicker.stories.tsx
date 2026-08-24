import type { Meta, StoryObj } from '@storybook/react-vite';
import AssetTemplatePicker from './AssetTemplatePicker';

const meta = {
  title: 'Assets/AssetTemplatePicker',
  component: AssetTemplatePicker,
  parameters: { layout: 'padded' },
  args: { onPick: () => {} },
} satisfies Meta<typeof AssetTemplatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The starting points offered to a ledger that has never tracked assets.
 * Picking one only PRE-FILLS the category dialog -- nothing is created until it
 * is saved, which is what keeps the feature optional.
 */
export const Default: Story = {};
