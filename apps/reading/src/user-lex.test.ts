/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, Reader } from "@henge/reading-wasm";
import { katakanaToHiragana } from "@henge/shared";
import { readingOf } from "./reading";

/**
 * ユーザー辞書（assets/user-lex.csv）の回帰テスト。
 * 本番・E2Eで観測された誤読が直っていること、ユーザー辞書なしでも
 * Reader が動くこと、不正CSVが Err になることを確認する。
 */

const assetsDir = fileURLToPath(new URL("../assets/", import.meta.url));
const dictPath = `${assetsDir}unidic.dic.zst`;
const userCsv = readFileSync(`${assetsDir}user-lex.csv`, "utf8");

function kanaOf(reader: Reader, text: string): string {
  const result = readingOf(reader.tokenize(text), katakanaToHiragana);
  if ("error" in result) throw new Error(`UNKNOWN_READING: ${result.surface} (${text})`);
  return result.kana;
}

describe("user-lex.csv の書式", () => {
  // 辞書が無くても回る。壊れた行をコミットすると Worker の起動が全滅するので、
  // 形式だけはCIで必ず検査する
  test("全行が MeCab 書式の13列（表層,lid,rid,cost,特徴9列）", () => {
    const lines = userCsv.split("\n").filter((line) => line !== "");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const fields = line.split(",");
      expect(fields.length).toBe(13);
      expect(fields[0]).not.toBe(""); // 表層
      expect(fields[1]).toMatch(/^\d+$/); // lid
      expect(fields[2]).toMatch(/^\d+$/); // rid
      expect(fields[3]).toMatch(/^-?\d+$/); // cost
      expect(fields[11]).not.toBe(""); // 読み（カタカナ）
    }
  });
});

// 辞書は git 管理外（bun run --cwd apps/reading dict:fetch で取得）。
// 無い環境では辞書依存ケースだけ飛ばす
const describeWithDict = existsSync(dictPath) ? describe : describe.skip;

describeWithDict("ユーザー辞書で誤読が直る", () => {
  initSync({
    module: readFileSync(
      fileURLToPath(
        new URL("../../../packages/reading-wasm/pkg/reading_wasm_bg.wasm", import.meta.url),
      ),
    ),
  });
  const dictZst = readFileSync(dictPath);
  const reader = Reader.from_zstd(new Uint8Array(dictZst), userCsv);

  // 本番（夏祭りの屋台）で観測された誤読
  test.each([
    ["綺麗な提灯が揺れている", "きれいなちょうちんがゆれている"],
    ["お菓子を買って食べる", "おかしをかってたべる"],
    ["かき氷を食べながら歩いた", "かきごおりをたべながらあるいた"],
    ["子どもが楽しそうだった", "こどもがたのしそうだった"],
    ["花火大会", "はなびたいかい"],
    ["たこ焼き屋台", "たこやきやたい"],
    ["かき氷の冷たさ", "かきごおりのつめたさ"],
    ["頁が無い", "ぺーじがない"],
    // E2E（5新テーマ）で観測された誤読
    ["敵を追って走る", "てきをおってはしる"],
    ["虫を殺して捨てた", "むしをころしてすてた"],
    ["駆ける少年", "かけるしょうねん"],
    ["温泉に浸かって休む", "おんせんにつかってやすむ"],
    ["壊れた時計を直して使う", "こわれたとけいをなおしてつかう"],
    ["ゴミを拾って歩く", "ごみをひろってあるく"],
    ["星が光っている", "ほしがひかっている"],
    ["窓が閉まる", "まどがしまる"],
    ["電車が通過した", "でんしゃがつうかした"],
    ["金魚すくいの屋台", "きんぎょすくいのやたい"],
    ["牛乳を飲む", "ぎゅうにゅうをのむ"],
    ["パンの職人", "ぱんのしょくにん"],
    ["海図を広げる", "かいずをひろげる"],
    ["港に船が着く", "みなとにふねがつく"],
    ["人波に流される", "ひとなみにながされる"],
    ["荷物を持つ", "にもつをもつ"],
    ["花が香る", "ばながかおる"],
    ["線香花火を楽しむ", "せんこうはなびをたのしむ"],
    ["ほおずき市に行く", "ほおずきいちにいく"],
    ["夜空に星が瞬いていた", "よぞらにほしがしばたたいていた"],
    ["背中が汗で濡れた", "せなかがあせでぬれた"],
    ["犯人を待ち伏せる計画", "はんにんをまちぶせるけいかく"],
  ])("%s → %s", (text, expected) => {
    expect(kanaOf(reader, text)).toBe(expected);
  });

  // 強制コストが複合語を分解しないか。単漢字（星/港）や動詞語幹の
  // エントリは低めのコストに留めてあり、既存複合語は守れるはず
  test.each([
    ["空港に向かう", "くうこうにむきかう"],
    ["火星に行く", "かせいにいく"],
    ["流星を見る", "りゅうせいをみる"],
    ["星座を探す", "せいざをさがす"],
    ["香港旅行", "ほんこんりょこう"],
    ["星空を眺める", "ほしぞらをながめる"],
    ["人殺しが逃げた", "ひとごろしがにげげた"],
    ["殺し屋を雇う", "ころしやをやとう"],
    ["やり直しがきく", "やりなおしがきく"],
    ["大会社の社長", "だいがいしゃのしゃちょう"],
    ["浸かり湯につかる", "つかりゆにつかる"],
    ["戸締まりを確認する", "とじまりをかくにんする"],
  ])("複合語が壊れない: %s → %s", (text, expected) => {
    expect(kanaOf(reader, text)).toBe(expected);
  });

  test("ユーザー辞書なしでも動く", () => {
    const bare = Reader.from_zstd(new Uint8Array(dictZst));
    expect(kanaOf(bare, "花火")).toBe("はなび");
  });

  test("不正なCSVは Err としてJS例外になる", () => {
    expect(() => Reader.from_zstd(new Uint8Array(dictZst), "garbage,row\n")).toThrow();
  });
});
