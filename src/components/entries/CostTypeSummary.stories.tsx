import type { Meta, StoryObj } from '@storybook/react-vite';
import CostTypeSummary from './CostTypeSummary';

const meta = {
  title: 'Entries/CostTypeSummary',
  component: CostTypeSummary,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CostTypeSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {
  args: { breakdown: { fixed: 240_000, variable: 95_000, unclassified: 0, total: 335_000 } },
};

/** Unclassified is shown, never folded into 変動費 -- the ratio would flatter. */
export const WithUnclassified: Story = {
  args: { breakdown: { fixed: 180_000, variable: 60_000, unclassified: 45_000, total: 285_000 } },
};

export const AllFixed: Story = {
  args: { breakdown: { fixed: 200_000, variable: 0, unclassified: 0, total: 200_000 } },
};

/** Renders nothing: a month with no expenses has no split to show. */
export const Empty: Story = {
  args: { breakdown: { fixed: 0, variable: 0, unclassified: 0, total: 0 } },
};
