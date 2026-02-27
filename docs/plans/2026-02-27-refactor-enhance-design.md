# Balance Forecast App - リファクタ & エンハンス設計書

**Date**: 2026-02-27
**Approach**: B - 現スタック維持で全面リライト
**Stack**: Electron 40 + React 19 + TypeScript 5.9 + better-sqlite3 + Tailwind v4

---

## 1. 概要

家計簿アプリ「Balance Forecast」の全面リファクタ。現在のElectron + React + SQLiteスタックを維持しつつ、設計・UI・機能を一新する。

### 主な改善目標

- テンプレートにデフォルト金額・カテゴリを追加し、月次セットアップの手間を削減
- 残高入力を常時アクティブにし、直感的に更新可能に
- 当日の収支イベントは「反映済み」として扱う
- サンキーダイアグラムで収支フローを可視化
- 月次実績記録を追加
- Zustandによる状態管理の分離
- ダークテーマを維持しつつUI全面刷新

---

## 2. データモデル & DBスキーマ

### 新規テーブル

```sql
-- カテゴリテーブル
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 月次実績テーブル
CREATE TABLE monthly_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  year_month TEXT NOT NULL CHECK(length(year_month) = 7),
  actual_amount REAL NOT NULL CHECK(actual_amount >= 0),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES entry_templates(id) ON DELETE CASCADE,
  UNIQUE(template_id, year_month)
);
```

### 既存テーブルの変更

```sql
-- entry_templates に追加
ALTER TABLE entry_templates ADD COLUMN category_id INTEGER REFERENCES categories(id);
ALTER TABLE entry_templates ADD COLUMN default_amount REAL NOT NULL DEFAULT 0;
```

### 金額解決の優先順位

1. `monthly_amounts` にその月のレコードがある → その金額
2. なければ → `entry_templates.default_amount`
3. `default_amount` も 0 → イベントとして表示しない

### プリセットカテゴリ（初回起動時に自動作成）

**支出**: 住居費, 食費, 光熱費, 通信費, 保険, 交通費, 娯楽, その他
**収入**: 給与, 副収入, 投資収入, その他収入

---

## 3. 状態管理 & アーキテクチャ

### Zustand ストア分離

```
stores/
├── useBalanceStore.ts      -- 残高管理（get/set/subscribe）
├── useTemplateStore.ts     -- テンプレート CRUD + カテゴリ
├── useMonthlyStore.ts      -- 月次金額・実績データ
├── useSnapshotStore.ts     -- 残高スナップショット
└── useForecastStore.ts     -- 予測データ（derived state）
```

### 各ストアの責務

- **BalanceStore**: 現在残高の読み書き、残高変更のサブスクライブ
- **TemplateStore**: テンプレート・カテゴリの CRUD、有効/無効トグル
- **MonthlyStore**: 月次金額のセット・取得・コピー、実績記録
- **SnapshotStore**: スナップショットの記録・削除・一覧
- **ForecastStore**: 上記ストアを購読して予測を自動再計算

### エラー & ローディング

- 各ストアに `loading` / `error` 状態を持たせる
- IPC呼び出し失敗時にトースト通知で表示
- 楽観的更新 + エラー時のロールバック

### 当日イベント反映ロジック

```
Day 0 (今日): balance = currentBalance（イベントは「反映済み」マーク付きで表示）
Day 1 (明日): balance += 明日の収入 - 明日の支出
Day 2 以降: 同様に加減算
```

当日の残高 = ユーザーが入力した現在残高（当日分の収支は既に含まれている前提）。

---

## 4. UI/UX デザイン

### レイアウト

```
┌──────────────────────────────────────────┐
│  ← サイドバー (折りたたみ可能)  │  メインエリア │
│                                 │              │
│  💰 現在残高: ¥XXX,XXX         │              │
│  [即座に編集可能な入力欄]       │  (各ビュー)   │
│                                 │              │
│  📊 ダッシュボード              │              │
│  📋 収支管理                    │              │
│  📈 履歴                        │              │
│  ⚙️ 設定                       │              │
│                                 │              │
│  ── 今月のサマリー ──           │              │
│  収入: +¥XXX,XXX               │              │
│  支出: -¥XXX,XXX               │              │
│  差引: ¥XXX,XXX                │              │
└──────────────────────────────────────────┘
```

### ダッシュボード

```
┌─────────────────────────────────────┐
│  [予測チャート - 60日間]             │
│  ※当日は反映済みとして表示          │
├──────────────┬──────────────────────┤
│ 最低残高カード │  サンキーダイアグラム │
│ (色分け警告)   │  収入 → カテゴリ別  │
│               │  支出の流れ          │
├──────────────┴──────────────────────┤
│  直近14日間のイベント一覧            │
│  ※当日分は「反映済み」マーク付き     │
└─────────────────────────────────────┘
```

### 収支管理画面

- テンプレート管理: モーダル → インライン編集に変更
- カテゴリ別グルーピング表示
- デフォルト金額の表示（上書き時は明示）
- 「デフォルトにリセット」ボタン追加
- 各テンプレートに「実績」列を追加

### デザイン方針

- 現ダークテーマを洗練（パーティクル背景は維持・最適化）
- 設定画面を新規追加（カテゴリ管理）
- トースト通知によるエラー・成功フィードバック

---

## 5. コンポーネント構成

```
App.tsx
├── Layout.tsx
│   ├── Sidebar/
│   │   ├── BalanceInput.tsx        -- 常時アクティブ残高入力
│   │   ├── Navigation.tsx          -- ビュー切替
│   │   └── MonthlySummary.tsx      -- 今月サマリー
│   └── MainContent/
│       ├── DashboardView/
│       │   ├── ForecastChart.tsx    -- 60日予測チャート
│       │   ├── MinBalanceCard.tsx   -- 最低残高カード
│       │   ├── SankeyChart.tsx      -- サンキーダイアグラム (d3-sankey)
│       │   └── UpcomingEvents.tsx   -- 直近イベント（当日反映済み表示）
│       ├── EntriesView/
│       │   ├── MonthNavigator.tsx   -- 月選択
│       │   ├── CategoryGroup.tsx    -- カテゴリ別グループ
│       │   ├── EntryRow.tsx         -- 個別エントリ（予定+実績）
│       │   └── TemplateEditor.tsx   -- インライン編集
│       ├── HistoryView/
│       │   ├── SnapshotForm.tsx     -- スナップショット記録
│       │   ├── SnapshotList.tsx     -- 履歴一覧
│       │   └── HistoryChart.tsx     -- 推移チャート
│       └── SettingsView/
│           ├── CategoryManager.tsx  -- カテゴリ CRUD
│           └── AppSettings.tsx      -- アプリ設定
├── shared/
│   ├── Toast.tsx                   -- 通知トースト
│   ├── LoadingSpinner.tsx          -- ローディング表示
│   └── ConfirmDialog.tsx           -- 確認ダイアログ
└── ParticleBackground.tsx          -- 3D背景（最適化）
```

---

## 6. 新規依存パッケージ

- **zustand**: 状態管理
- **d3-sankey** + **@types/d3-sankey**: サンキーダイアグラム
- **d3-shape** + **@types/d3-shape**: SVGパス生成（d3-sankeyの依存）

---

## 7. テスト戦略

- **Zustand ストア**: 各ストアのロジックをユニットテスト
- **コンポーネント**: React Testing Library で主要操作フローをテスト
- **予測ロジック**: 当日反映ロジックを含むforecast.tsの境界値テスト
- **IPC ハンドラ**: DBオペレーションの結合テスト

---

## 8. マイグレーション戦略

1. 新テーブル（categories, monthly_actuals）を作成
2. entry_templates に category_id, default_amount カラムを追加
3. プリセットカテゴリを自動挿入
4. 既存データは未分類カテゴリに紐付け
5. 既存の monthly_amounts データは保持（互換性維持）
