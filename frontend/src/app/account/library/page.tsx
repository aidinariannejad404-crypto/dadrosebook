import type { Metadata } from "next";
import Link from "next/link";
import type { LibraryEntry } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { formatJalaliDay } from "@/lib/order-status";
import { toPersianDigits } from "@/lib/format";
import { BookCover } from "@/components/book/BookCover";
import { EmptyState } from "@/components/account/EmptyState";
import { ContinueReading } from "@/components/account/ContinueReading";
import { ReadingProgressMeter, isFinished, isInProgress, mostRecentInProgress } from "@/components/account/ReadingProgressMeter";
import { BookOpenIcon, ChevronIcon } from "@/components/ui/Icons";
import { NotesExportMenu } from "@/components/reader/NotesExport";
import { OfflineBadge } from "@/components/account/OfflineBadge";
import { InstallPrompt } from "@/components/platform/InstallPrompt"; // platform stream (PF-14)

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "کتابخانه من", robots: { index: false, follow: false } };

export default async function LibraryPage() {
  let entries: LibraryEntry[] | null = null;
  try {
    entries = await serverApiGet<LibraryEntry[]>("/library/");
  } catch {
    entries = null;
  }
  const current = entries ? mostRecentInProgress(entries) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-black text-ink">کتابخانه من</h1>
        {entries && entries.length > 0 && (
          <p className="text-sm text-ink-muted">{toPersianDigits(entries.length)} کتاب الکترونیک</p>
        )}
      </div>
      {entries == null ? (
        <p className="rounded-card bg-surface p-4 text-ink-muted shadow-card">کتابخانه فعلاً در دسترس نیست. کمی بعد دوباره سر بزنید.</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon size={40} />}
          title="کتاب الکترونیک بخرید و همین حالا بخوانید"
          href={routes.search({ format: "ebook" })}
          action="دیدن کتاب‌های الکترونیک"
        >
          نسخه الکترونیک هر کتابی که می‌خرید، بلافاصله پس از پرداخت اینجا قرار می‌گیرد. با بسته «چاپی + الکترونیک»
          هم تا رسیدن نسخه چاپی، مطالعه را همین‌جا شروع کنید.
        </EmptyState>
      ) : (
        <>
          {current && (
            <div className="mb-5">
              <ContinueReading entry={current} />
            </div>
          )}
          <div className="mb-5 empty:hidden">
            <InstallPrompt placement="library" />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry) => (
              <LibraryCard key={entry.book.id} entry={entry} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LibraryCard({ entry: { book, granted_at, can_read, progress } }: { entry: LibraryEntry }) {
  const started = isInProgress(progress);
  const finished = isFinished(progress);
  const action = finished ? "مرور دوباره" : started ? "ادامه مطالعه" : "شروع مطالعه";
  return (
    <li className="flex gap-4 rounded-card bg-surface p-3 shadow-card transition-shadow hover:shadow-raised">
      <Link
        href={routes.product(book.slug)}
        className="w-24 shrink-0 self-start pt-1 sm:w-28"
        tabIndex={-1}
        aria-hidden="true"
      >
        <BookCover
          title={book.title}
          cover={book.cover}
          subjects={book.subjects}
          authors={book.authors}
          volumes={book.volumes}
          sizes="112px"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="line-clamp-2 text-sm font-extrabold leading-6 text-ink">
          <Link href={routes.product(book.slug)} className="hover:text-primary hover:underline">
            {book.title}
          </Link>
        </h2>
        {can_read && (
          <div className="mt-1 empty:hidden">
            <OfflineBadge slug={book.slug} />
          </div>
        )}
        {book.authors.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-ink-muted">{book.authors.map((a) => a.name).join("، ")}</p>
        )}
        <div className="mt-3">
          {can_read ? (
            <ReadingProgressMeter progress={progress} title={book.title} />
          ) : (
            <p className="text-xs text-ink-muted">
              افزوده‌شده: <time dateTime={granted_at}>{formatJalaliDay(granted_at)}</time>
            </p>
          )}
        </div>
        <div className="mt-auto pt-3">
          {can_read ? (
            <Link
              href={accountRoutes.read(book.slug)}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control px-3 text-sm font-extrabold ${
                started
                  ? "bg-primary text-white shadow-card hover:bg-primary-hover"
                  : "border border-primary text-primary hover:bg-primary-soft"
              }`}
            >
              <BookOpenIcon size={18} />
              {action}
              {started && <ChevronIcon size={16} />}
            </Link>
          ) : (
            <p className="rounded-control bg-neutral-soft px-3 py-2 text-center text-xs font-bold text-ink">
              دسترسی به این کتاب غیرفعال است
            </p>
          )}
          {can_read && <NotesExportMenu slug={book.slug} variant="card" />}
        </div>
      </div>
    </li>
  );
}
