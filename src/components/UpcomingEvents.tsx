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
      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-semibold text-white mb-4">Upcoming Events</h2>
        <p className="text-slate-500 text-sm">No events in the next 14 days</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
      <h2 className="text-lg font-semibold text-white mb-4">Upcoming Events</h2>
      <ul className="space-y-3">
        {events.map((event) => {
          const date = new Date(event.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          const daysFromNow = Math.round(
            (date.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
          );
          const daysLabel = daysFromNow === 0 ? 'Today' : daysFromNow === 1 ? 'Tomorrow' : `${daysFromNow} days`;

          return (
            <li key={event.date} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-12">{label}</span>
                <div>
                  {event.events.map((e, i) => (
                    <span key={i} className="text-sm text-slate-300">
                      {i > 0 && ', '}{e}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{daysLabel}</p>
                <p className={`text-sm font-medium ${event.balanceAfter < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  ¥{event.balanceAfter.toLocaleString()}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default UpcomingEvents;
