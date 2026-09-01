import { ViewType } from '../../types';
import { pathForView } from '../../app/routes';

// ---------------------------------------------------------------------------
// THE NAVIGATION IS MADE OF LINKS, NOT BUTTONS.
//
// Every item here changes the address, so it is a link, and being a real
// `<a href>` is what buys the behaviours a button silently withholds:
// middle-click and cmd-click to open a screen in another tab, "copy link
// address" to send 収支管理 to the other member of the household, and a status
// bar that shows where the item goes before it is pressed.
//
// The click handler still navigates in-page (no reload, no refetch), but it
// stands aside for a MODIFIED click -- calling preventDefault on cmd-click is
// how a hand-rolled router breaks "open in new tab" without anyone noticing.
// ---------------------------------------------------------------------------

interface Props {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  /**
   * Icon-only, for the desktop sidebar when it is narrowed.
   *
   * Ignored in the horizontal layout, which is always icon-plus-label: a bottom
   * bar of six unlabelled icons is a guessing game, and it has the width for
   * both.
   */
  collapsed?: boolean;
  /**
   * 'vertical' is the desktop sidebar; 'horizontal' is the phone's bottom bar.
   *
   * One component rather than two, because the LIST is the thing worth keeping
   * single: a screen added to one and forgotten in the other is a screen that
   * exists on a desktop and not on a phone, which nothing would catch.
   */
  orientation?: 'vertical' | 'horizontal';
}

const navItems: { id: ViewType; label: string; icon: React.ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'ダッシュボード',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    id: 'entries',
    label: '収支管理',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: '履歴',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'analytics',
    label: '分析',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    id: 'assets',
    label: '資産',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: '設定',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

/**
 * Whether the browser should be left to handle this click itself.
 *
 * A middle click, or one with a modifier held, means "open this somewhere else"
 * -- the one case where taking the navigation over in JavaScript is wrong.
 */
const isModifiedClick = (e: React.MouseEvent): boolean =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

function Navigation({
  currentView,
  onNavigate,
  collapsed = false,
  orientation = 'vertical',
}: Props) {
  const horizontal = orientation === 'horizontal';

  return (
    <ul className={horizontal ? 'flex items-stretch' : 'space-y-1'}>
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <li key={item.id} className={horizontal ? 'flex-1' : undefined}>
            <a
              href={pathForView(item.id)}
              onClick={(e) => {
                if (isModifiedClick(e)) return;
                e.preventDefault();
                onNavigate(item.id);
              }}
              title={collapsed && !horizontal ? item.label : undefined}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={
                horizontal
                  ? // A 44px-tall target, which is the smallest a thumb hits
                    // reliably. The active marker is on TOP here rather than on
                    // the left, because a left border on a full-width column
                    // reads as a divider between tabs.
                    `flex w-full flex-col items-center gap-0.5 border-t-2 px-1 py-2 transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                        : 'border-transparent text-[var(--color-content-muted)]'
                    }`
                  : `w-full px-3 py-2.5 flex items-center rounded-lg transition-all duration-200 border-l-2 ${
                      collapsed ? 'justify-center gap-0' : 'text-left gap-3'
                    } ${
                      isActive
                        ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-content-primary)] border-[var(--color-accent-primary)]'
                        : 'text-[var(--color-content-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-content-secondary)] border-transparent'
                    }`
              }
            >
              <span
                className={
                  !horizontal && isActive ? 'text-[var(--color-accent-primary)]' : undefined
                }
              >
                {item.icon}
              </span>
              {horizontal ? (
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              ) : (
                !collapsed && <span className="text-sm font-medium">{item.label}</span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default Navigation;
