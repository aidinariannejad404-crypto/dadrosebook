"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/session";
import { accountRoutes } from "@/lib/account-routes";
import { HeartIcon } from "@/components/ui/Icons";

type Ids = { kind: "user"; ids: Set<number> } | { kind: "anonymous" } | { kind: "error" };

// One GET /wishlist/ids/ per page load, shared by every heart on the page.
let idsPromise: Promise<Ids> | null = null;

function loadIds(): Promise<Ids> {
  idsPromise ??= apiFetch<number[]>("/wishlist/ids/").then((r): Ids => {
    if (r.ok && Array.isArray(r.data)) return { kind: "user", ids: new Set(r.data) };
    if (r.status === 401 || r.status === 403) return { kind: "anonymous" };
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

/** Heart toggle (aria-pressed). Anonymous visitors are sent to /login and come back here. */
export function WishlistButton({ bookId, bookTitle, className = "", showLabel = false }: WishlistButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "anonymous" | "ready">("loading");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    loadIds().then((s) => {
      if (!alive) return;
      if (s.kind === "anonymous") setState("anonymous");
      else {
        setOn(s.kind === "user" && s.ids.has(bookId));
        setState("ready");
      }
    });
    return () => {
      alive = false;
    };
  }, [bookId]);

  function goLogin() {
    router.push(accountRoutes.login(`${window.location.pathname}${window.location.search}`));
  }

  async function toggle() {
    if (state === "anonymous") return goLogin();
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
      setMessage(next ? "به علاقه‌مندی‌ها افزوده شد." : "از علاقه‌مندی‌ها حذف شد.");
      return;
    }
    setOn(!next);
    if (res.status === 401) {
      idsPromise = null;
      setState("anonymous");
      return goLogin();
    }
    setMessage(errorMessage(res.error, undefined, "علاقه‌مندی‌ها به‌روز نشد. دوباره تلاش کنید."));
  }

  const label = on ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";

  return (
    <span className={`inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={state === "anonymous" ? undefined : on}
        aria-label={showLabel ? undefined : bookTitle ? `${label}: ${bookTitle}` : label}
        aria-busy={busy || undefined}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border transition-colors ${
          on ? "border-danger bg-danger-soft text-danger" : "border-line-strong bg-surface text-ink-muted hover:text-danger"
        } ${showLabel ? "px-4 text-sm font-bold" : ""}`}
      >
        <HeartIcon size={22} filled={on} />
        {showLabel && <span>{label}</span>}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </span>
  );
}
