"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function ViewItemTracker({ id, name, price }: { id: number; name: string; price: number | null }) {
  useEffect(() => {
    track("view_item", { item_id: id, item_name: name, price: price ?? undefined, currency: "TOMAN" });
  }, [id, name, price]);
  return null;
}
