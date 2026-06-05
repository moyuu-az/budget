import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dialog } from './Dialog';
import { Button } from './Button';

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  // Stories drive open/close via `render`; these args only satisfy the required-prop types.
  args: { open: false, onClose: () => {}, title: 'ダイアログ', children: null },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>ダイアログを開く</Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="カテゴリを削除"
          description="この操作は取り消せません。"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button variant="danger" onClick={() => setOpen(false)}>削除</Button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-content-secondary)]">
            「食費」カテゴリを削除すると、関連するテンプレートの割り当ても解除されます。
          </p>
        </Dialog>
      </>
    );
  },
};
