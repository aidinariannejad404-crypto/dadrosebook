import type { SVGProps } from "react";

/** Reader-only icons (reader stream), drawn like `components/ui/Icons` (decorative, currentColor). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** «گزارش مشکل»: a flag. */
export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);

/** «اشتراک به‌صورت تصویر»: a picture with an arrow. */
export const ImageShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="13" height="14" rx="2" />
    <path d="m3 16 4-4 3 3 2-2 4 4" />
    <path d="M18 9V3m0 0-2.5 2.5M18 3l2.5 2.5" />
  </Svg>
);

/** «جابه‌جا شده»: arrows crossing. */
export const MovedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h11l-3-3M20 17H9l3 3" />
  </Svg>
);
