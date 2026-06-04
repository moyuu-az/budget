import type { ReactElement } from 'react';
import { Dialog } from '../ui/Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
}

const shortcuts: Shortcut[] = [
  { keys: ['G', 'D'], label: 'ダッシュボードへ移動' },
  { keys: ['G', 'E'], label: '収支管理へ移動' },
  { keys: ['G', 'H'], label: '履歴へ移動' },
  { keys: ['G', 'A'], label: '分析へ移動' },
  { keys: ['G', 'S'], label: '設定へ移動' },
  { keys: ['⌘/Ctrl', '\\'], label: 'サイドバーの開閉' },
  { keys: ['?'], label: 'このヘルプを表示' },
];

function Kbd({ children }: { children: string }): ReactElement {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-content-secondary)]">
      {children}
    </kbd>
  );
}

function ShortcutHelpDialog({ open, onClose }: Props): ReactElement {
  return (
    <Dialog open={open} onClose={onClose} title="キーボードショートカット" size="sm">
      <ul className="space-y-3">
        {shortcuts.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--color-content-secondary)]">{s.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-xs text-[var(--color-content-muted)]">then</span>
                  )}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export default ShortcutHelpDialog;
