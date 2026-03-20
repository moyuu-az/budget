# Forecast & Analytics エンジン高度化 設計書

**作成日**: 2026-03-20
**ステータス**: 承認済み

---

## 概要

Balance Forecast アプリの予測・分析機能を強化する。現在の60日予測を最大1年に拡張し、過去のトレンド分析と未来の予測を統合した専用ビューを追加する。

## 目標

1. ダッシュボードの予測チャートに期間切り替え（60日/3ヶ月/6ヶ月/1年）を追加
2. 過去トレンドと未来予測を一画面で見られる「Forecast & Analytics」専用ビューを新設
3. カテゴリ別の時系列推移・構成比・前月比/前年同月比の総合トレンド分析を提供

## 対象外

- シナリオ分析（楽観/悲観の比較シミュレーション）
- アラート・通知機能
- データのインポート/エクスポート

---

## 1. ダッシュボード拡張

### 変更対象: `ForecastChart`

- 期間セレクターを追加: 60日 / 3ヶ月 / 6ヶ月 / 1年
- 選択した期間に応じて `generateForecast()` の `days` パラメータを変更
- 長期間（3ヶ月以上）ではX軸ラベルを月単位に自動切り替え
- 「詳細を見る →」リンクで Forecast & Analytics ビューへ遷移

### データ取得

- 期間変更時に `monthlyAmountsRange` の取得範囲を動的に拡張
- 既存の `useMonthlyStore.fetchMonthlyAmountsRange()` を活用

---

## 2. Forecast & Analytics 専用ビュー

### ナビゲーション

- サイドバーに5番目のタブ「分析」を追加
- 既存の4ビュー（Dashboard / Entries / History / Settings）の後に配置

### レイアウト（上から下）

#### 2.1 期間セレクター

- 選択肢: 3ヶ月 / 6ヶ月 / 1年 / カスタム範囲
- 過去と未来の両方をカバーする期間指定
- デフォルト: 過去3ヶ月 + 未来3ヶ月（計6ヶ月）

#### 2.2 統合タイムラインチャート

- 一つの連続した折れ線グラフ
- 左側: 過去の実績残高（`balance_snapshots` データ）
- 右側: 未来の予測残高（`generateForecast()` データ）
- 現在地点に「今日」マーカーを表示
- 過去と未来で線のスタイルを分ける（実線 vs 破線など）

#### 2.3 カテゴリ別時系列グラフ

- 積み上げ棒グラフ
- 過去の月: `monthly_actuals` の実績データ
- 未来の月: テンプレート × `monthly_amounts` ベースの予測データ
- 収入と支出を別セクションまたは切り替えで表示
- カテゴリカラーは既存の `categories.color` を使用

#### 2.4 構成比チャート

- ドーナツチャート
- 選択月の支出カテゴリ比率を表示
- 棒グラフの月をクリックすると該当月に切り替え
- 各カテゴリの金額とパーセンテージをラベル表示

#### 2.5 前月比テーブル

- 各カテゴリの行に以下を表示:
  - カテゴリ名（カラーインジケータ付き）
  - 当月金額
  - 前月比（金額差 + パーセント + ↑↓矢印）
  - 前年同月比（金額差 + パーセント + ↑↓矢印）
- 大きな変動（例: ±20%以上）はカラーハイライト
- 前年同月のデータがない場合は「-」表示

---

## 3. 予測エンジン拡張

### 変更対象: `utils/forecast.ts`

#### `generateForecast()` の拡張

- `days` パラメータの上限を365日に拡張
- 既存の60日予測ロジックはそのまま動作（後方互換性維持）

#### 新規: `summarizeForecastByMonth()`

- 長期予測データを月単位にサマリー集計
- 各月の: 月末残高、収入合計、支出合計、最小残高を算出
- チャートのデータポイント削減に使用（365日 → 12ポイント）

---

## 4. 分析集計ロジック

### 新規ファイル: `utils/analytics.ts`

#### `buildCategoryTrend(actuals, categories, startMonth, endMonth)`

- 指定期間のカテゴリ別月次推移データを生成
- 戻り値: `{ month: string, categories: { id, name, color, amount }[] }[]`

#### `buildCompositionData(actuals, categories, yearMonth)`

- 指定月の支出構成比を計算
- 戻り値: `{ id, name, color, amount, percentage }[]`

#### `buildComparisonData(actuals, categories, yearMonth)`

- 前月比・前年同月比を算出
- 戻り値: `{ id, name, color, currentAmount, prevMonthDiff, prevMonthPercent, prevYearDiff, prevYearPercent }[]`
- 前年同月データがない場合は null

---

## 5. DB・IPC拡張

### database.ts 追加メソッド

#### `getMonthlyActualsRange(startMonth, endMonth)`

- 指定期間の全 `monthly_actuals` を一括取得
- JOIN で `entry_templates` と `categories` の情報を含める
- 戻り値にカテゴリ情報（name, type, color）を含む

#### `getBalanceSnapshotsRange(startDate, endDate)`

- 指定期間の `balance_snapshots` を取得（既存の全件取得を範囲指定に拡張）

### IPC ハンドラー追加

- `get-monthly-actuals-range` → `getMonthlyActualsRange()`
- `get-balance-snapshots-range` → `getBalanceSnapshotsRange()`

### スキーマ変更: なし

既存テーブル（`monthly_actuals`, `balance_snapshots`, `categories`, `entry_templates`）で全て対応可能。

---

## 6. ストア拡張

### `useMonthlyStore` 拡張

- `fetchActualsRange(startMonth, endMonth)` アクションを追加
- actuals データを `Map<yearMonth, Map<templateId, number>>` で保持（既存パターン踏襲）

### 新規ストアは作成しない

- データソースが既存ストアと同じため、既存ストアの拡張で対応
- 分析用の集計は `utils/analytics.ts` のユーティリティ関数で処理

---

## 7. コンポーネント構成

```
src/components/
├── dashboard/
│   └── ForecastChart.tsx          # 期間セレクター追加
├── analytics/                     # 新規ディレクトリ
│   ├── AnalyticsView.tsx          # メインオーケストレーター
│   ├── PeriodSelector.tsx         # 期間選択UI
│   ├── TimelineChart.tsx          # 統合タイムライン（過去+未来）
│   ├── CategoryTrendChart.tsx     # カテゴリ別時系列（積み上げ棒）
│   ├── CompositionChart.tsx       # 構成比ドーナツチャート
│   └── ComparisonTable.tsx        # 前月比/前年同月比テーブル
```

---

## 8. 影響範囲

| 領域 | 変更内容 | 既存への影響 |
|---|---|---|
| DB スキーマ | 変更なし | なし |
| `electron/database.ts` | クエリ2件追加 | 既存関数に影響なし |
| `electron/index.ts` | IPC ハンドラー2件追加 | 既存ハンドラーに影響なし |
| `electron/preload.ts` | API メソッド2件追加 | 既存APIに影響なし |
| `src/types/index.ts` | 分析用の型定義追加 | 既存型に影響なし |
| `utils/forecast.ts` | days上限拡張 + 月サマリー関数追加 | 既存の60日予測はそのまま動作 |
| 新規 `utils/analytics.ts` | 集計ロジック3関数 | 新規ファイル |
| `stores/monthlyStore.ts` | actuals範囲取得アクション追加 | 既存アクションに影響なし |
| `components/dashboard/ForecastChart.tsx` | 期間セレクター追加 | レイアウトの軽微な調整 |
| `components/sidebar/Navigation.tsx` | 5番目のタブ追加 | 1項目追加のみ |
| `src/App.tsx` | AnalyticsView のルーティング追加 | 既存ルートに影響なし |
| 新規 `components/analytics/` | 6コンポーネント | 新規ディレクトリ |

---

## 9. 技術的考慮事項

### パフォーマンス

- 365日予測はデータポイントが多いため、月サマリー集計でチャート描画を最適化
- actuals の範囲取得はSQLのWHERE句で絞り込み、全件取得を避ける
- 集計ロジックは `useMemo` でメモ化し、期間変更時のみ再計算

### チャートライブラリ

- 既存の Recharts を使用（折れ線、棒、ドーナツ全て対応可能）
- 統合タイムラインは `ComposedChart` で実線（過去）+ 破線（未来）を実現
- 構成比は `PieChart` を使用

### データの整合性

- 過去データ（actuals）がない月は0として扱う
- 未来のカテゴリ別データはテンプレートの `defaultAmount` × `monthly_amounts` のオーバーライドで算出
- カテゴリが削除された場合の actuals は「未分類」として集計
