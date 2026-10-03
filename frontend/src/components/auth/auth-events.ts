import type { Me } from "@/lib/account-types";

/** Fired on window when the visitor logs in or out, so the header chip updates without a reload. */
export const AUTH_EVENT = "dadrose:auth";

export function announceAuth(me: Me | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Me | null>(AUTH_EVENT, { detail: me }));
}
