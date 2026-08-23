import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureApi, getApi, normalizeError } from './lib/api';
import { createHttpApi } from './lib/http-api';
import { useSessionStore } from './stores/useSessionStore';
import './index.css';

// ---------------------------------------------------------------------------
// Start-up.
//
// The session has to be resolved BEFORE React renders, because every store's
// first fetch needs a ledger to be scoped to and the server rejects a request
// that names none. Rendering first and filling the ledger in later would mean a
// burst of requests that are all guaranteed to fail.
// ---------------------------------------------------------------------------

const root = ReactDOM.createRoot(document.getElementById('root')!);

function FatalError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold">アプリを開始できませんでした</h1>
        <p className="text-sm opacity-80">{message}</p>
        <button
          className="rounded border px-4 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}

async function bootstrap(): Promise<void> {
  // The client reads the active ledger from the store on every call, so it can
  // be created before a ledger is known -- getSession is what supplies one.
  configureApi(
    createHttpApi({
      activeLedgerId: () => useSessionStore.getState().activeLedgerId,
    }),
  );

  const session = await getApi().getSession();
  useSessionStore.getState().setSession(session);

  if (useSessionStore.getState().activeLedgerId === null) {
    // Provisioning always creates at least the shared ledger, so this means the
    // account exists but has no membership -- a configuration problem the user
    // cannot fix by retrying.
    throw new Error('開ける家計簿がありません。管理者に連絡してください');
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  // reportError is not used here: it raises a toast, and there is no app yet to
  // show one on.
  root.render(<FatalError message={normalizeError(error).message} />);
});
