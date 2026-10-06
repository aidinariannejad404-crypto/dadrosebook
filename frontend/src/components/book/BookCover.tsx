import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { PersonMini, SubjectMini } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";
import styles from "./Book3D.module.css";

export type BookCoverVariant = "card" | "product" | "hero";

interface BookCoverProps {
  title: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
  volumes?: number;
  /** next/image sizes hint */
  sizes?: string;
  priority?: boolean;
  /** resting pose: cards turn to the viewer on hover, product rests a little flatter */
  variant?: BookCoverVariant;
  className?: string;
}

const FALLBACK_COLOR = "#12264A";

/**
 * Book cover rendered as a CSS-only 3D book (see Book3D.module.css): real cover image via
 * next/image on the front face, or the generated subject-colour cover when there is no scan.
 * Spine (right, RTL binding), page block, top edge, ground shadow and — for multi-volume sets —
 * a second volume standing behind. Fixed 2:3 box, so layout never shifts.
 */
export function BookCover({
  title,
  cover,
  subjects,
  authors,
  volumes = 1,
  sizes = "(min-width: 1024px) 200px, 45vw",
  priority = false,
  variant = "card",
  className = "",
}: BookCoverProps) {
  const color = subjects[0]?.color ?? FALLBACK_COLOR;
  const author = authors.map((a) => a.name).join("، ");
  const multi = volumes >= 2;

  const art = (decorative: boolean): ReactNode =>
    cover ? (
      <Image
        src={cover}
        alt={decorative ? "" : `جلد کتاب ${title}`}
        fill
        sizes={sizes}
        priority={priority && !decorative}
        className="object-cover"
      />
    ) : (
      <GeneratedCover
        title={title}
        subject={subjects[0]?.name}
        author={author}
        volumes={volumes}
        decorative={decorative}
      />
    );

  const sceneClass = [styles.scene, multi ? styles.thick : "", variant !== "card" ? styles[variant] : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={sceneClass} style={{ "--book-color": color } as CSSProperties}>
      <div className={styles.stage}>
        <div className={styles.book}>
          <div aria-hidden="true" className={`${styles.face} ${styles.ground}`} />
          {multi && (
            <div aria-hidden="true" className={styles.vol2}>
              <BookBody>{art(true)}</BookBody>
            </div>
          )}
          <BookBody>{art(false)}</BookBody>
        </div>
      </div>
    </div>
  );
}

/** The six-ish faces of one volume; only the front carries content. */
function BookBody({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className={`${styles.face} ${styles.back}`} />
      <div aria-hidden="true" className={`${styles.face} ${styles.pages}`} />
      <div aria-hidden="true" className={`${styles.face} ${styles.top}`} />
      <div aria-hidden="true" className={`${styles.face} ${styles.spine}`} />
      <div className={`${styles.face} ${styles.front}`}>{children}</div>
    </>
  );
}

/** Subject-colour cover for books without a scan: pattern, frame, title, gold rule, author. */
function GeneratedCover({
  title,
  subject,
  author,
  volumes,
  decorative,
}: {
  title: string;
  subject: string | undefined;
  author: string;
  volumes: number;
  decorative: boolean;
}) {
  return (
    <div
      className="absolute inset-0 text-white [container-type:inline-size]"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": `جلد کتاب ${title}${author ? ` اثر ${author}` : ""}` })}
    >
      {/* subtle diagonal pattern (CSS only, no duplicate SVG ids) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.07)_0_1px,transparent_1px_9px)]"
      />
      {/* lighting: soft vignette from the top */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(255_255_255/0.2),transparent_60%)]"
      />
      {/* double frame line */}
      <div aria-hidden="true" className="absolute inset-y-[5%] end-[7%] start-[13%] rounded-[2px] border border-[rgb(214_180_100/0.55)]" />
      <div aria-hidden="true" className="absolute inset-y-[6.5%] end-[8.5%] start-[14.5%] rounded-[1px] border border-[rgb(255_255_255/0.16)]" />

      <div aria-hidden="true" className="absolute inset-y-[5%] end-[7%] start-[13%] flex flex-col items-center px-[6%] py-[9%] text-center">
        <span className="text-[6.5cqw] font-medium tracking-wide text-[rgb(236_214_160)]">{subject ?? "کتاب دادرُز"}</span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="line-clamp-4 text-[11cqw] font-extrabold leading-[1.35] [text-shadow:0_0.6cqw_2cqw_rgb(0_0_0/0.25)]">
            {title}
          </span>
          <span className="mt-[7cqw] block h-[1.4cqw] w-[24cqw] rounded-full bg-accent" />
        </div>
        {volumes > 1 && (
          <span className="mb-[3cqw] rounded-full bg-[rgb(255_255_255/0.18)] px-[4cqw] py-[0.8cqw] text-[6cqw] font-bold">
            {toPersianDigits(volumes)} جلد
          </span>
        )}
        {author && <span className="line-clamp-1 text-[7cqw] font-medium opacity-90">{author}</span>}
      </div>
    </div>
  );
}
