import type { Badge, BadgeTone } from "./types";

/** Cards never show more than two server badges (P1-20). */
export const MAX_CARD_BADGES = 2;

/**
 * Badge tone → token classes (tokens.css). Every pair is ≥ 4.5:1 (text on its soft background);
 * gold is never used as text on white — the accent tone uses the dark accent-ink token.
 */
export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  accent: "bg-accent-soft text-accent-ink",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-ink-muted",
};

/** Unknown tones (a newer backend) fall back to neutral instead of rendering unstyled. */
export function badgeToneClass(tone: string): string {
  return Object.prototype.hasOwnProperty.call(BADGE_TONE_CLASS, tone)
    ? BADGE_TONE_CLASS[tone as BadgeTone]
    : BADGE_TONE_CLASS.neutral;
}

/** Badges as sent by the API (already ordered), minus empty labels, at most two. */
export function cardBadges(badges: Badge[] | undefined | null): Badge[] {
  return (badges ?? []).filter((b) => b && b.label.trim() !== "").slice(0, MAX_CARD_BADGES);
}
