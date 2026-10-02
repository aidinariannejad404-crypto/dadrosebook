import Link from "next/link";

export interface Crumb {
  name: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="مسیر صفحه" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1 text-ink-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.name}-${i}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link prefetch={false} href={item.href} className="inline-flex min-h-11 items-center rounded-sm hover:text-primary hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="line-clamp-1 font-medium text-ink">
                  {item.name}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="px-1 text-line-strong">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
