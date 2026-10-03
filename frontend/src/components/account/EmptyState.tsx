import Link from "next/link";
import type { ReactNode } from "react";

/** Friendly empty list: icon, title, text and an optional call to action. */
export function EmptyState({
  icon,
  title,
  children,
  href,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-4 py-10 text-center">
      {icon && <div className="mb-3 text-primary">{icon}</div>}
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm leading-7 text-ink-muted">{children}</div>}
      {href && action && (
        <Link
          href={href}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
        >
          {action}
        </Link>
      )}
    </div>
  );
}
