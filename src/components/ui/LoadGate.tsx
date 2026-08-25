import type { ReactElement, ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { Button } from './Button';
import { Card } from './Card';
import { loadLedgerData } from '../../app/ledger';
import { reportError } from '../../app/reportError';
import type { LoadStatus } from '../../stores/load-status';

interface Props {
  status: LoadStatus;
  /** Height of the placeholder, so the layout does not jump when data lands. */
  height: number;
  /** What is being waited for, announced to screen readers and shown on failure. */
  label: string;
  /**
   * What 再読み込み should re-run. Defaults to the whole ledger load.
   *
   * A panel whose data is NOT part of that load has to say so, or its retry
   * button re-fetches everything except the thing that failed and leaves the
   * error on screen -- a button that visibly does nothing. The per-month
   * amounts and actuals are exactly that case: loadLedgerData deliberately
   * skips them, because which months are needed depends on the screen.
   */
  onRetry?: () => Promise<void>;
  /** Optional so a panel that only needs the placeholder can omit it. */
  children?: ReactNode;
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
//   only way out -- which nothing told the user.
//
//   The retry re-runs the whole ledger load by default, because these panels
//   share their inputs and repairing one alone would leave the screen
//   half-fresh. A panel whose data is outside that load passes `onRetry`;
//   without it the button would re-fetch everything except what failed, which
//   looks identical to a button that does not work.
// ---------------------------------------------------------------------------

export function LoadGate({ status, height, label, onRetry, children }: Props): ReactElement {
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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            // Reported, not swallowed. Every store catches its own failure
            // today, so this cannot reject -- but "cannot reject today" is how
            // an unhandled rejection gets introduced later.
            (onRetry ?? loadLedgerData)().catch(reportError);
          }}
        >
          再読み込み
        </Button>
      </Card>
    );
  }

  return (
    <div role="status" aria-label={`${label}を読み込み中`}>
      {/* The announcement has to be TEXT. role="status" is a live region, and a
          live region announces its CONTENT changing -- an aria-label alone names
          the region without giving a screen reader anything to read out. The
          skeleton beside it is aria-hidden, so without this line the region is
          silent while looking correct to every automated check, including
          getByRole('status', { name }) which reads the label. */}
      <span className="sr-only">{label}を読み込み中</span>
      <Skeleton height={height} className="w-full" />
    </div>
  );
}
