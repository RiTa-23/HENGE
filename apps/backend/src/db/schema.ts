import { desc, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

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
    /** 'difficult' は「何度やっても在庫が積み上がらないテーマ」の印 */
    generationStatus: text("generation_status", { enum: ["ok", "difficult"] })
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
    /** 打鍵数（10〜40）。候補が複数ある場合は最短で数える */
    keystrokeCount: integer("keystroke_count").notNull(),
    source: text("source", { enum: ["workers_ai"] }).notNull(),
    /** 生成に使ったモデル名。どのモデルが作ったお題か後から辿るため */
    model: text("model"),
    /** テーマ内で1始まりの連番。ページネーションの基準 */
    sequenceNumber: integer("sequence_number").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // このインデックス1本で、ページネーションと総生成数の取得の両方を賄う
    uniqueIndex("prompts_theme_seq").on(t.themeId, t.sequenceNumber),
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
    /** 15の倍数。次に配信する範囲のオフセット */
    playCount: integer("play_count").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.themeId] })],
);

/**
 * 生成回数の日次カウント。日付は必ずJST基準（packages/shared の todayJst）。
 */
export const userGenerationUsage = sqliteTable(
  "user_generation_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD。JST基準 */
    date: text("date").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export * from "./auth-schema";
