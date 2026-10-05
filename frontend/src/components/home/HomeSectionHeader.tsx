import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/Icons";

interface HomeSectionHeaderProps {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  /** small element before the title, e.g. a discount mark */
  icon?: ReactNode;
}

/**
 * Homepage section header: the site's gold bar plus a subtle gold hairline that fades out along
 * the title row (decorative; gold is never used as text colour on white).
 */
export function HomeSectionHeader({ id, title, subtitle, href, linkLabel = "مشاهده همه", icon }: HomeSectionHeaderProps) {
  return (
    <div className="relative mb-4 pb-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="flex items-center gap-2 text-lg font-extrabold text-ink md:text-xl">
            <span aria-hidden="true" className="relative inline-flex h-6 w-1.5 shrink-0 overflow-hidden rounded-full bg-accent">
              <span className="absolute inset-x-0 top-0 h-2 bg-primary" />
            </span>
            {icon}
            {title}
          </h2>
          {subtitle && <p className="mt-1 ps-3.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link
            prefetch={false}
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            {linkLabel}
            <ChevronIcon size={18} />
          </Link>
        )}
      </div>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(270deg,var(--color-accent),transparent_80%)] opacity-70"
      />
      <span aria-hidden="true" className="absolute -bottom-[3px] start-0 size-[7px] rotate-45 bg-accent" />
    </div>
  );
}
