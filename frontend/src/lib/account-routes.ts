/** Customer account routes (Phase 3). Kept apart from config.ts `routes` to avoid parallel-edit clashes. */
export const accountRoutes = {
  dashboard: "/account",
  orders: "/account/orders",
  ordersPage: (page: number) => (page > 1 ? `/account/orders?page=${page}` : "/account/orders"),
  order: (number: string) => `/account/orders/${encodeURIComponent(number)}`,
  addresses: "/account/addresses",
  library: "/account/library",
  /** Phase 6b: ebook reading devices («دستگاه‌های من»). */
  devices: "/account/devices",
  wishlist: "/account/wishlist",
  reviews: "/account/reviews",
  /** د۴ (impl/trust): readiness dashboard + «خبرم کن» list. */
  readiness: "/account/readiness",
  // --- retention stream: «کارنامه مطالعه» and the living study plan ---
  report: "/account/report",
  plan: "/account/plan",
  // --- end retention stream ---
  /** Phase 4 reader. */
  read: (slug: string) => `/read/${encodeURIComponent(slug)}`,
  /** Login with a return path (only same-site absolute paths are kept). */
  login: (next?: string | null) =>
    next && next.startsWith("/") && !next.startsWith("//") ? `/login?next=${encodeURIComponent(next)}` : "/login",
} as const;

/** Iran Post parcel tracking. */
export const POST_TRACKING_URL = "https://tracking.post.ir/";
