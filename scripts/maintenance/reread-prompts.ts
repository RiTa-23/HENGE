/**
 * 既存お題を新しいユーザー辞書で再読みして、読みが変わった行の
 * reading_kana / reading_roman_json / keystroke_count を更新するメンテナンスバッチ。
 *
 * 背景: prompts.reading_kana は生成時点で凍結される。unidic-cwj-trim 側の
 * user-lex.csv を更新しても既存お題には反映されないので、辞書変更のたびに
 * このスクリプトで差分更新をかける。
 *
 * **読みは生成時と同じ入口（`createGetReadings()`）から取る**（不変条件8）。
 * 読み Worker を直接叩くと、打鍵テーブル外のかなを弾く処理などを二重に持つことになる。
 * 新しい読みは**生成時と同じ基準で検査し、外れたら更新しない**（打鍵数の範囲・
 * 最適化の字を含むか）。辞書の更新で読みが伸びて範囲を外れたお題を、黙って書き換えない。
 *
 * 使い方（リポジトリルートから）:
 *   1. 読みWorkerを起動: bun run --cwd apps/reading dev（ポート 8788）
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
 *   --worker-url URL     読みWorker（既定 http://localhost:8788。apps/reading の dev と同じ）
 *   --db NAME            D1名（既定 henge-db）
 *   --out DIR            レポート・SQLの出力先（既定 /tmp/reread-prompts）
 *   --batch-size N       読みWorkerへの1リクエスト件数（既定40=MAX_TEXTS）
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  countKeystrokes,
  includesConstraint,
  isKeystrokeCountInRange,
  type PromptForm,
} from "../../packages/shared/src/index";
import { createGetReadings } from "../../apps/backend/src/reading/index";

const { values: options } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    "worker-url": { type: "string", default: "http://localhost:8788" },
    db: { type: "string", default: "henge-db" },
    out: { type: "string", default: "/tmp/reread-prompts" },
    "batch-size": { type: "string", default: "40" },
  },
});

if (options.local === options.remote) {
  console.error("--local か --remote のどちらか片方を指定してください");
  process.exit(1);
}
const workerUrl = options["worker-url"];
const outDir = options.out;
const batchSize = Number(options["batch-size"]);
// apps/backend/package.json の dev スクリプトと揃える
const persistTo = "../../.wrangler/state";

// **`URL#pathname` を使わない。** パスに日本語などが入ると %E3… のまま残り、別の場所を指す
const WRANGLER = fileURLToPath(new URL("../../node_modules/.bin/wrangler", import.meta.url));
// wrangler は apps/backend の wrangler.jsonc（DBバインディング定義）を読ませるため cwd を固定
const WRANGLER_CWD = fileURLToPath(new URL("../../apps/backend", import.meta.url));

/**
 * 読み Worker を Service Binding の代わりに HTTP で呼ぶ。本番の Hono と同じ
 * `createGetReadings()` に渡すので、ホスト名を差し替えるだけでパスはそのまま使う
 */
const READING = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return fetch(new URL(url.pathname + url.search, workerUrl), init);
  },
};
const getReadings = createGetReadings({ READING } as unknown as Env);

interface PromptRow {
  id: string;
  text: string;
  reading_kana: string;
  form: PromptForm;
  kind: "theme" | "constraint";
  theme_name: string;
}

function d1Execute(extraArgs: string[]): string {
  const res = spawnSync(
    WRANGLER,
    [
      "d1",
      "execute",
      options.db,
      options.local ? "--local" : "--remote",
      ...(options.local ? ["--persist-to", persistTo] : []),
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

function sqlEscape(s: string) {
  return `'${s.replaceAll("'", "''")}'`;
}

/** 新しい読みを生成時と同じ基準で検査する。通れば null、外れたら理由 */
function rejection(row: PromptRow, keystrokeCount: number, kana: string): string | null {
  if (!isKeystrokeCountInRange(keystrokeCount, row.form))
    return `打鍵数が範囲外(${keystrokeCount})`;
  if (row.kind === "constraint" && !includesConstraint(kana, row.theme_name)) {
    return `「${row.theme_name}」を含まなくなる`;
  }
  return null;
}

mkdirSync(outDir, { recursive: true });

// wrangler の --json 出力が巨大化するので LIMIT/OFFSET でページ分割する
const PAGE = 1000;
const changedSql: string[] = [];
const reportLines: string[] = ["id\ttext\told_kana\tnew_kana"];
const skippedLines: string[] = ["id\ttext\told_kana\tnew_kana\treason"];
let fetched = 0;

for (let offset = 0; ; offset += PAGE) {
  const rows = query(
    "SELECT p.id, p.text, p.reading_kana, p.form, t.kind, t.name AS theme_name" +
      " FROM prompts p JOIN themes t ON t.id = p.theme_id" +
      ` ORDER BY p.rowid LIMIT ${PAGE} OFFSET ${offset}`,
  );
  if (rows.length === 0) break;
  fetched += rows.length;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    // 読み Worker には1バッチずつ順に送る（ローカルの1プロセスに並列で積まない）
    // oxlint-disable-next-line no-await-in-loop
    const outcomes = await getReadings(chunk.map((row) => row.text));
    for (const [j, row] of chunk.entries()) {
      const outcome = outcomes[j];
      if (outcome === undefined) throw new Error("読み取得の応答と要求がずれている");
      if (!outcome.ok) {
        skippedLines.push(
          `${row.id}\t${row.text}\t${row.reading_kana}\t\t読みが引けない(${outcome.surface})`,
        );
        continue;
      }
      const { kana, roman } = outcome.reading;
      if (kana === row.reading_kana) continue;
      const keystrokeCount = countKeystrokes(roman);
      const reason = rejection(row, keystrokeCount, kana);
      if (reason !== null) {
        skippedLines.push(`${row.id}\t${row.text}\t${row.reading_kana}\t${kana}\t${reason}`);
        continue;
      }
      changedSql.push(
        `UPDATE prompts SET reading_kana = ${sqlEscape(kana)},` +
          ` reading_roman_json = ${sqlEscape(JSON.stringify(roman))},` +
          ` keystroke_count = ${keystrokeCount}` +
          ` WHERE id = ${sqlEscape(row.id)};`,
      );
      reportLines.push(`${row.id}\t${row.text}\t${row.reading_kana}\t${kana}`);
    }
  }
  console.log(
    `progress: ${fetched} 走査 / ${changedSql.length} 件差分 / ${skippedLines.length - 1} 件見送り`,
  );
  if (rows.length < PAGE) break;
}

writeFileSync(`${outDir}/changes.tsv`, reportLines.join("\n") + "\n");
writeFileSync(`${outDir}/skipped.tsv`, skippedLines.join("\n") + "\n");
writeFileSync(`${outDir}/updates.sql`, changedSql.join("\n") + "\n");
console.log(
  `完了: ${fetched}件走査, ${changedSql.length}件差分 → ${outDir}/changes.tsv + updates.sql` +
    (skippedLines.length > 1 ? `（見送り${skippedLines.length - 1}件 → skipped.tsv）` : ""),
);

if (options.apply && changedSql.length > 0) {
  d1Execute(["--file", `${outDir}/updates.sql`]);
  console.log(`適用完了: ${changedSql.length}件 UPDATE`);
}
