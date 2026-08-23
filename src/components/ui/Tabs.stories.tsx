import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';

const items = [
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '1y', label: '1年' },
];

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
  // Stories drive state via `render`; these args only satisfy the required-prop types.
  args: { items, value: '6m', onChange: () => {}, ariaLabel: '期間' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('6m');
    return <Tabs items={items} value={value} onChange={setValue} ariaLabel="期間" />;
  },
};

export const Small: Story = {
  render: () => {
    const [value, setValue] = useState('3m');
    return <Tabs items={items} value={value} onChange={setValue} ariaLabel="期間" size="sm" />;
  },
};

export const WithDisabled: Story = {
  render: () => {
    const [value, setValue] = useState('3m');
    return (
      <Tabs
        items={[...items, { value: 'custom', label: 'カスタム', disabled: true }]}
        value={value}
        onChange={setValue}
        ariaLabel="期間"
      />
    );
  },
};
