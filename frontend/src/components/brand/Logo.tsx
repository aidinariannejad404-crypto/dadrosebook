import Image from "next/image";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

/*
 * Dadrose logo. The mark is read from /public/brand/ so replacing the files swaps the logo everywhere:
 *   - replace public/brand/logo-mark.svg (square mark) and public/brand/logo.svg (lockup) with the official files;
 *   - the wordmark is HTML text in the self-hosted Vazirmatn (not baked into the SVG);
 *   - if the official logo.svg already contains the wordmark, set LOCKUP_INCLUDES_WORDMARK = true.
 * See public/brand/README.md.
 */
export const LOGO_MARK_SRC = "/brand/logo-mark.svg";
export const LOGO_LOCKUP_SRC = "/brand/logo.svg";
export const LOGO_LOCKUP_ON_DARK_SRC = "/brand/logo-on-dark.svg";
const LOCKUP_INCLUDES_WORDMARK = false;

export type LogoVariant = "header" | "footer-on-dark" | "compact";

const markSize: Record<LogoVariant, number> = { header: 40, "footer-on-dark": 44, compact: 34 };

interface LogoProps {
  variant?: LogoVariant;
  /** wrap in a link (e.g. "/"); the link gets an accessible name */
  href?: string;
  className?: string;
  /** above-the-fold header logo: load eagerly */
  priority?: boolean;
}

export function Logo({ variant = "header", href, className = "", priority = false }: LogoProps) {
  const dark = variant === "footer-on-dark";
  const size = markSize[variant];

  const content = LOCKUP_INCLUDES_WORDMARK ? (
    <Image
      src={dark ? LOGO_LOCKUP_ON_DARK_SRC : LOGO_LOCKUP_SRC}
      alt={href ? "" : SITE_NAME}
      width={size * 3.7}
      height={size}
      priority={priority}
      unoptimized
    />
  ) : (
    <>
      <Image
        src={LOGO_MARK_SRC}
        alt=""
        width={size}
        height={size}
        priority={priority}
        unoptimized
        className={`shrink-0 rounded-[24%] ${dark ? "ring-1 ring-white/25" : ""}`}
      />
      <span className="flex flex-col leading-tight">
        <span
          className={`whitespace-nowrap font-black tracking-tight ${variant === "compact" ? "text-base" : "text-lg md:text-xl"} ${
            dark ? "text-white" : "text-primary"
          }`}
        >
          کتاب <span className={dark ? "text-accent" : ""}>دادرُز</span>
        </span>
        {variant !== "compact" && (
          <span className={`text-[0.6875rem] font-medium ${dark ? "text-white/80" : "text-ink-muted"}`}>
            منابع آزمون وکالت و قضاوت
          </span>
        )}
      </span>
    </>
  );

  const cls = `inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-control ${className}`;
  if (href) {
    return (
      <Link href={href} prefetch={false} className={cls} aria-label={`${SITE_NAME} — صفحه اصلی`}>
        {content}
      </Link>
    );
  }
  return (
    <span className={cls} role={LOCKUP_INCLUDES_WORDMARK ? undefined : "img"} aria-label={LOCKUP_INCLUDES_WORDMARK ? undefined : SITE_NAME}>
      {content}
    </span>
  );
}
