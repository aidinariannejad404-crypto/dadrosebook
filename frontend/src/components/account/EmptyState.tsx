import Link from "next/link";
import type { ReactNode } from "react";

/** Friendly empty list: icon badge, title, short copy and a call to action (no illustrations). */
export function EmptyState({
  icon,
  title,
  children,
  href,
  action,
  headingLevel = 2,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  href?: string;
  action?: string;
  headingLevel?: 2 | 3;
}) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-5 py-10 text-center shadow-card">
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 grid size-20 place-items-center rounded-full bg-primary-soft text-primary ring-4 ring-accent-soft"
        >
          {icon}
        </div>
      )}
      <H className="text-base font-extrabold leading-7 text-ink md:text-lg">{title}</H>
      {children && <div className="mt-2 max-w-md text-sm leading-7 text-ink-muted">{children}</div>}
      {href && action && (
        <Link
          href={href}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-6 font-bold text-white shadow-card hover:bg-primary-hover"
        >
          {action}
        </Link>
      )}
    </div>
  );
}
