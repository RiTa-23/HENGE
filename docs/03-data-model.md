# データモデル

D1（SQLite）+ Drizzle ORM。Better Auth管理下のテーブル（`user` / `session` / `account` / `verification`）は自動生成されるため定義しない。

## themes

テーマと「含む文字」の**両方**を格納する。`kind`で区別する。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID |
| `kind` | TEXT | NOT NULL | `'theme'` / `'constraint'` |
| `name` | TEXT | NOT NULL | 表示名（入力されたまま） |
| `normalized_name` | TEXT | NOT NULL | 重複判定用の正規化キー |
| `created_by` | TEXT | NULL可, FK→`user.id` ON DELETE SET NULL | `user.id`。運営投入分はNULL。作成者が退会してもテーマは公開コンテンツとして残すためCASCADEにしない |
| `generation_status` | TEXT | NOT NULL, default `'ok'` | `'ok'` / `'difficult'` |
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
| `keystroke_count` | INTEGER | NOT NULL | 打鍵数（10〜40） |
| `source` | TEXT | NOT NULL | `'workers_ai'` |
| `model` | TEXT | NULL可 | 生成に使ったモデル名 |
| `sequence_number` | INTEGER | NOT NULL | テーマ内で1始まりの連番 |
| `created_at` | INTEGER | NOT NULL | unixepoch |

```sql
CREATE UNIQUE INDEX prompts_theme_seq ON prompts (theme_id, sequence_number);
```

このインデックス1本で、ページネーション（`WHERE theme_id = ? AND sequence_number BETWEEN ? AND ?`）と総生成数の取得（`SELECT MAX(sequence_number)`）の両方を賄える。

**テーマ行はお題15問と同じバッチで挿入する。** テーマ行を先に作ると、生成失敗時にお題ゼロのテーマが公開一覧に残り、クリックしても何も遊べない状態になる。

## user_theme_progress

ログインユーザーのみ。匿名ユーザーはlocalStorageで同等の値を保持する。

| カラム | 型 | 説明 |
|---|---|---|
| `user_id` | TEXT | FK→`user.id` ON DELETE CASCADE |
| `theme_id` | TEXT | FK→`themes.id` ON DELETE CASCADE |
| `play_count` | INTEGER | 15の倍数。次に配信する範囲のオフセット |
| `updated_at` | INTEGER | unixepoch |

```sql
PRIMARY KEY (user_id, theme_id)
```

## user_generation_usage

| カラム | 型 | 説明 |
|---|---|---|
| `user_id` | TEXT | FK→`user.id` ON DELETE CASCADE |
| `date` | TEXT | `YYYY-MM-DD`。**JST基準** |
| `count` | INTEGER | その日の生成回数 |

```sql
PRIMARY KEY (user_id, date)
```

**日付は必ずJST基準の共通関数で作る。** Workersの実行環境はUTCなので、素直に実装すると上限のリセットが朝9時になる。`new Date().toISOString()` を直接使わず、`packages/shared` の変換関数を経由すること。

MVPでは日次上限のみ（50回/日）。月次上限は設けないため当月SUMは不要。

## KVのキー

| キー                               | 値       | TTL     | 用途                |
| -------------------------------- | ------- | ------- | ----------------- |
| `theme:<kind>:<normalized_name>` | テーマID   | なし      | 重複チェック・ID解決のキャッシュ |
| `theme:<theme_id>:lock`          | `"1"` 等 | 60〜120秒 | バックグラウンド生成の多重起動防止 |

ロックのTTLは**最低60秒**（KVの制約）。生成処理がクラッシュしてもTTLで自動的に復旧するため、古いロックを掃除するバッチ処理は不要。

## テーマ削除時の連鎖

| 対象 | 消え方 |
|---|---|
| `prompts` | FKのCASCADEで自動削除 |
| `user_theme_progress` | 同上 |
| **KVのキャッシュ・ロック** | **自動では消えない。削除処理で明示的に削除する** |

D1のCASCADEはD1の中でしか効かない。KVを消し忘れると「削除したテーマがキャッシュ経由で復活したように見える」不具合になる。

## ユーザー削除時の連鎖

| 対象 | 消え方 |
|---|---|
| `user_theme_progress` / `user_generation_usage` | FKのCASCADEで自動削除 |
| Better Auth の `session` / `account` | 同上 |
| `themes` | **消さない。** `created_by` がNULLになるだけ（公開コンテンツのため） |

## マイグレーション

Drizzleのスキーマは `apps/backend/src/db/schema.ts`。Better Auth管理下のテーブルは
`@better-auth/cli generate` が出力した `apps/backend/src/db/auth-schema.ts` を取り込む（手で書かない）。

生成先は `apps/backend/migrations/`（wranglerの `migrations_dir` の既定値）。

```bash
bun run db:generate        # Drizzleでマイグレーションを生成
bun run db:migrate:local   # ローカルD1に適用
```

本番への適用は GitHub Actions の `D1 migrate` ワークフロー（手動トリガー）で行う。**自動適用しない。**

Drizzleで`references()`を明示しないとFK自体が作られない。ローカルD1で外部キー制約が有効であることと、
CASCADEが実際に効くことは `apps/backend/test/schema.test.ts` で検証している。
