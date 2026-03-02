import { useState, useEffect, useCallback } from 'react';
import { UpdateStatus } from '../types';

export function useAutoUpdate() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});

    const cleanup = window.electronAPI.onUpdateStatus((status: UpdateStatus) => {
      setUpdateStatus(status);
    });

    return cleanup;
  }, []);

  const checkForUpdates = useCallback(() => {
    window.electronAPI?.checkForUpdates().catch(() => {});
  }, []);

  const downloadUpdate = useCallback(() => {
    window.electronAPI?.downloadUpdate().catch(() => {});
  }, []);

  const installUpdate = useCallback(() => {
    window.electronAPI?.installUpdate().catch(() => {});
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateStatus(null);
  }, []);

  return {
    updateStatus,
    appVersion,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissUpdate
  };
}
