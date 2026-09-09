#!/usr/bin/env bun
import { KEYSTROKE_MAX, KEYSTROKE_MIN } from "@henge/shared";
import { planRebuild, type StoredPrompt, updateStatement } from "./rebuild-roman-plan";

/**
 * `packages/shared/src/typing/table.ts` を変えたあと、保存済みのお題の
 * `reading_roman_json` と `keystroke_count` を作り直す。
 *
 * **ローマ字候補は生成時に計算してD1へ焼き込んでいる**ため、テーブルに打ち方を
 * 足しても既存のお題には遡及しない（docs/06-typing-engine.md）。これがその埋め合わせ。
 *
 * **読み仮名はD1にあるので、Yahoo APIは叩かない。** `buildRomanCandidates` は
 * 純粋関数なので、全部ローカルで完結する。
 *
 * 使い方（リポジトリのルートから）:
 *   bun run rebuild:roman                    ローカルD1を確認するだけ
 *   bun run rebuild:roman -- --remote        本番を確認するだけ
 *   bun run rebuild:roman -- --remote --apply  本番に書き込む
 */

/** 一度に読む行数。**全件を1レスポンスで受けない。**大きすぎるとD1の30秒に当たる */
const PAGE_SIZE = 2000;
/** 1回の wrangler 実行に入れる UPDATE 文の数 */
const WRITE_CHUNK = 500;
/**
 * これを超える書き込みは `--force` なしでは進まない。
 *
 * **D1の書き込みは1日10万行で、使い切るとその日はD1へのクエリが全部落ちる。**
 * 保守用のスクリプトでサービスを止めないための歯止め。
 */
const CONFIRM_THRESHOLD = 5000;

type Options = { remote: boolean; apply: boolean; force: boolean; limit: number };

function parseArgs(argv: readonly string[]): Options {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    remote: argv.includes("--remote"),
    apply: argv.includes("--apply"),
    force: argv.includes("--force"),
    limit: limitArg === undefined ? Number.POSITIVE_INFINITY : Number(limitArg.slice(8)),
  };
}

/** wrangler を叩いて、`--json` の出力を読む */
async function d1(remote: boolean, args: readonly string[]): Promise<unknown> {
  // **ローカルは --persist-to を合わせる。** 既定では apps/backend/.wrangler/state が
  // 使われ、dev や db:migrate:local が見ているDB（リポジトリ直下）と別物になる
  const target = remote ? ["--remote"] : ["--local", "--persist-to", "../../.wrangler/state"];
  const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", "henge-db", ...target, ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`wrangler が失敗した (${code})\n${err}\n${out}`);
  // 警告が先に出ることがあるので、最初の JSON 配列から読む
  const start = out.indexOf("[");
  if (start < 0) throw new Error(`wrangler の出力に JSON が無い\n${out}`);
  return JSON.parse(out.slice(start));
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  const first = Array.isArray(payload) ? payload[0] : undefined;
  const results = (first as { results?: unknown } | undefined)?.results;
  return Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
}

/**
 * IDの昇順に区切って読む。**OFFSET を使わない。**
 * OFFSET は毎回そこまで走査するので、後ろのページほど読み取り行数が膨らむ。
 */
async function readAll(options: Options): Promise<StoredPrompt[]> {
  const all: StoredPrompt[] = [];
  let after = "";
  for (;;) {
    const take = Math.min(PAGE_SIZE, options.limit - all.length);
    if (take <= 0) break;
    const sql =
      `SELECT id, reading_kana, reading_roman_json, keystroke_count FROM prompts ` +
      `WHERE id > '${after.replaceAll("'", "''")}' ORDER BY id LIMIT ${take};`;
    // 次のページの開始位置が前のページの結果に依るので、並列にはできない
    // oxlint-disable-next-line no-await-in-loop
    const rows = rowsOf(await d1(options.remote, ["--json", "--command", sql]));
    for (const row of rows) {
      all.push({
        id: String(row["id"]),
        readingKana: String(row["reading_kana"]),
        readingRomanJson: String(row["reading_roman_json"]),
        keystrokeCount: Number(row["keystroke_count"]),
      });
    }
    if (rows.length < take) break;
    after = all[all.length - 1]?.id ?? "";
    process.stdout.write(`\r読み込み中… ${all.length} 件`);
  }
  if (all.length > PAGE_SIZE) process.stdout.write("\n");
  return all;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const where = options.remote ? "本番" : "ローカル";
  console.log(`${where}のD1を読み、いまの table.ts で作り直した結果と比べる`);

  const rows = await readAll(options);
  const plan = planRebuild(rows);

  console.log(`\n見た行: ${plan.scanned}  一致: ${plan.unchanged}  要更新: ${plan.changed.length}`);

  for (const row of plan.changed.slice(0, 40)) {
    const before = JSON.parse(
      rows.find((r) => r.id === row.id)?.readingRomanJson ?? "[]",
    ) as string[][];
    const after = JSON.parse(row.readingRomanJson) as string[][];
    console.log(
      `  ${row.readingKana}\n` +
        `    旧: ${before.map((u) => u[0]).join("|")} (${row.previousKeystrokeCount}打)\n` +
        `    新: ${after.map((u) => u[0]).join("|")} (${row.keystrokeCount}打)` +
        (row.outOfRange ? `  ← ${KEYSTROKE_MIN}〜${KEYSTROKE_MAX}打の範囲外` : ""),
    );
  }
  if (plan.changed.length > 40) console.log(`  …ほか ${plan.changed.length - 40} 件`);

  const outOfRange = plan.changed.filter((r) => r.outOfRange);
  if (outOfRange.length > 0) {
    console.log(
      `\n打鍵数が範囲外になる行が ${outOfRange.length} 件ある。` +
        `**値は書き換えるが、消しはしない。**残すか消すかは人が決める:`,
    );
    for (const row of outOfRange)
      console.log(`  ${row.id}  ${row.readingKana}  ${row.keystrokeCount}打`);
  }

  if (plan.unsupported.length > 0) {
    console.log(
      `\nテーブルに無いかなを含む行が ${plan.unsupported.length} 件ある。` +
        `**書き換えない。**打てないお題なので、消すかどうかは人が決める:`,
    );
    for (const row of plan.unsupported) {
      console.log(`  ${row.id}  ${row.readingKana}  ← 「${row.missingKana}」がテーブルに無い`);
    }
  }

  if (plan.changed.length === 0) {
    console.log("\n書き換える行は無い。");
    return;
  }
  if (!options.apply) {
    console.log(`\n（下見のみ。実際に書くには --apply を付ける）`);
    return;
  }
  if (plan.changed.length > CONFIRM_THRESHOLD && !options.force) {
    console.error(
      `\n${plan.changed.length} 行の書き込みは多すぎる（目安 ${CONFIRM_THRESHOLD} 行）。\n` +
        `D1の書き込みは1日10万行で、使い切るとその日はD1へのクエリが全部落ちる。\n` +
        `--limit= で分けて流すか、残り枠を wrangler d1 info で確かめてから --force を付ける。`,
    );
    process.exit(1);
  }

  for (let i = 0; i < plan.changed.length; i += WRITE_CHUNK) {
    const chunk = plan.changed.slice(i, i + WRITE_CHUNK);
    const file = `${process.env["TMPDIR"] ?? "/tmp"}/henge-rebuild-${i}.sql`;
    // **並列に投げない。** D1は1つずつしか処理しないうえ、まとめて叩くと
    // 書き込み速度が跳ねて、上限に当たったときの被害が読めなくなる
    // oxlint-disable-next-line no-await-in-loop
    await Bun.write(file, chunk.map(updateStatement).join("\n"));
    // oxlint-disable-next-line no-await-in-loop
    await d1(options.remote, ["--file", file]);
    console.log(
      `書き込み ${Math.min(i + WRITE_CHUNK, plan.changed.length)} / ${plan.changed.length}`,
    );
  }
  console.log("完了。");
}

// テストからは計画部分（rebuild-roman-plan.ts）だけを読むので、ここは直接実行時のみ
if (import.meta.main) {
  await main();
}
