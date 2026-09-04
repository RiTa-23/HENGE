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
| バインディング | なし（Hono経由） | D1 / KV / Workers AI |

## 守るべき不変条件

### 認証は Next.js Worker にのみ置く

Hono側にBetter Authを重複して実装しない。Honoは外部に公開されず、Service Bindings経由でNext.jsからしか呼ばれないため、Next.js側で検証済みの`userId`をそのまま信頼してよい。

「クライアントの自己申告を信じる」アンチパターンとは異なる。呼び出し元はブラウザではなく、信頼できるもう一方のサーバーである。

**Honoに公開ルートを生やさないこと。** これが崩れると上記の前提が壊れる。

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | Wranglerのシークレット |
| `BETTER_AUTH_SECRET` | セッション署名 | 同上 |
| `YAHOO_APP_ID` | ルビ振りAPI | 同上（Hono側） |
| `ADMIN_EMAILS` | 管理者判定（カンマ区切り） | 同上（Next.js側） |

ローカル開発では `.dev.vars` を使う。**リポジトリにコミットしない。**
