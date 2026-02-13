import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import type { UpcomingEvent } from '../hooks/useForecast';

interface UpcomingEventsProps {
  events: UpcomingEvent[];
}

function UpcomingEvents({ events }: UpcomingEventsProps) {
  if (events.length === 0) {
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
        {events.map((event, index) => {
          const date = new Date(event.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          const daysFromNow = Math.round(
            (date.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
          );
          const daysLabel = daysFromNow === 0 ? '今日' : daysFromNow === 1 ? '明日' : `${daysFromNow}日後`;
          const isToday = daysFromNow === 0;
          const isTomorrow = daysFromNow === 1;

          const showDate = index === 0 || events[index - 1].date !== event.date;
          const isIncome = event.type === 'income';

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
                <span className="text-sm text-slate-300">{event.name}</span>
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

export default UpcomingEvents;
