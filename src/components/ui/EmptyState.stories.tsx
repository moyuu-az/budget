import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  args: { title: 'データがありません' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    title: '記録がまだありません',
    description: '収支を入力すると、ここに支出トレンドが表示されます。',
  },
};

export const WithAction: Story = {
  args: {
    title: 'テンプレートが未登録です',
    description: '最初のテンプレートを追加して開始しましょう。',
    action: <Button size="sm">テンプレートを追加</Button>,
  },
};
