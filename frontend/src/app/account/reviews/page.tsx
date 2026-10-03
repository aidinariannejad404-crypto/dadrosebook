import type { Metadata } from "next";
import Link from "next/link";
import type { MyReview, ReviewStatus } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { formatJalaliDay, type Tone } from "@/lib/order-status";
import { StatusPill } from "@/components/account/StatusPill";
import { EmptyState } from "@/components/account/EmptyState";
import { Stars } from "@/components/reviews/Stars";
import { ChatIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "نظرات من", robots: { index: false, follow: false } };

const REVIEW_TONES: Record<ReviewStatus, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" };
const REVIEW_LABELS: Record<ReviewStatus, string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
};

export default async function MyReviewsPage() {
  let reviews: MyReview[] | null = null;
  try {
    reviews = await serverApiGet<MyReview[]>("/me/reviews/");
  } catch {
    reviews = null;
  }
  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-ink">نظرات من</h1>
      {reviews == null ? (
        <p className="rounded-card bg-surface p-4 text-ink-muted">فهرست نظرها فعلاً در دسترس نیست.</p>
      ) : reviews.length === 0 ? (
        <EmptyState icon={<ChatIcon size={40} />} title="هنوز نظری ثبت نکرده‌اید">
          در صفحه هر کتاب می‌توانید تجربه خود را با داوطلبان دیگر به اشتراک بگذارید.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`${routes.product(r.book.slug)}#reviews`} className="font-bold text-primary hover:underline">
                  {r.book.title}
                </Link>
                <StatusPill tone={REVIEW_TONES[r.status] ?? "neutral"}>
                  {r.status_label || REVIEW_LABELS[r.status] || r.status}
                </StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                <Stars value={r.rating} />
                <time dateTime={r.created_at}>{formatJalaliDay(r.created_at)}</time>
                {r.exam_type && <span>{r.exam_type.short_name || r.exam_type.name}</span>}
              </div>
              {r.body && <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink">{toPersianDigits(r.body)}</p>}
              {r.status === "REJECTED" && (
                <p className="mt-2 text-xs leading-6 text-ink-muted">
                  می‌توانید از صفحه کتاب نظر خود را ویرایش و دوباره ارسال کنید.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
