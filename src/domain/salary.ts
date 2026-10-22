import type {
  Currency,
  PayDelayMode,
  Person,
  SalaryAdjustment,
  SalaryAdjustmentType,
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

/** Sunday. Used when a person has never chosen their rest days. */
export const DEFAULT_REST_DAYS: number[] = [0];

/**
 * The weekdays nobody works (0 = Sunday … 6 = Saturday). A stopped day only costs money if it was
 * a working day, and the daily rate is the monthly salary over the working days in four weeks.
 * Resting every day of the week would leave no working day to price, so that counts as none.
 */
export function getRestDays(person: Person): number[] {
  if (!person.salaryRestDays) return DEFAULT_REST_DAYS;
  const days = [
    ...new Set(
      person.salaryRestDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort();
  return days.length >= 7 ? [] : days;
}

function weekdayOf(dateString: string): number {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year!, month! - 1, day).getDay();
}

function workingDaysBetween(from: string, to: string, restDays: number[]): number {
  let count = 0;
  for (let day = from; compareDateStrings(day, to) <= 0; day = addDays(day, 1)) {
    if (!restDays.includes(weekdayOf(day))) count += 1;
  }
  return count;
}
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

/** One adjustment as it landed on one period: signed amount (negative reduces), plus days for a stoppage. */
export interface AppliedAdjustment {
  id: string;
  type: SalaryAdjustmentType;
  amount: number;
  days?: number;
  note?: string;
}

interface Installment {
  periodStartDate: string;
  periodEndDate: string;
  payDate: string;
  /** What the period is worth after its adjustments. */
  amount: number;
  /** What it was worth before any adjustment. */
  baseAmount: number;
  /** What one working day is worth: the monthly salary over the working days in four weeks. */
  dailyRate: number;
  applied: AppliedAdjustment[];
  completed: boolean;
}

/**
 * Nearest-week value of a leftover span of days (never exact days) — used for the partial period
 * left behind when a segment is cut short by the next one taking over, or by the end date. Half a
 * week rounds up, matching how a person would eyeball 'closer to which week is this'.
 */
/**
 * Where the first period ends when the cycle is anchored on `cycleDate` rather than on the day
 * work began: the first cycle boundary after `start` (boundaries sit every `periodDays` from the
 * cycle date, in both directions). `start` itself when it already falls on one — no short period.
 */
function firstCycleBoundary(start: string, cycleDate: string, periodDays: number): string {
  const offset = ((daysBetweenDates(cycleDate, start) % periodDays) + periodDays) % periodDays;
  return offset === 0 ? start : addDays(start, periodDays - offset);
}

/** What a stretch of working days is worth at one daily rate, in whole currency units. */
function daysAmount(from: string, endExclusive: string, dailyRate: number, restDays: number[]) {
  const lastDay = addDays(endExclusive, -1);
  if (compareDateStrings(lastDay, from) < 0) return 0;
  return normalizeAmount(workingDaysBetween(from, lastDay, restDays) * dailyRate);
}

/**
 * The short first period a cycle date creates, for showing before saving: from the start up to the
 * first cycle boundary, priced by working days. Null when the start already sits on the cycle.
 */
export function describeFirstPeriod(input: {
  startDate: string;
  cycleDate: string;
  periodWeeks: number;
  monthly: number;
  restDays: number[];
}): { startDate: string; endDate: string; workingDays: number; amount: number } | null {
  if (!input.startDate || !input.cycleDate) return null;
  const periodDays = clampPeriodWeeks(input.periodWeeks) * 7;
  const endDate = firstCycleBoundary(input.startDate, input.cycleDate, periodDays);
  if (endDate === input.startDate) return null;
  const dailyRate = input.monthly / (4 * (7 - input.restDays.length));
  const workingDays = workingDaysBetween(input.startDate, addDays(endDate, -1), input.restDays);
  return {
    startDate: input.startDate,
    endDate,
    workingDays,
    amount: normalizeAmount(workingDays * dailyRate),
  };
}

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
  adjustments: SalaryAdjustment[] = [],
  restDays: number[] = DEFAULT_REST_DAYS,
  cycleDate = '',
): Installment[] {
  const referenceDateString = formatReferenceDate(referenceDate);
  const installments: Installment[] = [];
  const ended = Boolean(endDate) && compareDateStrings(endDate, referenceDateString) <= 0;
  // A cycle date means this person's partial periods are priced by working days, not rounded to
  // whole weeks — the short first period below, and the tail at an end date or a mid-period change.
  const byDays = Boolean(cycleDate);
  let segments = timeline;
  let firstSegmentWaiting = false;

  if (byDays && timeline.length > 0) {
    const first = timeline[0]!;
    const boundary = firstCycleBoundary(
      first.effectiveDate,
      cycleDate,
      clampPeriodWeeks(first.periodWeeks) * 7,
    );
    if (boundary !== first.effectiveDate) {
      const firstCutoff = timeline.length > 1 ? timeline[1]!.effectiveDate : ended ? endDate : null;
      const stubEnd =
        firstCutoff && compareDateStrings(firstCutoff, boundary) < 0 ? firstCutoff : boundary;
      const dailyRate = first.amount / (4 * (7 - restDays.length));
      const amount = daysAmount(first.effectiveDate, stubEnd, dailyRate, restDays);
      const stubDone =
        firstCutoff !== null || compareDateStrings(stubEnd, referenceDateString) <= 0;
      if (amount > 0) {
        installments.push({
          periodStartDate: first.effectiveDate,
          periodEndDate: stubEnd,
          payDate: computeSalaryPayDate(stubEnd, first.payDelayMode),
          amount,
          baseAmount: amount,
          dailyRate,
          applied: [],
          completed: stubDone,
        });
      }
      // The regular periods start where the short one ends. If it's still in progress it already
      // is the one 'what's next' period, so no further one is forecast behind it.
      segments = [{ ...first, effectiveDate: stubEnd }, ...timeline.slice(1)];
      firstSegmentWaiting = !stubDone;
    }
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const periodDays = clampPeriodWeeks(segment.periodWeeks) * 7;
    const isLastSegment = index === segments.length - 1;
    const nextSegmentStart = isLastSegment ? null : segments[index + 1]!.effectiveDate;
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
    } else if (index === 0 && firstSegmentWaiting) {
      periodCount = 0;
      completedCount = 0;
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
    const dailyRate = segment.amount / (4 * (7 - restDays.length));
    for (let k = 1; k <= periodCount; k += 1) {
      const periodStartDate = addDays(segment.effectiveDate, (k - 1) * periodDays);
      const periodEndDate = addDays(segment.effectiveDate, k * periodDays);
      const payDate = computeSalaryPayDate(periodEndDate, segment.payDelayMode);
      installments.push({
        periodStartDate,
        periodEndDate,
        payDate,
        amount,
        baseAmount: amount,
        dailyRate,
        applied: [],
        completed: k <= completedCount,
      });
    }

    if (cutoffDate) {
      const lastFullPeriodEnd = addDays(segment.effectiveDate, completedCount * periodDays);
      const remainderDays = daysBetweenDates(lastFullPeriodEnd, cutoffDate);
      const remainderWeeks = roundToNearestWeek(remainderDays);
      const remainderAmount = byDays
        ? daysAmount(lastFullPeriodEnd, cutoffDate, dailyRate, restDays)
        : periodAmountFor(segment.amount, remainderWeeks);
      // Exactly as before for anyone without a cycle date: a tail counts once it rounds to a week.
      if (byDays ? remainderAmount > 0 : remainderWeeks > 0) {
        const payDate = computeSalaryPayDate(cutoffDate, segment.payDelayMode);
        installments.push({
          periodStartDate: lastFullPeriodEnd,
          periodEndDate: cutoffDate,
          payDate,
          amount: remainderAmount,
          baseAmount: remainderAmount,
          dailyRate,
          applied: [],
          completed: true,
        });
      }
    }
  }
  return applyAdjustments(installments, adjustments, restDays);
}

/** How many WORKING days of a period (start included, end excluded) a stoppage covers. */
function stoppedDaysWithin(
  adjustment: SalaryAdjustment,
  installment: Installment,
  restDays: number[],
): number {
  const lastDay = addDays(installment.periodEndDate, -1);
  const from =
    compareDateStrings(adjustment.startDate, installment.periodStartDate) > 0
      ? adjustment.startDate
      : installment.periodStartDate;
  const stoppedTo = adjustment.endDate || adjustment.startDate;
  const to = compareDateStrings(stoppedTo, lastDay) < 0 ? stoppedTo : lastDay;
  return compareDateStrings(to, from) >= 0 ? workingDaysBetween(from, to, restDays) : 0;
}

/**
 * The one period a bonus or deduction belongs to: the one that holds its date. A date before the
 * first period joins the first, one after the last joins the last, so nothing recorded is ever
 * silently ignored.
 */
function periodIndexFor(date: string, installments: Installment[]): number {
  const index = installments.findIndex(
    (installment) =>
      compareDateStrings(date, installment.periodStartDate) >= 0 &&
      compareDateStrings(date, installment.periodEndDate) < 0,
  );
  if (index !== -1) return index;
  return compareDateStrings(date, installments[0]!.periodStartDate) < 0
    ? 0
    : installments.length - 1;
}

/**
 * Lets recorded stoppages, bonuses and deductions change what each period is worth, before the
 * payment waterfall ever sees the amounts — so due, upcoming, the strip and the period list all
 * agree without any of them knowing adjustments exist. A stoppage costs its WORKING days (rest days
 * are free) at the period's daily rate, each charged to whichever period holds it; a period can't
 * go below zero.
 */
function applyAdjustments(
  installments: Installment[],
  adjustments: SalaryAdjustment[],
  restDays: number[],
): Installment[] {
  if (adjustments.length === 0 || installments.length === 0) return installments;
  const indexById = new Map(
    adjustments
      .filter((adjustment) => adjustment.type !== 'stoppage')
      .map((adjustment) => [adjustment.id, periodIndexFor(adjustment.startDate, installments)]),
  );
  // A stoppage with its own amount (a corrected figure — say, for half a day) replaces the
  // calculated one. It is still charged to the periods that hold its working days, shared out in
  // proportion to them, with the last share taking the rounding so the shares add up exactly.
  const customShares = new Map<string, number[]>();
  for (const adjustment of adjustments) {
    if (adjustment.type !== 'stoppage' || adjustment.amount === undefined) continue;
    const total = normalizeAmount(adjustment.amount);
    const dayCounts = installments.map((installment) =>
      stoppedDaysWithin(adjustment, installment, restDays),
    );
    // Only rest days inside it: nothing to share by, so the whole amount lands where it starts.
    const weights = dayCounts.some((days) => days > 0)
      ? dayCounts
      : installments.map((_, index) =>
          index === periodIndexFor(adjustment.startDate, installments) ? 1 : 0,
        );
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const lastIndex = weights.reduce((last, weight, index) => (weight > 0 ? index : last), -1);
    let assigned = 0;
    customShares.set(
      adjustment.id,
      weights.map((weight, index) => {
        if (weight === 0) return 0;
        const share =
          index === lastIndex ? total - assigned : Math.round((total * weight) / weightSum);
        assigned += share;
        return share;
      }),
    );
  }
  return installments.map((installment, index) => {
    const applied: AppliedAdjustment[] = [];
    for (const adjustment of adjustments) {
      if (adjustment.type === 'stoppage') {
        const days = stoppedDaysWithin(adjustment, installment, restDays);
        const custom = customShares.get(adjustment.id);
        const charge = custom
          ? (custom[index] ?? 0)
          : normalizeAmount(days * installment.dailyRate);
        if (custom ? charge > 0 : days > 0) {
          applied.push({
            id: adjustment.id,
            type: 'stoppage',
            ...(days > 0 ? { days } : {}),
            amount: -charge,
            ...(adjustment.note ? { note: adjustment.note } : {}),
          });
        }
      } else if (indexById.get(adjustment.id) === index) {
        const amount = normalizeAmount(adjustment.amount);
        if (amount > 0) {
          applied.push({
            id: adjustment.id,
            type: adjustment.type,
            amount: adjustment.type === 'bonus' ? amount : -amount,
            ...(adjustment.note ? { note: adjustment.note } : {}),
          });
        }
      }
    }
    if (applied.length === 0) return installment;
    const net = applied.reduce((sum, item) => sum + item.amount, 0);
    return { ...installment, amount: Math.max(0, installment.baseAmount + net), applied };
  });
}

export interface UpcomingPayment {
  date: string;
  amount: number;
}

interface InstallmentClassification {
  due: number;
  upcoming: number;
  nextPayDate: string;
  upcomingPayments: UpcomingPayment[];
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
  const upcomingByDate = new Map<string, number>();
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
        // Two installments landing on the same date are one payment from the person's point of
        // view, so they're summed per date.
        upcomingByDate.set(
          installment.payDate,
          normalizeAmount((upcomingByDate.get(installment.payDate) ?? 0) + uncovered),
        );
      }
    }
  }
  // Sorted by date explicitly: a later segment with a shorter payment delay can pay out before an
  // earlier segment's last installment, so generation order isn't guaranteed to be date order.
  const upcomingPayments = [...upcomingByDate.entries()]
    .sort(([first], [second]) => compareDateStrings(first, second))
    .map(([date, amount]) => ({ date, amount }));
  return { due, upcoming, nextPayDate, upcomingPayments };
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

  const installments = buildInstallments(
    timeline,
    endDate,
    referenceDate,
    person.salaryAdjustments,
    getRestDays(person),
    person.salaryCycleDate,
  );
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

export type PeriodStatus = 'paid' | 'partial' | 'overdue' | 'upcoming';

export interface PeriodSummary {
  periodStartDate: string;
  periodEndDate: string;
  payDate: string;
  /** What the period is worth after its adjustments. */
  amount: number;
  /** What it was worth before them. */
  baseAmount: number;
  adjustments: AppliedAdjustment[];
  paidAmount: number;
  status: PeriodStatus;
}

/**
 * Every pay period as the person sees it — its dates, what it's worth, how much of that has been
 * covered, and one of four states: 'paid' (fully covered), 'partial' (some covered, some not),
 * 'overdue' (nothing covered and its pay date has arrived) or 'upcoming' (nothing covered yet,
 * pay date still ahead). It's the same installments and the same oldest-first payment waterfall
 * that calculateSalary uses for due/upcoming, so what a period shows here always agrees with
 * those totals — nothing is tracked or matched by hand.
 */
export function calculatePeriodStatuses(person: Person, referenceDate: Date): PeriodSummary[] {
  const timeline = getEffectiveTimeline(person);
  if (timeline.length === 0) return [];
  const config = getSalarySettings(person)!;
  const installments = buildInstallments(
    timeline,
    config.endDate,
    referenceDate,
    person.salaryAdjustments,
    getRestDays(person),
    person.salaryCycleDate,
  );
  const paid = salaryPaid(person);
  const referenceDateString = formatReferenceDate(referenceDate);
  let cumulative = 0;
  return installments.map((installment) => {
    cumulative = normalizeAmount(cumulative + installment.amount);
    const uncovered = Math.max(0, Math.min(installment.amount, normalizeAmount(cumulative - paid)));
    const paidAmount = normalizeAmount(installment.amount - uncovered);
    const isDue = compareDateStrings(installment.payDate, referenceDateString) <= 0;
    const status: PeriodStatus =
      uncovered <= 0.0001
        ? 'paid'
        : paidAmount > 0.0001
          ? 'partial'
          : isDue
            ? 'overdue'
            : 'upcoming';
    return {
      periodStartDate: installment.periodStartDate,
      periodEndDate: installment.periodEndDate,
      payDate: installment.payDate,
      amount: installment.amount,
      baseAmount: installment.baseAmount,
      adjustments: installment.applied,
      paidAmount,
      status,
    };
  });
}

/**
 * What's still owed and not yet due, broken out by the date each part actually gets paid —
 * e.g. 1000 on the 21st and then 750 on the 28th — instead of one lump sum under the first date.
 * The amounts add up to calculateSalary().upcoming exactly (same installments, same payment
 * waterfall), just not collapsed.
 */
export function calculateUpcomingPayments(person: Person, referenceDate: Date): UpcomingPayment[] {
  const timeline = getEffectiveTimeline(person);
  if (timeline.length === 0) return [];
  const config = getSalarySettings(person)!;
  const installments = buildInstallments(
    timeline,
    config.endDate,
    referenceDate,
    person.salaryAdjustments,
    getRestDays(person),
    person.salaryCycleDate,
  );
  return classifyInstallments(installments, salaryPaid(person), formatReferenceDate(referenceDate))
    .upcomingPayments;
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
