import type { CSSProperties } from 'react';
import ColorPicker from './ColorPicker';

interface Props {
  name: string;
  color: string;
  type: 'income' | 'expense';
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onTypeChange: (value: 'income' | 'expense') => void;
  onSubmit: () => void;
  inputStyle: CSSProperties;
}

function CategoryForm({
  name,
  color,
  type,
  onNameChange,
  onColorChange,
  onTypeChange,
  onSubmit,
  inputStyle,
}: Props) {
  return (
    <div
      className="pt-4"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <h3 className="text-sm font-medium text-slate-400 mb-3">
        カテゴリを追加
      </h3>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-slate-500 mb-1">色</label>
          <ColorPicker
            value={color}
            onChange={onColorChange}
            className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-slate-500 mb-1">名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
            }}
            placeholder="カテゴリ名"
            className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">種別</label>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value as 'income' | 'expense')}
            className="rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors appearance-none"
            style={inputStyle}
          >
            <option value="income">収入</option>
            <option value="expense">支出</option>
          </select>
        </div>
        <button
          onClick={onSubmit}
          disabled={!name.trim()}
          className="px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50"
          style={{
            background: 'rgba(139, 92, 246, 0.7)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

export default CategoryForm;
