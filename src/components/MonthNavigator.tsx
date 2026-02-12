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

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function MonthNavigator({ yearMonth, onChange }: MonthNavigatorProps) {
  const [year, month] = parseYearMonth(yearMonth);

  const goPrev = () => {
    const d = new Date(year, month - 1, 1);
    onChange(formatYearMonth(d.getFullYear(), d.getMonth()));
  };

  const goNext = () => {
    const d = new Date(year, month + 1, 1);
    onChange(formatYearMonth(d.getFullYear(), d.getMonth()));
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={goPrev}
        className="p-2 rounded-lg text-slate-400 hover:text-white transition-all hover:bg-white/5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-white font-semibold text-lg min-w-[180px] text-center">
        {MONTH_NAMES[month]} {year}
      </span>
      <button
        onClick={goNext}
        className="p-2 rounded-lg text-slate-400 hover:text-white transition-all hover:bg-white/5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default MonthNavigator;
