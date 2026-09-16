#!/usr/bin/env bun
/**
 * 保存済みのお題（`prompts.text` と `reading_kana`）を読み Worker に流し、
 * 既存の読み（Yahoo）との一致率と不一致の型を出す。#174 の Go/No-Go の判断材料。
 *
 * 入力は `wrangler d1 execute ... --json` の results を JSON 配列で保存したもの
 * （`[{ id, form, text, reading_kana }]`）。読み Worker は `wrangler dev` で起動しておく。
 *
 * 使い方: `bun run scripts/compare-readings.ts prompts.json http://localhost:8790`
 */
const [, , file, base = "http://localhost:8790"] = process.argv;
if (file === undefined)
  throw new Error("使い方: compare-readings.ts <prompts.json> [reading Worker の URL]");

type Row = { id: string; form: string; text: string; reading_kana: string };
type Result = { kana: string } | { error: "UNKNOWN_READING"; surface: string };

const rows: Row[] = await Bun.file(file).json();
const BATCH = 30;

const mismatches: { form: string; text: string; yahoo: string; vibrato: string }[] = [];
const unknown: { form: string; text: string; surface: string }[] = [];
let matched = 0;
let elapsedMs = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const t0 = performance.now();
  // 1バッチずつ送る。並列にすると往復時間が測れず、Worker 側も1アイソレートに集中しない
  // oxlint-disable-next-line no-await-in-loop
  const response = await fetch(`${base}/readings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts: batch.map((row) => row.text) }),
  });
  elapsedMs += performance.now() - t0;
  // oxlint-disable-next-line no-await-in-loop
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  // oxlint-disable-next-line no-await-in-loop
  const { results } = (await response.json()) as { results: Result[] };
  for (const [j, row] of batch.entries()) {
    const result = results[j];
    if (result === undefined) throw new Error("件数が合わない");
    if ("error" in result) {
      unknown.push({ form: row.form, text: row.text, surface: result.surface });
    } else if (result.kana === row.reading_kana) {
      matched++;
    } else {
      mismatches.push({
        form: row.form,
        text: row.text,
        yahoo: row.reading_kana,
        vibrato: result.kana,
      });
    }
  }
}

const byForm = (items: { form: string }[]) =>
  Object.entries(Object.groupBy(items, (item) => item.form))
    .map(([form, list]) => `${form}=${list?.length ?? 0}`)
    .join(" ");

console.log(`件数 ${rows.length}（${byForm(rows)}）`);
console.log(`一致 ${matched}（${((matched / rows.length) * 100).toFixed(1)}%）`);
console.log(`不一致 ${mismatches.length}（${byForm(mismatches)}）`);
console.log(`読み不明 ${unknown.length}（${byForm(unknown)}）`);
console.log(`往復 ${(elapsedMs / Math.ceil(rows.length / BATCH)).toFixed(0)}ms/${BATCH}件`);

const out = file.replace(/\.json$/, "") + ".diff.json";
await Bun.write(out, JSON.stringify({ mismatches, unknown }, null, 2));
console.log(`不一致の一覧: ${out}`);
