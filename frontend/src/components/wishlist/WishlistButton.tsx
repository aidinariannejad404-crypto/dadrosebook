"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/session";
import { trackWishlistToggle } from "@/lib/analytics";
import {
  GUEST_WISHLIST_EVENT,
  GUEST_WISHLIST_KEY,
  readGuestIds,
  setGuestHeart,
  writeGuestIds,
} from "@/lib/guest-wishlist";
import { AUTH_EVENT } from "@/components/auth/auth-events";
import { HeartIcon } from "@/components/ui/Icons";

type Ids = { kind: "user"; ids: Set<number> } | { kind: "guest" } | { kind: "error" };

// One GET /wishlist/ids/ per page load, shared by every heart on the page.
let idsPromise: Promise<Ids> | null = null;

/**
 * Logged-in visitor: their server ids, after merging any hearts kept in this browser while they
 * were a guest (ج۶, mirrors the cart merge on login). Anonymous visitor: the browser list.
 */
function loadIds(): Promise<Ids> {
  idsPromise ??= apiFetch<number[]>("/wishlist/ids/").then(async (r): Promise<Ids> => {
    if (r.ok && Array.isArray(r.data)) {
      const guest = readGuestIds();
      if (guest.length === 0) return { kind: "user", ids: new Set(r.data) };
      const merged = await apiFetch<{ ids: number[] }>("/wishlist/merge/", { method: "POST", json: { book_ids: guest } });
      if (merged.ok) {
        writeGuestIds([]);
        return { kind: "user", ids: new Set(merged.data.ids) };
      }
      return { kind: "user", ids: new Set(r.data) };
    }
    if (r.status === 401 || r.status === 403) return { kind: "guest" };
    idsPromise = null; // transient failure: let the next button / click retry
    return { kind: "error" };
  });
  return idsPromise;
}

/** Keep the shared cache in sync after a toggle. */
function remember(bookId: number, on: boolean) {
  void idsPromise?.then((s) => {
    if (s.kind === "user") {
      if (on) s.ids.add(bookId);
      else s.ids.delete(bookId);
    }
  });
}

interface WishlistButtonProps {
  bookId: number;
  bookTitle?: string;
  className?: string;
  /** show the text next to the heart */
  showLabel?: boolean;
}

const HINT_MS = 5000;

/**
 * Heart toggle (aria-pressed). Guests are no longer sent to /login (ج۶): their hearts are kept in
 * this browser (/wishlist) and moved into the account when they log in.
 */
export function WishlistButton({ bookId, bookTitle, className = "", showLabel = false }: WishlistButtonProps) {
  const [state, setState] = useState<"loading" | "guest" | "ready">("loading");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState(0); // >0: show «دیدن علاقه‌مندی‌ها» after a guest heart

  useEffect(() => {
    let alive = true;
    const sync = () =>
      loadIds().then((s) => {
        if (!alive) return;
        if (s.kind === "guest") {
          setOn(readGuestIds().includes(bookId));
          setState("guest");
        } else {
          setOn(s.kind === "user" && s.ids.has(bookId));
          setState("ready");
        }
      });
    void sync();
    // login/logout in this tab: reload (a login merges the guest hearts first)
    const onAuth = () => {
      idsPromise = null;
      void sync();
    };
    // another heart for the same book, or another tab, changed the guest list
    const onGuest = () => {
      void idsPromise?.then((s) => {
        if (alive && s.kind === "guest") setOn(readGuestIds().includes(bookId));
      });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_WISHLIST_KEY) onGuest();
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(GUEST_WISHLIST_EVENT, onGuest);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(GUEST_WISHLIST_EVENT, onGuest);
      window.removeEventListener("storage", onStorage);
    };
  }, [bookId]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(0), HINT_MS);
    return () => window.clearTimeout(t);
  }, [hint]);

  function toggleGuest(next: boolean) {
    setOn(next);
    setGuestHeart(bookId, next);
    setHint(next ? Date.now() : 0);
    trackWishlistToggle({ item_id: bookId, on: next, guest: true });
    setMessage(
      next ? "به علاقه‌مندی‌ها افزوده شد. با ورود به حساب، این فهرست در همه دستگاه‌ها می‌ماند." : "از علاقه‌مندی‌ها حذف شد.",
    );
  }

  async function toggle() {
    if (state === "guest") return toggleGuest(!on);
    if (busy || state === "loading") return;
    const next = !on;
    setBusy(true);
    setOn(next);
    setMessage("");
    const res = next
      ? await apiFetch("/wishlist/", { method: "POST", json: { book_id: bookId } })
      : await apiFetch(`/wishlist/${bookId}/`, { method: "DELETE" });
    setBusy(false);
    if (res.ok || (!next && res.status === 404)) {
      remember(bookId, next);
      trackWishlistToggle({ item_id: bookId, on: next, guest: false });
      setMessage(next ? "به علاقه‌مندی‌ها افزوده شد." : "از علاقه‌مندی‌ها حذف شد.");
      return;
    }
    if (res.status === 401) {
      // the session ended meanwhile: keep the heart in this browser instead
      idsPromise = null;
      setState("guest");
      return toggleGuest(next);
    }
    setOn(!next);
    setMessage(errorMessage(res.error, undefined, "علاقه‌مندی‌ها به‌روز نشد. دوباره تلاش کنید."));
  }

  const label = on ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";

  return (
    // `relative` anchors the guest hint, unless the caller already positions the heart (cards: absolute)
    <span className={`${/\babsolute\b/.test(className) ? "" : "relative "}inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={state === "loading" ? undefined : on}
        aria-label={showLabel ? undefined : bookTitle ? `${label}: ${bookTitle}` : label}
        aria-busy={busy || undefined}
        className={`press inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border transition-colors ${
          on ? "border-danger bg-danger-soft text-danger" : "border-line-strong bg-surface text-ink-muted hover:text-danger"
        } ${showLabel ? "px-4 text-sm font-bold" : ""}`}
      >
        <HeartIcon size={22} filled={on} className={on ? "motion-pop" : undefined} />
        {showLabel && <span>{label}</span>}
      </button>
      {hint > 0 && state === "guest" && on && (
        <Link
          href="/wishlist"
          prefetch={false}
          className="absolute end-0 top-full z-20 mt-1 inline-flex min-h-11 items-center whitespace-nowrap rounded-control bg-ink px-3 text-xs font-bold text-white shadow-raised hover:underline"
        >
          دیدن علاقه‌مندی‌ها
        </Link>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </span>
  );
}
