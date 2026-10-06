"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountRoutes } from "@/lib/account-routes";
import { trackStudyPlanLinked } from "@/lib/analytics";
import { apiFetch, errorMessage } from "@/lib/session";
import { studyRoutes, type LivingPlan } from "@/lib/study";

/**
 * On the printable /plan/<token> page: «پیگیری روزانه در حساب من». Links the lead plan to the
 * account (same phone), then opens /account/plan. Anonymous visitors go through login first.
 */
export function LinkPlanButton({ token, className = "" }: { token: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function link() {
    setBusy(true);
    setError("");
    const res = await apiFetch<LivingPlan>("/study/plan/", { method: "POST", json: { lead_token: token } });
    setBusy(false);
    if (res.status === 401) {
      router.push(accountRoutes.login(`/plan/${token}`));
      return;
    }
    if (!res.ok) {
      setError(errorMessage(res.error, undefined, "اتصال برنامه انجام نشد. دوباره تلاش کنید."));
      return;
    }
    trackStudyPlanLinked({ source: "lead" });
    router.push(studyRoutes.plan);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void link()}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-sm font-extrabold text-[color:var(--color-on-accent)] hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "در حال اتصال…" : "پیگیری روزانه در حساب من"}
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-sm font-bold text-white empty:hidden">
        {error}
      </p>
    </div>
  );
}
