"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_READER_TYPOGRAPHY,
  READER_FONTS,
  loadReaderTypography,
  saveReaderTypography,
  type ReaderTypography,
} from "@/lib/reader-typography";

/** PF-6: reader font + Persian-digits preference (localStorage, next to the reader theme). */
export function useReaderTypography(): [ReaderTypography, (t: ReaderTypography) => void] {
  const [value, setValue] = useState<ReaderTypography>(DEFAULT_READER_TYPOGRAPHY);
  useEffect(() => setValue(loadReaderTypography()), []);
  const update = useCallback((t: ReaderTypography) => {
    setValue(t);
    saveReaderTypography(t);
  }, []);
  return [value, update];
}

/** «نوع قلم» and «ارقام فارسی» in the reader's display settings sheet. */
export function ReaderTypographyControls({ value, onChange }: { value: ReaderTypography; onChange: (t: ReaderTypography) => void }) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">نوع قلم</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {READER_FONTS.map((f) => {
            const on = value.font === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, font: f.value })}
                className={`flex min-h-11 flex-col items-start justify-center rounded-control border px-3 py-2 text-start ${
                  on ? "border-primary bg-primary-soft" : "border-line-strong"
                }`}
              >
                <span className="text-base font-bold" style={{ fontFamily: f.family }}>
                  {f.label}
                </span>
                <span className="text-xs text-ink-muted">{f.sample}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold" id="reader-fa-digits-label">
          ارقام فارسی در متن کتاب
          <span className="block text-xs font-normal text-ink-muted">مثلاً «ماده ۱۰» به‌جای «ماده 10»</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={value.persianDigits}
          aria-labelledby="reader-fa-digits-label"
          onClick={() => onChange({ ...value, persianDigits: !value.persianDigits })}
          className="inline-flex min-h-11 min-w-11 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className={`relative inline-block h-7 w-12 rounded-full border-2 transition-colors ${
              value.persianDigits ? "border-primary bg-primary" : "border-line-strong bg-bg"
            }`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full shadow-card transition-[inset-inline-start] ${
                value.persianDigits ? "start-[1.4rem] bg-surface" : "start-0.5 bg-ink-muted"
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
