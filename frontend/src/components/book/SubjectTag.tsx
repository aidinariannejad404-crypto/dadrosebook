import Link from "next/link";
import type { SubjectMini } from "@/lib/types";
import { routes } from "@/lib/config";

interface SubjectTagProps {
  subject: SubjectMini;
  /** link to the subject hub /subject/<slug> (package ب; was the noindexed /search?subject=) */
  link?: boolean;
  size?: "sm" | "md";
}

/**
 * Subject colour chip: colour dot + ink text on a light tint of the subject colour (AA-safe for any hue).
 */
export function SubjectTag({ subject, link = false, size = "sm" }: SubjectTagProps) {
  const style = {
    "--subject": subject.color,
    backgroundColor: "color-mix(in srgb, var(--subject) 12%, #fff)",
    borderColor: "color-mix(in srgb, var(--subject) 35%, #fff)",
  } as React.CSSProperties;
  const cls = `inline-flex items-center gap-1.5 rounded-full border font-medium text-ink ${
    size === "sm" ? "px-2 py-0.5 text-xs" : "min-h-11 px-3 text-sm"
  }`;
  const content = (
    <>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
      {subject.name}
    </>
  );
  if (link) {
    return (
      <Link prefetch={false} href={routes.subject(subject.slug)} className={`${cls} hover:brightness-95`} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <span className={cls} style={style}>
      {content}
    </span>
  );
}
