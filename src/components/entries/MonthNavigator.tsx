import { toYearMonth } from '../../../shared/recurrence';

interface MonthNavigatorProps {
  yearMonth: string;
  onChange: (yearMonth: string) => void;
}

const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
];

function parseYearMonth(ym: string): [number, number] {
  const [y, m] = ym.split('-').map(Number);
  return [y, m - 1];
}

function MonthNavigator({ yearMonth, onChange }: MonthNavigatorProps) {
  const [year, month] = parseYearMonth(yearMonth);

  // toYearMonth from shared/recurrence.ts, not a local copy.
  //
  // This module used to format the string itself. The result was identical, and
  // that is the problem: this application's whole date story rests on "local
  // time throughout, deliberately", and two implementations of the same
  // conversion are two places for that to stop being true -- silently, since
  // both would keep agreeing in JST.
  const goPrev = () => onChange(toYearMonth(new Date(year, month - 1, 1)));
  const goNext = () => onChange(toYearMonth(new Date(year, month + 1, 1)));

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={goPrev}
        aria-label="前月"
        className="p-2 rounded-lg text-slate-400 hover:text-white transition-all hover:bg-white/5"
      >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="flex-1 text-center text-white font-semibold text-lg sm:flex-none sm:min-w-[180px]">
        {year}年{MONTH_NAMES[month]}
      </span>
      <button
        type="button"
        onClick={goNext}
        aria-label="翌月"
        className="p-2 rounded-lg text-slate-400 hover:text-white transition-all hover:bg-white/5"
      >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default MonthNavigator;
