import type { ReactElement, ReactNode } from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { loadLedgerData } from '../../app/ledger';
import type { LoadStatus } from '../../stores/load-status';

interface Props {
  status: LoadStatus;
  /** Height of the placeholder, so the layout does not jump when data lands. */
  height: number;
  /** What is being waited for, announced to screen readers and shown on failure. */
  label: string;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// "Not yet" and "it failed" both look nothing like "there is none".
//
// WHY THIS IS A COMPONENT RATHER THAN AN `if` AT EACH SITE
//   The dashboard has several panels fed by the same fetches, and the judgement
//   they share is not obvious: a panel with a POSITIVE empty state -- 「14日以内
//   の予定はありません」, 「データがありません」 -- turns an empty array into a
//   confident false statement. That is worse than a wrong number, because the
//   user has no reason to doubt it.
//
//   Written out per panel, that judgement gets made three times and forgotten
//   once. It already was: the first version of the readiness guard covered the
//   chart and the minimum-balance card and left 今後の予定 announcing that
//   nothing was coming up, on every cold load.
//
//   So panels declare what they are waiting for, and this decides what to show.
//
// AND FAILURE IS NOT A LONGER WAIT
//   A failed fetch used to be indistinguishable from a slow one: the skeleton
//   pulsed forever, no error stayed on screen, and reloading the page was the
//   only way out -- which nothing told the user. The retry re-runs the whole
//   ledger load, because these panels share their inputs and repairing one of
//   them alone would leave the screen half-fresh.
// ---------------------------------------------------------------------------

export function LoadGate({ status, height, label, children }: Props): ReactElement {
  if (status === 'ready') return <>{children}</>;

  if (status === 'error') {
    return (
      <Card padding="md" className="flex flex-col items-start gap-3" style={{ minHeight: height }}>
        <div>
          <p className="text-sm font-medium text-[var(--color-content-primary)]">
            {label}を読み込めませんでした
          </p>
          <p className="mt-1 text-xs text-[var(--color-content-secondary)]">
            通信に失敗した可能性があります。
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void loadLedgerData()}>
          再読み込み
        </Button>
      </Card>
    );
  }

  return (
    <div role="status" aria-label={`${label}を読み込み中`}>
      <Skeleton height={height} className="w-full" />
    </div>
  );
}
