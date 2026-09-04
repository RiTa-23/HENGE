---
name: add-endpoint
description: HENGEにAPIエンドポイントを追加・変更するときの手順。公開API（Next.js Route Handler）と内部API（Hono）の2層をセットで実装し、認証・Zod検証・型共有・テストの置き場所を間違えないようにする。エンドポイントの追加、APIの変更、新しい画面のためのデータ取得を実装するときに使う。
---

# APIエンドポイントの追加

HENGEのAPIは2層構造で、**片方だけ実装すると動かない**。また、認証や検証を書く場所を間違えると設計が破綻する。この順序で進める。

## 前提の確認

`docs/04-api.md` を読み、追加するエンドポイントが既存の設計に含まれているか確認する。含まれていない場合は、なぜ必要かを整理してから進める（勝手に増やさない）。

## 手順

### 1. Hono側（内部API）を実装する

`apps/backend` にルートを追加する。

- **認証・認可の判定を書かない。** 引数で受け取った `userId` を信頼する
- D1 / KV / Workers AI へのアクセスはここに閉じる
- ルートの型がHono RPCで共有されるよう、アプリの型をexportする

```ts
const route = app.post('/things', async (c) => {
  const { userId, ...params } = await c.req.json()
  // 処理
  return c.json(result)
})
export type AppType = typeof route
```

### 2. Next.js側（公開API）を実装する

`apps/frontend` にRoute Handlerを追加する。ここが**認証・認可・入力検証のすべてを担う**。

```ts
// 1. セッション検証（要認証エンドポイントの場合）
const session = await auth.api.getSession({ headers: req.headers })
if (!session) return errorResponse('UNAUTHORIZED', 401)

// 2. 管理者チェック（/api/admin/* の場合）
if (!isAdmin(session.user.email)) return errorResponse('FORBIDDEN', 403)

// 3. Zodで入力検証
const parsed = schema.safeParse(await req.json())
if (!parsed.success) return errorResponse('VALIDATION_ERROR', 400)

// 4. クォータ判定（生成を伴う場合。加算はHono側で行う）

// 5. Service Binding経由でHonoを呼ぶ
const client = hc<AppType>('http://backend', {
  fetch: env.BACKEND.fetch.bind(env.BACKEND),
})
const res = await client.things.$post({ json: { userId: session.user.id, ...parsed.data } })
```

### 3. エラーレスポンスを既存の形式に合わせる

```jsonc
{ "error": { "code": "QUOTA_EXCEEDED", "message": "..." } }
```

使えるコードは `docs/04-api.md` のエラーコード表にある。**新しいコードを増やす前に、既存で表現できないか確認する。**

### 4. テストを書く

| 対象 | 使うもの |
|---|---|
| D1/KVを触る処理 | Vitest + `@cloudflare/vitest-pool-workers` |
| 純粋な変換・計算 | `bun test` |

生成を伴うエンドポイントは、**クォータの判定と加算の順序**（判定 → 生成 → 成功したら加算）が守られているかを必ずテストする。先に加算すると、生成失敗時にクォータだけ減る。

### 5. ドキュメントを更新する

`docs/04-api.md` のエンドポイント表に追記する。リクエスト/レスポンスの形が非自明な場合は例も載せる。

## やってはいけないこと

- Hono側にBetter Authや管理者判定を書く（Next.js側と二重管理になる）
- Honoに公開ルートを生やす（外部非公開が設計の前提）
- Next.js側から直接D1を触る
- 手書きの型定義でWorker間の型を二重に持つ（Hono RPCで共有する）
