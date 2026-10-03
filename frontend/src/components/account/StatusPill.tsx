import { TONE_CLASSES, type Tone } from "@/lib/order-status";

/** Small coloured status label (order or review status). */
export function StatusPill({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
