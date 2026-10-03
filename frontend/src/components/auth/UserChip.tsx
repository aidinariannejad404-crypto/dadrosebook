"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Me } from "@/lib/account-types";
import { routes } from "@/lib/config";
import { maskPhone } from "@/lib/otp";
import { apiFetch } from "@/lib/session";
import { UserIcon } from "@/components/ui/Icons";
import { AUTH_EVENT } from "./auth-events";

const chip =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control px-2 text-sm font-bold text-ink hover:bg-primary-soft md:px-3";

/**
 * Header login state. Client-only on purpose: the header is part of ISR catalog pages, so personal
 * data must not be rendered on the server. Defaults to the login link; asks GET /me/ on mount.
 */
export function UserChip() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    void apiFetch<Me>("/me/").then((res) => {
      if (alive) setMe(res.ok ? res.data : null);
    });
    const onAuth = (e: Event) => setMe((e as CustomEvent<Me | null>).detail ?? null);
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_EVENT, onAuth);
    };
  }, []);

  if (!me) {
    return (
      <Link prefetch={false} href={routes.login} className={chip}>
        <UserIcon size={22} />
        <span className="hidden sm:inline">ورود / ثبت‌نام</span>
        <span className="sr-only sm:hidden">ورود / ثبت‌نام</span>
      </Link>
    );
  }

  const name = me.first_name.trim() || maskPhone(me.phone);
  return (
    <Link prefetch={false} href={routes.account} className={chip}>
      <UserIcon size={22} />
      <span className="hidden flex-col text-start leading-tight sm:flex">
        <span>حساب من</span>
        <span dir="auto" className="max-w-32 truncate text-xs font-medium text-ink-muted">
          {name}
        </span>
      </span>
      <span className="sr-only sm:hidden">حساب من ({name})</span>
    </Link>
  );
}
