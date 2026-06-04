# Balance Forecast — 全体リファクタリング + UI/UX 刷新 設計書

- **Date**: 2026-04-17
- **Status**: Draft / pending review
- **Scope**: プロダクト全体（Electron main + React renderer + スタイリング + テスト基盤）
- **Author**: Claude (Opus 4.7) with moyuu approval

---

## 1. 背景と目的

### 1.1 背景
`feature/forecast-analytics` のマージ直後時点で、プロダクトは以下の状況にある。

- React 19 + Zustand + Tailwind v4 + Recharts/D3 + Framer Motion で構築された Electron 家計簿アプリ。
- 5,608 行 / 40+ コンポーネント規模。
- 肥大化コンポーネント 3 ファイル（`SankeyChart.tsx` 386 / `CategoryManager.tsx` 345 / `EntriesView.tsx` 302）。
- デザインシステム未定義（CSS 変数で色管理のみ、Tailwind v4 `@theme` 活用なし）。
- ライトモード未対応、アクセシビリティ欠落（`aria-*` が 4 箇所のみ）、テスト基盤なし、IPC バリデーションなし。
- 「選択月」状態がコンポーネント間で重複保持されている。

### 1.2 目的
以下 3 点を同時に達成する。

1. **構造整理**: 保守性・拡張性を確保するため、肥大化コンポーネントを分割し、デザイントークンと共通 UI プリミティブを整備する。
2. **UI/UX 刷新**: ライト/ダークテーマ切替、KPI ヒーロー、サイドバー再設計、空状態・エラー・ローディングの統一、マイクロインタラクション磨き込みで、ユーザー体験を一段引き上げる。
3. **品質保証基盤**: Vitest によるユニットテスト、Zod による IPC バリデーション、パフォーマンス計測を導入し、今後の開発に耐える足場を作る。

### 1.3 非ゴール
- 新機能（シナリオ分析、通知、データ同期など）の追加。
- DB スキーマの破壊的変更。
- ネイティブメニュー（macOS メニューバーなど）の再設計。
- Storybook 等の独立したコンポーネントカタログの導入（将来検討）。

---

## 2. 全体アーキテクチャ

### 2.1 新ディレクトリ構造

```
src/
├── App.tsx
├── main.tsx
├── index.css                      # Tailwind v4 @import + @theme
├── theme/
│   ├── tokens.ts                  # 型付きトークン (typed design tokens)
│   ├── theme.css                  # @theme ブロック + CSS 変数
│   └── motion.ts                  # Framer Motion variants 共通化
├── lib/
│   ├── ipc.ts                     # Zod バリデーション付き IPC ラッパー
│   └── schemas.ts                 # Zod スキーマ（renderer 側）
├── hooks/
│   ├── useAutoUpdate.ts           # 既存
│   ├── useSelectedMonth.ts        # 新規: UIStore と同期
│   ├── useCashFlowData.ts         # 新規: SankeyChart から抽出
│   ├── useTheme.ts                # 新規: light/dark トグル
│   └── useKeyboardShortcuts.ts    # 新規: グローバルショートカット
├── stores/
│   ├── useBalanceStore.ts
│   ├── useCategoryStore.ts
│   ├── useMonthlyStore.ts
│   ├── useSnapshotStore.ts
│   ├── useTemplateStore.ts
│   ├── useToastStore.ts
│   └── useUIStore.ts              # 新規: theme / selectedYearMonth / sidebarCollapsed
├── components/
│   ├── ui/                        # 新規: 共通プリミティブ
│   │   ├── Button.tsx
│   │   ├── IconButton.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── NumberInput.tsx
│   │   ├── Select.tsx
│   │   ├── Tabs.tsx
│   │   ├── Dialog.tsx
│   │   ├── Badge.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Toast.tsx              # 既存 shared から昇格
│   │   └── ConfirmDialog.tsx      # 既存 shared から昇格
│   ├── layout/
│   │   ├── Layout.tsx
│   │   ├── Sidebar.tsx            # 既存 sidebar から移設・再設計
│   │   ├── SidebarItem.tsx
│   │   ├── ThemeToggle.tsx        # 新規
│   │   └── ParticleBackground.tsx
│   ├── dashboard/
│   │   ├── DashboardView.tsx
│   │   ├── KpiHero.tsx            # 新規
│   │   ├── MinBalanceCard.tsx
│   │   ├── ForecastChart.tsx
│   │   ├── SankeyChart/
│   │   │   ├── index.tsx          # 分割後のエントリ
│   │   │   ├── SankeyCanvas.tsx
│   │   │   └── SankeyTooltip.tsx
│   │   └── UpcomingEvents.tsx
│   ├── entries/
│   │   ├── EntriesView.tsx        # 薄いオーケストレーター化
│   │   ├── MonthNavigator.tsx
│   │   ├── CategoryGroupList.tsx  # 新規
│   │   ├── CategoryGroup.tsx
│   │   ├── EntryRow.tsx
│   │   ├── TemplateActions.tsx    # 新規（コピー/リセット等）
│   │   └── TemplateEditor.tsx
│   ├── history/
│   │   ├── HistoryView.tsx
│   │   ├── SnapshotList.tsx
│   │   ├── SnapshotForm.tsx
│   │   └── HistoryChart.tsx
│   ├── analytics/
│   │   ├── AnalyticsView.tsx
│   │   ├── PeriodSelector.tsx
│   │   ├── TimelineChart.tsx
│   │   ├── CategoryTrendChart.tsx
│   │   ├── CompositionChart.tsx
│   │   └── ComparisonTable.tsx
│   ├── settings/
│   │   ├── SettingsView.tsx
│   │   ├── BalanceInput.tsx
│   │   ├── CategoryList.tsx       # 新規（CategoryManager 分割）
│   │   ├── CategoryForm.tsx       # 新規
│   │   └── ColorPicker.tsx        # 新規
│   └── UpdateNotification.tsx
├── utils/
│   ├── analytics.ts
│   ├── cashflow.ts
│   ├── currency.ts
│   ├── forecast.ts
│   └── date.ts                    # 月範囲ヘルパーの集約
├── types/
│   ├── index.ts
│   ├── analytics.ts
│   └── ui.ts                      # 新規: Theme / ViewType 等
└── test/
    ├── setup.ts
    └── helpers.tsx                # renderWithProviders など

electron/
├── index.ts
├── preload.ts
├── database.ts
├── updater.ts
└── schemas.ts                     # 新規: main 側 Zod（renderer と共有ロジックを最小化）
```

### 2.2 モジュール境界

| レイヤー | 責務 | 依存方向 |
|---|---|---|
| `theme/` | デザイントークン、motion variants | 単独（どこにも依存しない） |
| `components/ui/` | プリミティブ UI。業務ロジックを持たない | `theme/`, `lib/cn` |
| `components/layout/` | 骨格（サイドバー、コンテナ） | `ui/`, `stores/useUIStore` |
| `components/<feature>/` | 機能ビュー | `ui/`, `hooks/`, `stores/`, `utils/` |
| `hooks/` | 再利用可能な状態・副作用 | `stores/`, `utils/`, `lib/ipc` |
| `stores/` | Zustand スライス | `lib/ipc`, `types/` |
| `lib/ipc.ts` | `window.electronAPI` の型安全ラッパー | `lib/schemas`, `types/` |
| `utils/` | 純粋関数のみ（I/O 無し） | `types/` |

**ルール**:
- `components/ui/*` は業務ドメイン型（`EntryTemplate` 等）を import しない。
- `utils/*` は副作用を持たない（テスト容易化）。
- Feature 間の相互 import は禁止（`entries/` から `dashboard/` を呼ばない）。共有は `ui/` か `hooks/`。

### 2.3 状態管理の統合

`useUIStore` を新設し、以下を集約する。

```ts
interface UIState {
  theme: 'light' | 'dark';
  selectedYearMonth: string;       // YYYY-MM
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSelectedYearMonth: (ym: string) => void;
  shiftMonth: (delta: number) => void;
  toggleSidebar: () => void;
}
```

- `theme` は `localStorage` に永続化（Zustand `persist` ミドルウェア）。初期値は `prefers-color-scheme`。
- `selectedYearMonth` は Dashboard / Entries / Analytics 間で共有。既存の各コンポーネントの `useState` は全廃。
- `sidebarCollapsed` は `localStorage` に永続化。

---

## 3. デザインシステム

### 3.1 トークン設計

`src/theme/tokens.ts` で TS 型付きトークンを定義し、`src/theme/theme.css` の `@theme` ブロックで Tailwind に流し込む。

**色トークン**（意味論ベース）:
```
surface.{base, raised, overlay, inverse}
content.{primary, secondary, muted, disabled, inverse}
accent.{primary, secondary}
semantic.{success, warning, danger, info}
chart.{income, expense, balance, forecast, series-{1..8}}
border.{subtle, strong, focus}
```

各トークンはライト/ダーク 2 値を持ち、CSS 変数として `[data-theme="light"]` / `[data-theme="dark"]` で切り替え。

**その他トークン**:
- **Spacing**: 4px グリッド（`space.0.5` = 2px, `space.1` = 4px, ... `space.16` = 64px）
- **Radius**: `radius.{sm, md, lg, xl, pill, full}`
- **Shadow**: `shadow.{sm, md, lg, glow.{blue, green, red, purple}}`
- **Typography**: `font.display / heading / body / caption / mono` × サイズスケール（12/14/16/18/20/24/32/40）
- **Motion**: `duration.{fast: 120ms, base: 200ms, slow: 320ms}` / `easing.{standard, emphasized, decelerate}`

### 3.2 テーマ切替

- Tailwind v4 の `@custom-variant dark (&:where([data-theme="dark"] *))` で `dark:` モディファイアを有効化。
- 既存のハードコード色（`bg-[#141a2e]` 等）は全て意味論トークンに置換。
- ライトテーマ基調: `surface.base = #F8FAFC` / `content.primary = #0F172A` / accent は既存ダークと同系の青紫だが彩度を下げる。
- ダークテーマは既存の Glass morphism を維持。トークン経由で表現。

### 3.3 Motion variants

`src/theme/motion.ts` に Framer Motion の variants を集約し、全画面で共通化する。

```ts
export const fadeUp = { initial: {...}, animate: {...}, exit: {...} };
export const stagger = { animate: { transition: { staggerChildren: 0.04 } } };
export const cardHover = { whileHover: {...}, whileTap: {...} };
```

### 3.4 共通 UI プリミティブ

`components/ui/` に以下を実装する。アクセシビリティは各プリミティブの責務とする。

| コンポーネント | API 概要 | a11y 要件 |
|---|---|---|
| `Button` | `variant: primary/secondary/ghost/danger` / `size: sm/md/lg` / `loading` / `leftIcon/rightIcon` | `focus-visible:ring` / `aria-busy` / `disabled` |
| `IconButton` | `icon` / `label` 必須 | `aria-label` 必須 |
| `Card` | `as` / `interactive` / `padding` | interactive 時は `role="button"` + キーボード |
| `Input` / `NumberInput` | `label` / `hint` / `error` / `prefix/suffix` | `<label>` 紐付け / `aria-invalid` / `aria-describedby` |
| `Select` | 単一選択、keyboard 操作 | `role="listbox"` / `aria-selected` |
| `Tabs` | controlled/uncontrolled | `role="tablist"` + `aria-controls` |
| `Dialog` | トラップフォーカス、Esc 閉じ | `role="dialog"` / `aria-modal` / ポータル |
| `Badge` | `tone: neutral/success/warning/danger/info` | — |
| `Tooltip` | hover/focus トリガー | `role="tooltip"` / `aria-describedby` |
| `Skeleton` | `variant: text/rect/circle` | `aria-hidden` |
| `EmptyState` | `icon` / `title` / `description` / `action` | — |
| `Toast` | stack、auto-dismiss、pause on hover | `role="status"` / `aria-live="polite"` |
| `ConfirmDialog` | Dialog を composition | Dialog と同等 |

---

## 4. コンポーネント分割

### 4.1 SankeyChart（386 行 → 3 ファイル）

| ファイル | 責務 | 目安行数 |
|---|---|---|
| `SankeyChart/index.tsx` | ビューのオーケストレーター、データ取得 | ~80 |
| `SankeyChart/SankeyCanvas.tsx` | D3 sankey レンダリング、ResizeObserver | ~180 |
| `SankeyChart/SankeyTooltip.tsx` | ホバー時ツールチップ | ~50 |
| `hooks/useCashFlowData.ts` | `buildCashFlowData` の memo 化フック | ~50 |

### 4.2 CategoryManager（345 行 → 3 ファイル）

| ファイル | 責務 |
|---|---|
| `settings/CategoryList.tsx` | 一覧表示・並び替え |
| `settings/CategoryForm.tsx` | 新規/編集フォーム |
| `settings/ColorPicker.tsx` | カラーピッカー UI |

### 4.3 EntriesView（302 行 → 3 ファイル）

| ファイル | 責務 |
|---|---|
| `entries/EntriesView.tsx` | 薄いオーケストレーター（~80 行） |
| `entries/CategoryGroupList.tsx` | カテゴリごとの展開・バーチャルスクロール対応余地 |
| `entries/TemplateActions.tsx` | 「先月コピー」「デフォルトリセット」等のバルクアクション |

### 4.4 既存コンポーネントの調整

- `components/sidebar/*` → `components/layout/` に移設し、Sidebar は collapsible に刷新。
- `components/shared/*` → `components/ui/` に昇格統合（Toast, ConfirmDialog, LoadingSpinner → Skeleton へ置換）。
- `dashboard/MinBalanceCard.tsx` は `KpiHero` に統合される場合は削除、単体で残すなら `Card` プリミティブベースに書き直し。

---

## 5. UI/UX 刷新の具体

### 5.1 Sidebar
- **Collapsible**: デフォルト展開（240px）、`⌘ \` で 72px（アイコンのみ）に切り替え。状態は `useUIStore.sidebarCollapsed` に永続化。
- **アクティブインジケーター**: 左端 3px の accent バー + 背景 `surface.raised`。
- **下部に ThemeToggle + バージョン表示**。

### 5.2 Dashboard
- **KPI ヒーロー**: 4 カード（今月収支 / 最小残高（90 日）/ 次の大型支出 / 予測傾き）。`react-countup` で数値のカウントアップ。
- **レイアウト**:
  ```
  [ KPI Hero (4 cards) ]
  [ ForecastChart (full) ]
  [ SankeyChart ]  [ UpcomingEvents ]
  ```
- `ForecastChart` の期間セレクタを `Tabs` プリミティブに差し替え。

### 5.3 Entries
- **インライン編集**: セル全体がクリックターゲット、フォーカス時に明確なリング、`Enter` で確定、`Esc` でキャンセル、`↑↓` で行移動、`Tab` で列移動。
- **TemplateActions**: 右上に集約（「先月コピー」「デフォルトリセット」「テンプレート追加」）。
- **カテゴリ見出し**: 合計金額バッジを `Badge` プリミティブで表示。

### 5.4 Analytics
- **PeriodSelector** を `Tabs` に差し替え。選択は `localStorage` で永続化。
- **CategoryTrendChart**: 凡例クリックで系列トグル、ホバーで他系列フェード。
- **ComparisonTable**: 列ソート対応、差分に色付け。

### 5.5 History
- 空状態で「最初のスナップショットを記録」CTA。
- `SnapshotForm` を `Dialog` に収容し、リストから `+` ボタンで開く。

### 5.6 Settings
- 2 カラムレイアウト（左: 一覧、右: フォーム）。
- `ColorPicker` は 12 色のプリセット + 任意入力。

### 5.7 グローバル
- **空状態 / ローディング / エラー**: `EmptyState` / `Skeleton` / エラーカードを統一適用。
- **Toast スタック**: 最大 3 件、超過分はキュー。pause on hover。
- **Particle Background**: ライトテーマでは彩度・透明度を下げる。`useUIStore.theme` に追従。

### 5.8 キーボードショートカット（グローバル）
- `g d` / `g e` / `g h` / `g a` / `g s`: 各ビューへ遷移。
- `⌘ \`: サイドバー開閉。
- `⌘ k`: （将来拡張のため予約）コマンドパレット。Phase 2 では未実装、hook だけ用意。
- `Esc`: モーダル閉じ。
- `?`: ショートカット一覧ダイアログ。

---

## 6. アクセシビリティ

- **フォーカス**: `focus-visible:ring-2 ring-border-focus ring-offset-2` を全インタラクティブ要素に適用。
- **ARIA**:
  - ナビゲーション: `<nav aria-label="Primary">`。
  - アクティブリンク: `aria-current="page"`。
  - トースト: `role="status" aria-live="polite"`。
  - エラー: `role="alert"`。
- **キーボード**: タブ順を論理順に揃える。Dialog はフォーカストラップ。
- **コントラスト**: 全テキストで WCAG AA（4.5:1）を満たす。チャート色は凡例テキストと併用で識別可能に。
- **モーション配慮**: `prefers-reduced-motion` を `theme/motion.ts` で参照し、アニメを短縮/無効化。

---

## 7. IPC バリデーション

### 7.1 方針
- `zod` を依存に追加（renderer と main 双方で利用）。
- `electron/schemas.ts` と `src/lib/schemas.ts` にスキーマを定義。共通部は `types/` で TS 型を生成し、両サイドで参照。
- `lib/ipc.ts` は `window.electronAPI` を薄くラップし、呼び出し前に引数 / 呼び出し後に戻り値をパース。パース失敗時は Toast でエラー通知し、Promise を reject。

### 7.2 適用範囲
- 全 IPC メソッド（CRUD 系 + Range 取得系）。
- main 側は `ipcMain.handle` の先頭で `schema.parse(payload)`、失敗は Error を throw（renderer 側に伝播）。

---

## 8. テスト戦略

### 8.1 ツール
- **Vitest**（electron-vite と統合可能）。
- **@testing-library/react** + **@testing-library/user-event**。
- **happy-dom** を DOM として使用（jsdom より軽量）。

### 8.2 カバー範囲
- **Unit（必須）**: `utils/` 全関数、`stores/` の主要アクション、`lib/ipc` の Zod パース境界。
- **Component（主要）**: `KpiHero`, `ForecastChart`, `SankeyChart/index`, `EntryRow`, `CategoryForm`, `ConfirmDialog`。
- **Smoke（ビュー単位）**: 各 View が mock IPC でクラッシュせずレンダリングされること。

### 8.3 カバレッジ目標
- 初期マージ時点で `utils/`: 90%+、`stores/`: 70%+、全体: 50%+。CI で下回ったら警告（Phase 3 で GitHub Actions 検討）。

---

## 9. パフォーマンス

- `SankeyChart` / `TimelineChart` の `useMemo` 依存キーを細粒度化（例: `monthlyAmountsMap` 全体でなく、対象月のスナップショットに絞る）。
- `ParticleBackground` は `useUIStore.theme` とライト時にパーティクル数を 1/2 に。
- 重い計算は `useMemo`、ハンドラは `useCallback`、リスト行は `memo` を徹底。
- Electron 起動時のメインプロセス IPC 初期化順序を点検し、不要な同期 I/O があれば非同期化。

---

## 10. 実装フェーズ

フルコースで順次実装する。各 Phase 完了時に手動確認。

### Phase 1 — 基盤（構造 / トークン / 共通 UI / a11y / IPC）
1. `theme/tokens.ts` + `theme/theme.css` + `theme/motion.ts` を作成し、Tailwind v4 `@theme` を構成。
2. `components/ui/*` プリミティブを実装（業務ドメイン非依存、a11y 要件満たす）。
3. `useUIStore` 新設。既存コンポーネントの `selectedYearMonth` `useState` を全廃し、store 経由に移行。
4. `SankeyChart` / `CategoryManager` / `EntriesView` を分割。
5. `lib/ipc.ts` + `lib/schemas.ts` + `electron/schemas.ts` を実装し、既存 IPC 呼び出しを差し替え。
6. 全インタラクティブ要素に `focus-visible` と `aria-*` を付与。

**Phase 1 完了条件**: 既存機能が全て動作し、ライトテーマ未切替の状態でも UI が破綻しないこと。

### Phase 2 — UI/UX 刷新
1. ライト/ダーク切替（`ThemeToggle`、`data-theme` 属性切替）。
2. Sidebar 再設計（collapsible、アクティブインジケーター刷新、ThemeToggle 配置）。
3. Dashboard に `KpiHero` 追加、`ForecastChart` の期間セレクタを Tabs 化。
4. Entries のインライン編集 UX 改善、キーボードナビ実装。
5. Analytics の PeriodSelector を Tabs 化、凡例トグル、ソート対応。
6. History / Settings のレイアウト刷新、Dialog ベースのフォーム。
7. 空状態 / ローディング / エラーの全画面適用。
8. グローバルショートカット実装（`g` プレフィックス、`?` ヘルプ、`⌘\`）。
9. `prefers-reduced-motion` 対応。

**Phase 2 完了条件**: ライト/ダーク両テーマで全画面が視覚的に整合し、キーボードのみで主要操作が可能。

### Phase 3 — 品質保証
1. Vitest セットアップ（`vitest.config.ts`、`test/setup.ts`、`test/helpers.tsx`）。
2. `utils/` 全関数のユニットテスト。
3. `stores/` 主要アクションのテスト。
4. 主要コンポーネントのスモーク + インタラクションテスト。
5. `lib/ipc.ts` のスキーマ境界テスト。
6. パフォーマンス計測（Chrome DevTools Performance、Sankey / Timeline 再計算回数）。必要に応じ `useMemo` キー調整。

**Phase 3 完了条件**: `npm run test` が緑、カバレッジ目標到達、主要画面で再レンダー回数が許容範囲内。

---

## 11. リスクと対策

| リスク | 対策 |
|---|---|
| トークン全面差し替えによる視覚的後退 | Phase 1 完了時点でスクリーンショット比較を実施。ダークテーマの既存見た目を優先保守。 |
| IPC Zod 導入による既存データ失敗 | スキーマを寛容に（`.passthrough()`）。既存 DB 内容は変更せず、パース失敗はログ + Toast で可視化。 |
| 大規模変更で機能デグレ | Phase ごとに `npm run dev` で手動動作確認。Phase 3 のテストで回帰検知。 |
| Framer Motion の `prefers-reduced-motion` 見落とし | `motion.ts` の variants を全てこのフラグ参照でラップ。 |
| Electron main/renderer でのスキーマ二重管理 | 型は `types/` に集約、Zod スキーマだけ両側に配置し、TS の `z.infer` で型同期を保証。 |

---

## 12. 成功基準

- 3 Phase 全てが完了し、`main` ブランチにマージ可能な状態。
- 肥大化コンポーネント 3 ファイルが全て 200 行以下に分割されている。
- ライト/ダーク両テーマで全ビューがスクリーンショット上破綻しない。
- 主要操作がキーボードのみで完結する。
- `npm run test` で `utils/` カバレッジ 90%+。
- `electronAPI` の全呼び出しが Zod バリデーションを通過する。
- 既存機能（予測、Sankey、テンプレート、スナップショット、分析）の振る舞いが変わっていない。

---

## 13. オープン質問（必要に応じ実装中に解決）

- KPI ヒーローで「次の大型支出」の閾値（例: 今月残高の 10%以上、あるいは絶対額）をどう定義するか → 暫定: 今後 60 日以内で最大額のイベント 1 件。
- グローバルショートカットの `?` ヘルプダイアログは Phase 2 に含めるか Phase 3 で後付けか → Phase 2 の最終ステップに含める。
- ライトテーマでの Particle Background の表現 → 粒子数 1/2、透明度 0.3、色はアクセントの 20% 濃度。
