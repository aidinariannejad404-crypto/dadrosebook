export const SITE_NAME = "کتاب دادرُز";
export const SITE_SHORT_NAME = "دادرُز بوک";
export const SITE_DESCRIPTION =
  "فروشگاه تخصصی کتاب‌های حقوقی برای دانشجویان و داوطلبان آزمون وکالت، قضاوت، سردفتری و ارشد؛ نسخه چاپی، الکترونیک و بسته‌های مطالعاتی.";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const COURSE_SITE = "https://dadrose.com";

/**
 * Official social profiles for Organization.sameAs (home JSON-LD). Owner: fill in the real Instagram page
 * and Telegram channel URLs; empty entries are skipped. The store's Telegram support account
 * (StoreSettings.consult_telegram) and COURSE_SITE are added automatically.
 */
export const SOCIAL_PROFILES: readonly string[] = [
  // "https://www.instagram.com/<page>/",
  // "https://t.me/<channel>",
];

/** Append Dadrose referral UTM params to an external course URL. */
export function withCourseUtm(url: string, campaign: "home_course" | "product_course"): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "dadrosebook");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url;
  }
}

/** Internal routes (some arrive in later phases). */
export const routes = {
  home: "/",
  product: (slug: string) => `/product/${encodeURIComponent(slug)}`,
  category: (slug: string) => `/category/${encodeURIComponent(slug)}`,
  search: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `/search?${qs}` : "/search";
  },
  kit: "/kit",
  login: "/login",
  cart: "/cart",
};
