"use client";

import { useEffect } from "react";
import { trackViewItem } from "@/lib/analytics";

export function ViewItemTracker({
  id,
  name,
  price,
  subject,
}: {
  id: number;
  name: string;
  price: number | null;
  /** primary subject slug */
  subject?: string;
}) {
  useEffect(() => {
    trackViewItem({ item_id: id, item_name: name, price, subject });
  }, [id, name, price, subject]);
  return null;
}
