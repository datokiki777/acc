import type { PayDelayMode } from '../types/domain';

const MILLISECONDS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function calendarOrdinal(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / MILLISECONDS_PER_DAY;
}

function referenceCalendarDate(referenceDate: Date): CalendarDate {
  return {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth() + 1,
    day: referenceDate.getDate(),
  };
}

export function formatReferenceDate(referenceDate: Date): string {
  const date = referenceCalendarDate(referenceDate);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function compareDateStrings(first: string, second: string): number {
  const firstDate = parseCalendarDate(first);
  const secondDate = parseCalendarDate(second);
  if (!firstDate || !secondDate) return 0;
  return calendarOrdinal(firstDate) - calendarOrdinal(secondDate);
}

export function daysBetweenDates(startDate: string, endDate: string): number {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) return 0;
  return calendarOrdinal(end) - calendarOrdinal(start);
}

export function daysSince(startDate: string, referenceDate: Date): number {
  const start = parseCalendarDate(startDate);
  if (!start) return 0;
  const localStart = new Date(start.year, start.month - 1, start.day);
  const localReference = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  return Math.max(
    0,
    Math.floor((localReference.getTime() - localStart.getTime()) / MILLISECONDS_PER_DAY),
  );
}

export function daysUntil(targetDate: string, referenceDate: Date): number {
  const target = parseCalendarDate(targetDate);
  if (!target) return 0;
  const localTarget = new Date(target.year, target.month - 1, target.day);
  const localReference = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  return Math.floor((localTarget.getTime() - localReference.getTime()) / MILLISECONDS_PER_DAY);
}

export function addDays(dateString: string, days: number): string {
  const date = parseCalendarDate(dateString);
  if (!date) return '';
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function capReferenceDate(endDate: string, referenceDate: Date): Date {
  const end = parseCalendarDate(endDate);
  if (!end || daysUntil(endDate, referenceDate) >= 0) return referenceDate;
  return new Date(end.year, end.month - 1, end.day);
}

export function computeSalaryPayDate(periodEndDate: string, payDelayMode: PayDelayMode): string {
  if (payDelayMode === '2weeks') return addDays(periodEndDate, 14);
  if (payDelayMode === '4weeks') return addDays(periodEndDate, 28);
  if (payDelayMode === 'firstOfMonth') {
    const date = parseCalendarDate(periodEndDate);
    if (!date) return periodEndDate;
    const nextMonth = new Date(Date.UTC(date.year, date.month, 1));
    return `${String(nextMonth.getUTCFullYear()).padStart(4, '0')}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return periodEndDate;
}
