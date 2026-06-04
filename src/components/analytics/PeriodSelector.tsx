import { memo } from 'react';
import { Tabs } from '../ui/Tabs';
import type { AnalyticsPeriod } from '../../types/ui';

interface PeriodOption {
  value: AnalyticsPeriod;
  label: string;
}

interface PeriodSelectorProps {
  options: PeriodOption[];
  selected: AnalyticsPeriod;
  onChange: (value: AnalyticsPeriod) => void;
}

function PeriodSelector({ options, selected, onChange }: PeriodSelectorProps) {
  return (
    <Tabs
      items={options.map((opt) => ({ value: opt.value, label: opt.label }))}
      value={selected}
      onChange={onChange}
      ariaLabel="分析期間"
      size="sm"
    />
  );
}

export default memo(PeriodSelector);
