import type { PayDelayMode, Person, SalaryTimelineEntry } from '../types/domain';
import { normalizeAmount } from './entries';
import { formatReferenceDate } from './pay-dates';
import { getEffectiveTimeline } from './salary';

function sortTimeline(timeline: SalaryTimelineEntry[]): SalaryTimelineEntry[] {
  return [...timeline].sort((first, second) =>
    first.effectiveDate < second.effectiveDate
      ? -1
      : first.effectiveDate > second.effectiveDate
        ? 1
        : 0,
  );
}

/**
 * Writes a person's whole salary timeline in one shot, plus the legacy display fields kept in
 * sync alongside it (for any other code that still reads salaryAmount/salaryStartDate/etc.
 * directly, and so a JSON export stays readable) — but salaryTimeline is the only thing
 * calculateSalary actually trusts. salaryAccruedBaseline and salaryHistory are cleared: there is
 * nothing left for them to do once a timeline exists.
 */
function withTimeline(person: Person, timeline: SalaryTimelineEntry[]): Person {
  const sorted = sortTimeline(timeline);
  const next: Person = {
    ...person,
    entries: person.entries.map((entry) => ({ ...entry })),
    salaryTimeline: sorted,
  };
  delete next.salaryAccruedBaseline;
  delete next.salaryHistory;
  delete next.salaryPayDay;
  if (sorted.length === 0) {
    delete next.salaryAmount;
    delete next.salaryStartDate;
    delete next.salaryPeriodAnchorDate;
    delete next.salaryPayPeriodWeeks;
    delete next.salaryPayDelayMode;
    return next;
  }
  const first = sorted[0]!;
  const latest = sorted[sorted.length - 1]!;
  next.salaryAmount = latest.amount;
  next.salaryStartDate = first.effectiveDate;
  next.salaryPeriodAnchorDate = latest.effectiveDate;
  next.salaryPayPeriodWeeks = latest.periodWeeks;
  next.salaryPayDelayMode = latest.payDelayMode;
  next.salaryCurrency = next.salaryCurrency ?? next.currency;
  return next;
}

export interface TimelineChangeInput {
  effectiveDate: string;
  amount?: number;
  periodWeeks?: number;
  payDelayMode?: PayDelayMode;
}

/**
 * The one operation behind every kind of schedule change — a new monthly amount, a new pay
 * period, a new payment delay, or any combination, all becoming effective from the same date.
 * Whatever isn't specified carries forward from the current latest segment (or, for a brand-new
 * salary, sensible defaults). If a segment already exists at this exact date (editing the same
 * change again), it's replaced rather than duplicated.
 */
export function applyTimelineChange(person: Person, input: TimelineChangeInput): Person {
  const timeline = getEffectiveTimeline(person);
  const latest = timeline[timeline.length - 1];
  const newSegment: SalaryTimelineEntry = {
    effectiveDate: input.effectiveDate,
    amount: normalizeAmount(input.amount ?? latest?.amount ?? 0),
    periodWeeks: Math.min(52, Math.max(1, input.periodWeeks ?? latest?.periodWeeks ?? 2)),
    payDelayMode: input.payDelayMode ?? latest?.payDelayMode ?? 'none',
  };
  const withoutSameDate = timeline.filter(
    (segment) => segment.effectiveDate !== input.effectiveDate,
  );
  return withTimeline(person, [...withoutSameDate, newSegment]);
}

/**
 * Replaces the entire timeline at once — used by 'Manage Salary History' to correct or add any
 * past change, including the very first (starting) segment. This is the same operation as
 * applyTimelineChange, just for the whole list instead of one date at a time: nothing needs
 * separately 'replaying' or re-banking, since calculateSalary always derives everything fresh
 * from whatever timeline is stored.
 */
export function replaceTimeline(person: Person, timeline: SalaryTimelineEntry[]): Person {
  return withTimeline(person, timeline);
}

/**
 * One-time payment recorded today, alongside (or instead of) a schedule change — a plain salary
 * entry, nothing more. Kept as its own small step since it touches entries, not the timeline.
 */
export function addOneTimeAdjustment(
  person: Person,
  amount: number,
  entryId: string,
  referenceDate: Date,
): Person {
  const normalized = normalizeAmount(amount);
  if (normalized <= 0) return person;
  return {
    ...person,
    entries: [
      {
        id: entryId,
        amount: normalized,
        type: 'Gave',
        date: formatReferenceDate(referenceDate),
        comment: '[Salary] Schedule sync adjustment',
        category: 'salary',
      },
      ...person.entries.map((entry) => ({ ...entry })),
    ],
  };
}

export interface ChangeSalaryInput {
  effectiveDate: string;
  amount?: number;
  periodWeeks?: number;
  payDelayMode?: PayDelayMode;
  adjustmentAmount?: number;
  adjustmentEntryId?: string;
  referenceDate: Date;
}

/**
 * The single entry point for the whole Change Salary / Set Up Salary form: a timeline change
 * (amount and/or pay period and/or payment timing, all from the chosen date) plus an optional
 * one-time adjustment entry recorded today. The live preview in the sheet calls
 * applyTimelineChange directly with the same watched values, so what's shown before saving is
 * guaranteed to match what actually gets saved.
 */
export function applyChangeSalary(person: Person, input: ChangeSalaryInput): Person {
  const withTimelineChange = applyTimelineChange(person, {
    effectiveDate: input.effectiveDate,
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    ...(input.periodWeeks === undefined ? {} : { periodWeeks: input.periodWeeks }),
    ...(input.payDelayMode === undefined ? {} : { payDelayMode: input.payDelayMode }),
  });
  if (!input.adjustmentAmount || !input.adjustmentEntryId) return withTimelineChange;
  return addOneTimeAdjustment(
    withTimelineChange,
    input.adjustmentAmount,
    input.adjustmentEntryId,
    input.referenceDate,
  );
}

/**
 * Resuming after an archive: re-anchors to today at the same rate/period/timing (so the archived
 * gap isn't counted as an unpaid period) and clears the end date. This is just another timeline
 * segment — no baseline to reset.
 */
export function resetSalaryWhenUnarchiving(person: Person, referenceDate: Date): Person {
  const resumed = applyTimelineChange(person, {
    effectiveDate: formatReferenceDate(referenceDate),
  });
  return { ...resumed, salaryEndDate: '', archived: false, expanded: false };
}

export function endSalaryWhenArchiving(person: Person, referenceDate: Date): Person {
  if (person.salaryEndDate) return person;
  return { ...person, salaryEndDate: formatReferenceDate(referenceDate) };
}
