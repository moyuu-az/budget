# デプロイ手順 (GCP Cloud Run + Cloud SQL + IAP)

夫婦 2 人専用の家計簿を、Google 認証付きで公開インターネットに置くための手順。

このファイルには**実在のプロジェクト ID・アカウント・パスワードを書かない**。すべて
シェル変数として与える。

## 前提

| 項目 | 値 |
|---|---|
| リージョン | `asia-northeast1` (東京) |
| DB | Cloud SQL for PostgreSQL 16 (最小構成、常時起動) |
| 認証 | Identity-Aware Proxy (LB 不要の Cloud Run 直接統合) |
| 概算費用 | 月 $10 前後。ほぼ Cloud SQL の常時起動分 |

**PostgreSQL 15 以上が必須。** マイグレーション 001 の
`ON DELETE SET NULL (category_id)` という列指定が 15 で入った構文で、14 以下では
カテゴリ削除時に `ledger_id` まで NULL にしようとして NOT NULL 違反になる。

```sh
export PROJECT_ID="..."          # 新規プロジェクト ID
export REGION="asia-northeast1"
export SQL_INSTANCE="budget-pg"
export DB_NAME="budget"
export SERVICE="budget"
export APP_ROLE="app_user"
```

## 1. プロジェクトと API

```sh
gcloud projects create "$PROJECT_ID"
gcloud config set project "$PROJECT_ID"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iap.googleapis.com
```

## 2. Cloud SQL

```sh
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --storage-size=10GB --storage-type=SSD \
  --no-backup  # 下で PITR 付きに変更する。初期作成を速くするためだけの指定

gcloud sql instances patch "$SQL_INSTANCE" \
  --backup-start-time=19:00 \
  --enable-point-in-time-recovery

gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
```

## 3. ロール

**ここが本番でいちばん壊しやすい箇所。**

サーバーは **superuser でも BYPASSRLS 保持でもないロール**で接続しなければならない。
PostgreSQL は両者を row-level security から無条件で除外し、`FORCE ROW LEVEL SECURITY`
でも変わらない。リポジトリの SELECT は述語を RLS に委ねているので、間違えると
**エラーなしで他人の帳簿の行が返る**（開発中に実際に踏んだ)。

サーバー起動時に `assertIsolationEnforceable()` が検査して拒否するが、それは
最後の砦であって設計ではない。

```sh
# 所有者 (マイグレーション用)。Cloud SQL の postgres ユーザー
gcloud sql users set-password postgres --instance="$SQL_INSTANCE" --password="$OWNER_PASSWORD"

# アプリ用の最小権限ロールは SQL で作る (gcloud sql users は属性を指定できない)
gcloud sql connect "$SQL_INSTANCE" --user=postgres --database="$DB_NAME"
```

```sql
CREATE ROLE app_user LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```

パスワードは Secret Manager へ。

```sh
printf '%s' "$APP_PASSWORD" | gcloud secrets create budget-db-password --data-file=-
```

## 4. マイグレーション

サーバーは DDL を打てないロールで動くので、マイグレーションは**所有者として別途**
実行する。`MIGRATE_ON_START` は本番では `false` のまま。

Cloud SQL Auth Proxy を手元で立てて流す。

```sh
cloud-sql-proxy "$PROJECT_ID:$REGION:$SQL_INSTANCE" --port 5433 &

DATABASE_URL="postgres://postgres:$OWNER_PASSWORD@localhost:5433/$DB_NAME" \
DATABASE_APP_ROLE="$APP_ROLE" \
npm run db:migrate
```

`db:migrate` はマイグレーション適用後、`$APP_ROLE` に行レベルの権限だけを付与する
(スキーマ変更権限は与えない)。同時起動しても pg_advisory_lock で直列化される。

> **初期セットアップ時だけの手順ではない。**
> `server/db/migrations/` にファイルが増えたリリースでは、**デプロイの前に毎回**この手順を
> 実行する。新しいリビジョンが先に立ち上がると、まだ存在しない列やテーブルを読みに行って
> 失敗する。適用済みのファイルは runner がスキップするので、毎回流して問題ない。
>
> `ALTER DEFAULT PRIVILEGES` が効いているため、既に一度 grant 済みの環境なら
> `DATABASE_APP_ROLE` を省いても新テーブルの権限は付く。ただし前回 grant を実行した
> ロールと今回 migration を流すロールが同じ場合に限るので、迷ったら毎回付けてよい。

### 004 はデータを動かす

`004_cash_is_an_asset.sql` は列を足すだけでなく、**各帳簿の残高を資産に移す**。

- 帳簿ごとに `kind = 'cash'` の資産分類を 1 つ用意する（`現金` という名前の分類が
  既にあればそれを昇格させる。新たに作らない）
- その分類に**保有が 1 件も無い**帳簿では、`settings.current_balance` を
  `口座残高` という保有として作る
- **保有が既にある**帳簿では取り込まない。その保有こそが現金であり、
  古い残高を足すと二重計上をそのまま新しい形で残すことになる
- 古い値は消さずに `legacy_current_balance` へ改名して残す。移行後に残高が
  合わないときの比較対象になる

適用後は `settings` を読むコードが存在しない。残高は
`kind = 'cash'` の分類の保有合計であり、それが唯一の場所。

移行結果を確認するときは、**帳簿ごとに `app.current_ledger_id` を設定する**こと。
`asset_categories` も `assets` も FORCE ROW LEVEL SECURITY なので、**所有者ロールで
繋いでも RLS は効く**。設定せずに全帳簿を横断するクエリを書くと、ポリシーが
`ledger_id = NULL` を評価して**必ず 0 件**が返り、「データが無い」と誤読する。

```sh
psql "$DATABASE_URL" -P pager=off -c "
DO \$\$
DECLARE led RECORD; cash_name TEXT; total NUMERIC;
BEGIN
  FOR led IN SELECT id, name FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);
    SELECT c.name, coalesce(sum(a.value), 0)
      INTO cash_name, total
      FROM asset_categories c
      LEFT JOIN assets a ON a.category_id = c.id
     WHERE c.kind = 'cash'
     GROUP BY c.name;
    RAISE NOTICE '% (id %) -> % = %', led.name, led.id, cash_name, total;
  END LOOP;
END
\$\$"
```

各帳簿に現金分類が 1 つずつあり、その合計が移行前の残高（または移行前から
記録されていた現金の合計）になっていれば成功。

> **`<NULL>` が出る帳簿があっても失敗ではない。** migration の後に作られた帳簿は、
> 誰かが最初にアクセスするまで現金分類を持たない（サーバーが読み取り時に用意する。
> `server/repositories/asset-category.repository.ts`）。migration 実行時点で
> 存在していた帳簿だけが対象。
>
> **金額が想定と違う帳簿があるときは `legacy_current_balance` と突き合わせる。**
> 現金分類に保有が既にあった帳簿では旧残高を取り込んでいない（二重計上だったため）。
> また `現金` という名前の分類が 2 つあった帳簿では、**保有を持つ方**が昇格され、
> もう一方は普通の分類として残る。

### 005 は全項目の「いつ発生するか」を書き換える

`005_entry_recurrence.sql` は金額を動かさないが、**既存の全ての収支項目の
タイミングの意味を書き換える**。1 日でもズレれば予測が静かに嘘になるので、
004 と同じ扱いで確認すること。

- `entry_templates.day_of_month`（毎月 D 日固定）を 4 つの形に置き換える:
  `monthly` / `yearly` / `interval` / `once`
- **既存の全行は `monthly` にバックフィルされる**。日付は既に持っていたものが
  そのまま残る = 意味は変わらない
- `day_of_month` の NOT NULL は外れる（`once` は `on_date` が日付を持つため）。
  代わりに `entry_templates_recurrence_shape_chk` が形ごとに必要な列と
  禁止する列を両方強制する

適用後の確認（**帳簿ごとに `app.current_ledger_id` を設定すること**。理由は
004 と同じ、FORCE RLS は所有者にも効く）:

```sh
psql "$DATABASE_URL" -P pager=off -c "
DO \$\$
DECLARE led RECORD; total INTEGER; stray INTEGER;
BEGIN
  FOR led IN SELECT id, name FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);
    SELECT count(*) INTO total FROM entry_templates;
    SELECT count(*) INTO stray FROM entry_templates
     WHERE recurrence_kind <> 'monthly' OR day_of_month IS NULL;
    RAISE NOTICE '% (id %) -> % 件、うち monthly でない/日付なし: %',
      led.name, led.id, total, stray;
  END LOOP;
END
\$\$"
```

**移行直後は `stray` が全帳簿で 0 でなければならない。** 0 でなければ
バックフィルが届いていない行があり、その項目は発生しなくなっている。
（次回以降の確認では、ユーザーが年次や単発を登録していれば 0 でなくなる。
これは正常。）

### 005 適用後はリビジョンのロールバックが安全でなくなる

**これは 005 に限った話ではなく、契約（`shared/types.ts` の `AppApi`）が
非互換に変わったときは常にそうなる。** 005 が最初の実例なのでここに書く。

`entry_templates` に `monthly` 以外の行が 1 つでも作られると、旧リビジョンへ
戻すことは**データの誤読**を意味する:

- 旧コードは `day_of_month` しか読まない。`yearly` / `interval` の行は
  **毎月の項目として集計される**（年払いの保険料が 12 回計上される）
- `once` の行は `day_of_month` が NULL なので**予測から消える**

migration 005 自体はロールバックしても壊れない（列が増えているだけ）。危険なのは
**新しい形のデータが作られた後**。戻す前に必ず確認する:

```sh
psql "$DATABASE_URL" -P pager=off -c "
DO \$\$
DECLARE led RECORD; n INTEGER;
BEGIN
  FOR led IN SELECT id, name FROM ledgers ORDER BY id LOOP
    PERFORM set_config('app.current_ledger_id', led.id::TEXT, true);
    SELECT count(*) INTO n FROM entry_templates WHERE recurrence_kind <> 'monthly';
    IF n > 0 THEN RAISE WARNING '% (id %): monthly 以外が % 件。ロールバック不可', led.name, led.id, n; END IF;
  END LOOP;
END
\$\$"
```

**1 件でも出たらリビジョンを戻さない。** 前に進んで直す。

### 開いたままのタブは自動的にブロックされる

デプロイはタブが開いたままのブラウザの下でサーバーを差し替える。005 より前の
変更は全て追加的だったので旧タブは知らないフィールドを無視するだけで済んだが、
`dayOfMonth` → `recurrence` はそれを終わらせた。**旧ビルドが新レスポンスを読むと
`dayOfMonth` が無いので予測から全項目が消え、平坦で安心できる残高線を描く。**

そのため全リクエストが `X-Contract-Version` を送り、サーバーが一致しないものを
**426 Upgrade Required** で拒否する（`shared/contract-version.ts`）。旧タブには
「アプリが更新されました。再読み込みしてください」が全画面で出る。

- **契約を非互換に変えたら `CONTRACT_VERSION` を上げる**。上げ忘れると旧タブが
  黙って誤ったデータを読む
- **追加的な変更では上げない**。上げるとデプロイのたびに全員が再読み込みになる
- デプロイ後に 426 がログに出るのは正常（開いていた旧タブの分）

## 5. デプロイ

```sh
INSTANCE_CONN="$PROJECT_ID:$REGION:$SQL_INSTANCE"

gcloud run deploy "$SERVICE" \
  --source . \
  --region="$REGION" \
  --add-cloudsql-instances="$INSTANCE_CONN" \
  --set-env-vars="AUTH_MODE=iap,ALLOWED_EMAILS=$ALLOWED_EMAILS,SHARED_LEDGER_NAME=家計,DATABASE_SSL=false" \
  --set-secrets="DB_PASSWORD=budget-db-password:latest" \
  --memory=1Gi \
  --no-allow-unauthenticated
```

`--memory` は明示する。デフォルトの 512 MiB は、リクエストボディの検証で JSON が
一時的に数十倍へ膨らむ処理と合わせると余裕がない (入口側の上限は
`server/http/app.ts` の `MAX_BODY_BYTES` で 64 KB に絞ってある)。

`DATABASE_URL` は unix socket 形式。Cloud SQL コネクタが TLS を終端するので
`DATABASE_SSL=false` でよい。

```
postgres://app_user:PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
```

## 6. OAuth 同意画面とカスタムクライアント (ブラウザ操作。ここだけ CLI で完結しない)

**組織 (Organization) の外にあるプロジェクトでは、カスタム OAuth クライアントが必須。**
IAP 既定の Google 管理クライアントは組織内の identity しか扱えないので、組織外の
アカウント (配偶者の個人 Gmail など) を許可するにはこの手順が要る。

なお IAP の OAuth Admin API (`gcloud iap oauth-brands`) は組織配下でないと使えず、
2026-03 に廃止済み。コンソール以外の道はない。

### 6-1. ブランディング

Console → **APIs & Services → OAuth 同意画面 (ブランディング)**

- 対象ユーザー: **External**
- 必須はアプリ名 / ユーザーサポートメール / デベロッパー連絡先の 3 つだけ
- **ホームページ URL・プライバシーポリシー URL・承認済みドメインは空欄でよい**
  (リダイレクト先は Google 側の `iap.googleapis.com` で、自分のドメインを使わないため)

### 6-2. 公開ステータスは「テスト中」のまま

**本番公開しないこと。** 公開すると、実在するホームページ URL とプライバシーポリシー
URL が必須になり、`*.run.app` は Google 所有ドメインなので Search Console で所有権を
証明できない。ロゴを設定していると審査も必要になる。

テスト中に残る唯一の制約は「リフレッシュトークンが 7 日で失効」だが、
**これは要求スコープが name / email / profile を超える場合のみ**適用される。IAP が
使うのは `openid` と `email` だけなので該当しない (実際にサインイン用リダイレクトの
`scope=openid+email` で確認できる)。

代わりに**テストユーザーへ利用者全員を追加する**。ここが空だと誰もサインインできない。

### 6-3. OAuth クライアント

Console → **APIs & Services → 認証情報 → クライアントを作成**

- 種類: **ウェブ アプリケーション**
- 作成後にクライアント ID をコピーし、**同じクライアントを開き直して**
  「承認済みのリダイレクト URI」に以下を追加する

```
https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect
```

これを登録しないと、サインイン時に `redirect_uri_mismatch` で止まる。

JSON をダウンロードし、**リポジトリ管理外の `.secrets/oauth-client.json`** に置く
(`.secrets/` は `.gitignore` 済み)。

### 6-4. IAP へ適用

```sh
python3 -c "
import json
d = json.load(open('.secrets/oauth-client.json'))['web']
print('accessSettings:\n  oauthSettings:\n    clientId: %s\n    clientSecret: %s' % (d['client_id'], d['client_secret']))
" > /tmp/iap-oauth.yaml

gcloud iap settings set /tmp/iap-oauth.yaml \
  --project="$PROJECT_ID" --resource-type=cloud-run \
  --region="$REGION" --service="$SERVICE"

rm /tmp/iap-oauth.yaml
```

適用できたかは、未認証で開いて 302 が返り、`accounts.google.com` へ飛ぶことで確認
できる。502 のままならクライアントが適用されていない。

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$SERVICE_URL/"
```

## 7. IAP 有効化

```sh
gcloud beta run services update "$SERVICE" --region="$REGION" --iap
```

**IAP サービスエージェントに Cloud Run Invoker を付ける。** GA 化に伴い Cloud Run が
IAP からの呼び出しにも `run.routes.invoke` を検査するようになったため、これを忘れると
**全リクエストが 403 になる**。

```sh
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

許可する人だけに IAP のアクセス権を付ける。**これが一次の許可リスト**で、
`ALLOWED_EMAILS` は二次 (未登録アカウントのプロビジョニングを止めるだけ)。
**アクセスの剥奪はこちらで行う。**

```sh
for EMAIL in $ALLOWED_LIST; do
  gcloud beta iap web add-iam-policy-binding \
    --resource-type=cloud-run --service="$SERVICE" --region="$REGION" \
    --member="user:$EMAIL" --role="roles/iap.httpsResourceAccessor"
done
```

## 8. IAP_AUDIENCE の設定

アサーションの `aud` を検証しないと、別の IAP 保護サービス向けに発行された
アサーションを再利用できてしまう。IAP 設定画面に表示される値をそのまま渡す。

```sh
gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars="IAP_AUDIENCE=$IAP_AUDIENCE"
```

## 9. 既存データの取り込み

デスクトップ版のローカル SQLite を共有帳簿へ。一度だけ実行する
(二重実行はガードで止まる)。

```sh
DATABASE_URL="postgres://postgres:$OWNER_PASSWORD@localhost:5433/$DB_NAME" \
npm run db:import -- \
  --sqlite "$HOME/Library/Application Support/balance-forecast/balance-forecast.db" \
  --ledger shared --name 家計 --kind shared
```

## 10. 検証

起動時ガードは属性を見るだけなので、**実際に分離が効いていることを本番で一度確認する**。

```sh
# 1. サインインできること、帳簿が 2 つ (共有 + 個人) 見えること
# 2. 共有帳簿に移行済みデータが出ること
# 3. 個人帳簿が空であること
# 4. 相手の個人帳簿 ID を X-Ledger-Id に入れると 403 になること
```

`gcloud sql connect` から `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';`
が両方 `f` であることも確認する。

## 11. 予算アラート

課金アカウントの通貨は **JPY** なので、金額は円で指定する (`3000JPY`)。ドルで
書くと通貨不一致で弾かれる。

```bash
gcloud services enable billingbudgets.googleapis.com --project="$PROJECT_ID"

gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="budget-app-monthly" \
  --budget-amount=3000JPY \
  --filter-projects="projects/$PROJECT_NUMBER" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.0,basis=forecasted-spend
```

`--filter-projects` はプロジェクト **番号** を取る (ID ではない)。省略すると課金
アカウント全体が対象になる。

`FORECASTED_SPEND` の 1 行が実質的な早期警報で、月末の着地見込みが予算を超えた
時点で鳴る。`CURRENT_SPEND` だけだと、実際に使い切ってからしか気づけない。

通知先を指定していないため、既定で **課金アカウントの管理者と閲覧者にメールが飛ぶ**
(現在は `moyuu.kz@gmail.com` のみ)。Slack 等に流したい場合だけ Monitoring の
通知チャンネルを作って `--notifications-rule-monitoring-notification-channels`
を足す。

`creditTypesTreatment` は既定の `INCLUDE_ALL_CREDITS` になる。クレジットを
差し引いた **実際に請求される額** で判定されるため、無料トライアルのクレジットが
残っている間は鳴らない。これは意図した挙動。

## ローカルに置く認証情報

| ファイル | 内容 | 管理 |
|---|---|---|
| `.secrets/oauth-client.json` | IAP 用カスタム OAuth クライアント | `.gitignore` 済み。再取得はコンソールから |
| `.env` | ローカル開発用の接続情報 | `.gitignore` 済み |

本番の DB 接続文字列と所有者パスワードは Secret Manager
(`budget-database-url` / `budget-owner-password`) にあり、手元には置かない。

## 運用メモ

- **アクセスの剥奪は IAP の IAM から行う。** `ALLOWED_EMAILS` は既存ユーザーには
  効かない (Google の subject id で照合しているため、アドレス変更で締め出されないのが
  優先されている)
- 更新は `gcloud run deploy --source .` のみ。Web ではデプロイが更新
- スキーマ変更は手順 4 を再実行する。適用済みのファイルは編集せず、番号付きで追加する
