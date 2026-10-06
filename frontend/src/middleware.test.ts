import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

beforeAll(() => {
  vi.stubEnv("USE_API_FIXTURES", "1");
});

const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;

async function run(path: string, method = "GET") {
  const { middleware } = await import("./middleware");
  return middleware(new NextRequest(new URL(path, "https://dadrosebook.com"), { method }), event);
}

describe("middleware", () => {
  it("301s a trailing slash to the slash-less page, keeping the query", async () => {
    const res = await run("/product/x/?utm_source=ig");
    expect(res.status).toBe(301);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(
      "/product/x?utm_source=ig",
    );
  });
  it("prefers a Sazito redirect (single hop) over the slash redirect", async () => {
    const res = await run("/products/");
    expect(res.status).toBe(301);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });
  it("passes clean pages, the home page and non-GET requests through", async () => {
    for (const p of ["/product/x", "/", "/category/y?page=2"]) {
      const res = await run(p);
      expect(res.headers.get("location")).toBeNull();
    }
    expect((await run("/kit/", "POST")).headers.get("location")).toBeNull();
  });
});
