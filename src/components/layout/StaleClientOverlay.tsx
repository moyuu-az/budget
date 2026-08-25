import { type ReactElement } from 'react';
import { Button } from '../ui/Button';
import { reloadForNewBuild, useStaleClientStore } from '../../app/staleClient';

/**
 * Shown once the server has refused this tab's bundle as out of date.
 *
 * WHY IT BLOCKS THE PAGE
 *   Every request from this bundle is being refused, so nothing on screen is
 *   still updating and nothing the user does will take effect. Leaving the app
 *   interactive underneath would let someone edit a form that cannot save, or
 *   read figures that stopped refreshing at some unknown point.
 *
 *   The numbers behind it are worse than merely stale: an old build reading a
 *   new response can misread it. That is what the refusal is protecting against
 *   (see shared/contract-version.ts), so covering them is the point rather than
 *   a side effect.
 *
 * WHY THERE IS NO DISMISS
 *   There is nothing to go back to. The only thing that resolves this is a
 *   reload, and an overlay someone can close is one they will close.
 */
function StaleClientOverlay(): ReactElement | null {
  const isStale = useStaleClientStore((s) => s.isStale);
  if (!isStale) return null;

  return (
    <div
      // `alertdialog` rather than `dialog`: this interrupts to report a
      // condition, and it wants the assistive-technology treatment that comes
      // with an alert rather than an ordinary modal's.
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="stale-client-title"
      aria-describedby="stale-client-body"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] p-6 text-center">
        <h2
          id="stale-client-title"
          className="text-base font-semibold text-[var(--color-content-primary)]"
        >
          アプリが更新されました
        </h2>
        <p id="stale-client-body" className="mt-2 text-sm text-[var(--color-content-secondary)]">
          このタブは古いバージョンで動いています。表示中の数字が正しくない可能性があるため、
          再読み込みしてください。
        </p>
        {/* The shared primitive, not hand-rolled classes: this button should
            look like every other primary action, including under a theme change
            nobody remembered this file during. */}
        <Button
          variant="primary"
          onClick={reloadForNewBuild}
          // Focused on mount: there is exactly one thing to do here, so it
          // should take one key.
          autoFocus
          className="mt-4 w-full"
        >
          再読み込み
        </Button>
      </div>
    </div>
  );
}

export default StaleClientOverlay;
