"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { BulkAddResult, ExamTypeMini, StudyKit, StudyKitItem, Variant } from "@/lib/types";
import { formatNumber, formatToman, toPersianDigits } from "@/lib/format";
import { examCountdown } from "@/lib/countdown";
import { routes } from "@/lib/config";
import { track } from "@/lib/analytics";
import { SHORT_LABEL } from "@/lib/variants";
import {
  formatOptions,
  initialSelection,
  kitTotals,
  kitUrl,
  parseSubjects,
  selectedLines,
  type KitSelection,
  type KitTotals,
} from "@/lib/kit";
import { BookCover } from "@/components/book/BookCover";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { CartIcon, CheckIcon, ClockIcon } from "@/components/ui/Icons";
import { useCart } from "@/components/cart/CartProvider";
import { KitShareBox } from "@/components/growth/KitShareBox"; // growth (و۳)
// د۱ (impl/trust): owned books are marked and left out of «افزودن همه»
import { useOwned } from "@/components/trust/useOwned";
import { ownedBadge, ownedIdsIn, uncheckBooks } from "@/lib/owned";
import type { OwnedBook } from "@/lib/trust-types";
import { AddToCalendar } from "@/components/calendar/AddToCalendar";
import type { CalendarEvent } from "@/lib/calendar";
import { completeSubjects, newlyComplete } from "@/lib/kit-complete";

export interface KitBuilderProps {
  examTypes: ExamTypeMini[];
  exam: string | null;
  /** ordered by weight */
  kits: StudyKit[];
  subjectsParam: string | null;
  event: { name: string; date: string; dateLabel: string; calendar?: CalendarEvent } | null;
  serverNow: number;
}

type AddState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; result: BulkAddResult }
  | { kind: "error"; message: string };

export function KitBuilder({ examTypes, exam, kits, subjectsParam, event, serverNow }: KitBuilderProps) {
  const router = useRouter();
  const { bulk, cart } = useCart();
  const [pending, startTransition] = useTransition();
  const [pendingExam, setPendingExam] = useState(exam);
  const [subjects, setSubjects] = useState(() => parseSubjects(subjectsParam, kits));
  const [sel, setSel] = useState<KitSelection>(() => initialSelection(kits));
  const [add, setAdd] = useState<AddState>({ kind: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);
  const examName = examTypes.find((e) => e.slug === exam)?.name ?? "";
  const allSubjects = useMemo(() => kits.map((k) => k.subject.slug), [kits]);

  const ownedState = useOwned();
  const owned = ownedState?.kind === "user" ? ownedState.books : null;
  const [excluded, setExcluded] = useState<number[]>([]);
  useEffect(() => {
    if (!owned) return;
    const ids = ownedIdsIn([...new Set(kits.flatMap((k) => k.items.map((i) => i.book.id)))], owned);
    setExcluded(ids);
    if (ids.length) setSel((s) => uncheckBooks(s, ids));
  }, [owned, kits]);

  const lines = useMemo(() => selectedLines(kits, subjects, sel), [kits, subjects, sel]);

  // ج۸ «درس … کامل شد»: every essential book of a subject is in the cart. Only a change the visitor
  // just made is celebrated (pulse + one polite announcement), never the state found on load.
  const cartBookKey = cart ? cart.items.map((i) => i.book.id).sort((a, b) => a - b).join(",") : null;
  const complete = useMemo(
    () => completeSubjects(kits, new Set(cartBookKey ? cartBookKey.split(",").map(Number) : [])),
    [kits, cartBookKey],
  );
  const prevComplete = useRef<Set<string> | null>(null);
  const [celebrate, setCelebrate] = useState<string[]>([]);
  useEffect(() => {
    if (cartBookKey == null) return;
    const fresh = newlyComplete(prevComplete.current, complete);
    prevComplete.current = complete;
    if (fresh.length === 0) return;
    setCelebrate(fresh);
    const t = window.setTimeout(() => setCelebrate([]), 2400);
    return () => window.clearTimeout(t);
  }, [complete, cartBookKey]);
  const celebrateNames = kits.filter((k) => celebrate.includes(k.subject.slug)).map((k) => k.subject.name);
  const totals = kitTotals(lines);

  function chooseExam(slug: string) {
    setPendingExam(slug);
    startTransition(() => router.replace(`/kit?exam=${encodeURIComponent(slug)}`, { scroll: false }));
  }

  function toggleSubject(slug: string, on: boolean) {
    const next = allSubjects.filter((s) => (s === slug ? on : subjects.includes(s)));
    setSubjects(next);
    setAdd({ kind: "idle" });
    if (exam) window.history.replaceState(null, "", kitUrl(exam, next, allSubjects));
  }

  function setBook(id: number, on: boolean) {
    setSel((s) => ({ ...s, books: { ...s.books, [id]: on } }));
    setAdd({ kind: "idle" });
  }

  function setFormat(id: number, variantId: number) {
    setSel((s) => ({ books: { ...s.books, [id]: true }, formats: { ...s.formats, [id]: variantId } }));
    setAdd({ kind: "idle" });
  }

  async function addAll() {
    if (add.kind === "busy" || lines.length === 0) return;
    setAdd({ kind: "busy" });
    const r = await bulk(
      lines.map((l) => ({ variant_id: l.variant.id, quantity: 1 })),
      "kit",
    );
    if (!r.ok) {
      setAdd({ kind: "error", message: r.error.detail });
      return;
    }
    const added = new Set(r.result.added);
    track("kit_built", {
      exam_type: exam,
      subjects: subjects.join(","),
      items: r.result.added.length,
      value: lines.filter((l) => added.has(l.variant.id)).reduce((s, l) => s + l.variant.effective_price, 0),
    });
    setAdd({ kind: "done", result: r.result });
  }

  useEffect(() => {
    if (add.kind === "done" || add.kind === "error") resultRef.current?.focus();
  }, [add.kind]);

  const completeNote = (
    <p role="status" aria-live="polite" className="sr-only">
      {celebrateNames.length ? `درس ${celebrateNames.join(" و ")} کامل شد؛ همه منابع ضروری آن در سبد خرید است.` : ""}
    </p>
  );

  const titleOf = (variantId: number) =>
    kits.flatMap((k) => k.items).find((i) => i.book.variants.some((v) => v.id === variantId))?.book.title ?? "";

  return (
    <>
      {completeNote}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-black text-ink md:text-2xl">کیت مطالعاتی آزمون</h1>
          <p className="mt-1.5 max-w-2xl leading-7 text-ink-muted">
            آزمونتان را انتخاب کنید؛ منابع ضروری هر درس بر اساس ضریب آماده است. نسخه دلخواه را انتخاب کنید و همه را یک‌جا
            به سبد اضافه کنید.
          </p>
        </div>
        {event && <ExamCountdown event={event} serverNow={serverNow} />}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <Step n={1} title="آزمون">
            <fieldset>
              <legend className="sr-only">آزمون را انتخاب کنید</legend>
              <div className="flex flex-wrap gap-2">
                {examTypes.map((e) => (
                  <label key={e.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="kit-exam"
                      value={e.slug}
                      checked={pendingExam === e.slug}
                      onChange={() => chooseExam(e.slug)}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink transition-colors hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                      {e.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Step>

          <div aria-busy={pending || undefined} className={`space-y-5 transition-opacity ${pending ? "opacity-50" : ""}`}>
            {kits.length === 0 ? (
              <section className="rounded-card bg-surface px-5 py-8 text-center shadow-card">
                <h2 className="text-lg font-black text-ink">برای این آزمون هنوز کیت پیشنهادی ثبت نشده است</h2>
                <p className="mt-2 leading-7 text-ink-muted">آزمون دیگری را انتخاب کنید یا کتاب‌های این آزمون را ببینید.</p>
                {exam && (
                  <Link
                    href={routes.exam(exam)}
                    className="mt-5 inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
                  >
                    کتاب‌های {examName || "این آزمون"}
                  </Link>
                )}
              </section>
            ) : (
              <>
                <Step n={2} title="دروس">
                  <fieldset>
                    <legend className="sr-only">دروس آزمون (به ترتیب ضریب)</legend>
                    <p className="mb-2 text-sm text-ink-muted">به ترتیب ضریب در آزمون {examName}</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {kits.map((k) => {
                        const on = subjects.includes(k.subject.slug);
                        return (
                          <li key={k.subject.slug}>
                            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={(e) => toggleSubject(k.subject.slug, e.target.checked)}
                                className="size-5 shrink-0 accent-[var(--color-primary)]"
                              />
                              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: k.subject.color }} />
                              <span className="min-w-0 flex-1 text-sm font-bold text-ink">{k.subject.name}</span>
                              {k.weight != null && (
                                <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-bold text-ink">
                                  ضریب {toPersianDigits(k.weight)}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                </Step>

                <Step n={3} title="کتاب‌ها و نوع نسخه">
                  {subjects.length === 0 ? (
                    <p className="text-ink-muted">دست‌کم یک درس را انتخاب کنید.</p>
                  ) : (
                    <div className="space-y-5">
                      {kits
                        .filter((k) => subjects.includes(k.subject.slug))
                        .map((k) => (
                          <section key={k.subject.slug} aria-labelledby={`kit-s-${k.subject.id}`}>
                            <h3 id={`kit-s-${k.subject.id}`} className="mb-2 flex flex-wrap items-center gap-2 text-base font-black text-ink">
                              <span aria-hidden="true" className="h-5 w-1.5 rounded-full" style={{ background: k.subject.color }} />
                              {k.subject.name}
                              {k.weight != null && (
                                <span className="text-xs font-bold text-ink-muted">· ضریب {toPersianDigits(k.weight)}</span>
                              )}
                              {complete.has(k.subject.slug) && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-extrabold text-success ${
                                    celebrate.includes(k.subject.slug) ? "motion-complete" : ""
                                  }`}
                                >
                                  <CheckIcon size={14} strokeWidth={2.8} className={celebrate.includes(k.subject.slug) ? "motion-pop" : ""} />
                                  منابع ضروری در سبد
                                </span>
                              )}
                            </h3>
                            {k.note && <p className="mb-2 text-sm leading-7 text-ink-muted">{k.note}</p>}
                            <ul className="space-y-2">
                              {k.items.map((item) => (
                                <KitBookRow
                                  key={item.book.id}
                                  uid={`${k.subject.id}-${item.book.id}`}
                                  item={item}
                                  checked={Boolean(sel.books[item.book.id])}
                                  format={sel.formats[item.book.id]}
                                  onCheck={(on) => setBook(item.book.id, on)}
                                  onFormat={(id) => setFormat(item.book.id, id)}
                                  owned={owned?.get(item.book.id)}
                                />
                              ))}
                            </ul>
                          </section>
                        ))}
                    </div>
                  )}
                </Step>
              </>
            )}
          </div>
        </div>

        {kits.length > 0 && (
          <aside aria-labelledby="kit-summary" className="rounded-card bg-surface p-4 shadow-card lg:sticky lg:top-4 md:p-5">
            <h2 id="kit-summary" className="text-base font-black text-ink">
              کیت شما
            </h2>
            <TotalsList totals={totals} />
            {excluded.length > 0 && (
              <p className="mt-3 rounded-control bg-info-soft px-3 py-2 text-xs font-bold leading-6 text-info">
                {toPersianDigits(excluded.length)} کتابی که دارید از «افزودن همه» کنار گذاشته شد.
              </p>
            )}
            <AddAllButton totals={totals} busy={add.kind === "busy"} onClick={addAll} className="mt-4 w-full" />
            <div ref={resultRef} tabIndex={-1} className="focus:outline-none" aria-live="polite">
              {add.kind === "error" && (
                <p role="alert" className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold leading-7 text-danger">
                  {add.message}
                </p>
              )}
              {add.kind === "done" && (
                <div className="mt-3 rounded-control bg-success-soft px-3 py-3 text-sm leading-7 text-success">
                  <p className="flex items-center gap-1.5 font-bold">
                    <CheckIcon size={18} strokeWidth={2.6} className="shrink-0" />
                    {toPersianDigits(add.result.added.length)} کتاب به سبد خرید اضافه شد
                  </p>
                  {add.result.skipped.length > 0 && (
                    <div className="mt-2 text-danger">
                      <p className="font-bold">این موارد اضافه نشد:</p>
                      <ul className="mt-1 list-disc space-y-1 ps-5">
                        {add.result.skipped.map((s) => (
                          <li key={s.variant_id}>
                            {titleOf(s.variant_id)}: {s.detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Link
                    href={routes.cart}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover"
                  >
                    <CartIcon size={18} />
                    مشاهده سبد خرید
                  </Link>
                </div>
              )}
            </div>
            {/* growth (و۳): shareable kit link */}
            <KitShareBox
              exam={exam}
              examName={examName}
              variantIds={lines.map((l) => l.variant.id)}
              slugs={lines.map((l) => l.item.book.slug)}
            />
          </aside>
        )}
      </div>

      {kits.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-line bg-surface shadow-raised pb-safe lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">
                {toPersianDigits(totals.books)} کتاب
                {totals.savings > 0 && <span className="font-bold text-success"> · {formatNumber(totals.savings)} سود</span>}
              </p>
              <p className="text-base font-black text-ink">{formatToman(totals.total)}</p>
            </div>
            {add.kind === "done" ? (
              <Link
                href={routes.cart}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-control border-2 border-primary px-4 text-sm font-extrabold text-primary"
              >
                <CartIcon size={18} />
                مشاهده سبد
              </Link>
            ) : (
              <AddAllButton totals={totals} busy={add.kind === "busy"} onClick={addAll} className="shrink-0 px-4 text-sm" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-card bg-surface p-4 shadow-card md:p-5">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-base font-black text-ink">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-primary text-sm text-white">
          {toPersianDigits(n)}
        </span>
        <span className="sr-only">مرحله {toPersianDigits(n)}: </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function TotalsList({ totals }: { totals: KitTotals }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      <div className="flex justify-between gap-2">
        <dt className="text-ink-muted">تعداد کتاب</dt>
        <dd className="font-bold text-ink">{toPersianDigits(totals.books)}</dd>
      </div>
      {totals.savings > 0 && (
        <div className="flex justify-between gap-2 font-bold text-success">
          <dt>سود شما</dt>
          <dd>{formatToman(totals.savings)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-2 border-t border-line pt-2 text-base font-black text-ink">
        <dt>جمع کیت</dt>
        <dd>{formatToman(totals.total)}</dd>
      </div>
    </dl>
  );
}

function AddAllButton({ totals, busy, onClick, className = "" }: { totals: KitTotals; busy: boolean; onClick: () => void; className?: string }) {
  const empty = totals.books === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={empty || busy || undefined}
      className={`press inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary font-extrabold text-white hover:bg-primary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${className}`}
    >
      <CartIcon size={20} className="shrink-0" />
      {busy ? "در حال افزودن…" : "افزودن همه به سبد"}
    </button>
  );
}

function optionPrice(v: Variant): string {
  return v.in_stock ? formatToman(v.effective_price) : "ناموجود";
}

function KitBookRow({
  uid,
  item,
  checked,
  format,
  onCheck,
  onFormat,
  owned,
}: {
  uid: string;
  item: StudyKitItem;
  checked: boolean;
  format: number | undefined;
  onCheck: (on: boolean) => void;
  onFormat: (variantId: number) => void;
  owned?: OwnedBook;
}) {
  const ownedLabel = ownedBadge(owned);
  const book = item.book;
  const options = formatOptions(book.variants);
  const buyable = options.some((v) => v.in_stock);
  const outPrint = book.variants.find((v) => v.type === "PRINT" && !v.in_stock && !v.price_is_placeholder);
  const author = book.authors.map((a) => a.name).join("، ");
  const checkId = `kit-b-${uid}`;

  return (
    <li className={`rounded-control border p-3 transition-colors ${checked && buyable ? "border-primary bg-primary-soft" : "border-line"}`}>
      <div className="md:flex md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <input
            id={checkId}
            type="checkbox"
            checked={checked && buyable}
            disabled={!buyable}
            onChange={(e) => onCheck(e.target.checked)}
            className="mt-3 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          <div className="w-12 shrink-0">
            <BookCover title={book.title} cover={book.cover} subjects={book.subjects} authors={book.authors} sizes="48px" />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={checkId} className="flex min-h-11 cursor-pointer flex-col justify-center">
              <span className="text-sm font-bold leading-6 text-ink">{book.title}</span>
              {author && <span className="text-xs text-ink-muted">{author}</span>}
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                  item.is_essential ? "bg-success-soft text-success" : "bg-neutral-soft text-ink"
                }`}
              >
                {item.is_essential ? "ضروری" : "پیشنهادی"}
              </span>
              {ownedLabel && (
                <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-xs font-bold text-info">
                  <CheckIcon size={12} strokeWidth={2.8} className="shrink-0" />
                  {ownedLabel}
                </span>
              )}
              <Link href={routes.product(book.slug)} className="inline-flex min-h-11 items-center text-xs font-bold text-primary underline-offset-4 hover:underline">
                جزئیات کتاب
              </Link>
            </div>
          </div>
        </div>

        {options.length > 0 && (
          <fieldset className="mt-2 md:mt-0 md:w-96 md:shrink-0">
            <legend className="sr-only">نوع نسخه «{book.title}»</legend>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {options.map((v) => (
                <label key={v.id} className={v.in_stock ? "cursor-pointer" : "cursor-not-allowed"}>
                  <input
                    type="radio"
                    name={`kit-f-${uid}`}
                    value={v.id}
                    checked={format === v.id && checked}
                    disabled={!v.in_stock}
                    onChange={() => onFormat(v.id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full min-h-11 flex-col items-center justify-center rounded-control border border-line bg-surface px-1 py-1.5 text-center peer-checked:border-primary peer-checked:bg-primary-soft peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                    <span className="text-xs font-extrabold text-ink">{SHORT_LABEL[v.type]}</span>
                    <span className={`text-[0.6875rem] ${v.in_stock ? "text-ink-muted" : "font-bold text-danger"}`}>{optionPrice(v)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {!buyable && <p className="mt-2 text-xs font-bold text-ink-muted">این کتاب فعلاً قابل خرید نیست.</p>}
      {outPrint && (
        <NotifyMeButton
          bookId={book.id}
          bookTitle={book.title}
          variantId={outPrint.id}
          variantType="PRINT"
          ebookAvailable={book.variants.some((v) => v.type === "EBOOK" && v.in_stock && !v.price_is_placeholder)}
          source="kit"
          size="sm"
          className="mt-2 w-full sm:w-auto"
        />
      )}
    </li>
  );
}

function ExamCountdown({ event, serverNow }: { event: NonNullable<KitBuilderProps["event"]>; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => setNow(Date.now()), []);
  const { days, past } = examCountdown(event.date, now);
  if (past) return null;
  const hint =
    days <= 30
      ? "زمان کم است؛ نسخه الکترونیک را همین امروز شروع کنید و منتظر ارسال نمانید."
      : "با منابع ضروری هر درس از همین امروز برنامه‌ریزی کنید.";
  return (
    <div className="flex items-start gap-3 rounded-card bg-primary px-4 py-3 text-white md:max-w-sm">
      <ClockIcon size={22} className="mt-1 shrink-0 text-accent" />
      <div>
        <p className="font-bold">
          <span className="rounded-md bg-accent px-1.5 font-black text-ink">{toPersianDigits(days)} روز</span> تا {event.name}
        </p>
        <p className="mt-0.5 text-xs text-white/80">{event.dateLabel}</p>
        <p className="mt-1 text-sm leading-6 text-white/90">{hint}</p>
        {event.calendar && <AddToCalendar event={event.calendar} placement="kit" tone="dark" className="-ms-3 mt-1" />}
      </div>
    </div>
  );
}
