import { vi } from 'vitest';
import type { ElectronAPI } from '../types';

// A fully-mocked ElectronAPI for tests. Override individual methods per test as needed.
export const createMockElectronAPI = (): ElectronAPI => ({
  getBalance: vi.fn().mockResolvedValue(0),
  setBalance: vi.fn().mockResolvedValue(undefined),

  getCategories: vi.fn().mockResolvedValue([]),
  addCategory: vi.fn().mockResolvedValue({ id: 1, name: '', type: 'expense', color: null, sortOrder: 0 }),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),

  getTemplates: vi.fn().mockResolvedValue([]),
  addTemplate: vi.fn().mockResolvedValue({
    id: 1, name: '', dayOfMonth: 1, type: 'expense', enabled: true,
    sortOrder: 0, categoryId: null, defaultAmount: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }),
  updateTemplate: vi.fn().mockResolvedValue(undefined),
  toggleTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),

  getMonthlyAmounts: vi.fn().mockResolvedValue([]),
  getMonthlyAmountsRange: vi.fn().mockResolvedValue([]),
  setMonthlyAmount: vi.fn().mockResolvedValue(undefined),
  deleteMonthlyAmount: vi.fn().mockResolvedValue(undefined),
  copyMonthlyAmounts: vi.fn().mockResolvedValue(undefined),

  getMonthlyActuals: vi.fn().mockResolvedValue([]),
  setMonthlyActual: vi.fn().mockResolvedValue(undefined),
  deleteMonthlyActual: vi.fn().mockResolvedValue(undefined),

  getMonthlyActualsRange: vi.fn().mockResolvedValue([]),
  getSnapshotsRange: vi.fn().mockResolvedValue([]),

  getSnapshots: vi.fn().mockResolvedValue([]),
  addSnapshot: vi.fn().mockResolvedValue({ id: 1, date: '2026-01-01', balance: 0, createdAt: '2026-01-01T00:00:00Z' }),
  deleteSnapshot: vi.fn().mockResolvedValue(undefined),

  getAppVersion: vi.fn().mockResolvedValue('1.0.0-test'),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  downloadUpdate: vi.fn().mockResolvedValue(undefined),
  installUpdate: vi.fn().mockResolvedValue(undefined),
  onUpdateStatus: vi.fn(() => () => undefined),
});

export const setupMockElectronAPI = (): void => {
  (globalThis as { window?: Window & { electronAPI?: ElectronAPI } }).window =
    (globalThis as { window?: Window & { electronAPI?: ElectronAPI } }).window ?? ({} as Window);
  (window as Window & { electronAPI: ElectronAPI }).electronAPI = createMockElectronAPI();
};
