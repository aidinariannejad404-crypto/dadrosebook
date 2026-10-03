"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "@/lib/session";
import { accountRoutes } from "@/lib/account-routes";

/**
 * Shown by the account layout when the server could not identify the visitor.
 * - With a session cookie (access token expired, refresh may still be valid): refresh, then re-render.
 * - Otherwise, or when the refresh fails: go to /login?next=<this page>.
 */
export function SessionGate({ hasCookie }: { hasCookie: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const next = qs ? `${pathname}?${qs}` : pathname;
  const loginHref = accountRoutes.login(next);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!hasCookie) {
      router.replace(loginHref);
      return;
    }
    refreshSession().then((ok) => {
      if (ok) router.refresh();
      else {
        setFailed(true);
        router.replace(loginHref);
      }
    });
  }, [hasCookie, loginHref, router]);

  return (
    <div className="flex flex-col items-center px-4 py-16 text-center" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary-tint border-t-primary"
      />
      <p className="mt-4 text-ink">
        {hasCookie && !failed ? "در حال بررسی ورود شما…" : "برای دیدن حساب کاربری باید وارد شوید."}
      </p>
      <Link
        href={loginHref}
        className="mt-4 inline-flex min-h-11 items-center rounded-control px-4 font-bold text-primary underline-offset-4 hover:underline"
      >
        ورود به حساب
      </Link>
    </div>
  );
}
