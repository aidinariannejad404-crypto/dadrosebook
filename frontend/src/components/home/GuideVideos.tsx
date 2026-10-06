import Image from "next/image";
import type { GuideVideo } from "@/lib/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PlayIcon } from "@/components/ui/Icons";

/** "کدام کتاب را بخوانم؟" — video cards that open the video page in a new tab (no embeds on the homepage). */
export function GuideVideos({ videos }: { videos: GuideVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <section aria-labelledby="guides-title">
      <SectionHeader id="guides-title" title="کدام کتاب را بخوانم؟" subtitle="راهنمای ویدئویی انتخاب منابع، از زبان مشاوران دادرُز" />
      <ul className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
        {videos.map((v) => {
          const color = v.subject?.color ?? "var(--color-primary)";
          return (
            <li key={v.id} className="w-[72%] shrink-0 snap-start md:w-auto">
              <a
                href={v.video_url}
                target="_blank"
                rel="noopener"
                className="group block h-full overflow-hidden rounded-card bg-surface shadow-card hover:shadow-raised"
              >
                <div className="relative aspect-video" style={{ backgroundColor: color }}>
                  {v.thumbnail ? (
                    <Image src={v.thumbnail} alt="" fill sizes="(min-width: 1024px) 300px, 72vw" className="object-cover" />
                  ) : (
                    <div aria-hidden="true" className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.07)_0_1px,transparent_1px_10px)]" />
                  )}
                  <span aria-hidden="true" className="absolute inset-0 m-auto grid size-14 place-items-center rounded-full bg-white/95 text-primary shadow-raised transition-transform group-hover:scale-105">
                    <PlayIcon size={26} />
                  </span>
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 font-bold leading-7 text-ink">{v.title}</h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    {[v.exam_type?.name, v.subject?.name].filter(Boolean).join(" · ") || "راهنمای انتخاب منابع"}
                  </p>
                  <span className="sr-only">(ویدئو در زبانه جدید باز می‌شود)</span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
