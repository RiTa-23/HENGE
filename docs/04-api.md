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
| GET | `/api/me` | 必須 | ユーザー情報・本日の残ニューロン |
| GET | `/api/admin/themes` | 管理者 | 管理用一覧 |
| DELETE | `/api/admin/themes/[id]` | 管理者 | 削除（prompts・KVも連鎖） |
| GET | `/api/admin/themes/[id]/prompts` | 管理者 | テーマ1つ分のお題一覧（管理用） |
| PATCH | `/api/admin/prompts/[id]` | 管理者 | お題本文の編集（読み・打鍵数はサーバーで取り直す） |
| DELETE | `/api/admin/prompts/[id]` | 管理者 | お題の削除（連番は詰め直さない） |
| GET | `/api/admin/users` | 管理者 | ユーザー一覧（閲覧のみ） |

テーマと含む文字は同じエンドポイントで`kind`により分岐する。DB上も同じテーブルのため。

**マイページ（`/me`）は Route Handler を持たない。** SSRで Service Bindings を直接使う（`lib/api/me.ts`。`/themes` と同じ）。残ニューロンは `GET /api/me` と同じ材料（Hono の `GET /usage/:userId`）から作り、作ったお題は `GET /users/themes` に**セッションのIDだけ**を渡す。Hono 側は渡されたIDで引くだけで本人かどうかを見ないので、他人のIDを渡す口を Next.js に作らない。

**ユーザー名（表示名）の更新は Route Handler を持たない。** Better Auth の `POST /api/auth/update-user`（`authClient.updateUser({ displayName })`）で行う。このルートは Better Auth が `/api/auth/*` に生やしていて外から叩けるので、**入力検証はそこにかける**（`lib/auth.ts` の `additionalFields.displayName.validator.input` に `displayNameSchema` を渡している）。別に `PATCH /api/me` を作って検証しても、Better Auth のルートが検証なしで残るだけ。

### POST /api/sessions/start

```jsonc
// リクエスト
{ "themeId": "01H...", "form": "word", "offset": 30 }   // offsetは匿名時のみ必須
// form は "sentence"（既定）/ "word"。省略すると短文になる

// レスポンス
{
  "prompts": [
    { "id": "...", "text": "手裏剣が闇を裂いた。",
      "readingKana": "しゅりけんがやみをさいた。",
      "readingRoman": [["shu","syu"], ["ri"], ...] }
  ],
  "nextOffset": 45,
  "remainingInPool": 12,     // 残り在庫（総生成数 − nextOffset）
  "refillKicked": true,      // 補充をキックした場合true（消費量ではない。補充は非同期）
  "neuronsRemaining": 428    // 本日の残ニューロン。ログイン時のみ
}
```

- **1プレイの問題数は形式で変わる**（短文15／単語20）。プールもオフセットも形式ごとに別（`docs/03-data-model.md`）
- 問題はシャッフルして返す
- **返却した時点でオフセット消費が確定する**（中断しても巻き戻さない）
- ログイン時のみ、条件を満たせば`ctx.waitUntil()`でバックグラウンド生成をキックする

**`form` は Zod で `sentence` / `word` だけを許し、省略時は `sentence` に倒す。** 形式を持たない古いURL・古いクライアントがそのまま短文で動く。知らない値を通すと、存在しないプールをHonoに引かせることになる。

### POST /api/themes

```jsonc
// リクエスト
{ "kind": "theme", "name": "忍びの心得" }

// レスポンス
{ "theme": { "id": "...", "kind": "theme", "name": "忍びの心得",
             "promptCounts": { "sentence": 17, "word": 0 } },
  "created": true }   // falseなら既存テーマの再利用（生成は走っていない）
```

**新規作成で作るのは短文だけ。** 単語を同じリクエストで作れない（不変条件4）。1回の実行で読み仮名の取得に使える外部サブリクエストは50回で、2形式ぶんだと最大80回になり静かに失敗する。`waitUntil` も同じ実行の枠を食うので回避にならない。**単語プールは `POST /api/prompts/regenerate` で別リクエストとして作る。**

### POST /api/prompts/regenerate

```jsonc
// リクエスト
{ "themeId": "01H...", "form": "word" }

// レスポンス
{ "theme": { ..., "promptCounts": { "sentence": 30, "word": 22 } },
  "added": 22, "neuronsUsed": 13.0, "neuronsRemaining": 487 }
```

**単語だけ、目標に届かなくても取れた分を保存する。** 短文は目標（1プレイ分）未達なら `GENERATION_FAILED` を返して1件も保存しないが、単語は1回で作れるのが最大40件（20件×2ラウンド）しかなく、届かないことが起こりうる。同じ扱いにすると**有効な20語と消費したニューロンを捨てて、何度も押させる**ことになる。追加先は既存テーマのプールなので、途中まで積むこと自体に害はない（「お題ゼロのテーマを作らない」新規作成とは事情が違う）。**1件も作れなかったときだけ失敗として返す。**

利用者から見た流れは「押す → 足りなければもう一度押す」になる。足りたかどうかは `sessions/start` の応答（配れたか `THEME_EXHAUSTED` か）で決まり、**オフセットを持つ側（サーバー／localStorage）でしか判断できない**ので、この応答では判定しない。

既存と一致した場合は**エラーにせず既存テーマを返す**。クォータも消費しない。

表示名の正規化は Hono 側で行う。呼び出し側で正規化すると、規則が2か所に分かれて必ずずれる。

**ベータモード（`BETA_MODE`）が有効な間、運営アカウント以外は `FORBIDDEN`（403）を返す。** ベータ版利用者は既存プールのプレイと補充生成だけができ、新しいお題の生成は「調整中」のため（`docs/07-ui.md`）。判定は認可なので**レート制限やクォータの照会より前に置く**。文言は「お題の生成は調整中です。既にあるお題は引き続き遊べます」を返す。運営アカウント（`ADMIN_EMAILS`）は制限しない。

### GET /api/me

```jsonc
// レスポンス
{
  "user": { "id": "...", "name": "Rita", "email": "...", "image": null },
  "neuronsRemaining": 428.4,                  // 500 − 当日の消費ニューロン
  "quotaResetAt": "2026-09-06T09:00:00+09:00" // 次の 00:00 UTC を日本時間で表記（＝朝9時）
}
```

### /api/admin/*

管理者判定は `ADMIN_EMAILS`（カンマ区切り）で行う。**判定はNext.js側だけ**で、Honoの `/admin/*` は認可を持たない。

```jsonc
// GET /api/admin/themes?limit=&cursor=
// kind で絞らず、テーマと含む文字の両方を作成順（新しい順）に返す。
// 公開一覧と違い、お題数と作成者を含む（削除の判断材料になるため）
{ "themes": [{ "id": "...", "kind": "theme", "name": "忍びの心得", "promptCount": 17,
               "createdBy": "...", "totalPlayCount": 3, "generationStatus": "ok", "createdAt": 1757000000 }],
  "nextCursor": 20 }

// DELETE /api/admin/themes/[id]
{ "deleted": true, "themeId": "..." }

// GET /api/admin/themes/[id]/prompts?limit=&cursor=
// テーマ内のお題を生成順（連番順）で返す。編集の判断材料として
// 読み仮名・打鍵数・生成モデルを含む（プレイ用のレスポンスとは持つ情報が違う）
{ "prompts": [{ "id": "...", "form": "sentence", "text": "手裏剣が闇を裂いた。",
                "readingKana": "しゅりけんがやみをさいた。", "keystrokeCount": 25,
                "sequenceNumber": 1, "model": "@cf/...", "createdAt": 1757000000 }],
  "nextCursor": 50 }

// PATCH /api/admin/prompts/[id]
// リクエストは本文のみ。読み仮名の取得（`getReading()`）をやり直し、
// 生成時と同じ検査（文字種・漢字・打鍵数10〜35・「含む」文字）を通してから
// 読み・ローマ字・打鍵数を一緒に更新する。本文だけ差し替えると
// 「画面の文と打つべきローマ字が食い違う」お題になるため
{ "id": "...", "text": "手裏剣が闇を裂いた。",
  "readingKana": "しゅりけんがやみをさいた。", "keystrokeCount": 25 }

// DELETE /api/admin/prompts/[id]
{ "deleted": true, "promptId": "..." }

// GET /api/admin/users?limit=&cursor=
// 閲覧のみ。更新・削除の口は持たない
// createdAt は認証テーブル（Better Auth）の列でミリ秒精度のため、themes と違い ISO 文字列で返る
{ "users": [{ "id": "...", "name": "Rita", "email": "...", "image": null,
              "createdAt": "2026-09-05T12:00:00.000Z",
              "todayNeurons": 19.5,          // 当日の消費。**上限に張り付いているかはこれで見る**
              "todayGenerationCount": 3 }],  // 当日AIを呼んだ回数（1回あたりの重さを読む分母）
  "nextCursor": null }
```

**削除では `prompts` / `user_theme_progress` がFKのCASCADEで消えるが、KVは消えない。** Hono側で `theme:<kind>:<normalized_name>` と `theme:<id>:lock` を明示的に削除する。消し忘れると、削除したテーマがキャッシュ経由で復活したように見える。

**お題を1件消すと連番に穴が空くが、詰め直さない。** 配信・管理一覧は連番を並び順として使うだけで位置を行数で数える（`OFFSET`）。詰め直すとテーマ内の全行を書き換えることになり、並行して走った補充の採番と衝突しうる。穴の影響は「以降のお題が1つずつ手前にずれる」だけで済む。一方、次の採番は `MAX(sequence_number) + 1`。件数（`COUNT`）で採番すると、穴が空いたテーマで既存の番号と衝突する。

未ログインは `UNAUTHORIZED`、ログイン済みの非管理者は `FORBIDDEN` を返す。`FORBIDDEN` の文言は `NOT_FOUND` と同じ「見つかりません」で、権限が無いのか存在しないのかを区別させない。

**テーマ詳細（`/api/themes/[kind]/[name]`）は2回に分けて引く。** 名前で1件を特定してから、IDで詳細を取る。一覧にお題数を含めるとテーマごとの集計が要って重くなるため、一覧と詳細で持つ情報を変えている。

**入力検証（Zod）**

| kind | 許可 |
|---|---|
| `'theme'` | 任意の文字列（1〜30文字） |
| `'constraint'` | **ひらがなのみ**（1〜4文字） |

## ②内部API（Hono）

| Method | Path | 説明 |
|---|---|---|
| GET | `/themes` | 一覧（kind / sort / limit / cursor）。`name` を渡すと表示名で1件引く |
| GET | `/themes/:id` | 単体取得 |
| POST | `/sessions/start` | 15問取得＋オフセット更新＋補充要否判定 |
| POST | `/themes` | 作成＋初回15問の同期生成 |
| POST | `/prompts/regenerate` | 枯渇時の同期再生成 |
| GET | `/usage/:userId` | 当日の `{ count, neurons }`（Next.js側の判定の材料）。**上限値はHono側に持たない** |
| GET | `/rankings` | テーマ×形式の上位100件（`themeId` / `form` をクエリで受ける）。`displayName` を結合して返す |
| POST | `/rankings` | 記録の登録。生の値からスコアを計算し、ベストのときだけ書き換え、101位以下を消す。**そのプールを遊んだ記録が無ければ `FORBIDDEN`** |
| GET | `/users/themes` | ある利用者が作ったテーマ／含む文字の一覧（`userId` / `limit` / `cursor` をクエリで受ける）。`kind` で絞らず作成順。マイページ用 |
| GET | `/admin/themes` | 管理用一覧 |
| DELETE | `/admin/themes/:id` | 削除 |
| GET | `/admin/prompts` | テーマ1つ分のお題一覧（`themeId` / `limit` / `cursor` をクエリで受ける） |
| PATCH | `/admin/prompts` | 編集（`id` と本文を本文で受ける）。読み取得をやり直し、検査後に読み・ローマ字・打鍵数を更新 |
| DELETE | `/admin/prompts/:id` | お題1件の削除。連番は詰め直さない |
| GET | `/admin/users` | ユーザー一覧 |

**加算（`addUsage`）はルートとして露出しない。** 同期生成・バックグラウンド補充のいずれも、AIを呼んだ処理からHono内部で直接呼ぶ。バックグラウンド補充は `waitUntil` 内で動くためNext.jsからは観測できず、HTTP経由の加算ルートは設計上使えない。

## クォータ

MVPは**500ニューロン/日**（月次上限なし）。**リセットは 00:00 UTC**（＝日本時間の朝9時）。Workers AI の無料枠と窓を揃えるため（`docs/03-data-model.md`）。

**回数ではなく消費ニューロンで数える。** 回数だと1回の重さを見ないことになる（実測で1ラウンド20件が約6.5ニューロン。2ラウンド回る呼び出しはその倍）。守りたいのはWorkers AIの無料枠（**アカウント全体で1日10,000ニューロン**）の方。500は1日約40〜75回にあたり、旧上限の50回/日と同じ桁に収まる。

消費量は応答からは取れない（返るのはトークン数だけ）ため、モデル別の単価を掛けて計算する（`docs/05-generation.md`）。

| 行為 | 消費 |
|---|---|
| 新規テーマ・含む文字の作成 | する |
| 枯渇時の同期再生成 | する |
| **バックグラウンド補充（発火させたユーザー）** | **する** |
| 既存プールのプレイ（補充が走らない場合） | しない |
| 既存テーマの再利用（同名作成） | しない |

- **バックグラウンド補充を発火できるのはログインユーザーのみ。** 匿名ユーザーのプレイでは補充をキックしない（匿名は在庫を消費するだけ）
- **AIを呼んだら、成否によらず実消費を加算する。** ニューロンは呼んだ時点でCloudflare側が消費しており、有効なお題が0件でも戻ってこない。作れないテーマ名は2ラウンドまるごと使うため、そこを無料にすると**最も高い呼び出しだけが台帳から漏れる**
- **加算はラウンドごとに、AIの応答が返った直後に行う**（`batch.ts` の `onNeurons`）。生成の終わりにまとめて書くと、**クライアントが切断してinvocationごと打ち切られたとき**に消費だけが台帳から消える。切断されると残りの処理はキャンセルされうるため（`waitUntil` に載せたものを除く）、記録は消費が確定した直後に済ませる
- **AIを一度も呼んでいない経路では加算しない。** 既存テーマの再利用、ロックが取れずに中断した再生成が該当する
- 加算そのものが失敗しても応答は落とさない。生成が済んでいるのに500を返すより、記録漏れの方が害が小さい（消費は AI Gateway 側のログにも残る）

### 判定と記録の分担

**判定はNext.js、記録はHono。**

- Next.js は `GET /usage/:userId` で当日の消費を取得し、`canGenerate()`（`packages/shared`）で許可を判定する。この取得はレスポンスの `neuronsRemaining` 表示にも使うため、リクエストごとに1回で済む
- **1回分を予約しない。** 残っていれば通すので、最後の1回は上限を20前後超えうる。見積りを先に引く方式にすると、モデルを変えるたびに見積り定数を手で直すことになり、外したときは「残っているのに生成できない」形で利用者側に出る
- 同期生成の応答には、その回の消費（`neuronsUsed`）をHonoが載せる。Next.js はそれを足して `neuronsRemaining` を返す（D1を読み直すと、加算と読み直しの間に別の生成が挟まったときにずれる）
- 同期生成（`POST /api/themes` / `/api/prompts/regenerate`）: 残数0なら `QUOTA_EXCEEDED` を返し、Honoを呼ばない
- バックグラウンド補充（`POST /api/sessions/start`）: Next.js が判定結果を **`allowRefill` フラグ**としてHonoに渡す。**Honoはポリシー値（上限500等）を持たず、フラグを信頼するだけ**。残数0でもプレイ自体は許可する（ニューロンを消費しない行為のため）。補充のキックだけスキップする

なお「判定 → 生成 → 加算」は非原子のため、同一ユーザーの並行リクエストで残数の同時観測が起きると、上限をもう1回分超えて走りうる。**そもそも超過を許す設計**（上記）なので、このずれ込みも同じ範囲として許容する。

## エラーレスポンス

```jsonc
{ "error": { "code": "QUOTA_EXCEEDED", "message": "本日の生成量を使い切りました" } }
```

| code | HTTP | 条件 | クライアントの対応 |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod検証に失敗 | 入力欄にエラー表示 |
| `UNAUTHORIZED` | 401 | 未ログインで要認証を叩いた | ログインへ誘導 |
| `FORBIDDEN` | 403 | 管理者以外が`/api/admin/*`。ベータ版の非運営がお題の新規生成（`POST /api/themes`）を叩いた | 404相当に見せる（後者は「調整中」を案内） |
| `NOT_FOUND` | 404 | 指定されたテーマが存在しない | 一覧へ戻す |
| `THEME_EXHAUSTED` | 409 | 匿名がプール枯渇に到達 | 別テーマ／ログインを提示 |
| `GENERATION_IN_PROGRESS` | 409 | 在庫不足だが生成ロックあり | 「準備中」を表示し数秒後に再試行 |
| `GENERATION_FAILED` | 422 | リトライ上限でも15問未満 | テーマ名の変更を促す |
| `RATE_LIMITED` | 429 | Rate Limitingが弾いた | 少し待って再試行 |
| `QUOTA_EXCEEDED` | 429 | **その利用者**が日次上限に到達 | 残数とリセット時刻（日本時間の朝9時＝00:00 UTC）を案内 |
| `AI_QUOTA_EXCEEDED` | 429 | **アカウント全体**のWorkers AI無料枠を使い切った（内部コード3036） | 「本日はこれ以上作れない」と伝える。**テーマ名の変更を促さない** |
| `AI_UNAVAILABLE` | 503 | Workers AI が一時的に混み合っている（内部コード3040） | 少し待って再試行 |

`RATE_LIMITED`と`QUOTA_EXCEEDED`はどちらも429だが、前者は数秒、後者は日付が変わるまで解消しない。案内文が変わるためcodeで区別する。

`QUOTA_EXCEEDED` と `AI_QUOTA_EXCEEDED` も同じ理由で分ける。前者は**その利用者の500ニューロン**、後者は**アカウント全体の無料枠**で、後者は他の利用者にも同時に起きるうえ、本人にできることが何も無い。**どちらも `GENERATION_FAILED` に落とさないこと。** 「テーマ名を変えて」は名前を変えても直らない原因に対する誤誘導になる。

3036 と 3040 も分ける。前者は翌 00:00 UTC まで戻らず、後者は数分で直りうる。判別は `generation/ai.ts` の `classifyAiError()` で、**翻訳できない例外は従来どおり**扱う（取りこぼしても壊れない）。

## Rate Limiting

Cloudflare の Rate Limiting binding（`GENERATION_RATE_LIMIT`、Next.js Worker の `wrangler.jsonc`）で、生成系の連打を弾く。

| バインディング | 対象 | キー | 上限 | 超過時 |
|---|---|---|---|---|
| `GENERATION_RATE_LIMIT` | `POST /api/themes` / `POST /api/prompts/regenerate` | ユーザーID | 5回 / 60秒 | `RATE_LIMITED`(429) |
| `REFILL_RATE_LIMIT` | `POST /api/sessions/start`（ログイン時のみ） | ユーザーID | 10回 / 60秒 | **`allowRefill: false`。429は返さない** |

- キーをIPにしないのは、共有回線の背後にいる別のユーザーを巻き添えにする理由が無いため。匿名の `sessions/start` は補充をキックしないので判定自体を行わない
- 同期生成では**クォータ判定より先に判定する。** 弾かれたリクエストで `GET /usage/:userId` を引くのは無駄で、連打を弾く目的にも反する
- `period` は 10 か 60 しか指定できない

**補充のキックは弾いても429にしない。** プレイ自体はクォータを消費しない行為なので止めず、キックだけを落とす（残数0のときとまったく同じ扱いで、`allowRefill` に畳み込む）。新しいエラー経路もクライアント側の対応も要らない。

枠を分けているのは、遊んでいるだけでテーマ作成の予算が減るのを避けるため。**補充が要るかどうかは在庫数を持つHono側にしか分からない**ので、Next.js は補充の不要なプレイでも1消費する。そのため `REFILL_RATE_LIMIT` の上限は補充の頻度ではなく**プレイの頻度**で見積もっている。1プレイ15問なので人間が1分に10回セッションを開始することはなく、実質スクリプト連打にだけ効く。これが無いと、在庫の少ないテーマを並べてクォータ残（最大50件）の補充を一斉に走らせられる。

**認可判定はリソースの照会より前に行う。** 「存在するが権限が無い」と「そもそも存在しない」を区別させないための決まりで、`/api/admin/*` では非管理者に `NOT_FOUND` を到達させないことで成立させている（照会に進まないため、応答が実在の有無に依存しない）。

文言を揃えること自体は要件ではない。既定文言が `NOT_FOUND` と `FORBIDDEN` で同じなのは保険で、**個別に上書きしてよい**。実際、管理者が存在しないIDを叩いたときは「テーマが見つかりません」を返す（IDの誤りなのか権限を失ったのかを管理者が切り分けられるようにするため）。順序さえ守っていれば、この文言が非管理者に届くことはない。

**在庫不足時は「生成中」と「本当に尽きた」を区別する。** KVの`theme:<id>:lock`の有無で判定し、ロックがあれば`GENERATION_IN_PROGRESS`を返す（クォータを消費せず、再生成もキックしない）。

## 匿名ユーザーのオフセット

クライアントから送られる`offset`は改ざん可能だが、改ざんされても「まだ遊んでいないお題を先に見る／既に見たお題を再度見る」だけで、他人への影響も金銭的損失もない。サーバー側でゲストIDを持つコストの方が大きいため許容する。**ただし範囲外の値（負数・極端に大きい数）はZodで弾く。**
