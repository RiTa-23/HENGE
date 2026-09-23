import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `/api/admin/*` の認可は「**リソースの照会より前に判定する**」ことで成立している。
 * 非管理者が照会に到達しないから、応答が実在の有無に依存せず、
 * 「存在するが権限が無い」と「そもそも存在しない」を区別させずに済む
 * （docs/04-api.md のエラーレスポンス節）。
 *
 * 危ないのは、新しい管理APIを足すときにガードを書き忘れる／Honoを呼んだ後に
 * 判定を置くこと。どちらも単体テストでは捕まらず、手で叩くと管理者では正常に
 * 動いてしまう。ここではルートの構造だけを機械的に検査する。
 */

const ADMIN_API_DIR = join(import.meta.dir, "../../app/api/admin");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("/api/admin/* のルート構造", () => {
  const files = routeFiles(ADMIN_API_DIR);

  it("管理APIのルートが検出できている", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // 認可ガードはどちらかを通す。機械アクセスを許すルート（辞書リポの
  // ワークフローが来るもの）は forbidNonSyncOrAdmin で、Bearer トークンか
  // 管理セッションのどちらかで通る。どちらも判定自体はNext.js側で完結する
  const GUARD = /await forbid(?:NonSyncOrAdmin|NonAdmin)\(request\)/;

  it.each(files)("%s は forbidNonAdmin / forbidNonSyncOrAdmin を通している", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(GUARD);
  });

  it.each(files)("%s は Hono を呼ぶ前に認可を判定している", (file) => {
    const source = readFileSync(file, "utf8");
    const guard = source.search(GUARD);
    const callBackend = source.indexOf("await backendClient()");

    expect(guard).toBeGreaterThanOrEqual(0);
    // Hono を呼ばないルート（check のような判定プローブ）に順序の検査は
    // 適用しない。ガード自体は上のテストで全ルートに要求している
    if (callBackend === -1) return;
    expect(callBackend).toBeGreaterThan(guard);
  });
});
