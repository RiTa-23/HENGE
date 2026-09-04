import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("GET /health が疎通する", async () => {
  const res = await SELF.fetch("http://backend/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    service: "henge-backend",
    shared: "henge:backend",
    ok: true,
  });
});

it("テスト環境から env を参照できる", () => {
  expect(env).toBeDefined();
});
