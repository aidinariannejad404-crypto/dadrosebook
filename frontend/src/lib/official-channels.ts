/**
 * PF-3 anti-phishing line («راه‌های رسمی ارتباط»). The SMS sender line is set by the owner
 * (NEXT_PUBLIC_SMS_SENDER); without it the line names only the domain and the SMS sender name.
 */
import { toPersianDigits } from "./format";

export function officialDomain(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "dadrosebook.com";
  }
}

export function officialChannelsText(siteUrl: string, smsSender = process.env.NEXT_PUBLIC_SMS_SENDER ?? ""): string {
  const domain = officialDomain(siteUrl);
  const sender = smsSender.trim();
  const from = sender ? `فقط از شماره پیامکی ${toPersianDigits(sender)}` : "فقط از سامانه پیامکی رسمی با نام «دادرُز»";
  return `دادرُز ${from} و با لینک‌های دامنه ${domain} پیام می‌دهد. کد ورود را به هیچ‌کس ندهید و به پیام‌هایی که «PDF رایگان» یا لینک دامنه دیگری می‌فرستند اعتماد نکنید.`;
}
