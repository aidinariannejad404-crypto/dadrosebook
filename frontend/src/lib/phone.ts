/**
 * Iranian mobile numbers for the study-plan form. Accepts Persian/Arabic-Indic digits, spaces,
 * dashes and +98 / 0098 / 98 prefixes; returns the canonical `09xxxxxxxxx` or null.
 */
export function normalizeMobile(raw: string): string | null {
  const ascii = raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s\-().‌‎‏]/g, "");
  let n = ascii;
  if (n.startsWith("+98")) n = n.slice(3);
  else if (n.startsWith("0098")) n = n.slice(4);
  else if (n.startsWith("98") && n.length === 12) n = n.slice(2);
  if (/^9\d{9}$/.test(n)) n = `0${n}`;
  return /^09\d{9}$/.test(n) ? n : null;
}

export const PHONE_ERROR = "شماره موبایل را به شکل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید.";
