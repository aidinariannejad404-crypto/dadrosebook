/** Routes added by the platform stream (kept apart from config.ts / account-routes.ts). */
export const platformRoutes = {
  messages: "/account/messages",
  notifications: "/account/notifications",
  studyProfile: "/account/study-profile",
  accountSupport: "/account/support",
  accountTicket: (code: string) => `/account/support/${encodeURIComponent(code)}`,
  support: (params: { order?: string; book?: string; topic?: string; source?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]).toString();
    return qs ? `/support?${qs}` : "/support";
  },
  track: (code?: string) => (code ? `/support/track?code=${encodeURIComponent(code)}` : "/support/track"),
  changelog: "/changelog",
} as const;

/** Only same-site paths are followed from inbox items (the API already strips other origins). */
export function safeInboxLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return null;
  return link;
}
