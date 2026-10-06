import { describe, expect, it } from "vitest";
import {
  aadFor,
  createOfflineStore,
  decodePayload,
  encodePayload,
  isExpired,
  loadOrCreateKey,
  memoryAdapter,
  needsRenewal,
  webCryptoCipher,
  type StoredLicense,
} from "./offline-store";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-05T12:00:00Z");
const license = (days: number, id = 5): StoredLicense => ({
  id,
  book: "epub-sample",
  title: "قانون مدنی",
  expires_at: new Date(NOW + days * DAY).toISOString(),
});

describe("expiry", () => {
  it("isExpired: past, future, unparseable", () => {
    expect(isExpired(new Date(NOW - 1).toISOString(), NOW)).toBe(true);
    expect(isExpired(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(isExpired(new Date(NOW + 1000).toISOString(), NOW)).toBe(false);
    expect(isExpired("not a date", NOW)).toBe(true);
  });

  it("needsRenewal: fewer than 3 days left, but not expired", () => {
    expect(needsRenewal(license(14).expires_at, NOW)).toBe(false);
    expect(needsRenewal(license(3.5).expires_at, NOW)).toBe(false);
    expect(needsRenewal(license(2.9).expires_at, NOW)).toBe(true);
    expect(needsRenewal(license(-1).expires_at, NOW)).toBe(false);
    expect(needsRenewal("garbage", NOW)).toBe(false);
  });
});

describe("serialization", () => {
  it("round-trips a versioned payload", () => {
    const payload = { book: { title: "کتاب" }, list: [1, 2, 3], text: "ی‌ک ۱۲" };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it("rejects other versions and garbage", () => {
    expect(decodePayload(new TextEncoder().encode(JSON.stringify({ v: 99, payload: {} })))).toBeNull();
    expect(decodePayload(new TextEncoder().encode("{not json"))).toBeNull();
    expect(decodePayload(new TextEncoder().encode("[]"))).toBeNull();
  });

  it("binds additional data to store and slug", () => {
    expect(new TextDecoder().decode(aadFor("books", "a"))).not.toBe(new TextDecoder().decode(aadFor("books", "b")));
    expect(new TextDecoder().decode(aadFor("state", "a"))).not.toBe(new TextDecoder().decode(aadFor("books", "a")));
  });
});

describe("encrypted store (memory adapter, real WebCrypto)", () => {
  it("creates one non-extractable key and reuses it", async () => {
    const kv = memoryAdapter();
    const a = await loadOrCreateKey(kv);
    const b = await loadOrCreateKey(kv);
    expect(a).toBe(b);
    expect(a.extractable).toBe(false);
    expect(a.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    await expect(crypto.subtle.exportKey("raw", a)).rejects.toBeTruthy();
  });

  it("saves ciphertext only and loads it back", async () => {
    const kv = memoryAdapter();
    const store = createOfflineStore(kv);
    const payload = { book: { title: "قانون مدنی در نظم کنونی" }, chapters: ["ماده ۱۸۳ – عقد عبارت است از…"] };
    await store.savePackage("epub-sample", license(14), payload, NOW);
    const raw = JSON.stringify([...kv.dump().values()].map(String));
    expect(raw).not.toContain("ماده");
    const rec = (await kv.get<{ data: ArrayBuffer }>("books", "epub-sample"))!;
    expect(new TextDecoder().decode(rec.data)).not.toContain("ماده");
    const loaded = await store.loadPackage<typeof payload>("epub-sample", NOW);
    expect(loaded?.payload).toEqual(payload);
    expect(loaded?.license.id).toBe(5);
    expect((await store.listPackages(NOW)).map((m) => m.slug)).toEqual(["epub-sample"]);
  });

  it("deletes expired copies on load and list", async () => {
    const kv = memoryAdapter();
    const store = createOfflineStore(kv);
    await store.savePackage("old", { ...license(1), book: "old" }, { x: 1 }, NOW);
    await store.savePackage("new", { ...license(10), book: "new" }, { x: 2 }, NOW);
    const later = NOW + 2 * DAY;
    expect((await store.listPackages(later)).map((m) => m.slug)).toEqual(["new"]);
    expect(await kv.get("books", "old")).toBeUndefined();
    await store.savePackage("old", { ...license(1), book: "old" }, { x: 1 }, NOW);
    expect(await store.loadPackage("old", later)).toBeNull();
    expect(await kv.get("books", "old")).toBeUndefined();
  });

  it("refuses a record moved to another slug or tampered with", async () => {
    const kv = memoryAdapter();
    const store = createOfflineStore(kv);
    await store.savePackage("a", { ...license(5), book: "a" }, { secret: 1 }, NOW);
    const rec = await kv.get<Record<string, unknown>>("books", "a");
    await kv.put("books", "b", { ...rec, slug: "b" });
    expect(await store.loadPackage("b", NOW)).toBeNull();
    const bytes = new Uint8Array((rec!.data as ArrayBuffer).slice(0));
    bytes[0] = bytes[0]! ^ 0xff;
    await kv.put("books", "a", { ...rec, data: bytes.buffer });
    expect(await store.loadPackage("a", NOW)).toBeNull();
    expect(await kv.get("books", "a")).toBeUndefined();
  });

  it("another browser's key cannot read the copy", async () => {
    const kv = memoryAdapter();
    await createOfflineStore(kv).savePackage("a", { ...license(5), book: "a" }, { secret: 1 }, NOW);
    const other = memoryAdapter();
    await other.put("books", "a", await kv.get("books", "a"));
    expect(await createOfflineStore(other, webCryptoCipher(other)).loadPackage("a", NOW)).toBeNull();
  });

  it("updates the license, deletes package + state, keeps the queue", async () => {
    const kv = memoryAdapter();
    const store = createOfflineStore(kv);
    await store.savePackage("a", { ...license(5), book: "a" }, { x: 1 }, NOW);
    await store.updateLicense("a", { ...license(14, 7), book: "a" });
    expect((await store.getMeta("a", NOW))?.license.id).toBe(7);
    await store.writeDoc("state", "a", { progress: null });
    await store.writeDoc("queue", "a", [{ kind: "copy", chars: 3 }]);
    expect(await store.readDoc("state", "a")).toEqual({ progress: null });
    await store.deletePackage("a");
    expect(await store.getMeta("a", NOW)).toBeNull();
    expect(await store.readDoc("state", "a")).toBeNull();
    expect(await store.readDoc("queue", "a")).toEqual([{ kind: "copy", chars: 3 }]);
  });

  it("documents are bound to their store", async () => {
    const kv = memoryAdapter();
    const store = createOfflineStore(kv);
    await store.writeDoc("state", "a", { ok: 1 });
    await kv.put("queue", "a", await kv.get("state", "a"));
    expect(await store.readDoc("queue", "a")).toBeNull();
  });
});
