# Phase 3 — Quality Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vitest + React Testing Library を導入してテスト基盤を敷き、`utils/` 全関数・主要ストアアクション・主要コンポーネントスモーク・IPC ラッパー境界をテスト化する。さらにチャートの再計算回数を最適化しパフォーマンス計測を行う。

**Architecture:** `vitest` + `@testing-library/react` + `@testing-library/user-event` + `happy-dom` を renderer 側のみで導入（main 側は対象外）。`test/setup.ts` に共通セットアップ、`test/helpers.tsx` に `renderWithProviders` を配置。

**Tech Stack:** Vitest 1.x / @testing-library/react 16.x / happy-dom 15.x / @vitest/coverage-v8

**Spec Reference:** `docs/superpowers/specs/2026-04-17-full-refactor-design.md` §8, §9

**Prerequisites:** Phase 1, 2 完了

**Target Coverage:**
- `src/utils/`: 90%+
- `src/stores/`: 70%+
- `src/lib/`: 80%+
- Overall: 50%+

---

## Task 1: Vitest 依存と設定

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.web.json` or `tsconfig.json` to include test files

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest@^1.6.0 @vitest/coverage-v8@^1.6.0 @testing-library/react@^16.1.0 @testing-library/user-event@^14.5.2 @testing-library/jest-dom@^6.6.3 happy-dom@^15.11.0
```

- [ ] **Step 2: Add scripts to package.json**

In the `scripts` object of `package.json`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['electron/**', 'node_modules/**', 'out/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/**/*.d.ts',
      ],
      thresholds: {
        'src/utils/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

```bash
npx vitest run
```
Expected: "No test files found" — exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest, RTL, happy-dom dev deps and config"
```

---

## Task 2: テストセットアップ・ヘルパー

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/test/helpers.tsx`
- Create: `src/test/mockElectronAPI.ts`

- [ ] **Step 1: Create setup.ts**

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setupMockElectronAPI } from './mockElectronAPI';

setupMockElectronAPI();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class RO {
    observe(): void { /* noop */ }
    unobserve(): void { /* noop */ }
    disconnect(): void { /* noop */ }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ResizeObserver = RO;
}
```

- [ ] **Step 2: Create mockElectronAPI.ts**

```ts
// src/test/mockElectronAPI.ts
import { vi } from 'vitest';
import type { ElectronAPI } from '../types';

export const createMockElectronAPI = (): ElectronAPI => ({
  getBalance: vi.fn().mockResolvedValue(100000),
  setBalance: vi.fn().mockResolvedValue(undefined),

  getCategories: vi.fn().mockResolvedValue([]),
  addCategory: vi.fn(),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),

  getTemplates: vi.fn().mockResolvedValue([]),
  addTemplate: vi.fn(),
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
  addSnapshot: vi.fn(),
  deleteSnapshot: vi.fn().mockResolvedValue(undefined),

  getAppVersion: vi.fn().mockResolvedValue('1.0.0-test'),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  downloadUpdate: vi.fn().mockResolvedValue(undefined),
  installUpdate: vi.fn().mockResolvedValue(undefined),
  onUpdateStatus: vi.fn(() => () => { /* noop */ }),
} as unknown as ElectronAPI);

export const setupMockElectronAPI = (): void => {
  const api = createMockElectronAPI();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = (globalThis as any).window ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.electronAPI = api;
};
```

- [ ] **Step 3: Create helpers.tsx**

```tsx
// src/test/helpers.tsx
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

export const renderWithProviders = (ui: ReactElement, options?: RenderOptions): RenderResult => {
  return render(ui, options);
};
```

(Providers kept minimal; Zustand stores are accessed directly via hooks without Context.)

- [ ] **Step 4: Verify vitest loads setup**

```bash
npx vitest run
```
Expected: no errors, still "no test files".

- [ ] **Step 5: Commit**

```bash
git add src/test/
git commit -m "test: add Vitest setup, helpers, and mock electronAPI"
```

---

## Task 3: utils/currency テスト

**Files:**
- Create: `src/utils/currency.test.ts`

- [ ] **Step 1: Read existing utils/currency.ts**

Identify exported functions (likely `formatCurrency`, maybe others).

- [ ] **Step 2: Write tests**

```ts
// src/utils/currency.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats positive integer', () => {
    expect(formatCurrency(100000)).toBe('¥100,000');
  });
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('¥0');
  });
  it('formats negative', () => {
    expect(formatCurrency(-500)).toBe('-¥500');
  });
  it('formats very large number', () => {
    expect(formatCurrency(1234567890)).toBe('¥1,234,567,890');
  });
  it('rounds decimals to integer', () => {
    expect(formatCurrency(100.7)).toBe('¥101');
  });
});
```

Adjust expected strings if the actual implementation uses different formatting (e.g. `toLocaleString('ja-JP')` might produce `￥`). Inspect the function and align tests with its real output.

- [ ] **Step 3: Run**

```bash
npx vitest run src/utils/currency.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/utils/currency.ts src/utils/currency.test.ts
git commit -m "test(utils): add currency formatter tests"
```

---

## Task 4: utils/forecast テスト

**Files:**
- Create: `src/utils/forecast.test.ts`

- [ ] **Step 1: Read utils/forecast.ts exports**

Identify the main exported function (likely `generateForecast` or similar) and its signature / return type.

- [ ] **Step 2: Write tests (adapt to actual API)**

```ts
// src/utils/forecast.test.ts
import { describe, it, expect } from 'vitest';
import { generateForecast } from './forecast';
import type { Category, EntryTemplate, MonthlyAmountsMap } from '../types';

const cat = (id: number, name: string, type: 'income' | 'expense'): Category => ({
  id, name, type, color: '#4F46E5', sortOrder: id,
});

const tpl = (id: number, name: string, day: number, type: 'income' | 'expense', amount: number, categoryId: number | null): EntryTemplate => ({
  id, name, dayOfMonth: day, type, enabled: true, sortOrder: id,
  categoryId, defaultAmount: amount,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('generateForecast', () => {
  it('returns points spanning the requested range inclusive', () => {
    const points = generateForecast({
      startBalance: 100000,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-03'),
      templates: [],
      categories: [],
      monthlyAmountsMap: new Map() as MonthlyAmountsMap,
    });
    expect(points).toHaveLength(3);
    expect(points[0].date).toBe('2026-04-01');
    expect(points[2].date).toBe('2026-04-03');
  });

  it('applies income on dayOfMonth match', () => {
    const templates = [tpl(1, '給与', 2, 'income', 3000, null)];
    const points = generateForecast({
      startBalance: 10000,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-03'),
      templates,
      categories: [cat(1, '給与', 'income')],
      monthlyAmountsMap: new Map() as MonthlyAmountsMap,
    });
    expect(points[0].balance).toBe(10000);
    expect(points[1].balance).toBe(13000);
    expect(points[2].balance).toBe(13000);
  });

  it('prefers monthly override amount over defaultAmount', () => {
    const templates = [tpl(1, '家賃', 1, 'expense', 50000, null)];
    const map: MonthlyAmountsMap = new Map([['2026-04', new Map([[1, 80000]])]]);
    const points = generateForecast({
      startBalance: 100000,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-01'),
      templates,
      categories: [cat(1, '家賃', 'expense')],
      monthlyAmountsMap: map,
    });
    expect(points[0].balance).toBe(20000);
  });

  it('marks the minimum balance point', () => {
    const templates = [tpl(1, '家賃', 2, 'expense', 90000, null)];
    const points = generateForecast({
      startBalance: 100000,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-03'),
      templates,
      categories: [cat(1, '家賃', 'expense')],
      monthlyAmountsMap: new Map() as MonthlyAmountsMap,
    });
    const mins = points.filter((p) => p.isMinimum);
    expect(mins).toHaveLength(1);
    expect(mins[0].date).toBe('2026-04-02');
  });
});
```

If `generateForecast` signature differs (positional args, different property names, `enabled` interaction), adjust calls. The goal is meaningful assertions on: horizon, income/expense application, monthly override precedence, minimum-balance detection, disabled-template exclusion.

- [ ] **Step 3: Add one more case — disabled template is ignored**

```ts
it('ignores templates with enabled=false', () => {
  const templates = [{ ...tpl(1, '給与', 1, 'income', 1000, null), enabled: false }];
  const points = generateForecast({
    startBalance: 500,
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-04-01'),
    templates,
    categories: [cat(1, '給与', 'income')],
    monthlyAmountsMap: new Map() as MonthlyAmountsMap,
  });
  expect(points[0].balance).toBe(500);
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/utils/forecast.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/forecast.test.ts
git commit -m "test(utils): add forecast engine tests"
```

---

## Task 5: utils/analytics テスト

**Files:**
- Create: `src/utils/analytics.test.ts`

- [ ] **Step 1: Read exports from utils/analytics.ts**

Identify all exported functions (`buildCategoryTrend`, `buildCompositionData`, `buildComparisonData`, `buildMonthSummary`, etc.).

- [ ] **Step 2: Write tests per function**

For each exported function, write at minimum:
- Empty input → returns empty/zero
- Typical input → returns expected aggregation
- One edge case (e.g., category with null id → "未分類" grouping)

Example for `buildCompositionData`:

```ts
// src/utils/analytics.test.ts
import { describe, it, expect } from 'vitest';
import { buildCompositionData } from './analytics';
import type { ActualWithCategory, Category } from '../types';

const cat = (id: number, name: string, color: string): Category => ({
  id, name, type: 'expense', color, sortOrder: id,
});

const actual = (
  templateId: number,
  amount: number,
  categoryId: number | null,
  categoryName: string | null = null,
): ActualWithCategory => ({
  templateId,
  yearMonth: '2026-04',
  actualAmount: amount,
  templateName: `template-${templateId}`,
  templateType: 'expense',
  categoryId,
  categoryName,
  categoryColor: null,
});

describe('buildCompositionData', () => {
  it('returns empty array on empty input', () => {
    expect(buildCompositionData([], [])).toEqual([]);
  });

  it('sums amounts per category and computes percentages', () => {
    const items = buildCompositionData(
      [actual(1, 60, 1), actual(2, 40, 1), actual(3, 100, 2)],
      [cat(1, '食費', '#F00'), cat(2, '光熱費', '#0F0')],
    );
    const food = items.find((x) => x.categoryId === 1);
    const util = items.find((x) => x.categoryId === 2);
    expect(food?.amount).toBe(100);
    expect(food?.percentage).toBeCloseTo(50, 1);
    expect(util?.amount).toBe(100);
    expect(util?.percentage).toBeCloseTo(50, 1);
  });

  it('groups null categoryId as "未分類"', () => {
    const items = buildCompositionData([actual(1, 30, null)], []);
    expect(items[0].name).toBe('未分類');
    expect(items[0].amount).toBe(30);
  });
});
```

Repeat similarly for `buildCategoryTrend`, `buildComparisonData`, `buildMonthSummary` — adapt to each function's actual signature.

- [ ] **Step 3: Run**

```bash
npx vitest run src/utils/analytics.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/analytics.test.ts
git commit -m "test(utils): add analytics aggregation tests"
```

---

## Task 6: utils/cashflow + utils/date テスト

**Files:**
- Create: `src/utils/cashflow.test.ts`
- Create: `src/utils/date.test.ts` (if date.ts exists; otherwise `src/types/ui.test.ts` for `shiftYearMonth` / `toYearMonth`)

- [ ] **Step 1: Write cashflow tests**

Focus on `buildCashFlowData`: empty → empty graph; one income + one expense → nodes for income, expense, balance flow.

```ts
// src/utils/cashflow.test.ts
import { describe, it, expect } from 'vitest';
import { buildCashFlowData } from './cashflow';

describe('buildCashFlowData', () => {
  it('returns empty structure when no templates', () => {
    const result = buildCashFlowData({
      yearMonth: '2026-04',
      templates: [],
      categories: [],
      monthlyAmountsMap: new Map(),
    });
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });
});
```

Expand with typical-input cases based on actual exported type.

- [ ] **Step 2: Write date/yearMonth tests**

```ts
// src/types/ui.test.ts
import { describe, it, expect } from 'vitest';
import { toYearMonth, shiftYearMonth } from './ui';

describe('toYearMonth', () => {
  it('formats Date to YYYY-MM', () => {
    expect(toYearMonth(new Date(2026, 3, 1))).toBe('2026-04');
    expect(toYearMonth(new Date(2026, 0, 1))).toBe('2026-01');
  });
});

describe('shiftYearMonth', () => {
  it('shifts forward', () => {
    expect(shiftYearMonth('2026-04', 1)).toBe('2026-05');
  });
  it('shifts backward', () => {
    expect(shiftYearMonth('2026-04', -1)).toBe('2026-03');
  });
  it('wraps around year boundary forward', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
  });
  it('wraps around year boundary backward', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
  });
});
```

- [ ] **Step 3: Run & Commit**

```bash
npx vitest run src/utils/ src/types/
git add src/utils/cashflow.test.ts src/types/ui.test.ts
git commit -m "test(utils): add cashflow and yearMonth helper tests"
```

---

## Task 7: Store action テスト（useCategoryStore）

**Files:**
- Create: `src/stores/useCategoryStore.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/stores/useCategoryStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCategoryStore } from './useCategoryStore';
import type { Category } from '../types';

const mockCategories: Category[] = [
  { id: 1, name: '食費', type: 'expense', color: '#F00', sortOrder: 0 },
  { id: 2, name: '給与', type: 'income', color: '#0F0', sortOrder: 1 },
];

beforeEach(() => {
  useCategoryStore.setState({ categories: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI.getCategories = vi.fn().mockResolvedValue(mockCategories);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI.addCategory = vi.fn().mockImplementation(async (input) => ({
    id: 3, ...input, color: input.color ?? null, sortOrder: input.sortOrder ?? 2,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI.deleteCategory = vi.fn().mockResolvedValue(undefined);
});

describe('useCategoryStore', () => {
  it('fetchCategories populates categories', async () => {
    await useCategoryStore.getState().fetchCategories();
    expect(useCategoryStore.getState().categories).toHaveLength(2);
  });

  it('addCategory appends and returns created category', async () => {
    await useCategoryStore.getState().fetchCategories();
    await useCategoryStore.getState().addCategory({ name: '交通費', type: 'expense', color: '#00F' });
    expect(useCategoryStore.getState().categories).toHaveLength(3);
    expect(useCategoryStore.getState().categories[2].name).toBe('交通費');
  });

  it('deleteCategory removes by id', async () => {
    await useCategoryStore.getState().fetchCategories();
    await useCategoryStore.getState().deleteCategory(1);
    expect(useCategoryStore.getState().categories).toHaveLength(1);
    expect(useCategoryStore.getState().categories[0].id).toBe(2);
  });
});
```

- [ ] **Step 2: Run & Commit**

```bash
npx vitest run src/stores/useCategoryStore.test.ts
git add src/stores/useCategoryStore.test.ts
git commit -m "test(stores): add useCategoryStore action tests"
```

---

## Task 8: Store action テスト（useUIStore, useMonthlyStore）

**Files:**
- Create: `src/stores/useUIStore.test.ts`
- Create: `src/stores/useMonthlyStore.test.ts`

- [ ] **Step 1: useUIStore tests**

```ts
// src/stores/useUIStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

beforeEach(() => {
  useUIStore.setState({
    theme: 'dark',
    selectedYearMonth: '2026-04',
    sidebarCollapsed: false,
  });
});

describe('useUIStore', () => {
  it('toggleTheme flips theme', () => {
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('light');
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('shiftMonth moves forward', () => {
    useUIStore.getState().shiftMonth(1);
    expect(useUIStore.getState().selectedYearMonth).toBe('2026-05');
  });

  it('shiftMonth moves backward across year boundary', () => {
    useUIStore.setState({ selectedYearMonth: '2026-01' });
    useUIStore.getState().shiftMonth(-1);
    expect(useUIStore.getState().selectedYearMonth).toBe('2025-12');
  });

  it('toggleSidebar flips collapsed state', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });
});
```

- [ ] **Step 2: useMonthlyStore tests**

Cover the subset most likely to regress: `setAmount`, `deleteAmount`, `resolveAmount` helper if exported. Read the store file first and tailor tests to its actual shape.

- [ ] **Step 3: Run & Commit**

```bash
npx vitest run src/stores/
git add src/stores/useUIStore.test.ts src/stores/useMonthlyStore.test.ts
git commit -m "test(stores): add useUIStore and useMonthlyStore action tests"
```

---

## Task 9: UI プリミティブのテスト

**Files:**
- Create: `src/components/ui/Button.test.tsx`
- Create: `src/components/ui/Dialog.test.tsx`
- Create: `src/components/ui/Tabs.test.tsx`

- [ ] **Step 1: Button tests**

```tsx
// src/components/ui/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    renderWithProviders(<Button>追加</Button>);
    expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();
  });

  it('is disabled when loading', () => {
    renderWithProviders(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('calls onClick when clicked', async () => {
    const fn = vi.fn();
    renderWithProviders(<Button onClick={fn}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const fn = vi.fn();
    renderWithProviders(<Button onClick={fn} disabled>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Dialog tests**

```tsx
// src/components/ui/Dialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('does not render when closed', () => {
    renderWithProviders(<Dialog open={false} onClose={() => {}} title="タイトル">body</Dialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    renderWithProviders(<Dialog open onClose={() => {}} title="確認">本文</Dialog>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('確認')).toBeInTheDocument();
    expect(screen.getByText('本文')).toBeInTheDocument();
  });

  it('calls onClose on Escape', async () => {
    const close = vi.fn();
    renderWithProviders(<Dialog open onClose={close} title="t">body</Dialog>);
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Tabs tests**

```tsx
// src/components/ui/Tabs.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  const items = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ] as const;

  it('renders each tab with role=tab', () => {
    renderWithProviders(<Tabs items={[...items]} value="a" onChange={() => {}} ariaLabel="test" />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('marks active tab aria-selected=true', () => {
    renderWithProviders(<Tabs items={[...items]} value="b" onChange={() => {}} ariaLabel="test" />);
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
  });

  it('invokes onChange when tab clicked', async () => {
    const fn = vi.fn();
    renderWithProviders(<Tabs items={[...items]} value="a" onChange={fn} ariaLabel="test" />);
    await userEvent.click(screen.getByRole('tab', { name: 'C' }));
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('moves focus and selection with ArrowRight', async () => {
    const fn = vi.fn();
    renderWithProviders(<Tabs items={[...items]} value="a" onChange={fn} ariaLabel="test" />);
    const first = screen.getByRole('tab', { name: 'A' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(fn).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 4: Run & Commit**

```bash
npx vitest run src/components/ui/
git add src/components/ui/Button.test.tsx src/components/ui/Dialog.test.tsx src/components/ui/Tabs.test.tsx
git commit -m "test(ui): add tests for Button, Dialog, Tabs primitives"
```

---

## Task 10: 主要コンポーネントのスモークテスト

**Files:**
- Create: `src/components/dashboard/KpiHero.test.tsx`
- Create: `src/components/entries/EntryRow.test.tsx`
- Create: `src/components/settings/CategoryForm.test.tsx`

- [ ] **Step 1: KpiHero smoke test**

```tsx
// src/components/dashboard/KpiHero.test.tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers';
import { KpiHero } from './KpiHero';

describe('KpiHero', () => {
  it('renders four KPI cards', () => {
    renderWithProviders(<KpiHero />);
    expect(screen.getByText('今月の収支')).toBeInTheDocument();
    expect(screen.getByText(/最小残高/)).toBeInTheDocument();
    expect(screen.getByText(/次の大型支出/)).toBeInTheDocument();
    expect(screen.getByText(/予測傾き/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: CategoryForm test**

```tsx
// src/components/settings/CategoryForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { CategoryForm } from './CategoryForm';

describe('CategoryForm', () => {
  it('calls onSubmit with trimmed name and chosen type', async () => {
    const submit = vi.fn();
    renderWithProviders(<CategoryForm initial={null} onSubmit={submit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('カテゴリ名'), '  食費  ');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: '食費', type: 'expense' }));
  });

  it('does not submit when name is empty', async () => {
    const submit = vi.fn();
    renderWithProviders(<CategoryForm initial={null} onSubmit={submit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(submit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: EntryRow test (keyboard edit)**

Adapt to actual `EntryRow` props. Minimal assertion: pressing `Enter` on the amount cell enters edit mode; `Escape` cancels.

- [ ] **Step 4: Run & Commit**

```bash
npx vitest run src/components/
git add -A
git commit -m "test(components): add KpiHero, CategoryForm, EntryRow smoke tests"
```

---

## Task 11: lib/ipc テスト

**Files:**
- Create: `src/lib/ipc.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/lib/ipc.test.ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { parseOrThrow, withToast } from './ipc';
import { useToastStore } from '../stores/useToastStore';

describe('parseOrThrow', () => {
  it('returns data when schema matches', () => {
    expect(parseOrThrow(z.number(), 42, 'ctx')).toBe(42);
  });

  it('throws and emits error toast when schema fails', () => {
    const add = vi.spyOn(useToastStore.getState(), 'addToast');
    expect(() => parseOrThrow(z.number(), 'not-a-number', 'ctx')).toThrow();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});

describe('withToast', () => {
  it('returns value on success', async () => {
    const result = await withToast(() => Promise.resolve('ok'), 'fail msg');
    expect(result).toBe('ok');
  });

  it('shows toast and rethrows on failure', async () => {
    const add = vi.spyOn(useToastStore.getState(), 'addToast');
    await expect(withToast(() => Promise.reject(new Error('boom')), 'fail msg')).rejects.toThrow('boom');
    expect(add).toHaveBeenCalledWith({ type: 'error', message: 'fail msg' });
  });
});
```

If `useToastStore.getState().addToast` cannot be spied directly (method binding), wrap through `useToastStore.setState({ addToast: vi.fn() })` pattern instead.

- [ ] **Step 2: Run & Commit**

```bash
npx vitest run src/lib/
git add src/lib/ipc.test.ts
git commit -m "test(lib): add IPC wrapper schema and toast tests"
```

---

## Task 12: カバレッジ計測と閾値確認

**Files:** none

- [ ] **Step 1: Run coverage**

```bash
npm run test:coverage
```
Expected output: `src/utils/**` meets or exceeds 90% statements. Overall prints a table.

- [ ] **Step 2: Inspect HTML report**

Open `coverage/index.html` in a browser. Identify any util function below 90%. For each gap, add a targeted test to close it.

- [ ] **Step 3: If threshold fails, commit additional tests**

Loop on:
```bash
npm run test:coverage
```
until `src/utils/**` passes the threshold.

- [ ] **Step 4: Commit final coverage pass**

```bash
git add -A
git commit -m "test: close util coverage gaps to meet 90% threshold"
```

---

## Task 13: パフォーマンス計測とメモ化調整

**Files:**
- Modify: `src/components/dashboard/SankeyChart/index.tsx`
- Modify: `src/components/analytics/TimelineChart.tsx`
- Modify: `src/hooks/useCashFlowData.ts`

- [ ] **Step 1: Measure in dev**

Run `npm run dev`. Open DevTools → Performance → Record interaction: navigate months in Sankey 5 times, then flip to Analytics and switch periods.

Identify expensive commits (>16ms) and which component is responsible.

- [ ] **Step 2: Narrow memo dependencies**

In `useCashFlowData`, inspect whether `monthlyAmountsMap` triggers rebuilds too often. If so, replace the dependency with a more granular slice:

```ts
const monthSlice = useMonthlyStore((s) => s.monthlyAmountsMap.get(yearMonth));
// useMemo dep: [yearMonth, templates, categories, monthSlice]
```

Zustand selectors re-compute with shallow equality by default; narrowing the selector return ensures the hook only re-runs when that specific month's data changes.

For `TimelineChart`, similarly ensure the merged data (past + future) is derived via `useMemo` with deps limited to the time-window-relevant slices.

- [ ] **Step 3: Re-measure**

Record the same interaction. Verify the longest commit dropped (target: <16ms for month-nav in Sankey).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: narrow memo dependencies in cash flow and timeline hooks"
```

---

## Task 14: CI 向けの静的チェックスクリプト（任意だが推奨）

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a verify script**

In `package.json` scripts:

```json
"verify": "tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json && vitest run"
```

- [ ] **Step 2: Run it locally to confirm**

```bash
npm run verify
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add verify script (tsc + vitest)"
```

---

## Task 15: Phase 3 総合動作確認

**Files:** none

- [ ] **Step 1: Full type check + test + build**

```bash
npm run verify
npm run build
```
Expected: all green.

- [ ] **Step 2: Coverage report**

```bash
npm run test:coverage
```
Expected: `src/utils/**` ≥90%, overall ≥50%.

- [ ] **Step 3: Final manual verification**

`npm run dev` → cycle through all 5 views with mouse + keyboard in both themes. Confirm nothing regressed.

- [ ] **Step 4: Tag**

```bash
git tag -a phase3-quality -m "Phase 3: quality assurance foundation complete"
```

---

## Phase 3 Completion Criteria

- [ ] Vitest runs via `npm test`.
- [ ] `src/test/setup.ts` provides common env (happy-dom, matchMedia, ResizeObserver, mock electronAPI).
- [ ] `src/utils/` coverage ≥ 90%.
- [ ] `src/stores/` critical actions covered.
- [ ] `src/lib/ipc.ts` schema + toast paths covered.
- [ ] UI primitives (Button, Dialog, Tabs) have interaction tests.
- [ ] At least one smoke test per major feature component.
- [ ] `npm run verify` script exists and passes locally.
- [ ] Sankey month-nav render completes in <16ms per frame on typical hardware.

---

## Completion of Full Refactor

With Phase 3 complete, all three phases of the refactor (spec `docs/superpowers/specs/2026-04-17-full-refactor-design.md`) are implemented. Recommend merging `feature/full-refactor-ui-redesign` into `main` through a PR once all phase-tagged milestones are present.
