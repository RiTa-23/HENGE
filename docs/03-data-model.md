# データモデル

D1（SQLite）+ Drizzle ORM。Better Auth管理下のテーブル（`user` / `session` / `account` / `verification`）の定義は `packages/shared/src/db/auth-schema.ts`（`@better-auth/cli generate` が出力したもの。手で書かない）。

## themes

テーマと「含む文字」の**両方**を格納する。`kind`で区別する。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID |
| `kind` | TEXT | NOT NULL | `'theme'` / `'constraint'` |
| `name` | TEXT | NOT NULL | 表示名（入力されたまま） |
| `normalized_name` | TEXT | NOT NULL | 重複判定用の正規化キー |
| `created_by` | TEXT | NULL可, FK→`user.id` ON DELETE SET NULL | `user.id`。運営投入分はNULL。作成者が退会してもテーマは公開コンテンツとして残すためCASCADEにしない |
| `generation_status` | TEXT | NOT NULL, default `'ok'` | `'ok'` / `'difficult'`。**短文プールの分** |
| `word_generation_status` | TEXT | NOT NULL, default `'ok'` | 同上。**単語プールの分**。1本にまとめない（単語が作れないテーマで短文の補充まで止まる） |
| `total_play_count` | INTEGER | NOT NULL, default 0 | 人気順ソート用。プレイ開始のたび+1 |
| `created_at` | INTEGER | NOT NULL | unixepoch |

```sql
CREATE UNIQUE INDEX themes_kind_normalized ON themes (kind, normalized_name);
CREATE INDEX themes_kind_popular ON themes (kind, total_play_count DESC);
CREATE INDEX themes_kind_created ON themes (kind, created_at DESC);
```

一意制約に`kind`を含めるのは、テーマ名「ざ」と含む文字「ざ」を共存させるため。

### normalized_name の作り方

表示は`name`、判定は`normalized_name`。SQLiteにUnicode正規化関数が無いため、**アプリ側で計算して保存する**（クエリ時の正規化は不可）。

| kind | ルール |
|---|---|
| `'theme'` | NFKC正規化 → 前後の空白除去 → 連続空白を1つに → 英字を小文字化 |
| `'constraint'` | NFC正規化のみ |

**含む文字はひらがなのみ受け付ける。** カタカナ・漢字・英数字・記号・空白は入力段階で拒否する。判定対象が読み仮名（ひらがな）のため、それ以外を指定しても永久に一致しない。

**NFC正規化はバリデーションより先に行う。** 「が」には1文字表現（U+304C）と「か」+結合濁点（U+304B U+3099）の2表現がある。後者は濁点がひらがなの範囲外なので、先に「ひらがなのみ」を検査すると正しい入力が弾かれる。

### generation_status

「何度やっても在庫が積み上がらないテーマ」の印。無駄な再試行を止めるために使う。

| 値 | 挙動 |
|---|---|
| `'ok'` | 在庫が閾値を割ればバックグラウンド生成をキック |
| `'difficult'` | バックグラウンド生成を試みない。在庫が尽きたユーザーは枯渇時ルートへ |

- 立つ条件: バックグラウンド補充がリトライ上限（2ラウンド）でも目標未達
- **戻す条件: 同期再生成が成功したとき`'ok'`に戻す**（生成できることが実証されたため）
- `'difficult'`でも既存の在庫は普通に配信される。枯渇判定はユーザーごとのオフセットで行うため、まだ遊んでいないユーザーには影響しない

## prompts

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID |
| `theme_id` | TEXT | NOT NULL, FK→`themes.id` ON DELETE CASCADE | |
| `text` | TEXT | NOT NULL | 漢字かな混じりの本文 |
| `reading_kana` | TEXT | NOT NULL | ひらがなの読み |
| `reading_roman_json` | TEXT | NOT NULL | かな→ローマ字候補配列のJSON |
| `keystroke_count` | INTEGER | NOT NULL | 打鍵数（10〜35） |
| `source` | TEXT | NOT NULL | `'workers_ai'` |
| `model` | TEXT | NULL可 | 生成に使ったモデル名 |
| `form` | TEXT | NOT NULL, default `'sentence'` | `'sentence'` / `'word'`。**プールはこれで分かれる** |
| `sequence_number` | INTEGER | NOT NULL | テーマ内・**形式内**で1始まりの連番 |
| `created_at` | INTEGER | NOT NULL | unixepoch |

```sql
CREATE UNIQUE INDEX prompts_theme_form_seq ON prompts (theme_id, form, sequence_number);
```

**`form` をインデックスに含める。** 連番は形式ごとに1から振り直すため、含めないと
単語の1番が短文の1番と衝突する。採番（`MAX + 1`）もプールをまたいで飛ぶ。

このインデックス1本で、配信・管理一覧のページネーション（`ORDER BY sequence_number LIMIT ? OFFSET ?`）と**次の採番**（`SELECT MAX(sequence_number)`）を賄える。**在庫数は `COUNT(*)` で数える。** 管理画面からお題を1件消すと連番に穴が空くため、最大値で数えると在庫を多く見積もりすぎる。配信も連番の「値」で範囲指定せず、行数で位置を数える（`OFFSET`）。そうしないと穴を含む15問ブロックが足りなくなり、1件の削除でテーマが遊べなくなる。

**テーマ行はお題15問と同じバッチで挿入する。** テーマ行を先に作ると、生成失敗時にお題ゼロのテーマが公開一覧に残り、クリックしても何も遊べない状態になる。

## user_theme_progress

ログインユーザーのみ。匿名ユーザーはlocalStorageで同等の値を保持する。

| カラム | 型 | 説明 |
|---|---|---|
| `user_id` | TEXT | FK→`user.id` ON DELETE CASCADE |
| `theme_id` | TEXT | FK→`themes.id` ON DELETE CASCADE |
| `form` | TEXT | `'sentence'` / `'word'`。**進捗は形式ごとに持つ** |
| `play_count` | INTEGER | その形式の1プレイ分（短文15／単語20）の倍数。次に配信する範囲のオフセット |
| `updated_at` | INTEGER | unixepoch |

```sql
PRIMARY KEY (user_id, theme_id, form)
```

**`form` を主キーに含める。** 含めないと、単語を1プレイ（20問）遊んだぶんだけ
短文のオフセットも進み、**まだ遊んでいない短文のお題が飛ばされる**。

匿名側のキーも同じ理由で分ける（`henge:offset:<themeId>` / `…:word`）。
**短文は接尾辞なしのまま**にしてある。付け替えると既存の進捗が0に戻り、
一度見たお題がもう一度配られる。

## user_generation_usage

| カラム | 型 | 説明 |
|---|---|---|
| `user_id` | TEXT | FK→`user.id` ON DELETE CASCADE |
| `date` | TEXT | `YYYY-MM-DD`。**00:00 UTC 基準** |
| `count` | INTEGER | その日にAIを呼んだ回数。**上限の判定には使わない**（1回あたりの重さ＝消費÷回数を見るための分母） |
| `neurons` | REAL | その日の消費ニューロン。**上限の判定はこの値で行う**。応答からは取れないためトークン数×モデル別単価で計算する（`docs/05-generation.md`）。小数になるのでREAL |

```sql
PRIMARY KEY (user_id, date)
```

**日付は必ず `packages/shared` の `usageDateKey()` で作る（00:00 UTC 基準）。JSTに直さない。**

Workers AI の無料枠（アカウント全体で1日10,000ニューロン）は **00:00 UTC にリセットされる**。利用者ごとの窓をJST 0時（＝15:00 UTC）にすると、1アカウント日の中に利用者のリセットが挟まり、**1人が上限の2倍（1,000ニューロン）まで消費できてしまう**。「500×20人で10,000」の想定が10人で埋まる。

```
UTC  00:00 ─────────── 15:00 ─────────── 24:00
     └ 前日枠の残り 最大500 ┘└ 新しい枠 最大500 ┘   ← JST基準だとこうなる
     └──── アカウント枠 10,000 の1日 ────┘
```

リセットは日本時間の朝9時になる。**利用者への表示だけ日本時間にする**（`quotaResetAt()` が `+09:00` 表記で返す）。日次の集計が突き合わせられるようになるので、管理画面の「本日の消費」の合計は Cloudflare ダッシュボードのその日の数字と一致する。

MVPでは日次上限のみ（**500ニューロン/日**）。月次上限は設けないため当月SUMは不要。

## KVのキー

| キー                               | 値       | TTL     | 用途                |
| -------------------------------- | ------- | ------- | ----------------- |
| `theme:<kind>:<normalized_name>` | テーマID   | なし      | 重複チェック・ID解決のキャッシュ |
| `theme:<theme_id>:<form>:lock`   | `"1"` 等 | 60秒 | バックグラウンド生成の多重起動防止。**形式ごとに分ける**（単語の補充中に短文の補充がスキップされないように） |

ロックのTTLは**最低60秒**（KVの制約）。生成処理がクラッシュしてもTTLで自動的に復旧するため、古いロックを掃除するバッチ処理は不要。

**TTLは「生成中」で待たせる上限（`GENERATION_WAIT_LIMIT_MS` = 90秒）より短く保つこと。** ロックが残っている間、在庫不足のプレイには `GENERATION_IN_PROGRESS` を返して待たせる。TTLの方が長いと、生成が打ち切られた後も「待てば解決する」と言い続けたままクライアントが先に諦め、**待たせた末にエラーを見せる**ことになる。2つの値は `packages/shared` に並べて置き、大小を `session.test.ts` で固定している（別々のWorkerに置くと、片方だけ動かしたときに静かに壊れる）。

60秒で足りる根拠は、背景補充が `waitUntil` の中で走り、**レスポンス送信から30秒で打ち切られる**こと（`docs/04-api.md`）。生きているロックが30秒強より長生きする必要はない。

## テーマ削除時の連鎖

| 対象 | 消え方 |
|---|---|
| `prompts` | FKのCASCADEで自動削除 |
| `user_theme_progress` | 同上 |
| **KVのキャッシュ・ロック** | **自動では消えない。削除処理で明示的に削除する**（ロックは**形式ぶんすべて**） |

D1のCASCADEはD1の中でしか効かない。KVを消し忘れると「削除したテーマがキャッシュ経由で復活したように見える」不具合になる。

## ユーザー削除時の連鎖

| 対象 | 消え方 |
|---|---|
| `user_theme_progress` / `user_generation_usage` | FKのCASCADEで自動削除 |
| Better Auth の `session` / `account` | 同上 |
| `themes` | **消さない。** `created_by` がNULLになるだけ（公開コンテンツのため） |

## マイグレーション

Drizzleのスキーマは `apps/backend/src/db/schema.ts`。Better Auth管理下のテーブルは
`@better-auth/cli generate` が出力した `packages/shared/src/db/auth-schema.ts` を取り込む（手で書かない）。

**`better-auth` は `@better-auth/cli` と同じ系列に固定する**（現在はどちらも1.4系）。本体だけ上げると、CLIが未対応の列（1.7で追加された `account.issuer` など）をスキーマが持たないまま動き、**OAuthのコールバックで初めて500になる**。ブラウザで最後まで通さないと気付けないため、`apps/frontend/lib/auth-schema.test.ts` で「better-auth が要求する列が揃っているか」を検査している。本体を上げるときはCLIも同時に上げ、スキーマを再生成すること。
両Workerから参照するため shared に置いている（アクセス権限の線引きは `docs/02-architecture.md`）。

生成先は `apps/backend/migrations/`（wranglerの `migrations_dir` の既定値）。

```bash
bun run db:generate        # Drizzleでマイグレーションを生成
bun run db:migrate:local   # ローカルD1に適用
```

本番への適用は **`main` へのマージで自動的に走る**（`deploy.yml` の `migrate` ジョブ）。デプロイの**前**に適用し、失敗したらデプロイを止める。逆順にすると、新しいスキーマを前提にしたコードが古いテーブルの上で動く時間ができる。

**適用後に未適用が残っていないかを必ず確かめる。** D1のマイグレーションはサイレントに失敗する報告があり、`apply` の終了コードだけでは信用できない。`list` を実行し直して「No migrations to apply」が出なければジョブを落とす。

手動トリガーの `D1 migrate` ワークフローは残してある。**調査（`list`）と、自動適用が落ちた後の復旧（`apply`）のための入口**で、両者は同じ concurrency グループで直列化している。

## D1のバインド変数の上限

**1クエリにつき100個まで。** `db.batch()` の中の各文にも個別に適用される。

お題1件の挿入で**10個**使う（`form` を足して1つ増えた）ため、**11件以上を1文で挿入すると `too many SQL variables` で落ちる**。10件でもちょうど上限100個に張り付くので、`apps/backend/src/db/prompts.ts` では**9件ずつ**に分けている。生成は1ラウンド20件なので分割は必須。テーマ行とお題は分割してもバッチの中に収める。**列を足すときはこの数を見直すこと。**

Drizzleで`references()`を明示しないとFK自体が作られない。ローカルD1で外部キー制約が有効であることと、
CASCADEが実際に効くことは `apps/backend/test/schema.test.ts` で検証している。

## 出題の形式（form）

`prompts.form` で短文と単語のプールを分ける。**`kind`（テーマ／最適化）とは直交する軸**で、
同じテーマを2つの形式で遊ぶための区別。

**`kind` に値を足す形にしない。** 一意制約が `(kind, normalized_name)` なので、
「福岡（短文）」と「福岡（単語）」が別のテーマ行になり、一覧に同じ名前が2つ並ぶ。
プレイ回数も作成者も分かれてしまう。

| 形式 | 1プレイ | 在庫目標 | 打鍵数 |
|---|---|---|---|
| `sentence` | 15問 | 30 | 10〜35 |
| `word` | 20問 | **30** | 4〜20 |

**単語の在庫目標を2プレイ分（60）にしない。** 補充が1回で作れるのは最大40件
（20件×2ラウンド）で、在庫0から60は埋められない。目標未達は `'difficult'` を立てる
条件なので、**普通に作れているテーマに「生成困難」の印が付き、以後の補充が止まる**。
値は `packages/shared/src/session.ts` にあり、`session.test.ts` で「1回の補充で
作れる上限を超えない」ことを固定している。

**単語モードはテーマだけ。** 最適化練習（`kind: 'constraint'`）には付けない。
短い語に指定の音を入れさせるのは短文よりさらに却下率が上がる（`docs/05-generation.md`）。
