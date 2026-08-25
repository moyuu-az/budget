import type { Meta, StoryObj } from '@storybook/react-vite';
import DormantEntries from './DormantEntries';
import { intervalOn, makeTemplate, onceOn, yearlyOn } from '../../test/factories';

/**
 * The entries that exist but do not fall in the month on screen.
 *
 * The section is not a nicety. 収支管理 states a 支出合計, and entries excluded
 * from it silently would make that figure unexplainable: the household knows it
 * pays 車検, does not see it, and cannot tell whether the app forgot it or
 * whether this simply is not its month.
 */
const meta = {
  title: 'Entries/DormantEntries',
  component: DormantEntries,
  parameters: { layout: 'padded' },
  args: {
    yearMonth: '2026-06',
    templates: [
      makeTemplate({ id: 1, name: '車検', defaultAmount: 120_000, recurrence: yearlyOn(9, 12) }),
      makeTemplate({ id: 2, name: '固定資産税', defaultAmount: 45_000, recurrence: intervalOn(3, '2026-04', 30) }),
      makeTemplate({ id: 3, name: '旅行', defaultAmount: 200_000, recurrence: onceOn('2026-11-20') }),
    ],
  },
} satisfies Meta<typeof DormantEntries>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed, which is how it opens: in a typical month nobody needs these rows. */
export const Collapsed: Story = {};

/** A disabled entry is doubly absent, and sorts to the bottom. */
export const WithDisabled: Story = {
  args: {
    templates: [
      makeTemplate({ id: 1, name: '車検', defaultAmount: 120_000, recurrence: yearlyOn(9, 12) }),
      makeTemplate({
        id: 4, name: '解約したサブスク', enabled: false, defaultAmount: 1_200, recurrence: yearlyOn(1, 15),
      }),
    ],
  },
};

/** Income shows too -- a yearly bonus is as absent from June as a yearly bill. */
export const WithIncome: Story = {
  args: {
    templates: [
      makeTemplate({ id: 5, name: '賞与', type: 'income', defaultAmount: 600_000, recurrence: yearlyOn(7, 10) }),
      makeTemplate({ id: 1, name: '車検', defaultAmount: 120_000, recurrence: yearlyOn(9, 12) }),
    ],
  },
};

/** Renders nothing at all: every entry falls in this month. */
export const Empty: Story = { args: { templates: [] } };
