interface TemplateActionsProps {
  copying: boolean;
  onAddTemplate: () => void;
  onCopyFromLastMonth: () => void;
  onResetToDefaults: () => void;
}

function TemplateActions({
  copying,
  onAddTemplate,
  onCopyFromLastMonth,
  onResetToDefaults,
}: TemplateActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onAddTemplate}
        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        テンプレート追加
      </button>
      <button
        onClick={onCopyFromLastMonth}
        disabled={copying}
        className="px-3 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
        style={{
          background: 'rgba(100, 116, 170, 0.12)',
          border: '1px solid rgba(100, 116, 170, 0.2)',
          color: '#94a3b8',
        }}
      >
        {copying ? 'コピー中...' : '先月からコピー'}
      </button>
      <button
        onClick={onResetToDefaults}
        className="px-3 py-2 rounded-lg text-sm transition-all"
        style={{
          background: 'rgba(100, 116, 170, 0.12)',
          border: '1px solid rgba(100, 116, 170, 0.2)',
          color: '#94a3b8',
        }}
      >
        デフォルトにリセット
      </button>
    </div>
  );
}

export default TemplateActions;
