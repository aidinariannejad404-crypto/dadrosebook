/** PF-17: the one-time «تازه‌ها» sheet — remember (per device) the newest entry already shown. */
export const WHATS_NEW_SEEN_KEY = "dadrose.whatsnew.seen";
/** Entries older than this are not announced to someone who never saw the sheet. */
export const WHATS_NEW_MAX_AGE_DAYS = 30;

export function shouldShowWhatsNew(
  entry: { id: number; published_at: string } | null | undefined,
  seenRaw: string | null,
  now = Date.now(),
): boolean {
  if (!entry) return false;
  const seen = Number(seenRaw);
  if (seenRaw && Number.isFinite(seen) && seen >= entry.id) return false;
  const published = Date.parse(entry.published_at);
  if (!Number.isFinite(published)) return false;
  return now - published <= WHATS_NEW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
