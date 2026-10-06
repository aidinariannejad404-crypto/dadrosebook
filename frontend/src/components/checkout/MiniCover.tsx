import { BookCover } from "@/components/book/BookCover";

/** Small book cover for order lines (subject colour fallback when there is no scan). */
export function MiniCover({
  title,
  cover,
  subjectColor,
  className = "w-14",
}: {
  title: string;
  cover: string | null;
  subjectColor: string | null;
  className?: string;
}) {
  return (
    <div className={`shrink-0 ${className}`}>
      <BookCover
        title={title}
        cover={cover}
        subjects={subjectColor ? [{ id: 0, name: "", slug: "", color: subjectColor }] : []}
        authors={[]}
        sizes="64px"
      />
    </div>
  );
}
