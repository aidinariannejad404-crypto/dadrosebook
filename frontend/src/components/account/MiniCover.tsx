import { BookCover } from "@/components/book/BookCover";

const FALLBACK = "#12264A";

/** A small BookCover for order lines (orders carry only a subject colour, not full subjects). */
export function MiniCover({
  title,
  cover,
  color,
  className = "w-12",
}: {
  title: string;
  cover: string | null;
  color: string | null;
  className?: string;
}) {
  return (
    <div className={`shrink-0 ${className}`}>
      <BookCover
        title={title}
        cover={cover}
        subjects={[{ id: 0, name: "", slug: "", color: color || FALLBACK }]}
        authors={[]}
        sizes="64px"
      />
    </div>
  );
}
