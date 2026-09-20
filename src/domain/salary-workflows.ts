import type { Entry, PayDelayMode, Person, SalaryChangeRecord } from '../types/domain';
import { normalizeAmount } from './entries';
import { formatReferenceDate } from './pay-dates';
import { calculateSalary } from './salary';

export function applyPayPeriodChange(
  person: Person,
  nextPeriodWeeks: number,
  referenceDate: Date,
): Person {
  const previousPeriodWeeks = Math.min(
    52,
    Math.max(1, Number(person.salaryPayPeriodWeeks ?? person.salaryPayDay ?? 1)),
  );
  const normalizedNextPeriod = Math.min(52, Math.max(1, Number(nextPeriodWeeks || 1)));
  const wasConfigured = Boolean(person.salaryAmount && person.salaryStartDate);
  const next = { ...person, entries: person.entries.map((entry) => ({ ...entry })) };

  if (wasConfigured && previousPeriodWeeks !== normalizedNextPeriod) {
    next.salaryAccruedBaseline = calculateSalary(person, referenceDate).accrued;
    next.salaryPeriodAnchorDate = formatReferenceDate(referenceDate);
  }
  next.salaryPayPeriodWeeks = normalizedNextPeriod;
  delete next.salaryPayDay;
  return next;
}

export function applySalaryAmountChange(
  person: Person,
  nextAmount: number,
  effectiveDate: Date,
): Person {
  const wasConfigured = Boolean(person.salaryAmount && person.salaryStartDate);
  const next = { ...person, entries: person.entries.map((entry) => ({ ...entry })) };

  if (wasConfigured && person.salaryAmount !== nextAmount) {
    next.salaryAccruedBaseline = calculateSalary(person, effectiveDate).accrued;
    next.salaryPeriodAnchorDate = formatReferenceDate(effectiveDate);
    const record: SalaryChangeRecord = {
      effectiveDate: formatReferenceDate(effectiveDate),
      previousAmount: person.salaryAmount ?? 0,
      newAmount: nextAmount,
    };
    next.salaryHistory = [record, ...(person.salaryHistory ?? [])].slice(0, 20);
  }
  next.salaryAmount = nextAmount;
  return next;
}

export interface SyncPayDateInput {
  adjustmentAmount: number;
  newAnchorDate: string;
  adjustmentEntryId: string;
  referenceDate: Date;
  newAmount?: number;
  payDelayMode?: PayDelayMode;
}

export function syncPayDate(person: Person, input: SyncPayDateInput): Person {
  const adjustmentAmount = normalizeAmount(input.adjustmentAmount);
  const entries: Entry[] = person.entries.map((entry) => ({ ...entry }));
  if (adjustmentAmount > 0) {
    entries.unshift({
      id: input.adjustmentEntryId,
      amount: adjustmentAmount,
      type: 'Gave',
      date: formatReferenceDate(input.referenceDate),
      comment: '[Salary] Schedule sync adjustment',
      category: 'salary',
    });
  }
  const next: Person = { ...person, entries };
  const wasConfigured = Boolean(person.salaryAmount && person.salaryStartDate);
  const amountChanging =
    wasConfigured && input.newAmount !== undefined && person.salaryAmount !== input.newAmount;
  const currentAnchor = person.salaryPeriodAnchorDate ?? person.salaryStartDate ?? '';
  const dateChanging = wasConfigured && input.newAnchorDate !== currentAnchor;

  if (amountChanging) {
    // Amount is changing too: bank accrued-under-the-OLD-rate as of this date, so past periods
    // keep the old rate/accounting and only periods from here forward use the new one.
    next.salaryAccruedBaseline = calculateSalary(person, input.referenceDate).accrued;
    const record: SalaryChangeRecord = {
      effectiveDate: input.newAnchorDate,
      previousAmount: person.salaryAmount ?? 0,
      newAmount: input.newAmount as number,
    };
    next.salaryHistory = [record, ...(person.salaryHistory ?? [])].slice(0, 20);
    next.salaryAmount = input.newAmount as number;
    next.salaryPeriodAnchorDate = input.newAnchorDate;
  } else if (!wasConfigured || dateChanging) {
    // Only the schedule date is actually changing (or this is a first-time setup): 'paid' is
    // always a live sum over every salary entry, so a plain recalibration needs no banked
    // baseline at all — it just goes stale if banked.
    next.salaryAccruedBaseline = 0;
    next.salaryPeriodAnchorDate = input.newAnchorDate;
  }
  // Otherwise neither the date nor the amount actually changed (e.g. this save only touched
  // Payment Timing or added a one-time adjustment) — leave the anchor/baseline exactly as they
  // were instead of silently resetting the whole schedule.
  if (input.payDelayMode !== undefined) next.salaryPayDelayMode = input.payDelayMode;
  return next;
}

export function resetSalaryWhenUnarchiving(person: Person, referenceDate: Date): Person {
  return {
    ...person,
    entries: person.entries.map((entry) => ({ ...entry })),
    // See syncPayDate: 'paid' is always live, so banking it here would only create a stale
    // snapshot that drifts if any already-counted entry is edited later.
    salaryAccruedBaseline: 0,
    salaryPeriodAnchorDate: formatReferenceDate(referenceDate),
    salaryEndDate: '',
    archived: false,
    expanded: false,
  };
}

export function endSalaryWhenArchiving(person: Person, referenceDate: Date): Person {
  if (person.salaryEndDate) return person;
  return { ...person, salaryEndDate: formatReferenceDate(referenceDate) };
}
