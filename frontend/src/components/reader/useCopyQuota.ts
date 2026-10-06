"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import { recordCopy, type ReaderResult } from "@/lib/reader";
import { planCopy, quotaAfterCopy, quotaRemaining } from "@/lib/reader-epub";
import type { CopyQuota, CopyRecorded, ReaderSession } from "@/lib/types";

export const QUOTA_EXHAUSTED_MESSAGE = "سهمیه کپی این کتاب تمام شده است";

/**
 * Phase 6b copy rule shared by both readers: cut the selection to min(copy_limit, limit − used)
 * using the last known `used`, return the clipboard text, then report the copy (POST /copies/) and
 * adopt the server's `used`. `used` is advanced optimistically so quick repeated copies stay inside
 * the quota even before the server answers.
 */
export function useCopyQuota(
  slug: string,
  session: ReaderSession | null,
  flash: (msg: string) => void,
  /** Phase 6b: offline-aware reporter (queues the report without network); defaults to POST /copies/ */
  record: (slug: string, chars: number) => Promise<ReaderResult<CopyRecorded>> = recordCopy,
) {
  const [quota, setQuotaState] = useState<CopyQuota | null>(session?.copy_quota ?? null);
  const quotaRef = useRef<CopyQuota | null>(session?.copy_quota ?? null);
  const reqRef = useRef(0);

  const setQuota = useCallback((q: CopyQuota | null) => {
    quotaRef.current = q;
    setQuotaState(q);
  }, []);

  // a new session (PDF reader loads it after mount; reload after a device change) brings the server's count
  useEffect(() => {
    if (session) setQuota(session.copy_quota ?? null);
  }, [session, setQuota]);

  /** Clipboard text for a selection (empty selection → null: let the browser do nothing special). */
  const copyText = useCallback(
    (selection: string): string | null => {
      if (!selection || !session) return null;
      const plan = planCopy(selection, session.copy_limit, quotaRef.current, session.book);
      if (plan.exhausted) {
        flash(`${QUOTA_EXHAUSTED_MESSAGE}؛ فقط ذکر منبع کپی شد.`);
        return plan.text;
      }
      if (plan.chars > 0) {
        if (quotaRef.current) setQuota(quotaAfterCopy(quotaRef.current, plan.chars));
        const id = ++reqRef.current;
        void record(slug, plan.chars).then((res) => {
          // only the latest answer wins (answers to earlier copies would undo the optimistic step)
          if (res.ok && id === reqRef.current) setQuota({ limit: res.data.limit, used: res.data.used });
        });
      }
      if (plan.limitedBy === "quota") {
        flash(`سهمیه کپی این کتاب رو به پایان است؛ فقط ${formatNumber(plan.chars)} نویسه، همراه با ذکر منبع، کپی شد.`);
      } else if (plan.limitedBy === "copy") {
        flash(`فقط ${formatNumber(session.copy_limit)} نویسه نخست، همراه با ذکر منبع، کپی شد.`);
      } else {
        flash("متن همراه با ذکر منبع کپی شد.");
      }
      return plan.text;
    },
    [slug, session, flash, setQuota, record],
  );

  /**
   * و۲ quote card: spend up to `chars` of the quota (online only) and return how many the server
   * granted (0 = exhausted), or null when the report could not be sent.
   */
  const spend = useCallback(
    async (chars: number): Promise<number | null> => {
      const want = Math.min(Math.max(0, Math.floor(chars)), quotaRemaining(quotaRef.current));
      if (want <= 0) return 0;
      const res = await record(slug, want);
      if (!res.ok) return null;
      setQuota({ limit: res.data.limit, used: res.data.used });
      return res.data.granted;
    },
    [slug, record, setQuota],
  );

  return { quota, copyText, spend };
}
