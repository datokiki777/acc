import type {
  Currency,
  PayDelayMode,
  Person,
  SalaryCalculationResult,
  SalarySettings,
} from '../types/domain';
import { isSalaryEntry, normalizeAmount } from './entries';
import {
  addDays,
  capReferenceDate,
  compareDateStrings,
  computeSalaryPayDate,
  daysSince,
  daysUntil,
} from './pay-dates';

export const SALARY_PAY_SOON_DAYS = 3;
export const SALARY_GRACE_DAYS = 0;

export function getSalarySettings(person: Person): SalarySettings | null {
  const monthly = normalizeAmount(person.salaryAmount ?? 0);
  const startDate = person.salaryStartDate ?? '';
  const endDate = person.salaryEndDate ?? '';
  const periodWeeks = Math.min(
    52,
    Math.max(1, Number(person.salaryPayPeriodWeeks ?? person.salaryPayDay ?? 1)),
  );
  if (!monthly || !startDate) return null;

  return {
    monthly,
    startDate,
    endDate,
    periodWeeks,
    anchorDate: person.salaryPeriodAnchorDate ?? startDate,
    accruedBaseline: normalizeAmount(person.salaryAccruedBaseline ?? 0),
    currency: person.salaryCurrency ?? person.currency,
    payDelayMode: person.salaryPayDelayMode ?? 'none',
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

export function earliestUnpaidPayDate(
  config: SalarySettings,
  completedPeriods: number,
  paid: number,
  periodAmount: number,
): string {
  const periodAmountSafe = periodAmount > 0 ? periodAmount : 1;
  const paidPeriodsCount = Math.floor(paid / periodAmountSafe);
  const earliestUnpaidIndex = Math.min(completedPeriods, paidPeriodsCount + 1);
  const periodEndDate = addDays(config.anchorDate, earliestUnpaidIndex * config.periodWeeks * 7);
  return computeSalaryPayDate(periodEndDate, config.payDelayMode);
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
  const config = getSalarySettings(person);
  if (!config) return disabledSalaryResult();

  const referenceDateString = [
    referenceDate.getFullYear(),
    String(referenceDate.getMonth() + 1).padStart(2, '0'),
    String(referenceDate.getDate()).padStart(2, '0'),
  ].join('-');
  const ended =
    Boolean(config.endDate) && compareDateStrings(config.endDate, referenceDateString) <= 0;
  const calculationDate = config.endDate
    ? capReferenceDate(config.endDate, referenceDate)
    : referenceDate;
  const days = daysSince(config.anchorDate, calculationDate);
  const periodDays = config.periodWeeks * 7;
  const completedPeriods = Math.floor(days / periodDays);
  const periodAmount = normalizeAmount(config.monthly * (config.periodWeeks / 4));
  const accrued = config.accruedBaseline + normalizeAmount(periodAmount * completedPeriods);
  const paid = salaryPaid(person);
  const periodsTargeted = days <= 0 ? 1 : Math.ceil(days / periodDays);
  const boundariesReached = completedPeriods;
  const dueTarget =
    config.accruedBaseline +
    normalizeAmount(periodAmount * (ended ? boundariesReached : periodsTargeted));
  const remaining = Math.max(0, dueTarget - paid);
  const overdueTarget = config.accruedBaseline + normalizeAmount(periodAmount * boundariesReached);
  const overdueRemaining = Math.max(0, overdueTarget - paid);
  // If the reference date lands exactly on a period boundary and that period's due amount has
  // already been fully paid (e.g. paid in advance), the forecast should point to the *next*
  // period rather than reusing the boundary that was just settled.
  const landedOnPaidBoundary = days > 0 && days % periodDays === 0 && remaining <= 0;
  const forecastPeriodIndex = landedOnPaidBoundary ? periodsTargeted + 1 : periodsTargeted;
  const nextPeriodEndDate = addDays(config.anchorDate, forecastPeriodIndex * periodDays);
  const nextPayDateForecast = computeSalaryPayDate(nextPeriodEndDate, config.payDelayMode);
  const earliestUnpaidDate = earliestUnpaidPayDate(config, boundariesReached, paid, periodAmount);
  const isPastDue =
    overdueRemaining > 0.0001 &&
    ((config.accruedBaseline > 0 && boundariesReached === 0) ||
      (boundariesReached > 0 && daysUntil(earliestUnpaidDate, referenceDate) < -SALARY_GRACE_DAYS));
  const due = isPastDue ? Math.min(overdueRemaining, remaining) : 0;
  const nextPayDate =
    overdueRemaining > 0.0001 && !isPastDue ? earliestUnpaidDate : nextPayDateForecast;
  const daysUntilNextPay = ended ? null : daysUntil(nextPayDate, referenceDate);
  let upcoming = remaining - due;
  if (remaining <= 0 && !ended) {
    // The currently-targeted period is already fully paid (including advance payment, whether or
    // not its boundary date has technically arrived yet) — nothing is actually due or upcoming.
    upcoming = 0;
  }
  const paySoon =
    !ended && due <= 0 && daysUntilNextPay !== null && daysUntilNextPay <= SALARY_PAY_SOON_DAYS;

  return {
    enabled: true,
    accrued,
    paid,
    due,
    upcoming,
    currency: config.currency,
    days,
    monthly: config.monthly,
    periodWeeks: config.periodWeeks,
    periodAmount,
    completedPeriods,
    nextPayDate,
    daysUntilNextPay,
    paySoon,
    startDate: config.startDate,
    ended,
    endDate: config.endDate,
    payDelayMode: config.payDelayMode,
  };
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
