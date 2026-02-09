import type { EntryTemplate, MonthlyAmountsMap } from '../types';
import { useForecast } from '../hooks/useForecast';
import BalanceDisplay from './BalanceDisplay';
import ForecastChart from './ForecastChart';
import UpcomingEvents from './UpcomingEvents';

interface DashboardProps {
  balance: number;
  templates: EntryTemplate[];
  monthlyAmountsMap: MonthlyAmountsMap;
  onUpdateBalance: (balance: number) => Promise<void>;
}

function Dashboard({ balance, templates, monthlyAmountsMap, onUpdateBalance }: DashboardProps) {
  const { forecast, minimumPoint, upcomingEvents } = useForecast(balance, templates, monthlyAmountsMap);

  const activeCount = templates.filter((t) => t.enabled).length;
  const incomeCount = templates.filter((t) => t.enabled && t.type === 'income').length;
  const expenseCount = templates.filter((t) => t.enabled && t.type === 'expense').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BalanceDisplay balance={balance} onUpdate={onUpdateBalance} />
        {minimumPoint && (
          <div className={`rounded-2xl p-6 shadow-lg ${
            minimumPoint.balance < 0
              ? 'bg-gradient-to-br from-red-600 to-red-800'
              : minimumPoint.balance < 50000
                ? 'bg-gradient-to-br from-amber-600 to-amber-800'
                : 'bg-gradient-to-br from-green-600 to-green-800'
          }`}>
            <p className="text-sm font-medium opacity-80 mb-1">Minimum Balance</p>
            <p className="text-2xl font-bold text-white">
              ¥{minimumPoint.balance.toLocaleString()}
            </p>
            <p className="text-xs opacity-70 mt-1">
              {new Date(minimumPoint.date).toLocaleDateString('ja-JP')}
            </p>
          </div>
        )}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <p className="text-slate-400 text-sm font-medium mb-1">Active Templates</p>
          <p className="text-2xl font-bold text-white">{activeCount}</p>
          <p className="text-xs text-slate-500 mt-1">
            {incomeCount} income, {expenseCount} expense
          </p>
        </div>
      </div>
      <ForecastChart data={forecast} minimumPoint={minimumPoint} />
      <UpcomingEvents events={upcomingEvents} />
    </div>
  );
}

export default Dashboard;
