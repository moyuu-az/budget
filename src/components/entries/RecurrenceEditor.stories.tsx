import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import RecurrenceEditor from './RecurrenceEditor';
import type { Recurrence } from '../../types';

/**
 * Controlled by a wrapper, because the point of this component is what happens
 * BETWEEN the fields: switching shape has to produce a complete value, and a
 * story that pinned `value` would show none of that.
 */
function Harness({ value: initial }: { value: Recurrence }) {
  const [value, setValue] = useState<Recurrence>(initial);
  return (
    <div className="max-w-md">
      <RecurrenceEditor value={value} onChange={setValue} />
      <pre className="mt-4 rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

const meta = {
  title: 'Entries/RecurrenceEditor',
  component: Harness,
  parameters: { layout: 'padded' },
  args: { value: { kind: 'monthly', dayOfMonth: 25 } satisfies Recurrence },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The shape almost every entry has: rent, salary, a subscription. */
export const Monthly: Story = {};

/**
 * 車検, 固定資産税, a year-paid premium.
 *
 * Year-agnostic on purpose -- it shows in every March, including past ones, which
 * is what the analytics screens look back at.
 */
export const Yearly: Story = { args: { value: { kind: 'yearly', month: 3, dayOfMonth: 20 } } };

/**
 * A bimonthly bill. The anchor is what says WHICH two months -- without it,
 * "every two months" has no phase.
 */
export const Interval: Story = {
  args: { value: { kind: 'interval', everyMonths: 2, anchorMonth: '2026-03', dayOfMonth: 10 } },
};

/** A trip booked for November. Happens once and then never again. */
export const Once: Story = { args: { value: { kind: 'once', date: '2026-11-20' } } };

/**
 * The end-of-month case.
 *
 * Stored as 31; the summary and the entry list both show the CLAMPED day, so a
 * February row says 28 rather than contradicting the forecast beside it.
 */
export const EndOfMonth: Story = { args: { value: { kind: 'monthly', dayOfMonth: 31 } } };

/** Every control disabled while a save is in flight. */
export const Saving: Story = {
  render: (args) => (
    <div className="max-w-md">
      <RecurrenceEditor value={args.value} onChange={() => {}} disabled />
    </div>
  ),
};
