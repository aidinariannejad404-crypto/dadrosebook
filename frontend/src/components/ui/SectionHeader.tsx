import Link from "next/link";
import { ChevronIcon } from "./Icons";

interface SectionHeaderProps {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}

export function SectionHeader({ id, title, subtitle, href, linkLabel = "مشاهده همه" }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-lg font-extrabold text-ink md:text-xl">
          <span aria-hidden="true" className="inline-block h-5 w-1.5 rounded-full bg-accent" />
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
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
  );
}
