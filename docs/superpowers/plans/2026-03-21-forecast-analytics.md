# Forecast & Analytics 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 60日予測を最大1年に拡張し、過去トレンドと未来予測を統合した「分析」ビューを新設する

**Architecture:** 既存の forecast エンジンを days パラメータ拡張で長期対応し、新規 `utils/analytics.ts` で集計ロジックを提供。DB/IPC は actuals 範囲取得を追加（スキーマ変更なし）。ダッシュボードの ForecastChart に期間セレクター、サイドバーに5番目の「分析」タブ、新規 `components/analytics/` に6コンポーネントを追加。

**Tech Stack:** React 19, TypeScript, Zustand, Recharts, better-sqlite3, electron-vite

---

## File Structure

### 新規ファイル
| ファイル | 責務 |
|---------|------|
| `src/utils/analytics.ts` | カテゴリ別トレンド・構成比・前月比の集計関数 |
| `src/components/analytics/AnalyticsView.tsx` | 分析ビューのメインオーケストレーター |
| `src/components/analytics/PeriodSelector.tsx` | 期間選択UI（3ヶ月/6ヶ月/1年） |
| `src/components/analytics/TimelineChart.tsx` | 統合タイムライン（過去実績+未来予測の折れ線） |
| `src/components/analytics/CategoryTrendChart.tsx` | カテゴリ別月次推移（積み上げ棒グラフ） |
| `src/components/analytics/CompositionChart.tsx` | 支出構成比ドーナツチャート |
| `src/components/analytics/ComparisonTable.tsx` | 前月比/前年同月比テーブル |

### 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | 分析用型定義追加、ViewType に `'analytics'` 追加 |
| `electron/database.ts` | `getMonthlyActualsRange()`, `getSnapshotsRange()` 追加 |
| `electron/index.ts` | IPC ハンドラー2件追加 |
| `electron/preload.ts` | API メソッド2件追加 |
| `src/stores/useMonthlyStore.ts` | `fetchActualsRange()` アクション追加 |
| `src/utils/forecast.ts` | `summarizeForecastByMonth()` 追加 |
| `src/components/dashboard/ForecastChart.tsx` | 期間セレクター追加、タイトル動的化 |
| `src/components/dashboard/DashboardView.tsx` | 期間 state 管理、データ取得範囲の動的化 |
| `src/components/sidebar/Navigation.tsx` | 「分析」タブ追加 |
| `src/App.tsx` | AnalyticsView のルーティング追加 |

---

## Task 1: 型定義の拡張

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: ViewType に analytics を追加**

`src/types/index.ts:97` を変更:

```typescript
export type ViewType = 'dashboard' | 'entries' | 'history' | 'settings' | 'analytics';
```

- [ ] **Step 2: 分析用の型定義を追加**

`src/types/index.ts` の末尾（`declare global` の前）に追加:

```typescript
// --- Analytics ---
export type ForecastPeriod = '60d' | '3m' | '6m' | '1y';

export interface MonthSummary {
  yearMonth: string;
  endBalance: number;
  totalIncome: number;
  totalExpense: number;
  minBalance: number;
}

export interface CategoryTrendPoint {
  yearMonth: string;
  categories: CategoryTrendItem[];
}

export interface CategoryTrendItem {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
}

export interface CompositionItem {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
  percentage: number;
}

export interface ComparisonRow {
  categoryId: number | null;
  name: string;
  color: string;
  currentAmount: number;
  prevMonthDiff: number | null;
  prevMonthPercent: number | null;
  prevYearDiff: number | null;
  prevYearPercent: number | null;
}

export interface ActualWithCategory {
  templateId: number;
  yearMonth: string;
  actualAmount: number;
  templateName: string;
  templateType: 'income' | 'expense';
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
}
```

- [ ] **Step 3: ElectronAPI にメソッド追加**

`ElectronAPI` インターフェースに追加:

```typescript
getMonthlyActualsRange(startMonth: string, endMonth: string): Promise<ActualWithCategory[]>;
getSnapshotsRange(startDate: string, endDate: string): Promise<BalanceSnapshot[]>;
```

- [ ] **Step 4: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: 型エラーあり（新しい API メソッドの実装がまだないため）。types 自体のエラーがないことを確認。

- [ ] **Step 5: コミット**

```bash
git add src/types/index.ts
git commit -m "feat: add analytics type definitions and ViewType extension"
```

---

## Task 2: DB・IPC レイヤーの拡張

**Files:**
- Modify: `electron/database.ts`
- Modify: `electron/index.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: database.ts に getMonthlyActualsRange を追加**

`electron/database.ts` の `deleteMonthlyActual` 関数の後に追加:

```typescript
export function getMonthlyActualsRange(startMonth: string, endMonth: string): Array<{
  template_id: number;
  year_month: string;
  actual_amount: number;
  template_name: string;
  template_type: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}> {
  return db.prepare(`
    SELECT
      ma.template_id,
      ma.year_month,
      ma.actual_amount,
      et.name AS template_name,
      et.type AS template_type,
      et.category_id,
      c.name AS category_name,
      c.color AS category_color
    FROM monthly_actuals ma
    JOIN entry_templates et ON et.id = ma.template_id
    LEFT JOIN categories c ON c.id = et.category_id
    WHERE ma.year_month >= ? AND ma.year_month <= ?
    ORDER BY ma.year_month ASC
  `).all(startMonth, endMonth) as Array<{
    template_id: number;
    year_month: string;
    actual_amount: number;
    template_name: string;
    template_type: string;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
  }>;
}
```

- [ ] **Step 2: database.ts に getSnapshotsRange を追加**

`deleteSnapshot` 関数の後に追加:

```typescript
export function getSnapshotsRange(startDate: string, endDate: string): Array<{
  id: number;
  date: string;
  balance: number;
  created_at: string;
}> {
  return db.prepare(
    'SELECT * FROM balance_snapshots WHERE date >= ? AND date <= ? ORDER BY date ASC'
  ).all(startDate, endDate) as Array<{
    id: number;
    date: string;
    balance: number;
    created_at: string;
  }>;
}
```

- [ ] **Step 3: electron/index.ts に IPC ハンドラー追加**

`electron/index.ts` のインポートに `getMonthlyActualsRange` と `getSnapshotsRange` を追加:

```typescript
import {
  // ... existing imports ...
  getMonthlyActualsRange,
  getSnapshotsRange
} from './database';
```

`registerIpcHandlers` 関数内の Snapshots セクションの後に追加:

```typescript
  // Analytics
  ipcMain.handle('get-monthly-actuals-range', (_event, startMonth: string, endMonth: string) => {
    return getMonthlyActualsRange(startMonth, endMonth).map((row) => ({
      templateId: row.template_id,
      yearMonth: row.year_month,
      actualAmount: row.actual_amount,
      templateName: row.template_name,
      templateType: row.template_type as 'income' | 'expense',
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
    }));
  });

  ipcMain.handle('get-snapshots-range', (_event, startDate: string, endDate: string) => {
    return getSnapshotsRange(startDate, endDate).map(mapSnapshot);
  });
```

- [ ] **Step 4: electron/preload.ts に API メソッド追加**

Monthly Actuals セクションの後に追加:

```typescript
  // Analytics
  getMonthlyActualsRange: (startMonth: string, endMonth: string) =>
    ipcRenderer.invoke('get-monthly-actuals-range', startMonth, endMonth),
  getSnapshotsRange: (startDate: string, endDate: string) =>
    ipcRenderer.invoke('get-snapshots-range', startDate, endDate),
```

- [ ] **Step 5: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし（型定義と実装が揃った）

- [ ] **Step 6: コミット**

```bash
git add electron/database.ts electron/index.ts electron/preload.ts
git commit -m "feat: add IPC handlers for actuals range and snapshots range queries"
```

---

## Task 3: ストア拡張 — actuals 範囲取得

**Files:**
- Modify: `src/stores/useMonthlyStore.ts`

- [ ] **Step 1: インポートに ActualWithCategory を追加**

```typescript
import type {
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
  ActualWithCategory,
} from '../types';
```

- [ ] **Step 2: MonthlyState インターフェースに追加**

```typescript
interface MonthlyState {
  // ... existing fields ...
  actualsWithCategory: ActualWithCategory[];
  fetchActualsRange: (startMonth: string, endMonth: string) => Promise<void>;
}
```

- [ ] **Step 3: ストアに初期値と fetchActualsRange を実装**

初期値に追加:
```typescript
actualsWithCategory: [],
```

アクションを追加（`deleteMonthlyActual` の後）:

```typescript
  fetchActualsRange: async (startMonth: string, endMonth: string) => {
    set({ loading: true, error: null });
    try {
      const actuals = await window.electronAPI.getMonthlyActualsRange(startMonth, endMonth);

      // Also populate the monthlyActualsMap for consistency
      const newMap = new Map(get().monthlyActualsMap);
      // Clear existing entries in the range
      for (const [key] of newMap) {
        if (key >= startMonth && key <= endMonth) {
          newMap.delete(key);
        }
      }
      for (const a of actuals) {
        if (!newMap.has(a.yearMonth)) {
          newMap.set(a.yearMonth, new Map<number, number>());
        }
        newMap.get(a.yearMonth)!.set(a.templateId, a.actualAmount);
      }

      set({
        actualsWithCategory: actuals,
        monthlyActualsMap: newMap,
        loading: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
```

- [ ] **Step 4: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/stores/useMonthlyStore.ts
git commit -m "feat: add fetchActualsRange action to monthly store"
```

---

## Task 4: 予測エンジン拡張 — 月サマリー関数

**Files:**
- Modify: `src/utils/forecast.ts`

- [ ] **Step 1: インポートに MonthSummary を追加**

```typescript
import type { EntryTemplate, MonthlyAmountsMap, ForecastPoint, ForecastEventDetail, MonthSummary } from '../types';
```

- [ ] **Step 2: summarizeForecastByMonth を追加**

`formatXAxis` 関数の後に追加:

```typescript
export function summarizeForecastByMonth(points: ForecastPoint[]): MonthSummary[] {
  const monthMap = new Map<string, { points: ForecastPoint[]; income: number; expense: number }>();

  for (const point of points) {
    const ym = point.date.substring(0, 7); // "YYYY-MM"
    if (!monthMap.has(ym)) {
      monthMap.set(ym, { points: [], income: 0, expense: 0 });
    }
    const entry = monthMap.get(ym)!;
    entry.points.push(point);

    for (const detail of point.eventDetails) {
      if (detail.type === 'income') {
        entry.income += detail.amount;
      } else {
        entry.expense += detail.amount;
      }
    }
  }

  const summaries: MonthSummary[] = [];
  for (const [yearMonth, data] of monthMap) {
    const balances = data.points.map((p) => p.balance);
    summaries.push({
      yearMonth,
      endBalance: balances[balances.length - 1],
      totalIncome: data.income,
      totalExpense: data.expense,
      minBalance: Math.min(...balances),
    });
  }

  return summaries;
}
```

- [ ] **Step 3: periodToDays ヘルパーを追加**

```typescript
export function periodToDays(period: '60d' | '3m' | '6m' | '1y'): number {
  switch (period) {
    case '60d': return 60;
    case '3m': return 90;
    case '6m': return 180;
    case '1y': return 365;
  }
}

export function periodToMonths(period: '60d' | '3m' | '6m' | '1y'): number {
  switch (period) {
    case '60d': return 2;
    case '3m': return 3;
    case '6m': return 6;
    case '1y': return 12;
  }
}
```

- [ ] **Step 4: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/utils/forecast.ts
git commit -m "feat: add forecast month summary and period helper functions"
```

---

## Task 5: 分析集計ロジック — analytics.ts

**Files:**
- Create: `src/utils/analytics.ts`

- [ ] **Step 1: analytics.ts を作成**

```typescript
import type {
  ActualWithCategory,
  Category,
  EntryTemplate,
  MonthlyAmountsMap,
  CategoryTrendPoint,
  CompositionItem,
  ComparisonRow,
} from '../types';
import { resolveAmount } from '../stores/useMonthlyStore';

/**
 * Generate monthly category trend data for the given period.
 * For past months, uses actuals. For future months, uses template-based forecasts.
 */
export function buildCategoryTrend(
  actuals: ActualWithCategory[],
  templates: EntryTemplate[],
  categories: Category[],
  monthlyAmountsMap: MonthlyAmountsMap,
  months: string[],
  todayYearMonth: string,
): CategoryTrendPoint[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return months.map((ym) => {
    const categoryTotals = new Map<number | null, { name: string; color: string; amount: number }>();

    if (ym <= todayYearMonth) {
      // Past/current month: use actuals
      const monthActuals = actuals.filter((a) => a.yearMonth === ym);
      for (const a of monthActuals) {
        const key = a.categoryId;
        const existing = categoryTotals.get(key);
        if (existing) {
          existing.amount += a.actualAmount;
        } else {
          categoryTotals.set(key, {
            name: a.categoryName ?? 'その他',
            color: a.categoryColor ?? '#6b7280',
            amount: a.actualAmount,
          });
        }
      }
    } else {
      // Future month: use templates + monthly amounts
      const enabled = templates.filter((t) => t.enabled);
      for (const t of enabled) {
        const amount = resolveAmount(t.id, ym, monthlyAmountsMap, templates);
        if (amount <= 0) continue;
        const key = t.categoryId;
        const cat = key != null ? categoryMap.get(key) : null;
        const existing = categoryTotals.get(key);
        if (existing) {
          existing.amount += amount;
        } else {
          categoryTotals.set(key, {
            name: cat?.name ?? 'その他',
            color: cat?.color ?? '#6b7280',
            amount,
          });
        }
      }
    }

    const items = Array.from(categoryTotals.entries()).map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      color: data.color,
      amount: data.amount,
    }));
    items.sort((a, b) => b.amount - a.amount);

    return { yearMonth: ym, categories: items };
  });
}

/**
 * Build composition data (percentage breakdown) for a single month.
 * Filters to expense-type entries only.
 */
export function buildCompositionData(
  actuals: ActualWithCategory[],
  templates: EntryTemplate[],
  categories: Category[],
  monthlyAmountsMap: MonthlyAmountsMap,
  yearMonth: string,
  todayYearMonth: string,
  type: 'expense' | 'income' = 'expense',
): CompositionItem[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<number | null, { name: string; color: string; amount: number }>();

  if (yearMonth <= todayYearMonth) {
    const monthActuals = actuals.filter((a) => a.yearMonth === yearMonth && a.templateType === type);
    for (const a of monthActuals) {
      const key = a.categoryId;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += a.actualAmount;
      } else {
        totals.set(key, {
          name: a.categoryName ?? 'その他',
          color: a.categoryColor ?? '#6b7280',
          amount: a.actualAmount,
        });
      }
    }
  } else {
    const enabled = templates.filter((t) => t.enabled && t.type === type);
    for (const t of enabled) {
      const amount = resolveAmount(t.id, yearMonth, monthlyAmountsMap, templates);
      if (amount <= 0) continue;
      const key = t.categoryId;
      const cat = key != null ? categoryMap.get(key) : null;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        totals.set(key, {
          name: cat?.name ?? 'その他',
          color: cat?.color ?? '#6b7280',
          amount,
        });
      }
    }
  }

  const totalAmount = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);
  if (totalAmount === 0) return [];

  const items = Array.from(totals.entries()).map(([categoryId, data]) => ({
    categoryId,
    name: data.name,
    color: data.color,
    amount: data.amount,
    percentage: Math.round((data.amount / totalAmount) * 1000) / 10,
  }));
  items.sort((a, b) => b.amount - a.amount);

  return items;
}

/**
 * Build month-over-month and year-over-year comparison for each category.
 */
export function buildComparisonData(
  trendData: CategoryTrendPoint[],
  targetMonth: string,
  type: 'expense' | 'income' = 'expense',
): ComparisonRow[] {
  const target = trendData.find((t) => t.yearMonth === targetMonth);
  if (!target) return [];

  // Compute prev month (YYYY-MM format)
  const [year, month] = targetMonth.split('-').map(Number);
  const prevMonthDate = new Date(year, month - 2, 1); // month is 1-indexed, Date month is 0-indexed
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const prevYearMonth = `${year - 1}-${String(month).padStart(2, '0')}`;

  const prev = trendData.find((t) => t.yearMonth === prevMonth);
  const prevYear = trendData.find((t) => t.yearMonth === prevYearMonth);

  // Build lookup maps
  const prevMap = new Map(prev?.categories.map((c) => [c.categoryId, c.amount]) ?? []);
  const prevYearMap = new Map(prevYear?.categories.map((c) => [c.categoryId, c.amount]) ?? []);

  return target.categories.map((cat) => {
    const prevAmt = prevMap.get(cat.categoryId) ?? null;
    const prevYearAmt = prevYearMap.get(cat.categoryId) ?? null;

    return {
      categoryId: cat.categoryId,
      name: cat.name,
      color: cat.color,
      currentAmount: cat.amount,
      prevMonthDiff: prevAmt != null ? cat.amount - prevAmt : null,
      prevMonthPercent: prevAmt != null && prevAmt > 0
        ? Math.round(((cat.amount - prevAmt) / prevAmt) * 1000) / 10
        : null,
      prevYearDiff: prevYearAmt != null ? cat.amount - prevYearAmt : null,
      prevYearPercent: prevYearAmt != null && prevYearAmt > 0
        ? Math.round(((cat.amount - prevYearAmt) / prevYearAmt) * 1000) / 10
        : null,
    };
  });
}

/**
 * Generate list of YYYY-MM strings for a range.
 */
export function generateMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [startY, startM] = startMonth.split('-').map(Number);
  const [endY, endM] = endMonth.split('-').map(Number);

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}
```

- [ ] **Step 2: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/utils/analytics.ts
git commit -m "feat: add analytics utility functions for category trends, composition, and comparison"
```

---

## Task 6: ダッシュボード — ForecastChart に期間セレクター追加

**Files:**
- Modify: `src/components/dashboard/ForecastChart.tsx`
- Modify: `src/components/dashboard/DashboardView.tsx`

- [ ] **Step 1: ForecastChart に期間セレクターを追加**

`ForecastChart.tsx` の props を変更:

```typescript
import type { ForecastPoint, ForecastPeriod } from '../../types';

interface ForecastChartProps {
  data: ForecastPoint[];
  minimumPoint: ForecastPoint | null;
  period: ForecastPeriod;
  onPeriodChange: (period: ForecastPeriod) => void;
  onOpenAnalytics?: () => void;
}
```

`ForecastChart` 関数のシグネチャを更新:

```typescript
function ForecastChart({ data, minimumPoint, period, onPeriodChange, onOpenAnalytics }: ForecastChartProps) {
```

タイトル行（`<h2>` タグ）を以下に置換:

```typescript
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">残高予測</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800/50 rounded-lg p-0.5">
            {([
              { value: '60d' as const, label: '60日' },
              { value: '3m' as const, label: '3ヶ月' },
              { value: '6m' as const, label: '6ヶ月' },
              { value: '1y' as const, label: '1年' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => onPeriodChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  period === opt.value
                    ? 'bg-blue-500/20 text-blue-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {onOpenAnalytics && (
            <button
              onClick={onOpenAnalytics}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-2"
            >
              詳細分析 →
            </button>
          )}
        </div>
      </div>
```

XAxis の `interval` を動的に変更（`period` に基づく）:

```typescript
// ForecastChart 関数内、todayPoint の後に追加
const xAxisInterval = period === '60d' ? 6 : period === '3m' ? 13 : period === '6m' ? 29 : 59;
```

`<XAxis>` の `interval={6}` を `interval={xAxisInterval}` に変更。

- [ ] **Step 2: DashboardView に期間 state を追加**

`DashboardView.tsx` のインポート更新:

```typescript
import { useMemo, useEffect, useState } from 'react';
import type { ForecastPeriod, ViewType } from '../../types';
import { generateForecast, toYearMonth, periodToDays, periodToMonths } from '../../utils/forecast';
```

props を追加:

```typescript
interface DashboardViewProps {
  onNavigate?: (view: ViewType) => void;
}

function DashboardView({ onNavigate }: DashboardViewProps) {
```

`DashboardView` 関数内に期間 state を追加:

```typescript
const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('60d');
```

`useEffect` のデータ取得範囲を動的化:

```typescript
  useEffect(() => {
    const now = new Date();
    const startMonth = toYearMonth(now);
    const months = periodToMonths(forecastPeriod) + 1;
    const endDate = new Date(now.getFullYear(), now.getMonth() + months, 0);
    const endMonth = toYearMonth(endDate);
    fetchMonthlyAmountsRange(startMonth, endMonth);
  }, [fetchMonthlyAmountsRange, forecastPeriod]);
```

`generateForecast` の days を動的化:

```typescript
  const forecast = useMemo(
    () => generateForecast(balance, templates, monthlyAmountsMap, periodToDays(forecastPeriod)),
    [balance, templates, monthlyAmountsMap, forecastPeriod]
  );
```

`<ForecastChart>` に props を追加:

```typescript
      <ForecastChart
        data={forecast}
        minimumPoint={minimumPoint}
        period={forecastPeriod}
        onPeriodChange={setForecastPeriod}
        onOpenAnalytics={onNavigate ? () => onNavigate('analytics') : undefined}
      />
```

- [ ] **Step 3: App.tsx の DashboardView に onNavigate を渡す**

`src/App.tsx` の DashboardView 部分:

```typescript
            <motion.div key="dashboard" {...pageTransition}>
              <DashboardView onNavigate={setCurrentView} />
            </motion.div>
```

- [ ] **Step 4: 動作確認**

Run: `cd /Users/moyu/DEV/budget && npm run dev`
Expected: ダッシュボードに期間セレクター（60日/3ヶ月/6ヶ月/1年）が表示され、切り替えるとチャートの範囲が変わる

- [ ] **Step 5: コミット**

```bash
git add src/components/dashboard/ForecastChart.tsx src/components/dashboard/DashboardView.tsx src/App.tsx
git commit -m "feat: add forecast period selector to dashboard chart"
```

---

## Task 7: ナビゲーション — 「分析」タブ追加

**Files:**
- Modify: `src/components/sidebar/Navigation.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Navigation に分析タブを追加**

`navItems` 配列の `settings` の前に追加:

```typescript
  {
    id: 'analytics',
    label: '分析',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
```

- [ ] **Step 2: App.tsx に AnalyticsView のルーティングを追加**

インポート追加:

```typescript
import AnalyticsView from './components/analytics/AnalyticsView';
```

ルーティング追加（settings の前）:

```typescript
          {currentView === 'analytics' && (
            <motion.div key="analytics" {...pageTransition}>
              <AnalyticsView />
            </motion.div>
          )}
```

**注意**: AnalyticsView はまだ存在しないため、このステップでは空のプレースホルダーを先に作成する。

- [ ] **Step 3: AnalyticsView プレースホルダーを作成**

`src/components/analytics/AnalyticsView.tsx`:

```typescript
function AnalyticsView() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">分析</h1>
      <p className="text-slate-400">準備中...</p>
    </div>
  );
}

export default AnalyticsView;
```

- [ ] **Step 4: 動作確認**

Run: `cd /Users/moyu/DEV/budget && npm run dev`
Expected: サイドバーに「分析」タブが表示され、クリックで「準備中...」画面に遷移する

- [ ] **Step 5: コミット**

```bash
git add src/components/sidebar/Navigation.tsx src/App.tsx src/components/analytics/AnalyticsView.tsx
git commit -m "feat: add analytics navigation tab with placeholder view"
```

---

## Task 8: PeriodSelector コンポーネント

**Files:**
- Create: `src/components/analytics/PeriodSelector.tsx`

- [ ] **Step 1: PeriodSelector を作成**

```typescript
import { memo } from 'react';

interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodSelectorProps {
  options: PeriodOption[];
  selected: string;
  onChange: (value: string) => void;
}

function PeriodSelector({ options, selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex bg-slate-800/50 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm rounded-md transition-all ${
            selected === opt.value
              ? 'bg-blue-500/20 text-blue-400 font-medium'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default memo(PeriodSelector);
```

- [ ] **Step 2: コミット**

```bash
git add src/components/analytics/PeriodSelector.tsx
git commit -m "feat: add PeriodSelector component for analytics view"
```

---

## Task 9: TimelineChart コンポーネント（過去+未来統合）

**Files:**
- Create: `src/components/analytics/TimelineChart.tsx`

- [ ] **Step 1: TimelineChart を作成**

```typescript
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { BalanceSnapshot, ForecastPoint } from '../../types';
import { formatYAxisTick } from '../../utils/forecast';

interface TimelineChartProps {
  snapshots: BalanceSnapshot[];
  forecast: ForecastPoint[];
}

interface TimelineDataPoint {
  date: string;
  pastBalance: number | null;
  futureBalance: number | null;
}

function formatXLabel(dateStr: string) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TimelineDataPoint }> }) {
  if (!active || !payload || !payload[0]) return null;
  const point = payload[0].payload;
  const date = new Date(point.date);
  const label = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  const balance = point.pastBalance ?? point.futureBalance;

  return (
    <div
      className="rounded-xl px-4 py-3 shadow-2xl"
      style={{
        background: 'rgba(30, 41, 72, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(100, 116, 170, 0.2)',
      }}
    >
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-lg">
        {balance != null ? `¥${balance.toLocaleString()}` : '-'}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {point.pastBalance != null ? '実績' : '予測'}
      </p>
    </div>
  );
}

function TimelineChart({ snapshots, forecast }: TimelineChartProps) {
  const data = useMemo(() => {
    const points: TimelineDataPoint[] = [];

    // Past snapshots
    for (const s of snapshots) {
      points.push({ date: s.date, pastBalance: s.balance, futureBalance: null });
    }

    // Future forecast — skip today (it overlaps with last snapshot concept)
    const todayStr = forecast.find((p) => p.isToday)?.date;
    for (const f of forecast) {
      if (f.isToday) {
        // Bridge point: appears in both series for visual continuity
        points.push({ date: f.date, pastBalance: f.balance, futureBalance: f.balance });
      } else {
        points.push({ date: f.date, pastBalance: null, futureBalance: f.balance });
      }
    }

    // Sort by date and deduplicate
    points.sort((a, b) => a.date.localeCompare(b.date));

    return { points, todayDate: todayStr };
  }, [snapshots, forecast]);

  if (data.points.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">残高タイムライン</h2>
        <p className="text-slate-400 text-sm">データがありません。履歴からスナップショットを追加してください。</p>
      </div>
    );
  }

  const allBalances = data.points
    .map((p) => p.pastBalance ?? p.futureBalance ?? 0)
    .filter((b) => b !== 0);
  const minBalance = allBalances.length > 0 ? Math.min(...allBalances) : 0;
  const maxBalance = allBalances.length > 0 ? Math.max(...allBalances) : 100000;
  const padding = (maxBalance - minBalance) * 0.1 || 10000;

  // Calculate appropriate interval based on data length
  const xInterval = Math.max(1, Math.floor(data.points.length / 8));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-4">残高タイムライン</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data.points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="pastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 170, 0.08)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatXLabel}
            stroke="#4a5580"
            tick={{ fontSize: 11, fill: '#64748b' }}
            interval={xInterval}
            axisLine={{ stroke: 'rgba(100, 116, 170, 0.12)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#4a5580"
            tick={{ fontSize: 11, fill: '#64748b' }}
            domain={[minBalance - padding, maxBalance + padding]}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Past: solid area */}
          <Area
            type="monotone"
            dataKey="pastBalance"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#pastGradient)"
            dot={false}
            connectNulls={false}
          />

          {/* Future: dashed line */}
          <Line
            type="stepAfter"
            dataKey="futureBalance"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={false}
          />

          {/* Today marker */}
          {data.todayDate && (
            <ReferenceLine
              x={data.todayDate}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
              label={{
                value: '今日',
                fill: '#f59e0b',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-0.5 bg-emerald-500 rounded-full" />
          <span className="text-xs text-slate-400">実績</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-0.5 border-t-2 border-dashed border-blue-500" />
          <span className="text-xs text-slate-400">予測</span>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(TimelineChart);
```

- [ ] **Step 2: コミット**

```bash
git add src/components/analytics/TimelineChart.tsx
git commit -m "feat: add TimelineChart with past snapshots and future forecast"
```

---

## Task 10: CategoryTrendChart コンポーネント（積み上げ棒グラフ）

**Files:**
- Create: `src/components/analytics/CategoryTrendChart.tsx`

- [ ] **Step 1: CategoryTrendChart を作成**

```typescript
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { CategoryTrendPoint } from '../../types';
import { formatYAxisTick } from '../../utils/forecast';

interface CategoryTrendChartProps {
  data: CategoryTrendPoint[];
  todayYearMonth: string;
  type: 'expense' | 'income';
  onMonthClick?: (yearMonth: string) => void;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || !label) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 shadow-2xl max-w-xs"
      style={{
        background: 'rgba(30, 41, 72, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(100, 116, 170, 0.2)',
      }}
    >
      <p className="text-slate-400 text-xs mb-2">{label}</p>
      <div className="space-y-1">
        {payload
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-xs text-slate-300">{p.name}</span>
            </div>
            <span className="text-xs font-medium text-white tabular-nums">
              ¥{p.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryTrendChart({ data, todayYearMonth, type, onMonthClick }: CategoryTrendChartProps) {
  // Collect all unique category names across all months
  const { chartData, categoryKeys } = useMemo(() => {
    const allCategories = new Map<string, string>(); // name -> color
    for (const month of data) {
      for (const cat of month.categories) {
        if (!allCategories.has(cat.name)) {
          allCategories.set(cat.name, cat.color);
        }
      }
    }

    const keys = Array.from(allCategories.entries());

    const formatted = data.map((month) => {
      const row: Record<string, string | number> = { yearMonth: month.yearMonth };
      for (const [name] of keys) {
        const found = month.categories.find((c) => c.name === name);
        row[name] = found?.amount ?? 0;
      }
      return row;
    });

    return { chartData: formatted, categoryKeys: keys };
  }, [data]);

  const title = type === 'expense' ? '支出トレンド' : '収入トレンド';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {chartData.length === 0 ? (
        <p className="text-slate-400 text-sm">データがありません</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
            onClick={(e) => {
              if (e?.activeLabel && onMonthClick) {
                onMonthClick(e.activeLabel as string);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 170, 0.08)" vertical={false} />
            <XAxis
              dataKey="yearMonth"
              stroke="#4a5580"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: 'rgba(100, 116, 170, 0.12)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatYAxisTick}
              stroke="#4a5580"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100, 116, 170, 0.05)' }} />
            <ReferenceLine
              x={todayYearMonth}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            {categoryKeys.map(([name, color]) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="stack"
                fill={color}
                fillOpacity={0.8}
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}

export default memo(CategoryTrendChart);
```

- [ ] **Step 2: コミット**

```bash
git add src/components/analytics/CategoryTrendChart.tsx
git commit -m "feat: add CategoryTrendChart with stacked bar visualization"
```

---

## Task 11: CompositionChart コンポーネント（ドーナツチャート）

**Files:**
- Create: `src/components/analytics/CompositionChart.tsx`

- [ ] **Step 1: CompositionChart を作成**

```typescript
import { memo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CompositionItem } from '../../types';
import { formatCurrency } from '../../utils/forecast';

interface CompositionChartProps {
  data: CompositionItem[];
  yearMonth: string;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CompositionItem }> }) {
  if (!active || !payload || !payload[0]) return null;
  const item = payload[0].payload;

  return (
    <div
      className="rounded-xl px-4 py-3 shadow-2xl"
      style={{
        background: 'rgba(30, 41, 72, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(100, 116, 170, 0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="text-sm text-white font-medium">{item.name}</span>
      </div>
      <p className="text-white font-bold">¥{item.amount.toLocaleString()}</p>
      <p className="text-slate-400 text-xs">{item.percentage}%</p>
    </div>
  );
}

function CompositionChart({ data, yearMonth }: CompositionChartProps) {
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-1">支出構成</h2>
      <p className="text-sm text-slate-400 mb-4">{yearMonth}</p>

      {data.length === 0 ? (
        <p className="text-slate-400 text-sm">データがありません</p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative w-48 h-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="amount"
                >
                  {data.map((item, i) => (
                    <Cell key={i} fill={item.color} fillOpacity={0.85} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-slate-400">合計</span>
              <span className="text-sm font-bold text-white">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {data.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-300 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white tabular-nums">¥{item.amount.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 tabular-nums w-12 text-right">{item.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default memo(CompositionChart);
```

- [ ] **Step 2: コミット**

```bash
git add src/components/analytics/CompositionChart.tsx
git commit -m "feat: add CompositionChart donut with category breakdown"
```

---

## Task 12: ComparisonTable コンポーネント

**Files:**
- Create: `src/components/analytics/ComparisonTable.tsx`

- [ ] **Step 1: ComparisonTable を作成**

```typescript
import { memo } from 'react';
import { motion } from 'framer-motion';
import type { ComparisonRow } from '../../types';

interface ComparisonTableProps {
  data: ComparisonRow[];
  yearMonth: string;
}

function formatDiff(diff: number | null): string {
  if (diff == null) return '-';
  const sign = diff > 0 ? '+' : '';
  return `${sign}¥${diff.toLocaleString()}`;
}

function formatPercent(pct: number | null): string {
  if (pct == null) return '-';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function getDiffColor(diff: number | null, isExpense: boolean): string {
  if (diff == null || diff === 0) return 'text-slate-400';
  // For expenses: increase is bad (red), decrease is good (green)
  // This logic can be inverted for income if needed
  if (isExpense) {
    return diff > 0 ? 'text-red-400' : 'text-emerald-400';
  }
  return diff > 0 ? 'text-emerald-400' : 'text-red-400';
}

function isLargeChange(pct: number | null): boolean {
  return pct != null && Math.abs(pct) >= 20;
}

function ComparisonTable({ data, yearMonth }: ComparisonTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-1">前月比・前年同月比</h2>
      <p className="text-sm text-slate-400 mb-4">{yearMonth}</p>

      {data.length === 0 ? (
        <p className="text-slate-400 text-sm">データがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 pr-4 text-slate-400 font-medium">カテゴリ</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">当月</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">前月比</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">前年比</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-slate-700/20 ${
                    isLargeChange(row.prevMonthPercent) ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-slate-200">{row.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-3 text-white tabular-nums">
                    ¥{row.currentAmount.toLocaleString()}
                  </td>
                  <td className="text-right py-2.5 px-3">
                    <div className="flex flex-col items-end">
                      <span className={`tabular-nums ${getDiffColor(row.prevMonthDiff, true)}`}>
                        {formatDiff(row.prevMonthDiff)}
                      </span>
                      <span className={`text-xs tabular-nums ${getDiffColor(row.prevMonthPercent, true)}`}>
                        {formatPercent(row.prevMonthPercent)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-3">
                    <div className="flex flex-col items-end">
                      <span className={`tabular-nums ${getDiffColor(row.prevYearDiff, true)}`}>
                        {formatDiff(row.prevYearDiff)}
                      </span>
                      <span className={`text-xs tabular-nums ${getDiffColor(row.prevYearPercent, true)}`}>
                        {formatPercent(row.prevYearPercent)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

export default memo(ComparisonTable);
```

- [ ] **Step 2: コミット**

```bash
git add src/components/analytics/ComparisonTable.tsx
git commit -m "feat: add ComparisonTable with month-over-month and year-over-year analysis"
```

---

## Task 13: AnalyticsView — 全コンポーネント統合

**Files:**
- Modify: `src/components/analytics/AnalyticsView.tsx`

- [ ] **Step 1: AnalyticsView を完全実装で置換**

```typescript
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import {
  generateForecast,
  toYearMonth,
  periodToDays,
  periodToMonths,
} from '../../utils/forecast';
import {
  buildCategoryTrend,
  buildCompositionData,
  buildComparisonData,
  generateMonthRange,
} from '../../utils/analytics';
import PeriodSelector from './PeriodSelector';
import TimelineChart from './TimelineChart';
import CategoryTrendChart from './CategoryTrendChart';
import CompositionChart from './CompositionChart';
import ComparisonTable from './ComparisonTable';
import type { BalanceSnapshot } from '../../types';

const periodOptions = [
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '1y', label: '1年' },
];

function AnalyticsView() {
  const [period, setPeriod] = useState('6m');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const balance = useBalanceStore((s) => s.balance);
  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const actualsWithCategory = useMonthlyStore((s) => s.actualsWithCategory);
  const fetchMonthlyAmountsRange = useMonthlyStore((s) => s.fetchMonthlyAmountsRange);
  const fetchActualsRange = useMonthlyStore((s) => s.fetchActualsRange);
  const snapshots = useSnapshotStore((s) => s.snapshots);

  const now = useMemo(() => new Date(), []);
  const todayYearMonth = useMemo(() => toYearMonth(now), [now]);

  // Compute date ranges based on period
  const { startMonth, endMonth, pastStartDate } = useMemo(() => {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    const pastStart = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const futureEnd = new Date(now.getFullYear(), now.getMonth() + months, 0);

    return {
      startMonth: toYearMonth(pastStart),
      endMonth: toYearMonth(futureEnd),
      pastStartDate: pastStart.toISOString().split('T')[0],
    };
  }, [now, period]);

  // Fetch data for the selected period
  useEffect(() => {
    fetchMonthlyAmountsRange(startMonth, endMonth);
    fetchActualsRange(startMonth, todayYearMonth);
  }, [fetchMonthlyAmountsRange, fetchActualsRange, startMonth, endMonth, todayYearMonth]);

  // Generate forecast
  const forecastDays = useMemo(() => {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return months * 31; // approximate
  }, [period]);

  const forecast = useMemo(
    () => generateForecast(balance, templates, monthlyAmountsMap, forecastDays),
    [balance, templates, monthlyAmountsMap, forecastDays]
  );

  // Filter snapshots to period range
  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((s) => s.date >= pastStartDate);
  }, [snapshots, pastStartDate]);

  // Generate month list
  const months = useMemo(
    () => generateMonthRange(startMonth, endMonth),
    [startMonth, endMonth]
  );

  // Default selected month to current month
  const activeMonth = selectedMonth ?? todayYearMonth;

  // Category trend data (expense)
  const expenseTrend = useMemo(
    () => buildCategoryTrend(
      actualsWithCategory, templates, categories,
      monthlyAmountsMap, months, todayYearMonth
    ).map((point) => ({
      ...point,
      categories: point.categories.filter((c) => {
        // Filter to expense only by checking template type
        const matchingActual = actualsWithCategory.find(
          (a) => a.yearMonth === point.yearMonth && a.categoryId === c.categoryId
        );
        if (matchingActual) return matchingActual.templateType === 'expense';
        // For future months, check template
        const matchingTemplate = templates.find(
          (t) => t.categoryId === c.categoryId && t.type === 'expense'
        );
        return !!matchingTemplate;
      }),
    })),
    [actualsWithCategory, templates, categories, monthlyAmountsMap, months, todayYearMonth]
  );

  // Income trend data
  const incomeTrend = useMemo(
    () => buildCategoryTrend(
      actualsWithCategory, templates, categories,
      monthlyAmountsMap, months, todayYearMonth
    ).map((point) => ({
      ...point,
      categories: point.categories.filter((c) => {
        const matchingActual = actualsWithCategory.find(
          (a) => a.yearMonth === point.yearMonth && a.categoryId === c.categoryId
        );
        if (matchingActual) return matchingActual.templateType === 'income';
        const matchingTemplate = templates.find(
          (t) => t.categoryId === c.categoryId && t.type === 'income'
        );
        return !!matchingTemplate;
      }),
    })),
    [actualsWithCategory, templates, categories, monthlyAmountsMap, months, todayYearMonth]
  );

  // Composition data for selected month
  const composition = useMemo(
    () => buildCompositionData(
      actualsWithCategory, templates, categories,
      monthlyAmountsMap, activeMonth, todayYearMonth, 'expense'
    ),
    [actualsWithCategory, templates, categories, monthlyAmountsMap, activeMonth, todayYearMonth]
  );

  // Comparison data for selected month
  const comparison = useMemo(
    () => buildComparisonData(expenseTrend, activeMonth),
    [expenseTrend, activeMonth]
  );

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">分析</h1>
        <PeriodSelector
          options={periodOptions}
          selected={period}
          onChange={(v) => {
            setPeriod(v);
            setSelectedMonth(null);
          }}
        />
      </div>

      {/* Timeline: past snapshots + future forecast */}
      <TimelineChart snapshots={filteredSnapshots} forecast={forecast} />

      {/* Category trends: expense + income side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CategoryTrendChart
          data={expenseTrend}
          todayYearMonth={todayYearMonth}
          type="expense"
          onMonthClick={setSelectedMonth}
        />
        <CategoryTrendChart
          data={incomeTrend}
          todayYearMonth={todayYearMonth}
          type="income"
          onMonthClick={setSelectedMonth}
        />
      </div>

      {/* Composition + Comparison side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompositionChart data={composition} yearMonth={activeMonth} />
        <ComparisonTable data={comparison} yearMonth={activeMonth} />
      </div>
    </motion.div>
  );
}

export default AnalyticsView;
```

- [ ] **Step 2: ビルド確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 動作確認**

Run: `cd /Users/moyu/DEV/budget && npm run dev`
Expected:
- 「分析」タブをクリックすると AnalyticsView が表示
- 期間セレクターで 3ヶ月/6ヶ月/1年 を切り替え可能
- タイムラインチャートに過去（実線）+未来（破線）が表示
- カテゴリ別積み上げ棒グラフが支出・収入それぞれ表示
- 棒グラフの月をクリックすると構成比チャートと前月比テーブルが更新
- データがない場合は「データがありません」が表示

- [ ] **Step 4: コミット**

```bash
git add src/components/analytics/AnalyticsView.tsx
git commit -m "feat: integrate all analytics components into AnalyticsView"
```

---

## Task 14: 最終統合テスト・調整

**Files:**
- 全ファイルの確認

- [ ] **Step 1: ビルド全体確認**

Run: `cd /Users/moyu/DEV/budget && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 2: 開発サーバーで全機能確認**

Run: `cd /Users/moyu/DEV/budget && npm run dev`

確認項目:
1. ダッシュボード: 期間セレクターが動作、「詳細分析 →」リンクで分析ビューへ遷移
2. 分析ビュー: 全5セクションが表示
3. ナビゲーション: 5タブすべて正常に切り替え
4. 既存機能: 収支管理、履歴、設定が以前通り動作

- [ ] **Step 3: プロダクションビルド確認**

Run: `cd /Users/moyu/DEV/budget && npm run build`
Expected: ビルド成功

- [ ] **Step 4: 不要な console.log やデバッグコードがないことを確認**

Run: 各新規ファイルに `console.log` がないことを確認

- [ ] **Step 5: 最終コミット（必要な場合のみ）**

調整が必要だった場合:
```bash
git add -A
git commit -m "fix: final adjustments for analytics integration"
```
