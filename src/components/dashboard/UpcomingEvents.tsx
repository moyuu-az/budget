import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import type { ForecastPoint } from '../../types';
import { useCategoryStore } from '../../stores/useCategoryStore';

interface UpcomingEventsProps {
  events: ForecastPoint[];
}

function UpcomingEvents({ events }: UpcomingEventsProps) {
  const categories = useCategoryStore((s) => s.categories);

  const categoryColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const cat of categories) {
      if (cat.color) {
        map.set(cat.id, cat.color);
      }
    }
    return map;
  }, [categories]);

  // Filter to only points with events, limit to 14 days from today
  const filteredEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 14);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return events.filter(
      (p) => p.eventDetails.length > 0 && p.date <= cutoffStr
    );
  }, [events]);

  // Flatten events for display with running balance
  const flatEvents = useMemo(() => {
    const items: Array<{
      date: string;
      name: string;
      amount: number;
      type: 'income' | 'expense';
      categoryId: number | null;
      isToday: boolean;
      balanceAfter: number;
    }> = [];

    let runningBalance = filteredEvents.length > 0 && filteredEvents[0].isToday
      ? filteredEvents[0].balance
      : filteredEvents[0]?.balance ?? 0;

    // For the first point, if it's today, the balance already includes today's events
    // We need to back-calculate from the first point
    if (filteredEvents.length > 0 && filteredEvents[0].isToday) {
      // Today's balance is already set (events not applied to today in forecast)
      runningBalance = filteredEvents[0].balance;
      for (const detail of filteredEvents[0].eventDetails) {
        items.push({
          date: filteredEvents[0].date,
          name: detail.name,
          amount: detail.amount,
          type: detail.type,
          categoryId: detail.categoryId,
          isToday: true,
          balanceAfter: runningBalance,
        });
      }
      // Continue from subsequent points
      for (let i = 1; i < filteredEvents.length; i++) {
        const point = filteredEvents[i];
        for (const detail of point.eventDetails) {
          if (detail.type === 'income') {
            runningBalance += detail.amount;
          } else {
            runningBalance -= detail.amount;
          }
          items.push({
            date: point.date,
            name: detail.name,
            amount: detail.amount,
            type: detail.type,
            categoryId: detail.categoryId,
            isToday: false,
            balanceAfter: runningBalance,
          });
        }
      }
    } else {
      // No today point or first point is not today
      for (const point of filteredEvents) {
        for (const detail of point.eventDetails) {
          if (detail.type === 'income') {
            runningBalance += detail.amount;
          } else {
            runningBalance -= detail.amount;
          }
          items.push({
            date: point.date,
            name: detail.name,
            amount: detail.amount,
            type: detail.type,
            categoryId: detail.categoryId,
            isToday: !!point.isToday,
            balanceAfter: runningBalance,
          });
        }
      }
    }

    return items;
  }, [filteredEvents]);

  if (flatEvents.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">今後の予定</h2>
        <p className="text-slate-500 text-sm">14日以内の予定はありません</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">今後の予定</h2>
      <ul className="space-y-1">
        {flatEvents.map((event, index) => {
          const date = new Date(event.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const daysFromNow = Math.round(
            (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          const daysLabel = daysFromNow === 0 ? '今日' : daysFromNow === 1 ? '明日' : `${daysFromNow}日後`;
          const isToday = daysFromNow === 0;
          const isTomorrow = daysFromNow === 1;
          const showDate = index === 0 || flatEvents[index - 1].date !== event.date;
          const isIncome = event.type === 'income';

          const catColor = event.categoryId != null
            ? categoryColorMap.get(event.categoryId) ?? '#6b7280'
            : '#6b7280';

          return (
            <motion.li
              key={`${event.date}-${event.name}-${index}`}
              className="flex items-center justify-between rounded-xl px-4 py-2.5 transition-colors hover:bg-white/5"
              style={{
                background: isToday ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                border: isToday && showDate ? '1px solid rgba(59, 130, 246, 0.15)' : '1px solid transparent',
              }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs w-12 font-medium ${showDate ? (isToday ? 'text-blue-400' : isTomorrow ? 'text-blue-300/60' : 'text-slate-500') : 'text-transparent'}`}>
                  {showDate ? label : ''}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: catColor }}
                />
                <span className="text-sm text-slate-300">{event.name}</span>
                {event.isToday && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                    反映済み
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm font-medium tabular-nums ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isIncome ? '+' : '-'}¥{event.amount.toLocaleString()}
                </span>
                <div className="text-right w-28">
                  <p className={`text-xs font-medium ${isToday && showDate ? 'text-blue-400' : 'text-slate-500'}`}>
                    {showDate ? daysLabel : ''}
                  </p>
                  <p className={`text-sm font-medium tabular-nums ${event.balanceAfter < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    ¥<CountUp end={event.balanceAfter} duration={0.6} separator="," preserveValue />
                  </p>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(UpcomingEvents);
