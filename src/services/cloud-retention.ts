// How long and how many cloud history copies are kept. Pure (no Firebase) so the rule can be tested.

/** One copy per day; at most this many are kept, today's included. */
export const CLOUD_HISTORY_MAX_RECORDS = 30;
/** A copy is kept this long from its own day, if newer ones haven't pushed it out first. */
export const CLOUD_HISTORY_RETENTION_MONTHS = 6;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year!, month! - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

/** When the copy for a given day stops having to be kept (for the server-side expiry). */
export function historyExpiry(dateKey: string): Date {
  const day = parseDateKey(dateKey);
  if (!day) throw new Error(`Not a history date: ${dateKey}`);
  return addMonths(day, CLOUD_HISTORY_RETENTION_MONTHS);
}

export interface HistoryDoc {
  id: string;
  /** The stored expiry, if the copy has one, in milliseconds. */
  expireAtMs?: number | undefined;
}

export interface RetentionPlan {
  /** Copies to delete. */
  remove: string[];
  /** Copies that are kept but whose stored expiry is shorter than it should now be. */
  refreshExpiry: { id: string; expireAt: Date }[];
}

/**
 * What to do with the history copies after a save.
 *
 * Counted, not aged: the newest 30 are kept (today's included) and anything beyond that goes, one
 * per new day. An age rule would wipe the whole history on the first save after a long pause,
 * since everything would be 'old' by then; a count leaves the last 30 untouched while nothing is
 * being written. Only copies older than six months are dropped by age, which is how long they are
 * promised to be kept.
 *
 * Copies saved under the earlier 30-day rule carry a 30-day expiry; those that are kept get it
 * raised to six months from their own day, so a server-side expiry can't remove them early.
 * Documents whose id is not a date are neither counted nor touched.
 */
export function planHistoryRetention(docs: HistoryDoc[], referenceDate: Date): RetentionPlan {
  const dated = docs
    .map((doc) => ({ doc, day: parseDateKey(doc.id) }))
    .filter((item): item is { doc: HistoryDoc; day: Date } => item.day !== null)
    .sort((first, second) => (first.doc.id < second.doc.id ? 1 : -1));
  const oldestKept = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() - CLOUD_HISTORY_RETENTION_MONTHS,
    referenceDate.getDate(),
  );

  const plan: RetentionPlan = { remove: [], refreshExpiry: [] };
  dated.forEach(({ doc, day }, index) => {
    if (index >= CLOUD_HISTORY_MAX_RECORDS || day.getTime() < oldestKept.getTime()) {
      plan.remove.push(doc.id);
      return;
    }
    const expireAt = addMonths(day, CLOUD_HISTORY_RETENTION_MONTHS);
    if (doc.expireAtMs === undefined || doc.expireAtMs < expireAt.getTime()) {
      plan.refreshExpiry.push({ id: doc.id, expireAt });
    }
  });
  return plan;
}
