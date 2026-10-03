import type { Metadata } from "next";
import Link from "next/link";
import type { LibraryEntry } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { formatJalaliDay } from "@/lib/order-status";
import { BookCover } from "@/components/book/BookCover";
import { EmptyState } from "@/components/account/EmptyState";
import { BookOpenIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "کتابخانه من", robots: { index: false, follow: false } };

export default async function LibraryPage() {
  let entries: LibraryEntry[] | null = null;
  try {
    entries = await serverApiGet<LibraryEntry[]>("/library/");
  } catch {
    entries = null;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-ink">کتابخانه من</h1>
      {entries == null ? (
        <p className="rounded-card bg-surface p-4 text-ink-muted">کتابخانه فعلاً در دسترس نیست.</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={<BookOpenIcon size={40} />} title="کتابخانه شما خالی است" href="/" action="دیدن کتاب‌ها">
          نسخه‌های الکترونیک کتاب‌هایی که می‌خرید بلافاصله پس از پرداخت اینجا قرار می‌گیرند. با خرید بسته
          «چاپی + الکترونیک» هم، تا رسیدن نسخه چاپی، مطالعه را همین‌جا شروع کنید.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map(({ book, granted_at, can_read }) => (
            <li key={book.id} className="flex flex-col rounded-card bg-surface p-2.5 shadow-card">
              <BookCover
                title={book.title}
                cover={book.cover}
                subjects={book.subjects}
                authors={book.authors}
                volumes={book.volumes}
                sizes="(min-width: 1024px) 150px, 40vw"
              />
              <h2 className="mt-2 line-clamp-2 min-h-[2.75rem] text-sm font-bold leading-[1.375rem] text-ink">{book.title}</h2>
              <p className="text-xs text-ink-muted">
                افزوده‌شده: <time dateTime={granted_at}>{formatJalaliDay(granted_at)}</time>
              </p>
              <div className="mt-auto flex flex-col gap-1 pt-2">
                {can_read ? (
                  <Link
                    href={accountRoutes.read(book.slug)}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-primary px-2 text-sm font-bold text-white hover:bg-primary-hover"
                  >
                    <BookOpenIcon size={16} />
                    شروع مطالعه
                  </Link>
                ) : (
                  <p className="py-2 text-center text-xs font-bold text-ink-muted">دسترسی غیرفعال است</p>
                )}
                <Link
                  href={routes.product(book.slug)}
                  className="inline-flex min-h-11 items-center justify-center rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
                >
                  جزئیات کتاب
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
