import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { reloadForNewBuild } from '../../app/staleClient';

// ---------------------------------------------------------------------------
// A SCREEN THAT CANNOT BE SHOWN MUST SAY SO.
//
// WHY THIS EXISTS
//   Every screen but the dashboard is a `lazy()` chunk, and a chunk is a
//   separate file fetched at the moment it is opened. Two ordinary things make
//   that fetch fail:
//
//     - A DEPLOY. This app is deployed by hand while tabs stay open (DEPLOY.md),
//       and Vite gives every build new hashed filenames. The chunk an open tab
//       asks for stopped existing the moment the new revision took traffic, so
//       the request 404s.
//     - A phone that lost signal between opening the app and pressing a tab.
//
//   Without a boundary, `lazy()`'s rejection propagates to the root and React
//   unmounts the whole tree: the tab goes WHITE, with the address bar still
//   showing the screen that was asked for. Nothing on the page says what
//   happened, and the state that survives -- the URL -- makes it look like the
//   app simply renders nothing at that address.
//
// IT CATCHES MORE THAN A MISSING CHUNK
//   Any error thrown while the screen renders lands here, including an ordinary
//   bug in the screen itself. That is deliberate -- the alternative for those is
//   the same white page -- but it is why the message below does not ASSERT a
//   cause. It names the two likely ones and leads with the action, because
//   telling somebody "the app was updated" when it was not is worse than saying
//   nothing.
//
// WHY THE ONLY OFFER IS A RELOAD
//   `lazy()` caches the rejected promise. Re-rendering the same lazy component
//   re-throws the SAME failure without re-fetching anything, so a "retry" button
//   that only resets this boundary would look like it did something and change
//   nothing. A reload is what actually asks the server for the current build,
//   and after a deploy that is also the right answer -- the same one
//   StaleClientOverlay gives for the same underlying cause.
//
// WHY IT IS INSIDE THE ANIMATED WRAPPER
//   It is keyed by the screen (see App.tsx), so opening a different screen
//   clears it. A boundary above the router would latch the error over every
//   subsequent navigation, turning one missing chunk into an app that is stuck.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately console rather than reportError: a toast is the wrong shape
    // for this (the screen behind it is empty, so there is nothing to return
    // to), and the message below is already the user-facing half. This half is
    // for whoever opens the console afterwards.
    console.error('画面の読み込みに失敗しました', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return <ScreenLoadFailure />;
  }
}

function ScreenLoadFailure(): ReactElement {
  return (
    <div
      // `alert` so a screen reader is told, rather than leaving somebody on a
      // page that silently became empty.
      role="alert"
      className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] p-6 text-center"
    >
      <h2 className="text-base font-semibold text-[var(--color-content-primary)]">
        画面を表示できませんでした
      </h2>
      <p className="mt-2 text-sm text-[var(--color-content-secondary)]">
        再読み込みしてください。アプリの更新直後や、通信が不安定なときに起きやすい問題です。
      </p>
      <Button variant="primary" onClick={reloadForNewBuild} className="mt-4">
        再読み込み
      </Button>
    </div>
  );
}

export default ScreenBoundary;
