export type AppMode = 'personal' | 'work';
export type ThemeMode = 'system' | 'dark' | 'light';
export type Currency = 'EUR' | 'USD' | 'GEL' | 'CAD';
export type EntryType = 'Gave' | 'Received';
export type EntryCategory = 'salary' | 'gift';
export type PayDelayMode = 'none' | '2weeks' | '4weeks' | 'firstOfMonth';

export interface Entry {
  id: string;
  amount: number;
  type: EntryType;
  date: string;
  comment?: string;
  category?: EntryCategory;
}

export interface SalarySettings {
  monthly: number;
  startDate: string;
  endDate: string;
  periodWeeks: number;
  anchorDate: string;
  accruedBaseline: number;
  currency: Currency;
  payDelayMode: PayDelayMode;
}

export interface SalaryChangeRecord {
  effectiveDate: string;
  previousAmount: number;
  newAmount: number;
}

/**
 * One segment of a salary's timeline: 'from this date, the rate/period/timing is this'. The full,
 * ascending-sorted list of these is the single source of truth for a salary's whole schedule —
 * amount changes, pay-period changes, and payment-timing changes are all just a new segment
 * appended to this list. There is no separate 'baseline' to bank or keep in sync: every
 * calculation replays the full list of segments against the live entries, every time.
 */
export interface SalaryTimelineEntry {
  effectiveDate: string;
  amount: number;
  periodWeeks: number;
  payDelayMode: PayDelayMode;
}

export interface Person {
  id: string;
  name: string;
  currency: Currency;
  entries: Entry[];
  note?: string;
  tagLabel?: string;
  tagColor?: string;
  archived?: boolean;
  expanded?: boolean;
  createdAt?: string;
  salaryAmount?: number;
  salaryStartDate?: string;
  salaryEndDate?: string;
  salaryPayPeriodWeeks?: number;
  salaryPayDay?: number;
  salaryPayDelayMode?: PayDelayMode;
  salaryCurrency?: Currency;
  salaryPeriodAnchorDate?: string;
  salaryAccruedBaseline?: number;
  salaryHistory?: SalaryChangeRecord[];
  salaryTimeline?: SalaryTimelineEntry[];
}

export interface SalaryCalculationResult {
  enabled: boolean;
  accrued: number;
  paid: number;
  due: number;
  upcoming: number;
  currency: Currency;
  days: number;
  monthly: number;
  periodWeeks: number;
  periodAmount: number;
  completedPeriods: number;
  nextPayDate: string;
  daysUntilNextPay: number | null;
  paySoon: boolean;
  startDate?: string;
  ended: boolean;
  endDate: string;
  payDelayMode?: PayDelayMode;
}

export interface CurrencyBalance {
  currency: Currency;
  balance: number;
}

export interface MonthlyStatistics {
  key: string;
  label: string;
  gave: number;
  received: number;
}

export interface TopBalanceResult {
  id: string;
  name: string;
  balance: number;
  currency: Currency;
}

export interface StatisticsResult {
  peopleCount: number;
  balancesByCurrency: Partial<Record<Currency, number>>;
  monthly: MonthlyStatistics[];
  entryCount: number;
  averageEntry: number;
  mostActiveName: string | null;
  mostActiveCount: number;
  topBalances: TopBalanceResult[];
}

export interface PayrollStatisticsRow {
  name: string;
  due: number;
  upcoming: number;
  nextPayDate: string;
  daysUntilNextPay: number | null;
  paySoon: boolean;
  ended: boolean;
  currency: Currency;
}

export interface PayrollPayDateGroup {
  date: string;
  rows: PayrollStatisticsRow[];
}

export interface PayrollOverview {
  totalsByCurrency: Partial<Record<Currency, { due: number; upcoming: number }>>;
  payDates: PayrollPayDateGroup[];
  overdueRows: PayrollStatisticsRow[];
}

export interface LegacyEntry {
  id?: string;
  amount?: number | string;
  type?: EntryType;
  date?: string;
  comment?: string;
  category?: EntryCategory;
  [legacyField: string]: unknown;
}

export interface LegacyStage {
  currency?: Currency;
  closed?: boolean;
  entries?: LegacyEntry[];
  [legacyField: string]: unknown;
}

export interface LegacyPerson {
  id?: string;
  name?: string;
  note?: string;
  currency?: Currency;
  entries?: LegacyEntry[];
  stages?: LegacyStage[];
  legacyStageFields?: Record<string, unknown>[];
  tagLabel?: string;
  tagColor?: string;
  archived?: boolean;
  expanded?: boolean;
  createdAt?: string;
  salaryAmount?: number | string;
  salaryStartDate?: string;
  salaryEndDate?: string;
  salaryPayPeriodWeeks?: number | string;
  salaryPayDay?: number | string;
  salaryPayDelayMode?: PayDelayMode;
  salaryCurrency?: Currency;
  salaryPeriodAnchorDate?: string;
  salaryAccruedBaseline?: number | string;
  [legacyField: string]: unknown;
}

export interface ExportedBackupData {
  personal: LegacyPerson[];
  work: LegacyPerson[];
  exportDate?: string;
  [legacyField: string]: unknown;
}
