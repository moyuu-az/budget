import { useId, useState } from 'react';
import {
  MAX_INTERVAL_MONTHS,
  MIN_INTERVAL_MONTHS,
  describeRecurrence,
  isIsoDate,
  sortDay,
  toIsoDate,
  toYearMonth,
  type Recurrence,
  type RecurrenceKind,
} from '../../../shared/recurrence';

// ---------------------------------------------------------------------------
// Picking WHEN a planned entry happens.
//
// Its own component rather than four more fields inside TemplateEditor, because
// the awkward part is not the inputs -- it is what happens BETWEEN them. Each
// shape needs different fields, and switching shape has to produce a value that
// is valid on arrival: a half-filled 'interval' with no anchor month is a state
// the database will not accept, and letting the form hold it means the user
// discovers that at save time with a message about a field they never saw.
//
// So this component never holds a partial recurrence. Every interaction emits a
// COMPLETE, valid `Recurrence`, and the parent stores nothing else.
//
// WHAT CARRIES ACROSS A SHAPE CHANGE
//   The day. Someone who set 「毎月25日」 and then realises it is annual means
//   the 25th of some month, not the 1st. Dropping it would make the common
//   correction -- monthly to yearly -- a retype.
// ---------------------------------------------------------------------------

interface Props {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
  /** Disables every control while a save is in flight. */
  disabled?: boolean;
}

const KIND_LABELS: Record<RecurrenceKind, string> = {
  monthly: '毎月',
  yearly: '毎年',
  interval: '数ヶ月ごと',
  once: '1回のみ',
};

const inputClass =
  'w-full rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50';

const labelClass = 'block text-xs text-slate-400 mb-1';

/**
 * Builds a valid recurrence of `kind`, carrying over whatever the previous one
 * can supply.
 *
 * The defaults are not arbitrary. The anchor month and the one-off date both
 * default to TODAY's month/date rather than to a fixed value: an entry created
 * now almost always starts now, and an anchor in the past would make a
 * bimonthly bill land on the opposite months from the ones the user expects --
 * a mistake that is invisible until the forecast is read two months later.
 */
function withKind(kind: RecurrenceKind, previous: Recurrence, today: Date): Recurrence {
  const day = sortDay(previous);

  switch (kind) {
    case 'monthly':
      return { kind: 'monthly', dayOfMonth: day };
    case 'yearly':
      return {
        kind: 'yearly',
        month: previous.kind === 'once' ? Number(previous.date.slice(5, 7)) : today.getMonth() + 1,
        dayOfMonth: day,
      };
    case 'interval':
      return {
        kind: 'interval',
        everyMonths: MIN_INTERVAL_MONTHS,
        anchorMonth: toYearMonth(today),
        dayOfMonth: day,
      };
    case 'once': {
      // Constructed in local time and clamped by the Date constructor itself:
      // asking for the 31st of a 30-day month rolls into the next one, which
      // would silently move the entry. Clamping first keeps it in the month the
      // user is looking at.
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return { kind: 'once', date: toIsoDate(new Date(today.getFullYear(), today.getMonth(), Math.min(day, lastDay))) };
    }
  }
}

/**
 * A bounded whole-number field that stays TYPEABLE.
 *
 * WHY THIS IS NOT JUST `<input type="number">` WITH A CLAMP
 *   Clamping on every keystroke makes the field impossible to retype. Clearing
 *   it snaps the value straight back to the minimum, so the next digit lands
 *   AFTER that: emptying an interval of 3 and typing 12 produces 2, then 21.
 *   The user watches the number they are typing turn into a different one.
 *
 *   So the text being typed lives here, and a value is COMMITTED only when the
 *   text parses inside the bounds. In between, the parent keeps the last valid
 *   value -- which is what preserves the promise that this editor never emits a
 *   partial or out-of-range recurrence.
 *
 *   On blur the text snaps back to whatever was actually committed, so a field
 *   left empty or out of range does not sit there looking like a saved value.
 */
function BoundedNumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);

  // Adjusting state during render, the React-sanctioned way to derive from a
  // prop: the parent changes `value` on its own when the shape switches (the
  // day is carried across), and the text has to follow without a frame of the
  // previous number.
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }

  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
        }}
        onBlur={() => setText(String(value))}
        className={inputClass}
      />
    </div>
  );
}

function RecurrenceEditor({ value, onChange, disabled = false }: Props) {
  // Read once per render rather than per handler: two handlers reading the clock
  // a millisecond apart across midnight would disagree about which month "now"
  // is, and the anchor would silently differ from the date beside it.
  const today = new Date();
  const id = useId();

  const dayField = (day: number, onDay: (next: number) => void) => (
    <BoundedNumberField
      id={`${id}-day`}
      label="日"
      value={day}
      min={1}
      max={31}
      disabled={disabled}
      onCommit={onDay}
    />
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor={`${id}-kind`}>
          繰り返し
        </label>
        <select
          id={`${id}-kind`}
          value={value.kind}
          disabled={disabled}
          onChange={(e) => onChange(withKind(e.target.value as RecurrenceKind, value, today))}
          className={inputClass}
        >
          {(Object.keys(KIND_LABELS) as RecurrenceKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {value.kind === 'monthly' && dayField(value.dayOfMonth, (dayOfMonth) => onChange({ ...value, dayOfMonth }))}

        {value.kind === 'yearly' && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${id}-month`}>
                月
              </label>
              <select
                id={`${id}-month`}
                value={value.month}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
                className={inputClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {month}月
                  </option>
                ))}
              </select>
            </div>
            {dayField(value.dayOfMonth, (dayOfMonth) => onChange({ ...value, dayOfMonth }))}
          </>
        )}

        {value.kind === 'interval' && (
          <>
            <BoundedNumberField
              id={`${id}-every`}
              label="間隔（ヶ月）"
              value={value.everyMonths}
              min={MIN_INTERVAL_MONTHS}
              max={MAX_INTERVAL_MONTHS}
              disabled={disabled}
              onCommit={(everyMonths) => onChange({ ...value, everyMonths })}
            />
            {dayField(value.dayOfMonth, (dayOfMonth) => onChange({ ...value, dayOfMonth }))}
            <div className="col-span-2">
              <label className={labelClass} htmlFor={`${id}-anchor`}>
                起点の月
              </label>
              <input
                id={`${id}-anchor`}
                type="month"
                value={value.anchorMonth}
                disabled={disabled}
                // Ignored when the field is cleared: <input type="month"> emits
                // '' while the user is retyping, and storing that would produce
                // a recurrence that occurs in no month at all.
                onChange={(e) => e.target.value && onChange({ ...value, anchorMonth: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">
                この月から数えます。{value.everyMonths}ヶ月ごとに発生します。
              </p>
            </div>
          </>
        )}

        {value.kind === 'once' && (
          <div className="col-span-2">
            <label className={labelClass} htmlFor={`${id}-date`}>
              日付
            </label>
            <input
              id={`${id}-date`}
              type="date"
              value={value.date}
              disabled={disabled}
              // isIsoDate rejects both the empty string mid-edit and a date that
              // does not exist. A one-off on 2026-02-31 would sit in the list,
              // enabled, and never occur -- the household budgets for something
              // the forecast does not contain.
              onChange={(e) => isIsoDate(e.target.value) && onChange({ kind: 'once', date: e.target.value })}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Says back what was chosen, in the same words the entry list will use.
          A recurrence assembled from three controls is easy to get subtly wrong
          -- an anchor a month off, a 12-month interval meant as 'yearly' -- and
          this is where that is caught, before saving. */}
      <p className="text-xs text-slate-400" data-testid="recurrence-summary">
        {describeRecurrence(value)}
      </p>
    </div>
  );
}

export default RecurrenceEditor;
