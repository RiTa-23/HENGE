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
     * 印も形式ごとに持つ。3つ目の形式が来たら theme_pools テーブルへ寄せる。
     */
    wordGenerationStatus: text("word_generation_status", { enum: ["ok", "difficult"] })
      .notNull()
      .default("ok"),
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
    form: text("form", { enum: ["sentence", "word"] })
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
    form: text("form", { enum: ["sentence", "word"] })
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
 * Better Auth 管理下のテーブル。@better-auth/cli generate が生成したものを
 * packages/shared に置き、両Workerから参照する。
 *
 * 認証テーブルの書き込みは Next.js Worker（Better Auth）のみ。ここでの
 * 再exportはFKの親テーブルとしての参照（読み取り）に使うためのもの。
 */
export * from "@henge/shared/db/auth-schema";
