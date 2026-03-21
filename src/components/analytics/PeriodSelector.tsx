import { memo } from 'react';

interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodSelectorProps {
  options: PeriodOption[];
  selected: string;
  onChange: (value: string) => void;
}

function PeriodSelector({ options, selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex bg-slate-800/50 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm rounded-md transition-all ${
            selected === opt.value
              ? 'bg-blue-500/20 text-blue-400 font-medium'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default memo(PeriodSelector);
