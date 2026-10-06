import type { Metadata } from "next";
import Link from "next/link";
import type { ChangelogEntry } from "@/lib/platform-types";
import { getChangelog } from "@/lib/api";
import { safeInboxLink } from "@/lib/platform-routes";
import { SparkIcon } from "@/components/platform/PlatformIcons";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "تازه‌های دادرُز",
  description: "تغییرات و امکانات تازه فروشگاه و کتابخوان دادرُز.",
  alternates: { canonical: "/changelog" },
};

async function load(): Promise<ChangelogEntry[] | null> {
  try {
    return await getChangelog();
  } catch {
    return null;
  }
}

/** PF-17: public changelog, edited in the admin («تازه‌های دادرُز»). */
export default async function ChangelogPage() {
  const entries = await load();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <h1 className="flex items-center gap-2 text-2xl font-black text-ink">
        <SparkIcon size={26} className="text-accent" />
        تازه‌های دادرُز
      </h1>
      <p className="mt-2 text-sm leading-7 text-ink-muted">امکانات تازه و بهبودهای فروشگاه و کتابخوان؛ تغییرات بزرگ را کم‌کم و با خبر شما منتشر می‌کنیم.</p>
      {entries == null || entries.length === 0 ? (
        <p className="mt-6 rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">هنوز موردی منتشر نشده است.</p>
      ) : (
        <ol className="mt-6 space-y-4 border-s-2 border-line ps-4">
          {entries.map((e) => {
            const link = safeInboxLink(e.link);
            return (
              <li key={e.id} className="relative rounded-card bg-surface p-4 shadow-card">
                <span aria-hidden="true" className="absolute -start-[1.4rem] top-5 size-3 rounded-full bg-accent ring-4 ring-bg" />
                <p className="text-xs font-bold text-primary">
                  <time dateTime={e.published_at}>{e.published_jalali}</time> · {e.area_label}
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-ink">{e.title}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink">{e.body}</p>
                {link && (
                  <Link href={link} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline">
                    مشاهده
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
