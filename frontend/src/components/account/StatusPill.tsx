import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "@/lib/order-status";
import { CheckIcon, ClockIcon, CloseIcon, PackageIcon, TruckIcon } from "@/components/ui/Icons";

const ICON = { size: 14, strokeWidth: 2.3 } as const;

const TONE_ICONS: Record<Tone, ReactNode> = {
  success: <CheckIcon {...ICON} />,
  warning: <ClockIcon {...ICON} />,
  danger: <CloseIcon {...ICON} />,
  info: <ClockIcon {...ICON} />,
  primary: <TruckIcon {...ICON} />,
  neutral: <CloseIcon {...ICON} />,
};

/** Order-status icons: the status reads from the icon and label, never from the colour alone. */
const ORDER_ICONS: Record<string, ReactNode> = {
  PENDING_PAYMENT: <ClockIcon {...ICON} />,
  PAID: <CheckIcon {...ICON} />,
  PROCESSING: <PackageIcon {...ICON} />,
  SHIPPED: <TruckIcon {...ICON} />,
  DELIVERED: <CheckIcon {...ICON} />,
  CANCELLED: <CloseIcon {...ICON} />,
  FAILED: <CloseIcon {...ICON} />,
};

/** Small status chip (order or review status): tone colour + icon + label (WCAG 1.4.1). */
export function StatusPill({
  tone,
  icon,
  children,
  className = "",
}: {
  tone: Tone;
  /** overrides the tone's default icon; `null` for none */
  icon?: ReactNode | null;
  children: ReactNode;
  className?: string;
}) {
  const glyph = icon === undefined ? TONE_ICONS[tone] : icon;
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[tone]} ${className}`}
    >
      {glyph && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {glyph}
        </span>
      )}
      {children}
    </span>
  );
}

/** An order's status chip: per-status icon (clock, check, package, truck, ×) + tone colour + label. */
export function OrderStatusChip({
  status,
  tone,
  children,
  className,
}: {
  status: string;
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <StatusPill tone={tone} icon={ORDER_ICONS[status]} className={className}>
      {children}
    </StatusPill>
  );
}
