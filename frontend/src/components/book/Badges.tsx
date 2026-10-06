import type { Badge } from "@/lib/types";
import { badgeToneClass, cardBadges } from "@/lib/badges";

/** Server badges (P1-20), rendered as-is in API order, at most two. */
export function Badges({ badges, className = "" }: { badges: Badge[]; className?: string }) {
  const list = cardBadges(badges);
  if (list.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="ویژگی‌ها">
      {list.map((b) => (
        // one line each: a long bestseller label is cut at the card edge (the subject tag below repeats
        // the subject); the full label stays in the accessible name and the tooltip
        <li
          key={b.code}
          title={b.label}
          className={`max-w-full truncate rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold leading-[1.125rem] ${badgeToneClass(b.tone)}`}
        >
          {b.label}
        </li>
      ))}
    </ul>
  );
}
