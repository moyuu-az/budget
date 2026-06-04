import type { ElectronAPI } from '../types';
import { isErrorEnvelope, decodeEnvelope, type ErrorCode } from '../../shared/errors';

// Single typed access point to the IPC surface. Stores call getIpc().* instead of reaching
// into the window.electronAPI global directly, which gives a one-line DI seam (setIpc) for
// future unit tests without a service locator or per-aggregate gateways.
let override: ElectronAPI | null = null;

export function getIpc(): ElectronAPI {
  return override ?? window.electronAPI;
}

// Test seam: inject a fake ElectronAPI; pass null to restore the real bridge.
export function setIpc(fake: ElectronAPI | null): void {
  override = fake;
}

export interface NormalizedError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const REMOTE_PREFIX = /^Error invoking remote method '[^']*':\s*/;

// Recovers the typed error code from whatever Electron handed back across the IPC boundary:
// a preserved envelope object, the tagged-JSON message, or an attached `envelope` property.
export function normalizeError(error: unknown): NormalizedError {
  if (isErrorEnvelope(error)) {
    return { code: error.code, message: error.message, details: error.details };
  }

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const decoded = decodeEnvelope(raw);
  if (decoded) {
    return { code: decoded.code, message: decoded.message, details: decoded.details };
  }

  const attached = (error as { envelope?: unknown }).envelope;
  if (isErrorEnvelope(attached)) {
    return { code: attached.code, message: attached.message, details: attached.details };
  }

  return { code: 'UNKNOWN', message: raw.replace(REMOTE_PREFIX, '') || '予期しないエラーが発生しました' };
}
