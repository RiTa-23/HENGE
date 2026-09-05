# アーキテクチャ

## 全体構成

```
ブラウザ
   |  ① 公開API（HTTP）
   v
Next.js Worker（OpenNext）… 画面のSSR、セッション検証、認可
   |  ② Service Bindings（HTTP方式）
   v
Hono Worker … 外部非公開。D1 / KV / Workers AI へのアクセスを担う
```

**Workerは2つに分かれている。** 責務は次のとおり。

| | Next.js Worker | Hono Worker |
|---|---|---|
| 役割 | 画面表示、認証、認可 | データ操作、AI生成 |
| 外部公開 | される | **されない** |
| 認証 | Better Authでセッション検証 | **しない**（渡された`userId`を信頼する） |
| バインディング | **D1（認証テーブル限定の例外）** | D1 / KV / Workers AI |

## 認証テーブルへのD1アクセス（例外の線引き）

「D1へのアクセスは Hono Worker に閉じる」に対して、**Better Auth のテーブル
（`user` / `session` / `account` / `verification`）の読み書きに限り、Next.js Worker も
D1 バインディングを持つ**。Phase 5（#41）で決めた例外で、背景は次のとおり。

Better Auth は認証を持つ側がDBに直接接続することを前提にしており、次の3案から選んだ。

| 案 | 内容 | 採否の理由 |
|---|---|---|
| **①（採用）** | Next.js WorkerにもD1バインディングを持ち、認証テーブルに限り例外とする | Better Authの公式パターンどおりで実装量最小。セッション検証が毎リクエストでService Bindingsのホップを挟まない。**認証をNext.jsで完結させる（不変条件1）と両立できる唯一の案** |
| ② | Honoに認証用のデータアクセスAPIを生やし、Better Authのカスタムアダプタから呼ぶ | アダプタの全メソッドをService Bindings越しに橋渡しする実装量に加え、Better Authのバージョンアップごとにカスタムアダプタのメンテが必要。判定が2か所に分散する |
| ③ | セッションをD1以外（KV等）に持つ | Better Authの4テーブル構成から外れ、検証・整合性を自前で再構築することになる |

**線引きのルール**:

- `session` / `account` / `verification` へのアクセスは**Next.js Workerのみ**（Better Authの処理するテーブル）
- `user` テーブルは**書き込みはNext.js Workerのみ**（ユーザーの作成・更新はBetter Authが行う）。**読み取りはHono側も可**（`themes.created_by` のFKの親として、また管理者向けユーザー一覧の表示のため、Phase 2からHonoのスキーマに存在する）
- ビジネスデータ（`themes` / `prompts` / `user_theme_progress` / `user_generation_usage`）への直接アクセスは引き続きNext.js側から行わない。**`lib/auth.ts` は認証スキーマのみをdrizzleに渡す**ため、間違ってビジネスデータへ接続しても型で弾けないが、スキーマに含めないことが実質の防御線
- Better Auth のスキーマは `packages/shared/src/db/auth-schema.ts` に置き、両Workerから参照する

## 守るべき不変条件

### 認証は Next.js Worker にのみ置く

Hono側にBetter Authを重複して実装しない。Honoは外部に公開されず、Service Bindings経由でNext.jsからしか呼ばれないため、Next.js側で検証済みの`userId`をそのまま信頼してよい。

「クライアントの自己申告を信じる」アンチパターンとは異なる。呼び出し元はブラウザではなく、信頼できるもう一方のサーバーである。

**Honoに公開ルートを生やさないこと。** これが崩れると上記の前提が壊れる。

認証テーブルへのD1バインディング（Next.js Worker側）はこの原則の**例外ではなく適用**。認証をNext.jsで完結させるために必要な例外で、線引きは上の「認証テーブルへのD1アクセス」を参照。

### Service Bindings は HTTP方式を使う

```ts
// Next.js側
const client = hc<AppType>('http://backend', {
  fetch: env.BACKEND.fetch.bind(env.BACKEND),
})
```

CloudflareにはRPC方式（`WorkerEntrypoint`のメソッドを直接呼ぶ）もあるが、**使わない**。理由は2つ。

1. Hono RPC（`hc`、型安全なクライアント）と組み合わせられるのはHTTP方式のみ
2. Smart Placement（D1/KVの近くでWorkerを実行する最適化）は fetch ハンドラにしか効かず、RPCメソッドには効かない

## 技術スタック

| レイヤー | 選定 |
|---|---|
| フロントエンド | Next.js（`@opennextjs/cloudflare`）、独立Worker |
| バックエンド | Hono、独立Worker |
| Worker間通信 | Service Bindings（HTTP方式）＋ Hono RPC `hc` |
| AI生成 | Workers AI（`glm-4.7-flash` / `llama-3.2-3b-instruct` を切り替え可能に実装）、AI Gateway経由 |
| データ | D1（Drizzle ORM）＋ KV |
| 認証 | Better Auth（Googleプロバイダのみ） |
| 入力検証 | Zod |
| スタイル | Tailwind v4（CSS-first設定） |
| テスト | `bun test`（純粋関数）＋ Vitest + `@cloudflare/vitest-pool-workers`（D1/KV依存） |
| lint/format | oxlint + oxfmt |
| パッケージ管理 | Bun（ワークスペース） |

## ディレクトリ構成

```
apps/
  frontend/   … Next.js Worker。画面とRoute Handler
  backend/    … Hono Worker。D1/KV/Workers AIへのアクセス
packages/
  shared/     … 型定義、ローマ字入力エンジン、正規化関数など両者で使うもの
```

`wrangler.jsonc` は `apps/frontend` と `apps/backend` にそれぞれ1本ずつ置く。

## 環境変数・シークレット

| 名前 | 用途 | 置き場所 |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth。Google Cloud Console で作り、リダイレクトURIに `BETTER_AUTH_URL/api/auth/callback/google` を登録する | Wranglerのシークレット（Next.js側） |
| `BETTER_AUTH_SECRET` | セッション署名。`openssl rand -base64 32` 等で作る | 同上 |
| `BETTER_AUTH_URL` | Better Auth の baseURL。ローカルは `http://localhost:3000`、本番はデプロイURL | 同上（URLそのものは公開情報だが、環境ごとに値が変わるため vars ではなくシークレットとして管理する） |
| `YAHOO_APP_ID` | ルビ振りAPI | 同上（Hono側） |
| `ADMIN_EMAILS` | 管理者判定（カンマ区切り） | 同上（Next.js側） |

ローカル開発では `.dev.vars` を使う。テンプレートは `apps/frontend/.dev.vars.example` / `apps/backend/.dev.vars.example`。**リポジトリにコミットしない。**
