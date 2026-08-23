import { useState, type ReactElement } from 'react';
import { Select } from '../ui/Select';
import { useSessionStore } from '../../stores/useSessionStore';
import { switchLedger } from '../../app/ledger';
import { reportError } from '../../app/reportError';

// ---------------------------------------------------------------------------
// Chooses which ledger the app is showing.
//
// This is the only control in the application that knows ledgers exist. Every
// other view is written as if there were one set of numbers, because from its
// point of view there is -- the active ledger is decided here and travels in a
// request header from then on.
// ---------------------------------------------------------------------------

/** Marks the shared household ledger apart from a private one at a glance. */
const KIND_LABEL: Record<'shared' | 'personal', string> = {
  shared: '共有',
  personal: '個人',
};

function LedgerSwitcher(): ReactElement | null {
  const session = useSessionStore((s) => s.session);
  const activeLedgerId = useSessionStore((s) => s.activeLedgerId);
  const [switching, setSwitching] = useState(false);

  // One ledger means nothing to choose between; showing a select would only
  // suggest there is somewhere else to go.
  if (!session || session.ledgers.length < 2 || activeLedgerId === null) return null;

  const handleChange = (ledgerId: number): void => {
    setSwitching(true);
    switchLedger(ledgerId)
      .catch(reportError)
      .finally(() => setSwitching(false));
  };

  return (
    <Select
      label="家計簿"
      aria-label="表示する家計簿"
      value={activeLedgerId}
      disabled={switching}
      onChange={(event) => handleChange(Number(event.target.value))}
      options={session.ledgers.map((ledger) => ({
        value: ledger.id,
        label: `${ledger.name}（${KIND_LABEL[ledger.kind]}）`,
      }))}
    />
  );
}

export default LedgerSwitcher;
