import { describe, expect, it } from "vitest";
import {
  credentialLine,
  guideByline,
  guideBylineText,
  guideRobots,
  hubRobots,
  listRobots,
  metaDescription,
  personRole,
  updatedLabel,
} from "./hubs";
import { INDEX, NOINDEX_FOLLOW } from "./seo";
import { articleJsonLd, collectionPageJsonLd, profilePageJsonLd } from "./jsonld-hubs";
import { routes } from "./config";
import type { GuideDetail, PersonProfile } from "./types";

const SITE = "https://dadrosebook.com";
const author: PersonProfile = {
  id: 1,
  name: "دکتر مهدی شکری",
  slug: "مهدی-شکری",
  job_title: "عضو هیئت علمی",
  affiliation: "دانشگاه تهران",
  photo: null,
};
const reviewer: PersonProfile = { id: 2, name: "وکیل الف", slug: "وکیل-الف", job_title: "", affiliation: "", photo: null };

describe("indexability guardrail → robots (ب۷)", () => {
  it("only an explicit server verdict makes a hub indexable", () => {
    expect(hubRobots(true)).toBe(INDEX);
    expect(hubRobots(false)).toBe(NOINDEX_FOLLOW);
    expect(hubRobots(undefined)).toBe(NOINDEX_FOLLOW);
    expect(hubRobots(null)).toBe(NOINDEX_FOLLOW);
  });
  it("thin hubs keep links followable", () => {
    expect(NOINDEX_FOLLOW).toEqual({ index: false, follow: true });
  });
  it("draft guides and expired lists are never indexed", () => {
    expect(guideRobots({ is_published: true, indexable: true })).toBe(INDEX);
    expect(guideRobots({ is_published: false, indexable: true })).toBe(NOINDEX_FOLLOW);
    expect(listRobots({ is_expired: false, indexable: true })).toBe(INDEX);
    expect(listRobots({ is_expired: true, indexable: true })).toBe(NOINDEX_FOLLOW);
    expect(listRobots({ is_expired: false, indexable: false })).toBe(NOINDEX_FOLLOW);
  });
});

describe("hub helpers", () => {
  it("meta description from the intro, cut at a word boundary", () => {
    expect(metaDescription("", "پیش‌فرض")).toBe("پیش‌فرض");
    expect(metaDescription("<p>کوتاه</p>", "x")).toBe("کوتاه");
    const long = `<p>${"کلمه ".repeat(60)}</p>`;
    const d = metaDescription(long, "x");
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("کلمه…")).toBe(true);
  });
  it("credentials and roles", () => {
    expect(credentialLine(author)).toBe("عضو هیئت علمی، دانشگاه تهران");
    expect(credentialLine(reviewer)).toBe("");
    expect(credentialLine(null)).toBe("");
    expect(personRole(3, 0)).toBe("نویسنده");
    expect(personRole(0, 2)).toBe("مترجم");
    expect(personRole(1, 1)).toBe("نویسنده و مترجم");
  });
  it("guide byline «نوشته … · بازبینی …»", () => {
    expect(guideBylineText({ author, reviewer })).toBe("نوشته دکتر مهدی شکری · بازبینی وکیل الف");
    expect(guideByline({ author: null, reviewer }).map((p) => p.label)).toEqual(["بازبینی"]);
    expect(guideBylineText({ author: null, reviewer: null })).toBe("");
  });
  it("updated label in Jalali", () => {
    expect(updatedLabel("2026-10-05")).toBe("به‌روزشده در ۱۳ مهر ۱۴۰۵");
    expect(updatedLabel("2026-10-05T08:00:00Z")).toBe("به‌روزشده در ۱۳ مهر ۱۴۰۵");
    expect(updatedLabel(null)).toBe("");
    expect(updatedLabel("bad")).toBe("");
  });
  it("hub routes percent-encode Persian slugs", () => {
    expect(routes.exam("کانون-وکلا")).toBe(`/exam/${encodeURIComponent("کانون-وکلا")}`);
    expect(routes.subject("حقوق-مدنی")).toMatch(/^\/subject\/%/);
    expect(routes.examSelect).toBe("/exam/select");
  });
});

describe("hub JSON-LD", () => {
  const books = [
    { title: "مدنی ۱", slug: "مدنی-1" },
    { title: "مدنی ۲", slug: "مدنی-2" },
  ];

  it("CollectionPage with an ItemList of product URLs", () => {
    const ld = collectionPageJsonLd({ site: SITE, path: "/exam/x", name: "منابع", description: "d", books, dateModified: "2026-10-01T00:00:00Z" });
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.url).toBe(`${SITE}/exam/x`);
    const list = ld.mainEntity as { itemListElement: { position: number; url: string }[] };
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(list.itemListElement[0]!.url).toBe(`${SITE}${routes.product("مدنی-1")}`);
    expect(collectionPageJsonLd({ site: SITE, path: "/x", name: "n", description: "", books: [] })).not.toHaveProperty("mainEntity");
  });

  it("ProfilePage › Person with jobTitle, affiliation and sameAs", () => {
    const ld = profilePageJsonLd({ site: SITE, person: author, bio: "<p>زندگی‌نامه</p>", sameAs: ["https://ut.ac.ir/x"], books });
    expect(ld["@type"]).toBe("ProfilePage");
    const person = ld.mainEntity as Record<string, unknown>;
    expect(person["@type"]).toBe("Person");
    expect(person.jobTitle).toBe("عضو هیئت علمی");
    expect(person.affiliation).toEqual({ "@type": "Organization", name: "دانشگاه تهران" });
    expect(person.sameAs).toEqual(["https://ut.ac.ir/x"]);
    expect(person.description).toBe("زندگی‌نامه");
    expect(person.url).toBe(`${SITE}${routes.author(author.slug)}`);
    const bare = profilePageJsonLd({ site: SITE, person: reviewer, bio: "", sameAs: [], books: [] }).mainEntity as Record<string, unknown>;
    expect(bare).not.toHaveProperty("jobTitle");
    expect(bare).not.toHaveProperty("sameAs");
  });

  it("Article with author → Person page and dateModified", () => {
    const guide: GuideDetail = {
      id: 1,
      title: "بهترین منابع آزمون وکالت",
      slug: "بهترین-منابع",
      summary: "خلاصه",
      updated_on: "2026-10-01",
      author,
      reviewer,
      intro: "",
      body: "<p>متن</p>",
      published_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
      is_published: true,
      indexable: true,
      exam_types: [{ id: 1, name: "کانون وکلا", slug: "کانون-وکلا", short_name: "کانون" }],
      subjects: [],
      books: [],
    };
    const ld = articleJsonLd(SITE, guide);
    expect(ld["@type"]).toBe("Article");
    expect(ld.headline).toBe(guide.title);
    expect(ld.dateModified).toBe("2026-10-01");
    expect(ld.datePublished).toBe("2026-09-01T00:00:00Z");
    expect((ld.author as Record<string, unknown>).url).toBe(`${SITE}${routes.author(author.slug)}`);
    expect((ld.editor as Record<string, unknown>).name).toBe("وکیل الف");
    expect(ld.about).toEqual(["کانون وکلا"]);
    const anonymous = articleJsonLd(SITE, { ...guide, author: null, reviewer: null, exam_types: [] });
    expect(anonymous.author).toEqual({ "@type": "Organization", name: "کتاب دادرُز" });
    expect(anonymous).not.toHaveProperty("editor");
    expect(anonymous).not.toHaveProperty("about");
  });
});
