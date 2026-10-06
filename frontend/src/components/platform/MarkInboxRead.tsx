"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/session";
import { patchNavSummary } from "@/lib/nav-summary";

/** Opening «پیام‌های من» marks everything read (the bell badge clears without a reload). */
export function MarkInboxRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread <= 0) return;
    void apiFetch<{ unread: number }>("/inbox/read/", { method: "POST", json: {} }).then((res) => {
      if (res.ok) patchNavSummary({ unread: res.data.unread });
    });
  }, [unread]);
  return null;
}
