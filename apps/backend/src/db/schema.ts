import { desc, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@henge/shared/db/auth-schema";

/**
 * テーマと「含む文字」の両方を格納する。kind で区別する。
 * 一意制約に kind を含めるのは、テーマ名「ざ」と含む文字「ざ」を共存させるため。
 */
export const themes = sqliteTable(
  "themes",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["theme", "constraint"] }).notNull(),
    /** 表示名。入力されたまま */
    name: text("name").notNull(),
    /**
     * 重複判定用の正規化キー。SQLiteにUnicode正規化関数が無いため、
     * アプリ側（packages/shared の normalizeThemeName）で計算して保存する。
     */
    normalizedName: text("normalized_name").notNull(),
    /** 運営投入分はNULL。作成者が退会してもテーマ自体は残す */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** 'difficult' は「何度やっても在庫が積み上がらないテーマ」の印。**短文のプールの分** */
    generationStatus: text("generation_status", { enum: ["ok", "difficult"] })
      .notNull()
      .default("ok"),
    /**
     * 単語のプールの「生成困難」の印。**短文と1本にまとめない。**
     *
     * まとめると、単語が作れないテーマで印が立った瞬間に**短文の補充まで止まる**。
     * 形式ごとに作りやすさは違う（短文は作れるが単語が出てこないテーマがある）ので、
     * 印も形式ごとに持つ。
     *
     * **形式ごとの列で持つのはこの印だけ。** 形式ごとに持ちたい属性が2つ以上になったら
     * `theme_pools (theme_id, form, ...)` へ寄せる（列が形式×属性で増えるため）。
     * 長文（3つ目）を足した時点では印1つだけなので列のまま。
     */
    wordGenerationStatus: text("word_generation_status", { enum: ["ok", "difficult"] })
      .notNull()
      .default("ok"),
    /** 長文のプールの「生成困難」の印。上と同じ理由で形式ごとに持つ */
    longGenerationStatus: text("long_generation_status", { enum: ["ok", "difficult"] })
      .notNull()
      .default("ok"),
    /**
     * 最適化（`kind: 'constraint'`）の既定の運指。作成者が作成時に決めたもの。
     * `{ units: ({ roman, fingers: ["right-index", …] } | null)[] }` の JSON。
     *
     * 標準運指のままなら NULL。テーマでは常に NULL。利用者がその端末で決めた運指
     * （localStorage）があればそちらが勝つ（docs/07-ui.md「最適化の運指」）。
     * 検証は Next.js 側で済ませてあり、ここでは中身を解釈しない
     */
    defaultFingeringJson: text("default_fingering_json"),
    /** 人気順ソート用。プレイ開始のたび+1 */
    totalPlayCount: integer("total_play_count").notNull().default(0),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("themes_kind_normalized").on(t.kind, t.normalizedName),
    index("themes_kind_popular").on(t.kind, desc(t.totalPlayCount)),
    index("themes_kind_created").on(t.kind, desc(t.createdAt)),
    // マイページの「作ったお題」（作成者で絞って作成順）。kind をまたいで引くので
    // 上の2本では賄えない
    index("themes_created_by").on(t.createdBy, desc(t.createdAt)),
  ],
);

/**
 * お題。テーマ行と同じバッチで挿入する（先にテーマだけ作らない）。
 */
export const prompts = sqliteTable(
  "prompts",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    /** 漢字かな混じりの本文 */
    text: text("text").notNull(),
    /** ひらがなの読み */
    readingKana: text("reading_kana").notNull(),
    /** かな→ローマ字候補配列のJSON */
    readingRomanJson: text("reading_roman_json").notNull(),
    /** 打鍵数（10〜35）。候補が複数ある場合は最短で数える */
    keystrokeCount: integer("keystroke_count").notNull(),
    source: text("source", { enum: ["workers_ai"] }).notNull(),
    /** 生成に使ったモデル名。どのモデルが作ったお題か後から辿るため */
    model: text("model"),
    /**
     * 出題の形式。**プールはこれで分かれる。**
     *
     * 既存の行はすべて 'sentence'。`kind`（テーマ／最適化）とは直交する軸で、
     * `kind` に値を足す形にすると同じテーマが一覧に2つ並ぶことになる。
     */
    form: text("form", { enum: ["sentence", "word", "long"] })
      .notNull()
      .default("sentence"),
    /** テーマ内・形式内で1始まりの連番。ページネーションの基準 */
    sequenceNumber: integer("sequence_number").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // このインデックス1本で、ページネーションと総生成数の取得の両方を賄う。
    // **form を含める。** 含めないと単語の連番が短文と衝突し、採番（MAX+1）も
    // プールをまたいで飛ぶ
    uniqueIndex("prompts_theme_form_seq").on(t.themeId, t.form, t.sequenceNumber),
  ],
);

/**
 * 最適化練習（`kind: 'constraint'`）の語彙。**1つの最適化につき1行。**
 *
 * 作成時に共通語彙リスト（`generation/vocabulary.ts`）から、読みに指定の連接を含む語を
 * よく使われる順に最大1000語選んで保存する。生成のたびにこの中からランダムに選び、
 * 「この語を使って自然な短文を作る」形でモデルに渡す（docs/05-generation.md）。
 *
 * **1語1行にしない。** 1000語を1語1行で挿入すると、バインド変数の上限（1文100個）で
 * 約31文に割れ、テーマ行・お題と同じバッチがそのぶん重くなる。生成時も
 * `ORDER BY RANDOM()` が最大1000行を読む。1行の JSON なら挿入も読み取りも1回で済む。
 *
 * **テーマ行・お題10問と同じバッチで挿入する**（不変条件5と同じ理由）。
 */
export const constraintVocabularies = sqliteTable("constraint_vocabularies", {
  themeId: text("theme_id")
    .primaryKey()
    .references(() => themes.id, { onDelete: "cascade" }),
  /** `[表記, 読み][]` の JSON。よく使われる順。最大1000語で約20KB */
  wordsJson: text("words_json").notNull(),
});

/**
 * ログインユーザーのみ。匿名ユーザーはlocalStorageで同等の値を保持する。
 */
export const userThemeProgress = sqliteTable(
  "user_theme_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    /**
     * 出題の形式。**進捗は形式ごとに持つ。**
     *
     * 1つにまとめると、単語を遊んだぶんだけ短文のオフセットも進み、
     * **遊んでいない短文のお題が飛ばされる**。
     */
    form: text("form", { enum: ["sentence", "word", "long"] })
      .notNull()
      .default("sentence"),
    /** その形式の1プレイ分の倍数。次に配信する範囲のオフセット */
    playCount: integer("play_count").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.themeId, t.form] })],
);

/**
 * 生成の日次消費。日付は必ず `usageDateKey()`（**00:00 UTC 基準**）で作る。
 *
 * **上限の判定に使うのは `neurons` の方。** `count` は「何回試したか」で、
 * 1回あたりの重さ（消費 ÷ 回数）を見るときの分母として残している。
 */
export const userGenerationUsage = sqliteTable(
  "user_generation_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD。**00:00 UTC 基準**（Workers AI の無料枠と窓を揃える） */
    date: text("date").notNull(),
    count: integer("count").notNull().default(0),
    /**
     * その日の消費ニューロン。小数になるため REAL。
     * 値はトークン数から計算する（apps/backend/src/generation/model.ts の neuronsUsed）
     */
    neurons: real("neurons").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/**
 * ランキング。**テーマ×形式ごとに、1人1件（ベストスコア）。**
 *
 * プレイごとに積むと1人で100枠を埋められるので、主キーに user_id を含めて
 * ベストだけを持つ。生の値（打鍵数・ミス・時間）も持つのは、一覧に打鍵/秒と
 * 正確率を出すためと、スコアの算出方法を変えたときに計算し直せるようにするため。
 *
 * 名前は持たない。表示時に `user.display_name` を結合する（名前を変えれば過去の
 * 記録の名前も変わる。ユーザー削除は CASCADE で記録ごと消える）。
 * 101位以下は登録のたびに消す（`RANKING_SIZE`。`docs/03-data-model.md`）。
 */
export const rankings = sqliteTable(
  "rankings",
  {
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    /** 出題の形式。短文と単語は別のランキング */
    form: text("form", { enum: ["sentence", "word", "long"] }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e-typing 方式のスコア（`packages/shared` の `etypingScore`）。サーバーで計算する */
    score: integer("score").notNull(),
    hits: integer("hits").notNull(),
    misses: integer("misses").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    /** この記録を出した時刻。同点は先に出した方が上 */
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.themeId, t.form, t.userId] }),
    // 一覧（上位100件）と刈り込みの両方で使う
    index("rankings_theme_form_score").on(t.themeId, t.form, desc(t.score)),
  ],
);

/**
 * 読み違いのユーザー報告。承認→user-lex.csv追記PR（辞書リポジトリ側）までの
 * ワークキューとして持つ。`prompts` へのFKではなく `theme_id`+`sentence_no`+
 * `prompt_text` で自己完結させる — お題が後で編集・削除されても報告内容は
 * 残る。
 *
 * 匿名ユーザーの報告は `user_id` NULL で受け付ける（報告は進捗データでは
 * ない）。
 */
export const readingReports = sqliteTable(
  "reading_reports",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    /** リザルト一覧でのお題番号（1始まり）。prompts の連番ではなく表示位置 */
    sentenceNo: integer("sentence_no").notNull(),
    /** 報告時点のお題文。お題が消えても報告は読めるように冗長に持つ */
    promptText: text("prompt_text").notNull(),
    /** 誤っている読みの部分（お題文中の表層） */
    surface: text("surface").notNull(),
    /** 生成時に実際に出た（誤った）読み */
    reportedKana: text("reported_kana").notNull(),
    /** ユーザーが申告した正しい読み（ひらがな。承認時にカタカナ正規化される） */
    expectedKana: text("expected_kana").notNull(),
    /** 報告者。匿名は NULL */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "approved", "rejected", "applied"] })
      .notNull()
      .default("pending"),
    /** 承認時に確定する user-lex コスト値。既定はワークフローの自動推定 */
    cost: integer("cost"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    appliedAt: integer("applied_at"),
  },
  (t) => [
    // 承認画面（pending一覧）とワークフロー（approved取得）の両方が status で絞る
    index("reading_reports_status").on(t.status, desc(t.createdAt)),
  ],
);

/**
 * 最適化の運指の投稿。**誰でも（ログインしていてユーザー名を決めた人）投稿できる。**
 *
 * 最適化の既定の運指（`themes.default_fingering_json`。作成者と運営が決める）とは別物で、
 * プレイヤーはこの一覧から選んで自分の運指（localStorage）に写す（docs/07-ui.md）。
 *
 * - **同じ運指は1件だけ**（`theme_id` × `fingering_json` の一意制約）。JSON は Next.js 側で
 *   検証済みの運指から作り直した形（`encodeFingering`）なので、同じ運指なら同じ文字列になる
 * - 1人1つの最適化につき5件まで（`FINGERING_POSTS_PER_USER`。Hono 側で数える）
 * - 名前は持たない。表示時に `user.display_name` を結合する（ランキングと同じ）。
 *   投稿者が退会したら投稿ごと消える
 */
export const fingeringPosts = sqliteTable(
  "fingering_posts",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `{ units: ({ roman, fingers: ["right-index", …] } | null)[] }` の JSON（既定の運指と同じ形） */
    fingeringJson: text("fingering_json").notNull(),
    /** 任意の説明文（60文字まで）。無ければ NULL */
    note: text("note"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("fingering_posts_theme_fingering").on(t.themeId, t.fingeringJson),
    // 1人あたりの投稿数を数える
    index("fingering_posts_user_theme").on(t.userId, t.themeId),
  ],
);

/**
 * 投稿の「選んだ人」。**ログインユーザーが、その最適化について最後に選んだ投稿**を
 * 1人1行で持つ（主キーが `user_id` × `theme_id`）。一覧の並び順（選んだ人数の多い順）に使う。
 *
 * いいね・お気に入りではない（MVP のスコープ外）。別の投稿を選び直せば票が移る。
 * 匿名は数えない（匿名ユーザーのデータをサーバーに持たない＝不変条件10）。
 */
export const fingeringPicks = sqliteTable(
  "fingering_picks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => fingeringPosts.id, { onDelete: "cascade" }),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.themeId] }),
    // 投稿ごとの人数を数える
    index("fingering_picks_post").on(t.postId),
  ],
);

/**
 * Better Auth 管理下のテーブル。Better Auth の CLI（auth パッケージ）が生成したものを
 * packages/shared に置き、両Workerから参照する。
 *
 * 認証テーブルの書き込みは Next.js Worker（Better Auth）のみ。ここでの
 * 再exportはFKの親テーブルとしての参照（読み取り）に使うためのもの。
 */
export * from "@henge/shared/db/auth-schema";
