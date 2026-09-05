import { vi } from 'vitest';
import { configureApi } from '../lib/api';
import type { AppApi } from '../types';
import { DEFAULT_LEDGER_SETTINGS } from '../../shared/ledger-settings';

// A fully-mocked AppApi for tests. Override individual methods per test as needed.
export const createMockApi = (): AppApi => ({

  // The defaults, which is what a ledger that has never opened 設定 really gets.
  getLedgerSettings: vi.fn().mockResolvedValue(DEFAULT_LEDGER_SETTINGS),
  updateLedgerSettings: vi.fn().mockResolvedValue(DEFAULT_LEDGER_SETTINGS),

  getCategories: vi.fn().mockResolvedValue([]),
  addCategory: vi
    .fn()
    .mockResolvedValue({ id: 1, name: '', type: 'expense', color: null, sortOrder: 0, costType: null }),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),

  getTemplates: vi.fn().mockResolvedValue([]),
  // `recurrence`, not the `dayOfMonth` this carried before migration 005. It
  // went unnoticed because `mockResolvedValue` is loosely typed -- a mock that
  // returns a shape the contract no longer has is a test passing against a
  // payload the server cannot send.
  addTemplate: vi.fn().mockResolvedValue({
    id: 1, name: '', recurrence: { kind: 'monthly', dayOfMonth: 1 }, type: 'expense', enabled: true,
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

  getAssetCategories: vi.fn().mockResolvedValue([]),
  addAssetCategory: vi
    .fn()
    .mockResolvedValue({ id: 1, name: '', color: null, sortOrder: 0, fields: [] }),
  updateAssetCategory: vi.fn().mockResolvedValue(undefined),
  deleteAssetCategory: vi.fn().mockResolvedValue(undefined),

  getAssets: vi.fn().mockResolvedValue([]),
  addAsset: vi.fn().mockResolvedValue({
    id: 1, categoryId: 1, name: '', value: 0, fields: {},
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }),
  updateAsset: vi.fn().mockResolvedValue(undefined),
  deleteAsset: vi.fn().mockResolvedValue(undefined),

  // --- 英単語クイズ (user-scoped) ---
  // An empty progress list is what a person who has never taken a quiz really
  // gets, and it is the case every screen has to render correctly: 「まだ解いて
  // いません」 rather than 0%.
  getVocabProgress: vi.fn().mockResolvedValue([]),
  recordVocabAttempts: vi.fn().mockResolvedValue([]),
  resetVocabProgress: vi.fn().mockResolvedValue([]),

  getSession: vi.fn().mockResolvedValue({
    user: { id: 1, email: 'test@example.com', displayName: 'test' },
    ledgers: [{ id: 1, slug: 'shared', name: '家計', kind: 'shared' }],
  }),
});

// Installs a mock as the configured client, standing in for what bootstrap does
// in the browser. Individual tests can still override it with setApi().
export const setupMockApi = (): AppApi => {
  const api = createMockApi();
  configureApi(api);
  return api;
};
