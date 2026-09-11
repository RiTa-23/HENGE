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
- `user` テーブルは**書き込みはNext.js Workerのみ**（ユーザーの作成・更新はBetter Authが行う。アプリで足した `display_name` の更新も Better Auth の `/api/auth/update-user` を通す）。**読み取りはHono側も可**（`themes.created_by` のFKの親として、また管理者向けユーザー一覧の表示のため、Phase 2からHonoのスキーマに存在する）
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
| `BETTER_AUTH_URL` | Better Auth の baseURL。ローカルは `http://localhost:3000`、本番は**公開ドメイン**。**認証だけでなく、シェアURLとOGPの基準URLもここから引く**（`lib/og.ts` の `siteUrl()`） | 同上（URLそのものは公開情報だが、環境ごとに値が変わるため vars ではなくシークレットとして管理する） |
| `YAHOO_APP_ID` | ルビ振りAPI | 同上（Hono側） |
| `ADMIN_EMAILS` | 管理者判定（カンマ区切り） | 同上（Next.js側） |

ローカル開発では `.dev.vars` を使う。テンプレートは `apps/frontend/.dev.vars.example` / `apps/backend/.dev.vars.example`。**リポジトリにコミットしない。**

### 公開ドメインを変えるときの手順

**`BETTER_AUTH_URL` は認証の baseURL であると同時に、サイトの基準URLでもある**（`lib/og.ts` の `siteUrl()`）。ここから次の3つが決まる。

- Google OAuth のコールバック先
- X投稿で共有されるURL（`docs/09-share.md`）
- OGPの `metadataBase`（`og:image` の絶対URL）

**1つの値で3つが動くので、順序を守らないとログインが壊れる。** これとは別に、`BETTER_AUTH_URL` から引いていない場所（Web Analytics のホスト名と、workers.dev のリダイレクト先）が2つあるので、そこは手で直す。

1. **先に** Google Cloud Console へ新しいリダイレクトURI（`https://<新ドメイン>/api/auth/callback/google`）を追加する。旧URIはまだ消さない
2. `BETTER_AUTH_URL` を新ドメインに更新する（`bunx wrangler secret put BETTER_AUTH_URL`。シークレットは即時反映で、再デプロイは不要）
3. 反映を確認する。**`og:image` のホスト名が新ドメインになっていれば通っている**

```bash
curl -s https://<新ドメイン>/ | grep -o 'og:image" content="[^"]*"'
```

4. 旧ドメインを残すか決める。残すと**同じ内容が2つのホスト名で配信され**、検索エンジンから重複コンテンツとして扱われる。**正規のホストへリダイレクトする**（下の「workers.dev のURL」と同じやり方）。リダイレクトを置かずに止めるだけなら `apps/frontend/wrangler.jsonc` に `"workers_dev": false` を足して再デプロイする（Hono Worker は既にそうしている）
5. 落ち着いたら Google Console から旧リダイレクトURIを消す
6. **Cloudflare Web Analytics の Configured hostname を新ドメインに直す。** Cloudflare は登録したホスト名以外からの計測を受け付けないので、ここを忘れるとアクセス解析だけ黙って止まる（トークンは変えなくてよい）
7. **プライバシーポリシー（`/privacy`）に旧ドメインが出ていないか確認する**
8. **`apps/frontend/next.config.ts` の `CANONICAL_ORIGIN` を新ドメインに直して再デプロイする。** workers.dev からのリダイレクト先はここに書いてある。**2番と違い、シークレットの更新では変わらない**（ビルドに焼かれるので再デプロイが要る）

**2を先にやるとログインが `redirect_uri_mismatch` で壊れる。** 新しいコールバック先が Google に登録されていない状態で認証が始まるため。

### workers.dev のURL

デプロイすると `henge-frontend.<アカウント>.workers.dev` が自動で付く。**ここを開けたままにしない。** 正規のホストへ **308** で寄せる。規則は `apps/frontend/next.config.ts` の `redirects()` にある。

**行き先は `next.config.ts` の定数（`CANONICAL_ORIGIN`）で、`BETTER_AUTH_URL` からは引いていない。** `next.config.ts` が評価されるのはビルド時で、そこにWranglerのシークレットは無いため。**正規のURLを2か所に持つことになるので、ドメインを変えるときは両方直す**（上の手順の8番）。片方だけだと、workers.dev から来た人が**旧ドメインへ飛ばされる**。

- 放っておくと**サイト全体が2つのホストで開ける**。テーマ詳細は検索からの着地ページ（`docs/07-ui.md`）なので、評価が割れるのは実害になる
- workers.dev 側は**ログインが通らない**。Google OAuth のコールバックは正規のホストにしか登録されていない。入口として機能しないURLを公開したままにしない

**Cloudflareの管理画面では設定できない。** Redirect Rules / Page Rules は自分のゾーンにしか置けず、`workers.dev` は自分のゾーンではない。管理画面でできるのは workers.dev のルートを**無効化**することだけで、それは到達不能にする設定であってリダイレクトではない。だからWorker側（Next.js）で返す。

**ホストは完全一致で見る。** `*.workers.dev` をまとめて弾くと、バージョンごとのプレビューURL（`<version>-henge-frontend...`）まで本番へ飛び、**デプロイ前に本番と同じWorkerを確かめる手段が無くなる。**

### ローカルのD1は両Workerで共有する

本番は1つのD1（`henge-db`）を両Workerが見るが、ローカルでは既定で各Workerの `.wrangler/state` に別々のDBが作られる。**そのままだと、Hono側でマイグレーションしても Next.js（Better Auth）からは認証テーブルが見えず、ログインが500で落ちる。**

永続化先をリポジトリ直下の `.wrangler/state` に揃えてある。

| 対象 | 指定 |
|---|---|
| `apps/backend` の `dev` / `db:migrate:local` | `--persist-to ../../.wrangler/state` |
| `apps/frontend` の `next dev` | `initOpenNextCloudflareForDev({ persist: { path: "../../.wrangler/state/v3" } })` |

片方だけ変えると再び別々のDBを見ることになるので、**変更するときは必ず両方を揃える。**
