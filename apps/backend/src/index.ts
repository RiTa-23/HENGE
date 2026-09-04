import { ping } from "@henge/shared";
import { Hono } from "hono";

/**
 * Hono Worker。外部には公開しない。
 * Next.js Worker から Service Bindings（HTTP方式）経由でのみ呼ばれる。
 */
const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    service: "henge-backend",
    shared: ping("backend"),
    ok: true,
  }));

export default app;
