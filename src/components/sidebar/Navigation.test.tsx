import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navigation from './Navigation';
import { pathForView } from '../../app/routes';

// ---------------------------------------------------------------------------
// The navigation is made of LINKS.
//
// That is not a styling choice: a control that changes the address has to be an
// `<a href>` for middle-click, cmd-click and "copy link address" to work at all,
// and those are how one member of the household sends the other a screen.
//
// The failure this file guards is the subtle half of a hand-rolled router:
// calling preventDefault on EVERY click silently breaks "open in new tab", and
// nothing about the app looks wrong afterwards -- the new tab simply never
// opens, or opens on the wrong screen.
// ---------------------------------------------------------------------------

describe('the navigation items', () => {
  it('carry the address of the screen they go to', () => {
    render(<Navigation currentView="dashboard" onNavigate={() => {}} />);

    expect(screen.getByRole('link', { name: '収支管理' })).toHaveAttribute(
      'href',
      pathForView('entries'),
    );
    expect(screen.getByRole('link', { name: '分析' })).toHaveAttribute(
      'href',
      pathForView('analytics'),
    );
  });

  it('navigate in-page on a plain click', async () => {
    const onNavigate = vi.fn();
    render(<Navigation currentView="dashboard" onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('link', { name: '資産' }));

    expect(onNavigate).toHaveBeenCalledWith('assets');
  });

  it('stands aside for a modified click, so the browser can open a new tab', () => {
    const onNavigate = vi.fn();
    render(<Navigation currentView="dashboard" onNavigate={onNavigate} />);
    const link = screen.getByRole('link', { name: '設定' });

    // cmd-click (macOS) and ctrl-click (Windows/Linux) both mean "somewhere
    // else". Handling them in-page would consume the click and open nothing.
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier });
      fireEvent(link, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('leaves a middle click alone', () => {
    // Pins the `e.button !== 0` branch. In a browser it is unreachable -- a
    // middle click fires `auxclick`, not `click` -- so what actually makes
    // "open in a new tab" work is the href above. This test exists so the
    // branch cannot be quietly deleted and read as proof of the opposite.
    const onNavigate = vi.fn();
    render(<Navigation currentView="dashboard" onNavigate={onNavigate} />);
    const link = screen.getByRole('link', { name: '履歴' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 });
    fireEvent(link, event);

    expect(event.defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('marks the current screen for a screen reader', () => {
    render(<Navigation currentView="history" onNavigate={() => {}} />);

    expect(screen.getByRole('link', { name: '履歴' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '分析' })).not.toHaveAttribute('aria-current');
  });
});
