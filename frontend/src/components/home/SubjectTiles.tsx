import Link from "next/link";
import type { HomeSubject } from "@/lib/types";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { HomeSectionHeader } from "./HomeSectionHeader";

/** [height %, width px, lean deg] of the decorative spines on each tile */
const SPINES: [number, number, number][] = [
  [40, 11, 0],
  [52, 13, 0],
  [45, 10, 0],
  [56, 14, 0],
  [42, 12, -10],
];

/**
 * Book-spine motif: a few translucent spines standing on a shelf at the tile's end edge, each with
 * gold head bands — the subject colour shows through, so every tile keeps its own colour code.
 * Purely decorative (aria-hidden); the text sits above it and keeps its contrast.
 */
function SpineShelf() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-0">
      <span className="absolute bottom-0 end-3 flex h-full items-end gap-[3px]">
        {SPINES.map(([h, w, lean], i) => (
          <span
            key={i}
            className={`relative block rounded-t-[3px] ${i % 2 ? "bg-white/[0.17]" : "bg-white/[0.1]"}`}
            style={{
              height: `${h}%`,
              width: w,
              transform: lean ? `rotate(${lean}deg)` : undefined,
              transformOrigin: "bottom",
            }}
          >
            <span className="absolute inset-x-0 top-[14%] h-[3px] bg-[rgb(214_180_100/0.6)]" />
            <span className="absolute inset-x-0 top-[22%] h-px bg-[rgb(214_180_100/0.45)]" />
            <span className="absolute inset-x-[32%] bottom-[18%] top-[34%] rounded-full bg-white/[0.12]" />
          </span>
        ))}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/15" />
    </span>
  );
}

/** Subject tiles in API order (by ضریب when an exam is selected, P1-10). */
export function SubjectTiles({ subjects, examName }: { subjects: HomeSubject[]; examName?: string }) {
  if (subjects.length === 0) return null;
  const weighted = subjects.some((s) => s.weight != null);
  return (
    <section aria-labelledby="subjects-title">
      <HomeSectionHeader
        id="subjects-title"
        title="منابع هر درس"
        subtitle={
          weighted && examName
            ? `به ترتیب ضریب در آزمون ${examName}`
            : "کتاب‌های هر درس آزمون، با رنگ همان درس"
        }
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {subjects.map((s) => (
          <li key={s.id}>
            <Link
              prefetch={false}
              href={routes.search({ subject: s.slug })}
              className="relative flex min-h-24 flex-col justify-between overflow-hidden rounded-card p-4 pb-3.5 text-white shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-raised"
              style={{ backgroundColor: s.color }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(255_255_255/0.16),transparent_60%)]"
              />
              <SpineShelf />
              <span className="relative text-base font-extrabold leading-7">{s.name}</span>
              <span className="relative mt-2 flex items-center justify-between gap-2 text-xs font-medium text-white">
                <span>{toPersianDigits(s.book_count)} کتاب</span>
                {s.weight != null && (
                  <span className="rounded-full bg-white px-2 py-0.5 font-extrabold text-ink">
                    ضریب {toPersianDigits(s.weight)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
