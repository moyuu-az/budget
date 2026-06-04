import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNELS } from './ipc/channels';

// Generic data-only bridge: one invoke-forwarder per channel from the shared contract.
// Only serializable channel-name strings cross contextBridge — safer than per-method
// closures and impossible to drift from CHANNELS. The renderer types this object via the
// ElectronAPI interface (declare global), so shape compatibility is compile-checked there.
const api: Record<string, unknown> = {};

for (const [method, channel] of Object.entries(CHANNELS)) {
  api[method] = (...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);
}

// The push 'update-status' event is a subscription, not request/response.
api.onUpdateStatus = (callback: (status: unknown) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, status: unknown): void => callback(status);
  ipcRenderer.on('update-status', handler);
  return () => {
    ipcRenderer.removeListener('update-status', handler);
  };
};

contextBridge.exposeInMainWorld('electronAPI', api);
