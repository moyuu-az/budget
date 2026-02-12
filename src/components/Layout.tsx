import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import UpdateNotification from './UpdateNotification';
import { UpdateStatus } from '../types';

interface LayoutProps {
  currentView: 'dashboard' | 'entries' | 'history';
  onNavigate: (view: 'dashboard' | 'entries' | 'history') => void;
  children: ReactNode;
  appVersion?: string;
  updateStatus?: UpdateStatus | null;
  onDownloadUpdate?: () => void;
  onInstallUpdate?: () => void;
  onDismissUpdate?: () => void;
}

const navIcons = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  entries: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  history: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  )
};

const navItems = [
  { id: 'dashboard' as const, label: 'ダッシュボード' },
  { id: 'entries' as const, label: '収支管理' },
  { id: 'history' as const, label: '履歴' }
];

function Layout({
  currentView,
  onNavigate,
  children,
  appVersion,
  updateStatus,
  onDownloadUpdate,
  onInstallUpdate,
  onDismissUpdate
}: LayoutProps) {
  return (
    <div className="flex h-screen">
      <nav className="w-56 glass-strong flex flex-col pt-12" style={{ borderRight: '1px solid var(--border-subtle)' }}>
        <div className="px-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h1 className="text-xl font-bold text-white tracking-tight">バランス予測</h1>
          <p className="text-xs text-slate-400 mt-1">60日間の収支予測</p>
        </div>
        <ul className="flex-1 py-4">
          {navItems.map((item) => (
            <li key={item.id} className="relative">
              <button
                onClick={() => onNavigate(item.id)}
                className={`w-full text-left px-6 py-3 flex items-center gap-3 transition-all duration-200 ${
                  currentView === item.id
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {currentView === item.id && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 border-r-2 border-blue-400"
                    style={{ background: 'rgba(59, 130, 246, 0.08)' }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{navIcons[item.id]}</span>
                <span className="relative z-10 text-sm font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {appVersion && (
          <UpdateNotification
            appVersion={appVersion}
            updateStatus={updateStatus ?? null}
            onDownload={onDownloadUpdate ?? (() => {})}
            onInstall={onInstallUpdate ?? (() => {})}
            onDismiss={onDismissUpdate ?? (() => {})}
          />
        )}
      </nav>
      <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-primary)' }}>
        {children}
      </main>
    </div>
  );
}

export default Layout;
