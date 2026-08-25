import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import { useTemplateStore } from '../../../stores/useTemplateStore';
import { combineStatus } from '../../../stores/load-status';
import { toYearMonth } from '../../../utils/forecast';
import { useCashFlowData } from '../../../hooks/useCashFlowData';
import { useMonthLoaded } from '../../../hooks/useMonthLoaded';
import { LoadGate } from '../../ui/LoadGate';
import { SankeyCanvas } from './SankeyCanvas';
import { SankeyTooltip, type TooltipState } from './SankeyTooltip';

function SankeyChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  });
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => toYearMonth(new Date()));
  const templatesStatus = useTemplateStore((s) => s.status);

  const currentYearMonth = useMemo(() => toYearMonth(new Date()), []);

  const goPrevMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      return toYearMonth(d);
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m, 1);
      return toYearMonth(d);
    });
  }, []);

  // Fetch on the month changing -- and on the LEDGER changing, which the shared
  // hook is what supplies. The dedupe that used to live in a ref is now the
  // store's own: a ref remembers that a month was ASKED FOR, which is the wrong
  // memory -- a month whose fetch FAILED was asked for, so the retry button
  // below could never re-run it.
  //
  // 'amounts' only: the flow diagram reads planned figures and never the
  // recorded actuals, and waiting for actuals nobody fetches here would leave it
  // loading forever.
  const { status: monthStatus, retry } = useMonthLoaded(selectedYearMonth, { actuals: false });

  // THIS PANEL STATES SOMETHING ABOUT MONEY, SO IT GATES LIKE THE REST.
  //
  // Its empty state is 「データがありません」 -- a positive claim, and a false
  // one while the templates or this month's amounts are still in flight. It is
  // not covered by the dashboard's shared readiness because it has its OWN month
  // selector: the user can page back to a month nothing else on the screen
  // fetched, and the dashboard's status knows nothing about that month.
  //
  const status = combineStatus(templatesStatus, monthStatus);

  const cashFlowData = useCashFlowData(selectedYearMonth);

  const handleMouseMove = useCallback((e: React.MouseEvent, content: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      content,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const titleText = useMemo(() => {
    if (selectedYearMonth === currentYearMonth) return '今月のキャッシュフロー';
    const [y, m] = selectedYearMonth.split('-').map(Number);
    return `${y}年${m}月のキャッシュフロー`;
  }, [selectedYearMonth, currentYearMonth]);

  const isLatestMonth = selectedYearMonth >= currentYearMonth;

  const navHeader = (
    <div className="flex items-center gap-2 mb-4">
      <button
        aria-label="前の月"
        onClick={goPrevMonth}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-lg font-semibold text-white">{titleText}</h2>
      <button
        aria-label="次の月"
        onClick={goNextMonth}
        disabled={isLatestMonth}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  if (status !== 'ready') {
    return (
      <div ref={containerRef} className="glass rounded-2xl p-6">
        {navHeader}
        <LoadGate status={status} height={150} label="キャッシュフロー" onRetry={retry} />
      </div>
    );
  }

  if (!cashFlowData) {
    return (
      <div ref={containerRef} className="glass rounded-2xl p-6">
        {navHeader}
        <div className="flex items-center justify-center" style={{ minHeight: 150 }}>
          <p className="text-slate-500 text-sm">データがありません</p>
        </div>
      </div>
    );
  }

  const { summary } = cashFlowData;

  return (
    <div ref={containerRef} className="glass rounded-2xl p-6 relative">
      {navHeader}
      <SankeyCanvas
        cashFlowData={cashFlowData}
        containerRef={containerRef}
        onHover={handleMouseMove}
        onHoverEnd={handleMouseLeave}
      />

      {/* Summary footer */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-white/5">
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">収入</div>
          <div className="text-sm font-medium text-emerald-400">
            ¥{Math.round(summary.totalIncome).toLocaleString()}
          </div>
        </div>
        <div className="text-slate-600">−</div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">支出</div>
          <div className="text-sm font-medium text-slate-300">
            ¥{Math.round(summary.totalExpenses).toLocaleString()}
          </div>
        </div>
        <div className="text-slate-600">=</div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">
            {summary.net >= 0 ? '貯蓄' : '不足'}
          </div>
          <div
            className={`text-sm font-bold ${
              summary.net >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {summary.net >= 0 ? '+' : '-'}¥{Math.abs(Math.round(summary.net)).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <SankeyTooltip tooltip={tooltip} />
    </div>
  );
}

export default memo(SankeyChart);
