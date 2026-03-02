import { useState, useRef, useEffect, useCallback } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { useToastStore } from '../../stores/useToastStore';
import { formatWithCommas, handleCurrencyInput, parseCommaNumber } from '../../utils/currency';
import TemplateEditor from './TemplateEditor';
import type { EntryTemplate } from '../../types';

interface Props {
  template: EntryTemplate;
  yearMonth: string;
}

function EntryRow({ template, yearMonth }: Props) {
  const templates = useTemplateStore((s) => s.templates);
  const toggleTemplate = useTemplateStore((s) => s.toggleTemplate);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const monthlyActualsMap = useMonthlyStore((s) => s.monthlyActualsMap);
  const setMonthlyAmount = useMonthlyStore((s) => s.setMonthlyAmount);
  const setMonthlyActual = useMonthlyStore((s) => s.setMonthlyActual);
  const addToast = useToastStore((s) => s.addToast);

  const [editingPlanned, setEditingPlanned] = useState(false);
  const [editingActual, setEditingActual] = useState(false);
  const [plannedStr, setPlannedStr] = useState('');
  const [actualStr, setActualStr] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const plannedInputRef = useRef<HTMLInputElement>(null);
  const actualInputRef = useRef<HTMLInputElement>(null);

  // Resolve current planned amount
  const resolvedPlanned = resolveAmount(template.id, yearMonth, monthlyAmountsMap, templates);
  const monthMap = monthlyAmountsMap.get(yearMonth);
  const hasMonthlyOverride = monthMap?.has(template.id) ?? false;

  // Resolve current actual amount
  const actualMap = monthlyActualsMap.get(yearMonth);
  const actualAmount = actualMap?.get(template.id) ?? null;

  // Focus input when editing starts
  useEffect(() => {
    if (editingPlanned && plannedInputRef.current) {
      plannedInputRef.current.focus();
      plannedInputRef.current.select();
    }
  }, [editingPlanned]);

  useEffect(() => {
    if (editingActual && actualInputRef.current) {
      actualInputRef.current.focus();
      actualInputRef.current.select();
    }
  }, [editingActual]);

  const handleToggle = useCallback(async () => {
    try {
      await toggleTemplate(template.id, !template.enabled);
    } catch {
      addToast('切り替えに失敗しました', 'error');
    }
  }, [template.id, template.enabled, toggleTemplate, addToast]);

  const startEditPlanned = () => {
    setPlannedStr(formatWithCommas(resolvedPlanned));
    setEditingPlanned(true);
  };

  const savePlanned = async () => {
    const value = parseCommaNumber(plannedStr);
    setEditingPlanned(false);
    try {
      await setMonthlyAmount(template.id, yearMonth, value);
    } catch {
      addToast('金額の保存に失敗しました', 'error');
    }
  };

  const cancelPlanned = () => {
    setEditingPlanned(false);
  };

  const startEditActual = () => {
    setActualStr(actualAmount !== null ? formatWithCommas(actualAmount) : '');
    setEditingActual(true);
  };

  const saveActual = async () => {
    const value = parseCommaNumber(actualStr);
    setEditingActual(false);
    try {
      await setMonthlyActual(template.id, yearMonth, value);
    } catch {
      addToast('実績の保存に失敗しました', 'error');
    }
  };

  const cancelActual = () => {
    setEditingActual(false);
  };

  const handlePlannedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') savePlanned();
    if (e.key === 'Escape') cancelPlanned();
  };

  const handleActualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveActual();
    if (e.key === 'Escape') cancelActual();
  };

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/30 transition-colors ${
          !template.enabled ? 'opacity-50' : ''
        }`}
      >
        {/* Toggle */}
        <button
          onClick={handleToggle}
          className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${
            template.enabled ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
              template.enabled ? 'left-[17px]' : 'left-0.5'
            }`}
          />
        </button>

        {/* Name + day */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm truncate ${template.enabled ? 'text-slate-200' : 'text-slate-500'}`}>
            {template.name}
          </span>
          <span className="text-xs text-slate-500 ml-1.5">{template.dayOfMonth}日</span>
        </div>

        {/* Planned amount */}
        <div className="w-28 text-right">
          {editingPlanned ? (
            <input
              ref={plannedInputRef}
              type="text"
              inputMode="numeric"
              value={plannedStr}
              onChange={(e) => setPlannedStr(handleCurrencyInput(e.target.value))}
              onKeyDown={handlePlannedKeyDown}
              onBlur={savePlanned}
              className="w-full rounded bg-slate-700/70 border border-blue-500/50 px-2 py-0.5 text-sm text-white text-right tabular-nums focus:outline-none"
            />
          ) : (
            <button
              onClick={startEditPlanned}
              className="text-right w-full group"
              title={hasMonthlyOverride ? '月別設定' : 'デフォルト金額'}
            >
              <span
                className={`text-sm tabular-nums ${
                  hasMonthlyOverride
                    ? 'text-slate-200'
                    : 'text-slate-400'
                } group-hover:text-blue-400 transition-colors`}
              >
                ¥{formatWithCommas(resolvedPlanned)}
              </span>
              {!hasMonthlyOverride && (
                <span className="text-[10px] text-slate-500 block leading-tight">デフォルト</span>
              )}
            </button>
          )}
        </div>

        {/* Actual amount */}
        <div className="w-28 text-right">
          {editingActual ? (
            <input
              ref={actualInputRef}
              type="text"
              inputMode="numeric"
              value={actualStr}
              onChange={(e) => setActualStr(handleCurrencyInput(e.target.value))}
              onKeyDown={handleActualKeyDown}
              onBlur={saveActual}
              className="w-full rounded bg-slate-700/70 border border-emerald-500/50 px-2 py-0.5 text-sm text-white text-right tabular-nums focus:outline-none"
            />
          ) : (
            <button
              onClick={startEditActual}
              className="text-right w-full group"
              title="実績金額"
            >
              {actualAmount !== null ? (
                <span className="text-sm tabular-nums text-emerald-400 group-hover:text-emerald-300 transition-colors">
                  ¥{formatWithCommas(actualAmount)}
                </span>
              ) : (
                <span className="text-sm text-slate-600 group-hover:text-slate-400 transition-colors">
                  --
                </span>
              )}
            </button>
          )}
        </div>

        {/* Edit button */}
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          title="テンプレート編集"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {/* Inline template editor */}
      {showEditor && (
        <div className="ml-8 mb-2">
          <TemplateEditor
            template={template}
            onSave={() => setShowEditor(false)}
            onCancel={() => setShowEditor(false)}
          />
        </div>
      )}
    </>
  );
}

export default EntryRow;
