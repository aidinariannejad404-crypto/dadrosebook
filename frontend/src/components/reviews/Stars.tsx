import { ratingText, starFills } from "@/lib/reviews";
import { StarIcon } from "@/components/ui/Icons";

/** Read-only star row; half stars fill from the start (reading) side. */
export function Stars({ value, size = 16, className = "" }: { value: number; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={ratingText(value)} className={`inline-flex items-center gap-0.5 ${className}`}>
      {starFills(value).map((fill, i) => (
        <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
          <StarIcon size={size} className={fill === "full" ? "text-accent-strong" : "text-line-strong"} />
          {fill === "half" && (
            <span className="absolute inset-y-0 start-0 w-1/2 overflow-hidden">
              <StarIcon size={size} className="text-accent-strong" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
