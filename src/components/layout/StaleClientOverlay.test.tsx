import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaleClientOverlay from './StaleClientOverlay';
import { useStaleClientStore } from '../../app/staleClient';
import { reportError } from '../../app/reportError';
import { useToastStore } from '../../stores/useToastStore';
import { createHttpApi } from '../../lib/http-api';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '../../../shared/contract-version';

// ---------------------------------------------------------------------------
// What a tab does when the server tells it its bundle is out of date.
//
// The failure this guards against is silent: an old build reading a new
// EntryTemplate finds no `dayOfMonth`, drops every planned entry from its
// forecast, and draws a flat, reassuring balance line. The server refuses to
// answer such a tab; these tests are about the second half -- turning that
// refusal into something the person in front of it can act on.
// ---------------------------------------------------------------------------

beforeEach(() => {
  useStaleClientStore.setState({ isStale: false });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the overlay', () => {
  it('renders nothing while the bundle is current', () => {
    const { container } = render(<StaleClientOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blocks the page and says what fixes it', () => {
    useStaleClientStore.setState({ isStale: true });
    render(<StaleClientOverlay />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('アプリが更新されました');
    expect(dialog).toHaveTextContent('再読み込み');
  });

  it('offers no way to dismiss it', () => {
    // There is nothing to go back to: every request from this bundle is being
    // refused. An overlay someone can close is one they will close.
    useStaleClientStore.setState({ isStale: true });
    render(<StaleClientOverlay />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('再読み込み');
  });

  it('reloads when asked, and not before', async () => {
    // Not automatic: a reload discards whatever half-finished form is on screen,
    // possibly an amount the user was reading off a statement.
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location);

    const user = userEvent.setup();
    useStaleClientStore.setState({ isStale: true });
    render(<StaleClientOverlay />);

    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('reportError', () => {
  const staleError = (): Error => {
    const error = new Error('アプリが更新されました。ページを再読み込みしてください') as Error & {
      envelope: unknown;
    };
    error.envelope = {
      __appError: true,
      code: 'STALE_CLIENT',
      message: 'アプリが更新されました。ページを再読み込みしてください',
    };
    return error;
  };

  it('latches the stale flag instead of raising a toast', () => {
    // A toast disappears, and every subsequent request fails the same way -- the
    // tab would fill with them while staying unusable.
    reportError(staleError());

    expect(useStaleClientStore.getState().isStale).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('never goes back to false', () => {
    // A latch, not a toggle: once set, there is no state in which clearing it
    // would be honest. Only a reload resolves it, and that is a new page.
    reportError(staleError());
    reportError(new Error('something else'));

    expect(useStaleClientStore.getState().isStale).toBe(true);
  });

  it('still raises a toast for every other code', () => {
    reportError(new Error('boom'));

    expect(useStaleClientStore.getState().isStale).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

/** A fetch that answers with `body`, stamped with `version` (null = no stamp). */
function stubFetch(body: string, status = 200, version: string | null = String(CONTRACT_VERSION)) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (version !== null) headers[CONTRACT_VERSION_HEADER] = version;
  return vi.fn().mockResolvedValue(new Response(body, { status, headers }));
}

describe('the request header', () => {
  it('states which contract this bundle was built against', async () => {
    // Without it the server cannot tell an old tab from a new one, and the whole
    // gate is decoration.
    const fetchImpl = stubFetch('[]');
    const api = createHttpApi({ activeLedgerId: () => 1, fetchImpl: fetchImpl as typeof fetch });

    await api.getCategories();

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers[CONTRACT_VERSION_HEADER]).toBe(String(CONTRACT_VERSION));
  });
});

describe('checking the ANSWER', () => {
  // ---------------------------------------------------------------------------
  // The other direction: a NEW bundle talking to an OLD revision -- a rollback,
  // or a traffic split during a staged deploy. That server cannot refuse the
  // request, because it predates the gate entirely. So it answers in the
  // previous shape, and this build reads `template.recurrence` as undefined and
  // throws on the first predicate that touches it.
  // ---------------------------------------------------------------------------
  const apiWith = (fetchImpl: ReturnType<typeof stubFetch>) =>
    createHttpApi({ activeLedgerId: () => 1, fetchImpl: fetchImpl as typeof fetch });

  it('refuses a body from a server that sends no stamp at all', async () => {
    // Exactly what an old revision looks like. Absent is a mismatch, not a pass.
    const api = apiWith(stubFetch('[{"id":1,"dayOfMonth":27}]', 200, null));

    await expect(api.getTemplates()).rejects.toMatchObject({
      envelope: { code: 'STALE_CLIENT' },
    });
  });

  it('refuses a body stamped with a different contract', async () => {
    const api = apiWith(stubFetch('[]', 200, '1'));
    await expect(api.getCategories()).rejects.toMatchObject({
      envelope: { code: 'STALE_CLIENT' },
    });
  });

  it('reports a version skew even when the status is an error', async () => {
    // An old server's 401 and a current one's must not read the same, or the
    // user is told to sign in again for something signing in cannot fix.
    const api = apiWith(stubFetch('{"__appError":true,"code":"UNAUTHORIZED","message":"x"}', 401, null));

    await expect(api.getCategories()).rejects.toMatchObject({
      envelope: { code: 'STALE_CLIENT' },
    });
  });

  it('accepts a body stamped with the current contract', async () => {
    const api = apiWith(stubFetch('[]'));
    await expect(api.getCategories()).resolves.toEqual([]);
  });

  it('drives the overlay, so a rollback is as visible as an old tab', async () => {
    const api = apiWith(stubFetch('[]', 200, null));

    await api.getCategories().catch((e: unknown) => reportError(e));

    expect(useStaleClientStore.getState().isStale).toBe(true);
  });
});
