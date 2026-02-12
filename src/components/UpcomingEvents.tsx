import { motion } from 'framer-motion';
import CountUp from 'react-countup';

interface UpcomingEvent {
  date: string;
  events: string[];
  balanceAfter: number;
}

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
      <ul className="space-y-2">
        {events.map((event, index) => {
          const date = new Date(event.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          const daysFromNow = Math.round(
            (date.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
          );
          const daysLabel = daysFromNow === 0 ? '今日' : daysFromNow === 1 ? '明日' : `${daysFromNow}日後`;
          const isToday = daysFromNow === 0;
          const isTomorrow = daysFromNow === 1;

          return (
            <motion.li
              key={event.date}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/5"
              style={{
                background: isToday ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                border: isToday ? '1px solid rgba(59, 130, 246, 0.15)' : '1px solid transparent',
              }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs w-12 font-medium ${isToday ? 'text-blue-400' : isTomorrow ? 'text-blue-300/60' : 'text-slate-500'}`}>
                  {label}
                </span>
                <div>
                  {event.events.map((e, i) => (
                    <span key={i} className="text-sm text-slate-300">
                      {i > 0 && ', '}{e}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{daysLabel}</p>
                <p className={`text-sm font-medium tabular-nums ${event.balanceAfter < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  ¥<CountUp end={event.balanceAfter} duration={0.6} separator="," preserveValue />
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export default UpcomingEvents;
