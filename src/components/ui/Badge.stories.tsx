import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  args: { children: 'ラベル', tone: 'neutral' },
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'success', 'warning', 'danger', 'info', 'accent'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const AllTones: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge {...args} tone="neutral">Neutral</Badge>
      <Badge {...args} tone="success">Success</Badge>
      <Badge {...args} tone="warning">Warning</Badge>
      <Badge {...args} tone="danger">Danger</Badge>
      <Badge {...args} tone="info">Info</Badge>
      <Badge {...args} tone="accent">Accent</Badge>
    </div>
  ),
};
