"use client";

import { useEffect, useState } from "react";
import { loadOwned, type OwnedState } from "@/lib/owned";
import { loadDeliverySummary } from "@/lib/delivery";
import type { DeliverySummary } from "@/lib/trust-types";

/** د۱: the shared /me/owned/ answer (null while loading). Logged-out visitors get `anonymous`. */
export function useOwned(): OwnedState | null {
  const [state, setState] = useState<OwnedState | null>(null);
  useEffect(() => {
    let alive = true;
    void loadOwned().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** د۲: the shared /delivery-estimate/ answer (null while loading or unavailable). */
export function useDeliverySummary(enabled = true): DeliverySummary | null {
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadDeliverySummary().then((s) => {
      if (alive) setSummary(s);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return summary;
}
