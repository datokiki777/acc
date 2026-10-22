import type { PeriodSummary } from '../../domain/salary';

const MAX_VISIBLE = 5;

/**
 * Which periods fit on the card: a short window of the latest ones, slid back just far enough to
 * keep one settled period before the first unpaid one in view — so you see where things stand
 * (last settled, what's open, what's next), not the whole history, which lives behind a tap.
 */
export function visiblePeriods(periods: PeriodSummary[]): PeriodSummary[] {
  if (periods.length <= MAX_VISIBLE) return periods;
  const firstOpen = periods.findIndex((period) => period.status !== 'paid');
  const anchor = firstOpen === -1 ? periods.length : firstOpen;
  const start = Math.max(0, Math.min(anchor - 1, periods.length - MAX_VISIBLE));
  return periods.slice(start, start + MAX_VISIBLE);
}

/**
 * "Paid through": the END DATE of the last period in the unbroken run of fully-paid periods from
 * the start — the day the work is paid up to, not the day the money was due. With a payment delay
 * the two differ (work through 07.10 gets paid on 21.10), and "paid through" is about the work.
 * Null when the very first period isn't settled; `allPaid` is true when nothing at all is open.
 */
export function paidThrough(periods: PeriodSummary[]): { date: string | null; allPaid: boolean } {
  const firstOpen = periods.findIndex((period) => period.status !== 'paid');
  const settled = firstOpen === -1 ? periods : periods.slice(0, firstOpen);
  return { date: settled[settled.length - 1]?.periodEndDate ?? null, allPaid: firstOpen === -1 };
}
