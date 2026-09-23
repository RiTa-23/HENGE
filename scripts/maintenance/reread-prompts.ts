/**
 * 既存お題を新しいユーザー辞書で再読みして、読みが変わった行の
 * reading_kana / reading_roman_json / keystroke_count を更新するメンテナンスバッチ。
 *
 * 背景: prompts.reading_kana は生成時点で凍結される。unidic-cwj-trim 側の
 * user-lex.csv を更新しても既存お題には反映されないので、辞書変更のたびに
 * このスクリプトで差分更新をかける。
 *
 * 使い方（リポジトリルートから）:
 *   1. 読みWorkerを起動: bun run --cwd apps/reading dev --port 8787
 *   2. dry-run（差分レポートのみ）:
 *        bun scripts/maintenance/reread-prompts.ts --local --out /tmp/reread
 *   3. 適用:
 *        bun scripts/maintenance/reread-prompts.ts --local --apply --out /tmp/reread
 *   本番に適用する場合は --local を --remote に変える。
 *   --remote は wrangler の認証（CLOUDFLARE_API_TOKEN か wrangler login）が必要。
 *
 * オプション:
 *   --local / --remote   D1の参照先（どちらか必須。既定なし=誤爆防止）
 *   --apply              省略時はdry-run（差分TSVとSQLファイルを出すだけ）
 *   --worker-url URL     読みWorker（既定 http://localhost:8787）
 *   --db NAME            D1名（既定 henge-db）
 *   --out DIR            レポート・SQLの出力先（既定 /tmp/reread-prompts）
 *   --batch-size N       読みWorkerへの1リクエスト件数（既定40=MAX_TEXTS）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildRomanCandidates, countKeystrokes } from "../../packages/shared/src/index";

const args = process.argv.slice(2);
function flag(name: string) {
  return args.includes(`--${name}`);
}
function opt(name: string, fallback: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const local = flag("local");
const remote = flag("remote");
if (local === remote) {
  console.error("--local か --remote のどちらか片方を指定してください");
  process.exit(1);
}
const apply = flag("apply");
const workerUrl = opt("worker-url", "http://localhost:8787");
const db = opt("db", "henge-db");
const outDir = opt("out", "/tmp/reread-prompts");
const batchSize = Number(opt("batch-size", "40"));
// apps/backend/package.json の dev スクリプトと揃える
const persistTo = "../../.wrangler/state";

const WRANGLER = new URL("../../node_modules/.bin/wrangler", import.meta.url).pathname;
// wrangler は apps/backend の wrangler.jsonc（DBバインディング定義）を読ませるため cwd を固定
const WRANGLER_CWD = new URL("../../apps/backend", import.meta.url).pathname;

interface PromptRow {
  id: string;
  text: string;
  reading_kana: string;
}

function d1Execute(extraArgs: string[]): string {
  const res = spawnSync(
    WRANGLER,
    [
      "d1",
      "execute",
      db,
      local ? "--local" : "--remote",
      ...(local ? ["--persist-to", persistTo] : []),
      ...extraArgs,
      "--json",
    ],
    { cwd: WRANGLER_CWD, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0 || res.error) {
    throw new Error(`wrangler d1 execute failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

/** `wrangler d1 execute --command ... --json` の1ページ分を取る */
function query(sql: string): PromptRow[] {
  const parsed = JSON.parse(d1Execute(["--command", sql])) as [
    { results?: PromptRow[]; success: boolean },
  ];
  return parsed[0]?.results ?? [];
}

async function readKana(texts: string[]): Promise<string[]> {
  const res = await fetch(`${workerUrl}/readings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`readings failed: ${res.status}`);
  const body = (await res.json()) as {
    results: { kana?: string; error?: string; surface?: string }[];
  };
  return body.results.map((r) => r.kana ?? `<ERR:${r.error}>`);
}

function sqlEscape(s: string) {
  return `'${s.replaceAll("'", "''")}'`;
}

mkdirSync(outDir, { recursive: true });

// wrangler の --json 出力が巨大化するので LIMIT/OFFSET でページ分割する
const PAGE = 1000;
const changedSql: string[] = [];
const reportLines: string[] = ["id\ttext\told_kana\tnew_kana"];
let fetched = 0;
let changed = 0;
let errors = 0;

for (let offset = 0; ; offset += PAGE) {
  const rows = query(
    `SELECT id, text, reading_kana FROM prompts ORDER BY rowid LIMIT ${PAGE} OFFSET ${offset}`,
  );
  if (rows.length === 0) break;
  fetched += rows.length;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const kanas = await readKana(chunk.map((r) => r.text));
    for (const [j, row] of chunk.entries()) {
      const newKana = kanas[j];
      if (newKana.startsWith("<ERR:")) {
        errors++;
        continue;
      }
      if (newKana !== row.reading_kana) {
        changed++;
        const roman = buildRomanCandidates(newKana);
        changedSql.push(
          `UPDATE prompts SET reading_kana = ${sqlEscape(newKana)},` +
            ` reading_roman_json = ${sqlEscape(JSON.stringify(roman))},` +
            ` keystroke_count = ${countKeystrokes(roman)}` +
            ` WHERE id = ${sqlEscape(row.id)};`,
        );
        reportLines.push(`${row.id}\t${row.text}\t${row.reading_kana}\t${newKana}`);
      }
    }
  }
  console.log(`progress: ${fetched} 走査 / ${changed} 件差分 / ${errors} 件エラー`);
  if (rows.length < PAGE) break;
}

writeFileSync(`${outDir}/changes.tsv`, reportLines.join("\n") + "\n");
writeFileSync(`${outDir}/updates.sql`, changedSql.join("\n") + "\n");
console.log(
  `完了: ${fetched}件走査, ${changed}件差分 → ${outDir}/changes.tsv + updates.sql` +
    (errors ? ` （エラー${errors}件はスキップ）` : ""),
);

if (apply && changed > 0) {
  d1Execute(["--file", `${outDir}/updates.sql`]);
  console.log(`適用完了: ${changed}件 UPDATE`);
}
