/** PF-1: «کد نیامد؟» appears this long after a code was sent. */
export const OTP_HELP_AFTER_SECONDS = 60;

export function otpHelpVisible(sentAt: number | null, now: number, after = OTP_HELP_AFTER_SECONDS): boolean {
  return sentAt != null && now - sentAt >= after * 1000;
}
