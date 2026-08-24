import { useId, type CSSProperties } from 'react';
import type { CostType } from '../../types';
import { COST_TYPE_OPTIONS, parseCostType } from '../../utils/cost-type';
import ColorPicker from './ColorPicker';

interface Props {
  name: string;
  color: string;
  type: 'income' | 'expense';
  costType: CostType | null;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onTypeChange: (value: 'income' | 'expense') => void;
  onCostTypeChange: (value: CostType | null) => void;
  onSubmit: () => void;
  inputStyle: CSSProperties;
}

/**
 * Every control is tied to its <label> with htmlFor/id.
 *
 * They were bare <label> elements before, which look right and read wrong: a
 * screen reader announces an unlabelled combobox, and clicking the caption does
 * not focus the field. useId keeps the ids unique if this form is ever rendered
 * twice on one page.
 */
function CategoryForm({
  name,
  color,
  type,
  costType,
  onNameChange,
  onColorChange,
  onTypeChange,
  onCostTypeChange,
  onSubmit,
  inputStyle,
}: Props) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const typeId = `${baseId}-type`;
  const colorId = `${baseId}-color`;
  const costTypeId = `${baseId}-cost-type`;

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
          <label htmlFor={colorId} className="block text-xs text-slate-500 mb-1">
            色
          </label>
          <ColorPicker
            id={colorId}
            value={color}
            onChange={onColorChange}
            className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label htmlFor={nameId} className="block text-xs text-slate-500 mb-1">
            名前
          </label>
          <input
            id={nameId}
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
          <label htmlFor={typeId} className="block text-xs text-slate-500 mb-1">
            種別
          </label>
          <select
            id={typeId}
            value={type}
            onChange={(e) => onTypeChange(e.target.value as 'income' | 'expense')}
            className="rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors appearance-none"
            style={inputStyle}
          >
            <option value="income">収入</option>
            <option value="expense">支出</option>
          </select>
        </div>
        {/* 固定費/変動費 applies to expenses only -- the database refuses the
            combination for income, so offering it would be offering an error. */}
        {type === 'expense' && (
          <div>
            <label htmlFor={costTypeId} className="block text-xs text-slate-500 mb-1">
              費目
            </label>
            <select
              id={costTypeId}
              value={costType ?? ''}
              onChange={(e) => onCostTypeChange(parseCostType(e.target.value))}
              className="rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors appearance-none"
              style={inputStyle}
            >
              {COST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
