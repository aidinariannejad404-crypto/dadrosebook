/**
 * د۳ post-purchase «شروع مطالعه»: small pure rules for the paid state of /checkout/result.
 */
import type { Order } from "./account-types";
import { toPersianDigits } from "./format";
import type { StartStudying } from "./trust-types";

/** The shipping line: the promised window, or the generic note when no range is configured. */
export function shippingLine(order: Pick<Order, "needs_shipping" | "delivery_estimate">): string | null {
  if (!order.needs_shipping) return null;
  if (order.delivery_estimate) return `تحویل تقریبی نسخه چاپی: ${order.delivery_estimate.label}`;
  return "نسخه چاپی سفارش شما آماده ارسال می‌شود؛ کد رهگیری مرسوله پیامک خواهد شد.";
}

/** «حقوق مدنی دوجلدی، درسنامه تجارت و ۲ کتاب دیگر» */
export function booksLabel(books: { title: string }[], max = 2): string {
  if (books.length === 0) return "";
  const shown = books.slice(0, max).map((b) => `«${b.title}»`);
  const rest = books.length - shown.length;
  if (rest <= 0) return shown.join(" و ");
  return `${shown.join("، ")} و ${toPersianDigits(rest)} کتاب دیگر`;
}

/** Reader button text: a fresh book starts at page 1, a started one continues. */
export function readFirstAction(readFirst: StartStudying["read_first"]): string {
  if (!readFirst) return "";
  return readFirst.percent_read > 0 ? "ادامه مطالعه" : "شروع مطالعه از صفحه ۱";
}

/** Exam line for the plan button: «۴۰ روز تا آزمون کانون ۱۴۰۵». */
export function examLine(start: Pick<StartStudying, "exam"> | null): string | null {
  const exam = start?.exam;
  if (!exam || exam.days_left == null || exam.days_left < 0) return null;
  const name = exam.event_name ?? exam.name;
  return exam.days_left === 0 ? `${name} امروز است` : `${toPersianDigits(exam.days_left)} روز تا ${name}`;
}
