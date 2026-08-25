import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import RecurrenceEditor from './RecurrenceEditor';
import type { Recurrence } from '../../types';

// ---------------------------------------------------------------------------
// The claim under test is not "the inputs render". It is that this component
// NEVER emits a partial recurrence.
//
// Every shape needs different fields, so switching shape has to produce a value
// that is complete on arrival -- an 'interval' without an anchor month is a
// state the database rejects, and letting the form hold it means the user finds
// out at save time, in a message about a field they never saw.
// ---------------------------------------------------------------------------

/** Wraps the controlled component so interactions actually change what is shown. */
function Harness({ initial, onEmit }: { initial: Recurrence; onEmit: (r: Recurrence) => void }) {
  const [value, setValue] = useState<Recurrence>(initial);
  return (
    <RecurrenceEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onEmit(next);
      }}
    />
  );
}

// The clock is pinned because the defaults for 'interval' and 'once' are
// derived from TODAY -- an entry created now almost always starts now. Without
// this the assertions below would drift with the calendar.
const FIXED_TODAY = new Date(2026, 5, 4); // 2026-06-04

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('switching shape', () => {
  it('emits a complete yearly recurrence, carrying the day across', async () => {
    // The common correction: someone sets 「毎月25日」, realises it is annual.
    // Dropping the 25 would make that a retype.
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 25 }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'yearly');

    expect(onEmit).toHaveBeenCalledWith({ kind: 'yearly', month: 6, dayOfMonth: 25 });
  });

  it('emits a complete interval recurrence, anchored to the current month', async () => {
    // An anchor in the past would land a bimonthly bill on the OPPOSITE months
    // from the ones the user expects -- invisible until the forecast is read
    // two months later.
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 10 }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'interval');

    expect(onEmit).toHaveBeenCalledWith({
      kind: 'interval',
      everyMonths: 2,
      anchorMonth: '2026-06',
      dayOfMonth: 10,
    });
  });

  it('emits a complete one-off dated in the current month', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 10 }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'once');

    expect(onEmit).toHaveBeenCalledWith({ kind: 'once', date: '2026-06-10' });
  });

  it('clamps the carried day rather than rolling into the next month', async () => {
    // June has 30 days. `new Date(2026, 5, 31)` is 1 July -- an entry silently
    // moved out of the month the user is looking at.
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 31 }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'once');

    expect(onEmit).toHaveBeenCalledWith({ kind: 'once', date: '2026-06-30' });
  });

  it('carries the day back out of a one-off', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'once', date: '2026-11-20' }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'monthly');

    expect(onEmit).toHaveBeenCalledWith({ kind: 'monthly', dayOfMonth: 20 });
  });

  it('carries a one-off month into yearly, not the current month', async () => {
    // 「11月20日に1回」 becoming annual means every November, not every June.
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'once', date: '2026-11-20' }} onEmit={onEmit} />);

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'yearly');

    expect(onEmit).toHaveBeenCalledWith({ kind: 'yearly', month: 11, dayOfMonth: 20 });
  });
});

describe('which fields are offered', () => {
  it('shows only the day for monthly', () => {
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 1 }} onEmit={vi.fn()} />);

    expect(screen.getByLabelText('日')).toBeInTheDocument();
    expect(screen.queryByLabelText('月')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('起点の月')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('日付')).not.toBeInTheDocument();
  });

  it('shows the month for yearly', () => {
    render(<Harness initial={{ kind: 'yearly', month: 3, dayOfMonth: 20 }} onEmit={vi.fn()} />);

    expect(screen.getByLabelText('月')).toHaveValue('3');
    expect(screen.getByLabelText('日')).toHaveValue(20);
  });

  it('shows the interval and its anchor', () => {
    render(
      <Harness
        initial={{ kind: 'interval', everyMonths: 3, anchorMonth: '2026-01', dayOfMonth: 9 }}
        onEmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('間隔（ヶ月）')).toHaveValue(3);
    expect(screen.getByLabelText('起点の月')).toHaveValue('2026-01');
  });

  it('shows only a date for a one-off', () => {
    render(<Harness initial={{ kind: 'once', date: '2026-11-20' }} onEmit={vi.fn()} />);

    expect(screen.getByLabelText('日付')).toHaveValue('2026-11-20');
    expect(screen.queryByLabelText('日')).not.toBeInTheDocument();
  });
});

describe('bounds', () => {
  it('never commits an interval of 1, which is monthly spelled a second way', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(
      <Harness
        initial={{ kind: 'interval', everyMonths: 3, anchorMonth: '2026-01', dayOfMonth: 9 }}
        onEmit={onEmit}
      />,
    );

    await user.clear(screen.getByLabelText('間隔（ヶ月）'));
    await user.type(screen.getByLabelText('間隔（ヶ月）'), '1');

    // Out of range, so nothing is committed and the parent keeps 3. The
    // alternative -- clamping to 2 on the keystroke -- is what made the field
    // untypeable: the next digit would land after the clamp.
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('stays typeable: clearing and entering a two-digit interval commits that number', async () => {
    // The regression this guards. With per-keystroke clamping, emptying a 3 and
    // typing 12 produced 2, then 21 -- the user watches the number they are
    // typing turn into a different one.
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(
      <Harness
        initial={{ kind: 'interval', everyMonths: 3, anchorMonth: '2026-01', dayOfMonth: 9 }}
        onEmit={onEmit}
      />,
    );

    await user.clear(screen.getByLabelText('間隔（ヶ月）'));
    await user.type(screen.getByLabelText('間隔（ヶ月）'), '12');

    expect(onEmit).toHaveBeenLastCalledWith(expect.objectContaining({ everyMonths: 12 }));
  });

  it('stays typeable for the day, and never commits one above 31', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 5 }} onEmit={onEmit} />);

    await user.clear(screen.getByLabelText('日'));
    await user.type(screen.getByLabelText('日'), '25');
    expect(onEmit).toHaveBeenLastCalledWith({ kind: 'monthly', dayOfMonth: 25 });

    await user.clear(screen.getByLabelText('日'));
    await user.type(screen.getByLabelText('日'), '99');
    // 9 is valid and commits; 99 is not and does not. The last committed value
    // is therefore 9, never 99 and never a silently clamped 31.
    expect(onEmit).toHaveBeenLastCalledWith({ kind: 'monthly', dayOfMonth: 9 });
  });

  it('snaps the field back to the committed value on blur', async () => {
    // A field left empty must not sit there looking like a saved value.
    const user = userEvent.setup();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 5 }} onEmit={vi.fn()} />);

    await user.clear(screen.getByLabelText('日'));
    expect(screen.getByLabelText('日')).toHaveValue(null);

    await user.tab();
    expect(screen.getByLabelText('日')).toHaveValue(5);
  });

  it('never emits a one-off on a date it cannot verify exists', async () => {
    // 2026-02-31 is well-formed and impossible; an entry carrying it would sit
    // in the list, enabled, and never occur. The empty string a date input emits
    // mid-edit is rejected by the same guard, which is what fireEvent produces
    // here -- happy-dom normalises an impossible date to '' exactly as a browser
    // does, so both paths through the guard are the same one.
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'once', date: '2026-11-20' }} onEmit={onEmit} />);

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-02-31' } });

    expect(onEmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('recurrence-summary')).toHaveTextContent('11月20日 (1回のみ)');
  });

  it('emits a one-off on a date that does exist', async () => {
    const onEmit = vi.fn();
    render(<Harness initial={{ kind: 'once', date: '2026-11-20' }} onEmit={onEmit} />);

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-12-01' } });

    expect(onEmit).toHaveBeenCalledWith({ kind: 'once', date: '2026-12-01' });
  });
});

describe('the summary line', () => {
  it('says back what was chosen, in the words the entry list uses', async () => {
    // A recurrence assembled from three controls is easy to get subtly wrong.
    // This is where that is caught -- before saving, not after.
    const user = userEvent.setup();
    render(<Harness initial={{ kind: 'monthly', dayOfMonth: 25 }} onEmit={vi.fn()} />);

    expect(screen.getByTestId('recurrence-summary')).toHaveTextContent('毎月25日');

    await user.selectOptions(screen.getByLabelText('繰り返し'), 'yearly');
    expect(screen.getByTestId('recurrence-summary')).toHaveTextContent('毎年6月25日');
  });
});
