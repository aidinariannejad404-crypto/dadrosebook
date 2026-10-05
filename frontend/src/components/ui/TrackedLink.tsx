"use client";

import type { AnchorHTMLAttributes } from "react";
import { trackCourseCrossSellClick, type CourseCrossSellClick } from "@/lib/analytics";

interface TrackedLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** fires `course_cross_sell_click` with these params on click */
  course: CourseCrossSellClick;
  external?: boolean;
}

/** Plain <a> to an academy course that fires `course_cross_sell_click` on click. */
export function TrackedLink({ course, external, onClick, children, ...rest }: TrackedLinkProps) {
  return (
    <a
      {...rest}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      onClick={(e) => {
        trackCourseCrossSellClick(course);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
