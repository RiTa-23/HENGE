import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** D1へのアクセスは Hono Worker に閉じる。Next.js Worker から直接触らない。 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
