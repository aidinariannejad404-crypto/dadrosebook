import Image from "next/image";
import type { PersonMini, SubjectMini } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";

interface BookCoverProps {
  title: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
  volumes?: number;
  /** next/image sizes hint */
  sizes?: string;
  priority?: boolean;
  className?: string;
}

const FALLBACK_COLOR = "#12264A";

/**
 * Fixed 2:3 book cover (CLS-safe). Real covers use next/image; books without a scan get a
 * generated "subject-colour cover": coloured board, spine on the binding side (start in RTL),
 * subtle pattern, title, gold rule and author — typography scales with the cover width (cqw).
 */
export function BookCover({
  title,
  cover,
  subjects,
  authors,
  volumes = 1,
  sizes = "(min-width: 1024px) 200px, 45vw",
  priority = false,
  className = "",
}: BookCoverProps) {
  const color = subjects[0]?.color ?? FALLBACK_COLOR;
  const frame = `relative aspect-[2/3] w-full overflow-hidden rounded-[6px] shadow-card ${className}`;

  if (cover) {
    return (
      <div className={`${frame} bg-surface-muted`}>
        <Image src={cover} alt={`جلد کتاب ${title}`} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }

  const author = authors.map((a) => a.name).join("، ");
  return (
    <div
      className={`${frame} text-white [container-type:inline-size]`}
      style={{ backgroundColor: color }}
      role="img"
      aria-label={`جلد کتاب ${title}${author ? ` اثر ${author}` : ""}`}
    >
      {/* subtle diagonal pattern (CSS only, no duplicate SVG ids) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.08)_0_1px,transparent_1px_9px)]"
      />
      {/* lighting: soft vignette from the top */}
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(255_255_255/0.18),transparent_60%)]" />
      {/* spine on the binding side (start = right in RTL) */}
      <div aria-hidden="true" className="absolute inset-y-0 start-0 w-[7%] bg-[rgb(0_0_0/0.28)]" />
      <div aria-hidden="true" className="absolute inset-y-0 start-[7%] w-px bg-[rgb(255_255_255/0.3)]" />
      {/* frame line */}
      <div aria-hidden="true" className="absolute inset-y-[5%] end-[6%] start-[13%] rounded-[2px] border border-[rgb(255_255_255/0.28)]" />

      <div className="absolute inset-y-[5%] end-[6%] start-[13%] flex flex-col items-center px-[6%] py-[9%] text-center">
        <span className="text-[6.5cqw] font-medium tracking-wide opacity-85">
          {subjects[0]?.name ?? "کتاب دادرُز"}
        </span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="line-clamp-4 text-[11cqw] font-extrabold leading-[1.35]">{title}</span>
          <span aria-hidden="true" className="mt-[7cqw] block h-[1.4cqw] w-[24cqw] rounded-full bg-accent" />
        </div>
        {volumes > 1 && (
          <span className="mb-[3cqw] rounded-full bg-[rgb(255_255_255/0.18)] px-[4cqw] py-[0.8cqw] text-[6cqw] font-bold">
            {toPersianDigits(volumes)} جلد
          </span>
        )}
        {author && <span className="line-clamp-1 text-[7cqw] font-medium opacity-90">{author}</span>}
      </div>
    </div>
  );
}
