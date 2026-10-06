/** Exams are held in Iran: count down to 00:00 Tehran time (UTC+03:30, no DST since 2022). */
export const TEHRAN_OFFSET = "+03:30";

export interface Countdown {
  days: number;
  hours: number;
  past: boolean;
}

export function examCountdown(isoDate: string, now: number): Countdown {
  const target = Date.parse(`${isoDate}T00:00:00${TEHRAN_OFFSET}`);
  const diff = target - now;
  if (!Number.isFinite(diff) || diff <= 0) return { days: 0, hours: 0, past: true };
  const totalHours = Math.floor(diff / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24, past: false };
}
