# API

## 2層構造

| | ①公開API | ②内部API |
|---|---|---|
| 実装場所 | Next.js Route Handler | Hono Worker |
| 呼び出し元 | ブラウザ | Next.js Workerのみ |
| 認証・認可 | ここで行う | **行わない** |
| 入力検証 | Zod | 型はHono RPCで共有 |

**認可判定をHono側に持たせない。** 「管理者か」「クォータが残っているか」はNext.js側で判断し、Honoは渡された`userId`で処理する。二重管理になると判定がずれたときに気付けない。

**ただしクォータの加算はHono側で行う**（D1書き込みを伴うため）。判定はNext.js、記録はHono。

## ①公開API

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | `/api/themes?kind=&sort=` | 不要 | テーマ／含む文字の一覧 |
| GET | `/api/themes/[kind]/[name]` | 不要 | 詳細（お題数など） |
| POST | `/api/sessions/start` | 不要（匿名可） | プレイ開始。15問を返す |
| POST | `/api/themes` | 必須 | 新規作成（初回15問を同期生成） |
| POST | `/api/prompts/regenerate` | 必須 | 枯渇時の同期再生成 |
| GET | `/api/me` | 必須 | ユーザー情報・本日の生成残数 |
| GET | `/api/admin/themes` | 管理者 | 管理用一覧 |
| DELETE | `/api/admin/themes/[id]` | 管理者 | 削除（prompts・KVも連鎖） |
| GET | `/api/admin/users` | 管理者 | ユーザー一覧（閲覧のみ） |

テーマと含む文字は同じエンドポイントで`kind`により分岐する。DB上も同じテーブルのため。

### POST /api/sessions/start

```jsonc
// リクエスト
{ "themeId": "01H...", "offset": 30 }   // offsetは匿名時のみ必須

// レスポンス
{
  "prompts": [
    { "id": "...", "text": "手裏剣が闇を裂いた。",
      "readingKana": "しゅりけんがやみをさいた。",
      "readingRoman": [["shu","syu"], ["ri"], ...] }
  ],
  "nextOffset": 45,
  "remainingInPool": 12,     // 巻物の在庫表示用（総生成数 − nextOffset）
  "quotaConsumed": true,     // 補充が走った場合true
  "quotaRemaining": 47       // ログイン時のみ
}
```

- 15問はシャッフルして返す
- **返却した時点でオフセット消費が確定する**（中断しても巻き戻さない）
- ログイン時のみ、条件を満たせば`ctx.waitUntil()`でバックグラウンド生成をキックする

### POST /api/themes

```jsonc
// リクエスト
{ "kind": "theme", "name": "忍びの心得" }

// レスポンス
{ "theme": { "id": "...", "kind": "theme", "name": "忍びの心得", "promptCount": 17 },
  "created": true }   // falseなら既存テーマの再利用（生成は走っていない）
```

既存と一致した場合は**エラーにせず既存テーマを返す**。クォータも消費しない。

**入力検証（Zod）**

| kind | 許可 |
|---|---|
| `'theme'` | 任意の文字列（1〜30文字） |
| `'constraint'` | **ひらがなのみ**（1〜4文字） |

## ②内部API（Hono）

| Method | Path | 説明 |
|---|---|---|
| GET | `/themes` | 一覧（kind / sort / limit / cursor） |
| GET | `/themes/:id` | 単体取得 |
| POST | `/sessions/start` | 15問取得＋オフセット更新＋補充要否判定 |
| POST | `/themes` | 作成＋初回15問の同期生成 |
| POST | `/prompts/regenerate` | 枯渇時の同期再生成 |
| GET | `/usage/:userId` | 当日の生成回数 |
| POST | `/usage/:userId/increment` | 生成成功時のカウント加算 |
| GET | `/admin/themes` | 管理用一覧 |
| DELETE | `/admin/themes/:id` | 削除 |
| GET | `/admin/users` | ユーザー一覧 |

## クォータ

MVPは**50回/日**（月次上限なし）。日付はJST基準。

| 行為 | 消費 |
|---|---|
| 新規テーマ・含む文字の作成 | する |
| 枯渇時の同期再生成 | する |
| **バックグラウンド補充（発火させたユーザー）** | **する** |
| 既存プールのプレイ（補充が走らない場合） | しない |

- **バックグラウンド補充を発火できるのはログインユーザーのみ。** 匿名ユーザーのプレイでは補充をキックしない（匿名は在庫を消費するだけ）
- **判定してから生成し、成功したら加算する。** 先に加算すると生成失敗時にクォータだけ減る
- **生成に失敗した場合はカウントしない**

## エラーレスポンス

```jsonc
{ "error": { "code": "QUOTA_EXCEEDED", "message": "本日の生成上限に達しました" } }
```

| code | HTTP | 条件 | クライアントの対応 |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod検証に失敗 | 入力欄にエラー表示 |
| `UNAUTHORIZED` | 401 | 未ログインで要認証を叩いた | ログインへ誘導 |
| `FORBIDDEN` | 403 | 管理者以外が`/api/admin/*` | 404相当に見せる |
| `THEME_EXHAUSTED` | 409 | 匿名がプール枯渇に到達 | 別テーマ／ログインを提示 |
| `GENERATION_IN_PROGRESS` | 409 | 在庫不足だが生成ロックあり | 「準備中」を表示し数秒後に再試行 |
| `GENERATION_FAILED` | 422 | リトライ上限でも15問未満 | テーマ名の変更を促す |
| `RATE_LIMITED` | 429 | Rate Limitingが弾いた | 少し待って再試行 |
| `QUOTA_EXCEEDED` | 429 | 日次上限に到達 | 残数とリセット時刻（JST 0時）を案内 |

`RATE_LIMITED`と`QUOTA_EXCEEDED`はどちらも429だが、前者は数秒、後者は日付が変わるまで解消しない。案内文が変わるためcodeで区別する。

**在庫不足時は「生成中」と「本当に尽きた」を区別する。** KVの`theme:<id>:lock`の有無で判定し、ロックがあれば`GENERATION_IN_PROGRESS`を返す（クォータを消費せず、再生成もキックしない）。

## 匿名ユーザーのオフセット

クライアントから送られる`offset`は改ざん可能だが、改ざんされても「まだ遊んでいないお題を先に見る／既に見たお題を再度見る」だけで、他人への影響も金銭的損失もない。サーバー側でゲストIDを持つコストの方が大きいため許容する。**ただし範囲外の値（負数・極端に大きい数）はZodで弾く。**
