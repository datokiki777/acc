import type {
  Currency,
  PayDelayMode,
  Person,
  SalaryCalculationResult,
  SalarySettings,
  SalaryTimelineEntry,
} from '../types/domain';
import { isSalaryEntry, normalizeAmount } from './entries';
import {
  addDays,
  compareDateStrings,
  computeSalaryPayDate,
  daysBetweenDates,
  daysUntil,
  formatReferenceDate,
} from './pay-dates';

export const SALARY_PAY_SOON_DAYS = 3;
export const SALARY_GRACE_DAYS = 0;

function clampPeriodWeeks(value: number): number {
  return Math.min(52, Math.max(1, Number(value) || 1));
}

/**
 * The single source of truth for a salary's whole schedule: an ascending-sorted list of segments,
 * each saying 'from this date, the rate/period/timing is this'. Every calculation below replays
 * this list against the live entries — there is no separate 'baseline' or 'anchor' snapshot to
 * keep in sync, so adding, correcting, or removing a past change can never leave a stale number
 * behind. For a person saved before this model existed (no salaryTimeline yet), one is derived
 * on the fly from the legacy fields — this is a pure, read-only reconstruction; nothing is
 * persisted until the person is next saved through a workflow that writes salaryTimeline.
 */
export function getEffectiveTimeline(person: Person): SalaryTimelineEntry[] {
  if (person.salaryTimeline && person.salaryTimeline.length > 0) {
    return [...person.salaryTimeline].sort((first, second) =>
      first.effectiveDate < second.effectiveDate
        ? -1
        : first.effectiveDate > second.effectiveDate
          ? 1
          : 0,
    );
  }
  if (!person.salaryAmount || !person.salaryStartDate) return [];
  const periodWeeks = clampPeriodWeeks(person.salaryPayPeriodWeeks ?? person.salaryPayDay ?? 1);
  const payDelayMode = person.salaryPayDelayMode ?? 'none';
  const history = [...(person.salaryHistory ?? [])].sort((first, second) =>
    first.effectiveDate < second.effectiveDate
      ? -1
      : first.effectiveDate > second.effectiveDate
        ? 1
        : 0,
  );
  const segments: SalaryTimelineEntry[] = [];
  const initialAmount = normalizeAmount(
    history.length > 0 ? history[0]!.previousAmount : person.salaryAmount,
  );
  segments.push({
    effectiveDate: person.salaryStartDate,
    amount: initialAmount,
    periodWeeks,
    payDelayMode,
  });
  for (const change of history) {
    segments.push({
      effectiveDate: change.effectiveDate,
      amount: normalizeAmount(change.newAmount),
      periodWeeks,
      payDelayMode,
    });
  }
  // A plain re-anchor (no amount change) from before this model existed left no trace in
  // salaryHistory — only the anchor field itself. Add it as its own segment if it isn't already
  // covered by one of the amount-change segments above.
  const anchor = person.salaryPeriodAnchorDate;
  if (anchor && !segments.some((segment) => segment.effectiveDate === anchor)) {
    segments.push({
      effectiveDate: anchor,
      amount: normalizeAmount(person.salaryAmount),
      periodWeeks,
      payDelayMode,
    });
  }
  return segments.sort((first, second) =>
    first.effectiveDate < second.effectiveDate
      ? -1
      : first.effectiveDate > second.effectiveDate
        ? 1
        : 0,
  );
}

export function getSalarySettings(person: Person): SalarySettings | null {
  const timeline = getEffectiveTimeline(person);
  if (timeline.length === 0) return null;
  const latest = timeline[timeline.length - 1]!;
  return {
    monthly: normalizeAmount(latest.amount),
    startDate: timeline[0]!.effectiveDate,
    endDate: person.salaryEndDate ?? '',
    periodWeeks: latest.periodWeeks,
    anchorDate: latest.effectiveDate,
    accruedBaseline: 0,
    currency: person.salaryCurrency ?? person.currency,
    payDelayMode: latest.payDelayMode,
  };
}

export function salaryPaid(person: Pick<Person, 'entries'>): number {
  return person.entries.reduce((sum, entry) => {
    if (!isSalaryEntry(entry)) return sum;
    if (entry.type === 'Gave') return sum + normalizeAmount(entry.amount);
    if (entry.type === 'Received') return sum - normalizeAmount(entry.amount);
    return sum;
  }, 0);
}

export function salaryPaidBefore(person: Pick<Person, 'entries'>, cutoffDate: string): number {
  return person.entries.reduce((sum, entry) => {
    if (!isSalaryEntry(entry) || !(entry.date < cutoffDate)) return sum;
    if (entry.type === 'Gave') return sum + normalizeAmount(entry.amount);
    if (entry.type === 'Received') return sum - normalizeAmount(entry.amount);
    return sum;
  }, 0);
}

function periodAmountFor(monthly: number, periodWeeks: number): number {
  return normalizeAmount(monthly * (periodWeeks / 4));
}

interface Installment {
  periodEndDate: string;
  payDate: string;
  amount: number;
  completed: boolean;
}

/**
 * Nearest-week value of a leftover span of days (never exact days) — used for the partial period
 * left behind when a segment is cut short by the next one taking over, or by the end date. Half a
 * week rounds up, matching how a person would eyeball 'closer to which week is this'.
 */
function roundToNearestWeek(days: number): number {
  return Math.round(days / 7);
}

/**
 * Walks the whole timeline and produces the list of period installments (period-end date, its
 * own delayed pay date, and its amount) up to the relevant cutoff — the end date if the person
 * has finished, or far enough past 'today' to always include at least one still-upcoming
 * installment otherwise (a long payment delay can otherwise leave every generated installment
 * already in the past). Each segment contributes its own FULLY COMPLETED periods, plus — when
 * the next segment takes over (or the end date lands) partway through what would have been one
 * more period — a single extra installment for that leftover stretch, valued at its NEAREST WEEK
 * (not exact days) and already completed, due right when the cut happened. This is what makes a
 * re-anchor a real accounting event rather than a place days can quietly vanish: every day is
 * either a full period, part of this nearest-week remainder, or too small a sliver (under half a
 * week) to matter.
 */
function buildInstallments(
  timeline: SalaryTimelineEntry[],
  endDate: string,
  referenceDate: Date,
): Installment[] {
  const referenceDateString = formatReferenceDate(referenceDate);
  const installments: Installment[] = [];
  const ended = Boolean(endDate) && compareDateStrings(endDate, referenceDateString) <= 0;

  for (let index = 0; index < timeline.length; index += 1) {
    const segment = timeline[index]!;
    const periodDays = clampPeriodWeeks(segment.periodWeeks) * 7;
    const isLastSegment = index === timeline.length - 1;
    const nextSegmentStart = isLastSegment ? null : timeline[index + 1]!.effectiveDate;
    let periodCount: number;
    let completedCount: number;
    let cutoffDate: string | null = null;

    if (!isLastSegment) {
      const span = daysBetweenDates(segment.effectiveDate, nextSegmentStart!);
      periodCount = Math.max(0, Math.floor(span / periodDays));
      completedCount = periodCount;
      cutoffDate = nextSegmentStart;
    } else if (ended) {
      const span = daysBetweenDates(segment.effectiveDate, endDate);
      periodCount = Math.max(0, Math.floor(span / periodDays));
      completedCount = periodCount;
      cutoffDate = endDate;
    } else {
      const span = daysBetweenDates(segment.effectiveDate, referenceDateString);
      completedCount = Math.max(0, Math.floor(span / periodDays));
      // Exactly one not-yet-completed installment is added — but only when it's actually needed
      // as the forward-looking 'what's next' placeholder: when there's no completed installment
      // whose own (possibly delayed) pay date is still in the future to serve that role already.
      // Without this check, a payment delay left the still-in-progress period showing alongside
      // the just-finished one that's simply awaiting its delayed pay date — the same 'next
      // payment' counted twice.
      const lastCompletedPayDate =
        completedCount > 0
          ? computeSalaryPayDate(
              addDays(segment.effectiveDate, completedCount * periodDays),
              segment.payDelayMode,
            )
          : null;
      const needsForecastInstallment =
        completedCount === 0 || compareDateStrings(lastCompletedPayDate!, referenceDateString) < 0;
      periodCount = needsForecastInstallment ? completedCount + 1 : completedCount;
    }

    const amount = periodAmountFor(segment.amount, segment.periodWeeks);
    for (let k = 1; k <= periodCount; k += 1) {
      const periodEndDate = addDays(segment.effectiveDate, k * periodDays);
      const payDate = computeSalaryPayDate(periodEndDate, segment.payDelayMode);
      installments.push({ periodEndDate, payDate, amount, completed: k <= completedCount });
    }

    if (cutoffDate) {
      const lastFullPeriodEnd = addDays(segment.effectiveDate, completedCount * periodDays);
      const remainderDays = daysBetweenDates(lastFullPeriodEnd, cutoffDate);
      const remainderWeeks = roundToNearestWeek(remainderDays);
      if (remainderWeeks > 0) {
        const remainderAmount = periodAmountFor(segment.amount, remainderWeeks);
        const payDate = computeSalaryPayDate(cutoffDate, segment.payDelayMode);
        installments.push({
          periodEndDate: cutoffDate,
          payDate,
          amount: remainderAmount,
          completed: true,
        });
      }
    }
  }
  return installments;
}

interface InstallmentClassification {
  due: number;
  upcoming: number;
  nextPayDate: string;
}

/**
 * Applies a straightforward payment waterfall: the live, all-time paid total is allocated against
 * installments in chronological order, oldest first. Whatever isn't covered by the time we reach
 * an installment is that installment's shortfall — split into 'due' (its own pay date has already
 * passed) or 'upcoming' (it hasn't yet). This one direct comparison naturally handles advance
 * payment, underpayment spanning several periods, and exact-boundary settlement alike, with no
 * separate bookkeeping of 'how many periods are already paid' needed anywhere.
 */
function classifyInstallments(
  installments: Installment[],
  paid: number,
  referenceDateString: string,
): InstallmentClassification {
  let cumulative = 0;
  let due = 0;
  let upcoming = 0;
  let nextPayDate = '';
  for (const installment of installments) {
    cumulative = normalizeAmount(cumulative + installment.amount);
    const uncovered = Math.max(0, Math.min(installment.amount, cumulative - paid));
    // SALARY_GRACE_DAYS is 0: an installment is already due the moment its pay date arrives,
    // today included — not the day after.
    const isPast = compareDateStrings(installment.payDate, referenceDateString) <= 0;
    if (uncovered > 0.0001) {
      if (isPast) due = normalizeAmount(due + uncovered);
      else {
        upcoming = normalizeAmount(upcoming + uncovered);
        if (!nextPayDate) nextPayDate = installment.payDate;
      }
    }
  }
  return { due, upcoming, nextPayDate };
}

/**
 * When everything generated so far is already fully settled (nothing due or upcoming), this
 * finds the delayed pay date of the very next period after the timeline's last segment — purely
 * for display ('here's when your next cycle completes'), never counted toward any amount.
 */
function forecastFollowingPayDate(timeline: SalaryTimelineEntry[], referenceDate: Date): string {
  const latest = timeline[timeline.length - 1];
  if (!latest) return '';
  const referenceDateString = formatReferenceDate(referenceDate);
  const periodDays = clampPeriodWeeks(latest.periodWeeks) * 7;
  const span = daysBetweenDates(latest.effectiveDate, referenceDateString);
  const periodsTargeted = span <= 0 ? 1 : Math.ceil(span / periodDays);
  const landedOnBoundary = span > 0 && span % periodDays === 0;
  const nextIndex = landedOnBoundary ? periodsTargeted + 1 : periodsTargeted;
  const periodEndDate = addDays(latest.effectiveDate, nextIndex * periodDays);
  return computeSalaryPayDate(periodEndDate, latest.payDelayMode);
}

function disabledSalaryResult(): SalaryCalculationResult {
  return {
    enabled: false,
    accrued: 0,
    paid: 0,
    due: 0,
    upcoming: 0,
    currency: 'EUR',
    days: 0,
    monthly: 0,
    periodWeeks: 1,
    periodAmount: 0,
    completedPeriods: 0,
    nextPayDate: '',
    daysUntilNextPay: null,
    paySoon: false,
    ended: false,
    endDate: '',
  };
}

export function calculateSalary(person: Person, referenceDate: Date): SalaryCalculationResult {
  const timeline = getEffectiveTimeline(person);
  if (timeline.length === 0) return disabledSalaryResult();

  const config = getSalarySettings(person)!;
  const referenceDateString = formatReferenceDate(referenceDate);
  const endDate = config.endDate;
  const ended = Boolean(endDate) && compareDateStrings(endDate, referenceDateString) <= 0;
  const latest = timeline[timeline.length - 1]!;
  const periodAmount = periodAmountFor(latest.amount, latest.periodWeeks);
  const days = daysBetweenDates(latest.effectiveDate, ended ? endDate : referenceDateString);
  const completedPeriods = Math.max(0, Math.floor(days / (latest.periodWeeks * 7)));

  const installments = buildInstallments(timeline, endDate, referenceDate);
  const accrued = installments.reduce(
    (sum, installment) => sum + (installment.completed ? installment.amount : 0),
    0,
  );
  const paid = salaryPaid(person);
  const classification = classifyInstallments(installments, paid, referenceDateString);
  const nextPayDate =
    classification.nextPayDate || (ended ? '' : forecastFollowingPayDate(timeline, referenceDate));
  const { due, upcoming } = classification;
  const daysUntilNextPay = ended || !nextPayDate ? null : daysUntil(nextPayDate, referenceDate);
  const paySoon =
    !ended && due <= 0 && daysUntilNextPay !== null && daysUntilNextPay <= SALARY_PAY_SOON_DAYS;

  return {
    enabled: true,
    accrued: normalizeAmount(accrued),
    paid,
    due,
    upcoming,
    currency: config.currency,
    days,
    monthly: config.monthly,
    periodWeeks: latest.periodWeeks,
    periodAmount,
    completedPeriods,
    nextPayDate,
    daysUntilNextPay,
    paySoon,
    startDate: config.startDate,
    ended,
    endDate,
    payDelayMode: latest.payDelayMode,
  };
}

/**
 * Whether a salaried person still has money owed to or from them (due or upcoming) as of the
 * reference date. Used to keep an archived person ('finished working') visible in the Active list
 * until their final payment is actually settled, instead of the outstanding balance silently
 * disappearing into the Archived tab along with them.
 */
export function hasOutstandingSalaryBalance(person: Person, referenceDate: Date): boolean {
  const result = calculateSalary(person, referenceDate);
  return result.enabled && (result.due > 0 || result.upcoming > 0);
}

export interface GiftSummary {
  gave: number;
  received: number;
  total: number;
  net: number;
  currency: Currency;
}

export function giftSummary(person: Person): GiftSummary {
  const totals = person.entries.reduce(
    (sum, entry) => {
      if (entry.category !== 'gift') return sum;
      const amount = normalizeAmount(entry.amount);
      if (entry.type === 'Gave') sum.gave += amount;
      if (entry.type === 'Received') sum.received += amount;
      return sum;
    },
    { gave: 0, received: 0 },
  );
  return {
    ...totals,
    total: totals.gave + totals.received,
    net: totals.gave - totals.received,
    currency: person.salaryCurrency ?? person.currency,
  };
}

export type { PayDelayMode };
