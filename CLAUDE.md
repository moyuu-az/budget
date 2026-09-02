# CLAUDE.md — このリポジトリでの作業手順

家計の残高予測 Web アプリ。Vite + React 19 + Hono + PostgreSQL、GCP Cloud Run + Cloud SQL + IAP。
アーキテクチャの説明は `README.md` と各ファイル先頭のコメントにある。ここに書くのは**進め方**だけ。

## ブランチ戦略

```
feature/<topic>  ──PR──▶  develop  ──PR──▶  main  ──手動デプロイ──▶  Cloud Run
```

- **`main`** … 本番。ここに入っているものが（デプロイ後に）動いている
- **`develop`** … 次のリリース。複数の feature をまとめる場所
- **`feature/<topic>`** … 作業ブランチ。**必ず `develop` から切る**

`main` から直接 feature を切らない。`develop` に入っていて `main` に無い変更を
取りこぼしたまま作業することになり、リリース PR で他人の変更を巻き戻す差分が出る。

```sh
git fetch origin --prune
git checkout develop && git pull --ff-only
git checkout -b feature/<topic>
```

## 1 つの変更を仕上げるまで

1. **`develop` から feature ブランチを切る**
2. 実装する。テストも一緒に書く（後述の「テストの下限」）
3. `npm test` が全部通ることを確認する。**通らないものを push しない**
4. **feature → develop の PR を作る**。本文は日本語（Conventional Commits の
   prefix とタイトルは英語のまま）
5. **SubAgent にレビューさせる**（次節）。指摘を反映して再度 `npm test`
6. develop へマージ
7. リリースするときだけ **develop → main の PR** を作ってマージ
8. **デプロイは手動**。`DEPLOY.md` の 4 章（migration）→ 5 章（`gcloud run deploy`）

CI は無い。テストを回すのも型検査も手元の責任。

## レビューの回し方

**同じセッションで実装とレビューを兼ねない。** 自分の実装に引きずられて、自分の
コメントを根拠に自分のコードを正しいと判断する事故が実際に起きている
（`shared/asset-fields.ts` の退役キー問題）。

- `Agent` tool で **cold context の SubAgent** を立てる。Opus 5 を使う
- **軸を分けて並列に**。このリポジトリでは「データ層 / クライアント / セキュリティ」が
  効いた。逐次で回すと巡回のたびに対象を読み直すので回数がそのままコストになる
- prompt には**対象ファイルの絶対パス**、実行コマンド、守るべき不変条件、
  報告フォーマットを書く（相手は何も知らない前提）
- **読み取り専用にする**。ファイルを書かせるなら `isolation: "worktree"` を付ける。
  付けないと agent の後始末が本体の未コミット変更を黙って消す
- 1 巡目の prompt に「**この変更が踏みやすくする既存経路の欠陥**も挙げてほしい
  （この PR の BLOCKER にはせず、別 PR 候補として）」を入れる。これが無いと
  同じ指摘が 3 巡目に出てくる

## テストの下限

`npm test` は 2 プロジェクトを回す。**両方通って初めて「通った」**。

| project | 環境 | 対象 |
| --- | --- | --- |
| `web` | happy-dom | `src/`、`shared/` |
| `server` | node + **本物の PostgreSQL**（testcontainers） | `server/`、migration |

- **server テストには Docker が要る**。起動していないと落ちる
- RLS・複合外部キー・CHECK は DB の挙動なので、モックでは何も証明できない。
  `server/` のテストが実際に PostgreSQL 16 を立てるのはそのため
- 型検査は `npm run typecheck`。**server の tsconfig も含まれている**
- 破壊的変更を恐れないかわりにテストを厚くする。ユニット / Storybook /
  vitest を必要に応じて足す

### 追加したら必ず書くテスト

- **API メソッドを足した**→ `server/isolation.test.ts` の `ADVERSARIAL_ARGS` に
  追加する（mapped type なので書かないとコンパイルエラーになる）
- **ledger スコープのテーブルを足した**→ migration で `apply_ledger_isolation()` を
  呼ぶ。`server/db/schema.test.ts` の drift guard が `ledger_id` 列でテーブルを
  自動発見して検査する
- **月単位で集計するコードを足した**→ `occursInMonth` を通したうえで、
  年次または単発の項目がその月に**入らない**ことのテストを書く。既存の
  `src/components/entries/EntriesView.test.tsx` と `src/utils/analytics.test.ts`
  が手本
- **データを動かす migration を書いた**→ 専用のテストを書く。
  `server/db/migrations/004_cash_is_an_asset.test.ts` が手本：1 つ前の版まで
  migration を適用した DB を立てて、本番にある状況を仕込み、対象の migration を
  流して結果を確かめる。**お金を動かす migration をレビューだけで通さない**

## migration

- **適用済みのファイルは絶対に編集しない**。runner がスキップするので、編集は
  新しい DB にしか届かず本番と静かに食い違う。変更＝新しい番号のファイル
- **デプロイの前に流す**（`DEPLOY.md` 4 章）。新リビジョンが先に立ち上がると
  まだ無い列を読んで落ちる
- `MIGRATE_ON_START` は本番では使えない。サーバーは DDL 権限の無いロールで繋ぐ
- migration は所有者ロールで走るが、**RLS は FORCE なので所有者にも効く**。
  データを INSERT する migration は ledger ごとに
  `set_config('app.current_ledger_id', ..., true)` を打つこと（004 が実例）

## 触るときに気をつける不変条件

コードのコメントに理由まで書いてあるので、ここには一覧だけ置く。

- **契約の単一の源は `shared/types.ts` の `AppApi`**。サーバーのハンドラ表も
  ブラウザのクライアントもここから導出される
- **repository の SELECT に `WHERE ledger_id = ...` を書き足さない**。述語は RLS が
  持っている。手で書くと RLS が効いているかどうか誰にも分からなくなる
- **アプリが繋ぐロールを superuser / BYPASSRLS にしない**。分離が黙って無効になる。
  起動時ガードが検出して落とすが、そもそも設定しないこと
- **予測は現金**（`src/hooks/useForecast.ts`）。資産（NISA など）を起点に混ぜない。
  最低残高の警告が黙るのは、このアプリが存在する理由そのものを潰すということ
- **残高は現金カテゴリの保有の合計**（`src/utils/net-worth.ts`）。残高を別に持つと
  同じお金が二重に数えられる。`kind: 'cash'` の分類は削除できない
- **契約を非互換に変えたら `shared/contract-version.ts` の `CONTRACT_VERSION` を
  上げる**。デプロイはタブが開いたままのブラウザの下でサーバーを差し替えるので、
  上げ忘れると旧ビルドが新レスポンスを誤読する（`dayOfMonth` が消えたとき、旧タブは
  予測から全項目を落として平坦で安心できる線を描いた）。追加的な変更では上げない
- **画面と絞り込みの単一の源は URL**（`src/app/routes.ts`）。画面は `useState` では
  なく `useRoute()` から決まり、月・期間などの絞り込みは `useSearchParam` で
  クエリパラメータに入る。コンポーネントに影の複製を置かないこと。置くと
  リロード・戻るボタン・共有リンクが本文と食い違う。逆に、端末に属する好み
  （テーマ、サイドバーの開閉、現金/純資産のレンズ）は URL に入れない —
  リンクを送ると相手の設定まで上書きしてしまう。画面を足したら
  `VIEW_SEGMENT` に区切りを足す（mapped type なので書かないとコンパイルエラー
  になる）。クエリパラメータは**必ず検証してから使う**（`parseYearMonthParam` /
  `parseEnumParam`）。手で書き換えられた `?month=banana` がそのまま月の計算に
  届くと、存在しない月を静かに表示する
- **「その項目が今月発生するか」を答えるのは `shared/recurrence.ts` だけ**。
  `enabled` は「今月の項目」を意味しない（年払い・単発・数ヶ月ごとがあるため）。
  月単位で集計するコードを書いたら必ず `occursInMonth` を通す。通さないと
  年払いの保険料が 12 回数えられる。月末クランプ（31日 → 2月は28日）も
  ここに 1 つだけ置く

## コミットと PR

- Conventional Commits（`feat:` `fix:` `docs:` `refactor:` `test:`）
- **PR 本文は日本語**。タイトルの prefix と型・パス・コマンドは英語のまま
- `.env` や認証情報はコミットしない
- コミット前に `git diff` で目を通す
