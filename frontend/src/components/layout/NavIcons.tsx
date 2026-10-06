import type { SVGProps } from "react";

/** Icons used only by the layout chrome (kept here so components/ui/Icons.tsx stays untouched). */
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

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    <path d="M12 14.5v2.5" />
  </Svg>
);

export const ReturnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const ArrowStartIcon = (p: IconProps) => (
  // points to the inline start (right in RTL)
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const InstagramIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
  </Svg>
);

export const TelegramIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m21 4.5-18 7 5.5 2 2 6 3.2-4.2L18.5 19 21 4.5Z" />
    <path d="m8.5 13.5 9-6.5" />
  </Svg>
);

export const WhatsappIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6l-3.9.9Z" />
    <path d="M9.2 8.8c.2-.5.6-.5.9-.5l.6 1.4c.1.2 0 .4-.1.6l-.4.5c.5 1 1.3 1.8 2.3 2.3l.5-.5c.2-.2.4-.2.6-.1l1.4.6c0 .4 0 .8-.5 1.1-.6.4-1.5.4-2.6-.1a7 7 0 0 1-3-3c-.5-1.1-.4-1.9.3-2.3Z" />
  </Svg>
);
