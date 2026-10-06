"use client";

import { useState } from "react";
import { videoEmbed } from "@/lib/video";
import { ExternalIcon, PlayIcon } from "@/components/ui/Icons";

interface IntroVideoProps {
  url: string;
  /** book or course title, used in the accessible names */
  title: string;
  /** play-button caption */
  label?: string;
  /** iframe/video accessible name */
  videoTitle?: string;
}

/** Click-to-load facade: nothing from the video host is fetched until the user asks. */
export function IntroVideo({ url, title, label = "پخش ویدئوی معرفی کتاب", videoTitle }: IntroVideoProps) {
  const name = videoTitle ?? `ویدئوی معرفی ${title}`;
  const [active, setActive] = useState(false);
  const embed = videoEmbed(url);

  if (embed.kind === "link") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:bg-primary-soft"
      >
        <PlayIcon size={18} className="text-primary" />
        {label}
        <ExternalIcon size={16} />
        <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
      </a>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-primary">
      {active ? (
        embed.kind === "iframe" ? (
          <iframe
            src={embed.src}
            title={name}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <video src={embed.src} controls autoPlay playsInline className="absolute inset-0 size-full" aria-label={name} />
        )
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-3 text-white"
        >
          <span aria-hidden="true" className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.06)_0_1px,transparent_1px_10px)]" />
          <span aria-hidden="true" className="relative grid size-16 place-items-center rounded-full bg-accent text-ink shadow-raised transition-transform group-hover:scale-105">
            <PlayIcon size={30} />
          </span>
          <span className="relative px-4 text-center text-sm font-bold">{label}</span>
        </button>
      )}
    </div>
  );
}
