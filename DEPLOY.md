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

## 5. デプロイ

```sh
INSTANCE_CONN="$PROJECT_ID:$REGION:$SQL_INSTANCE"

gcloud run deploy "$SERVICE" \
  --source . \
  --region="$REGION" \
  --add-cloudsql-instances="$INSTANCE_CONN" \
  --set-env-vars="AUTH_MODE=iap,ALLOWED_EMAILS=$ALLOWED_EMAILS,SHARED_LEDGER_NAME=家計,DATABASE_SSL=false" \
  --set-secrets="DB_PASSWORD=budget-db-password:latest" \
  --no-allow-unauthenticated
```

`DATABASE_URL` は unix socket 形式。Cloud SQL コネクタが TLS を終端するので
`DATABASE_SSL=false` でよい。

```
postgres://app_user:PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
```

## 6. OAuth 同意画面 (ブラウザ操作。ここだけ CLI で完結しない)

Console → APIs & Services → OAuth consent screen。

- User type: **External**
- アプリ名と連絡先を入力し、認証情報は自動生成でよい

IAP は既定で Google 管理の OAuth クライアントを使うため、クライアント ID を自分で
作る必要はない。

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

## 運用メモ

- **アクセスの剥奪は IAP の IAM から行う。** `ALLOWED_EMAILS` は既存ユーザーには
  効かない (Google の subject id で照合しているため、アドレス変更で締め出されないのが
  優先されている)
- 更新は `gcloud run deploy --source .` のみ。Web ではデプロイが更新
- スキーマ変更は手順 4 を再実行する。適用済みのファイルは編集せず、番号付きで追加する
