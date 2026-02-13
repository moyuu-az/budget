import { UpdateStatus } from '../types';

interface UpdateNotificationProps {
  appVersion: string;
  updateStatus: UpdateStatus | null;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

function UpdateNotification({
  appVersion,
  updateStatus,
  onDownload,
  onInstall,
  onDismiss
}: UpdateNotificationProps) {
  const status = updateStatus?.status;

  if (status === 'available') {
    return (
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-xs text-blue-400 mb-2">
          v{updateStatus.version} が利用可能
        </p>
        <div className="flex gap-2">
          <button
            onClick={onDownload}
            className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            ダウンロード
          </button>
          <button
            onClick={onDismiss}
            className="text-xs px-2 py-1 rounded text-slate-500 hover:text-slate-400 transition-colors"
          >
            後で
          </button>
        </div>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-xs text-slate-400 mb-1.5">ダウンロード中...</p>
        <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${updateStatus.percent ?? 0}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">{updateStatus.percent ?? 0}%</p>
      </div>
    );
  }

  if (status === 'downloaded') {
    return (
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-xs text-green-400 mb-2">
          アップデート準備完了
        </p>
        <button
          onClick={onInstall}
          className="text-xs px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
        >
          再起動して更新
        </button>
      </div>
    );
  }

  if (status === 'error') {
    // Silently show version only (e.g. no GitHub Releases published yet)
    return (
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-xs text-slate-500">v{appVersion}</p>
      </div>
    );
  }

  // Default: show version only (checking, up-to-date, or null)
  return (
    <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <p className="text-xs text-slate-500">v{appVersion}</p>
    </div>
  );
}

export default UpdateNotification;
