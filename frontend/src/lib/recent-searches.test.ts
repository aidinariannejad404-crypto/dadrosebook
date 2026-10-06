import { describe, expect, it } from "vitest";
import {
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  parseRecent,
  pushRecent,
  readRecent,
  rememberSearch,
  removeRecent,
  termKey,
  writeRecent,
} from "./recent-searches";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("recent searches", () => {
  it("keeps newest first, de-duplicates and caps at 5", () => {
    let list: string[] = [];
    for (const t of ["مدنی", "تجارت", "جزا", "ثبت", "داوری", "کیفری"]) list = pushRecent(list, t);
    expect(list).toHaveLength(RECENT_SEARCHES_MAX);
    expect(list[0]).toBe("کیفری");
    expect(list).not.toContain("مدنی");
    list = pushRecent(list, "  جزا  ");
    expect(list[0]).toBe("جزا");
    expect(list.filter((x) => x === "جزا")).toHaveLength(1);
  });

  it("treats Arabic ي/ك, ZWNJ and spacing as the same term", () => {
    expect(termKey("آيين دادرسي")).toBe(termKey("آیین  دادرسی"));
    expect(termKey("می‌خواهم")).toBe(termKey("می خواهم"));
    expect(pushRecent(["كتاب مدني"], "کتاب مدنی")).toEqual(["کتاب مدنی"]);
  });

  it("ignores too-short terms and removes entries", () => {
    expect(pushRecent(["مدنی"], " ا ")).toEqual(["مدنی"]);
    expect(removeRecent(["مدنی", "جزا"], "مدني")).toEqual(["جزا"]);
  });

  it("parses stored data defensively", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["مدنی", 3, "", "مدنی", "جزا"]')).toEqual(["مدنی", "جزا"]);
  });

  it("round-trips through storage and clears the key when empty", () => {
    const store = memoryStore();
    expect(rememberSearch("مدنی", store)).toEqual(["مدنی"]);
    expect(readRecent(store)).toEqual(["مدنی"]);
    writeRecent([], store);
    expect(store.data.has(RECENT_SEARCHES_KEY)).toBe(false);
    expect(readRecent(null)).toEqual([]);
  });
});
