import type { Entry, LegacyPerson, Person } from '../../types/domain';

export const date = (year: number, month: number, day: number): Date =>
  new Date(year, month - 1, day, 12);

export const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: overrides.id ?? 'entry-1',
  amount: overrides.amount ?? 100,
  type: overrides.type ?? 'Gave',
  date: overrides.date ?? '2026-03-01',
  ...(overrides.comment === undefined ? {} : { comment: overrides.comment }),
  ...(overrides.category === undefined ? {} : { category: overrides.category }),
});

export const person = (overrides: Partial<Person> = {}): Person => ({
  id: overrides.id ?? 'person-1',
  name: overrides.name ?? 'Alex',
  currency: overrides.currency ?? 'EUR',
  entries: overrides.entries ?? [],
  ...(overrides.archived === undefined ? {} : { archived: overrides.archived }),
  ...(overrides.expanded === undefined ? {} : { expanded: overrides.expanded }),
  ...(overrides.salaryAmount === undefined ? {} : { salaryAmount: overrides.salaryAmount }),
  ...(overrides.salaryStartDate === undefined
    ? {}
    : { salaryStartDate: overrides.salaryStartDate }),
  ...(overrides.salaryEndDate === undefined ? {} : { salaryEndDate: overrides.salaryEndDate }),
  ...(overrides.salaryPayPeriodWeeks === undefined
    ? {}
    : { salaryPayPeriodWeeks: overrides.salaryPayPeriodWeeks }),
  ...(overrides.salaryPayDay === undefined ? {} : { salaryPayDay: overrides.salaryPayDay }),
  ...(overrides.salaryPayDelayMode === undefined
    ? {}
    : { salaryPayDelayMode: overrides.salaryPayDelayMode }),
  ...(overrides.salaryCurrency === undefined ? {} : { salaryCurrency: overrides.salaryCurrency }),
  ...(overrides.salaryPeriodAnchorDate === undefined
    ? {}
    : { salaryPeriodAnchorDate: overrides.salaryPeriodAnchorDate }),
  ...(overrides.salaryAccruedBaseline === undefined
    ? {}
    : { salaryAccruedBaseline: overrides.salaryAccruedBaseline }),
  ...(overrides.salaryHistory === undefined ? {} : { salaryHistory: overrides.salaryHistory }),
  ...(overrides.salaryTimeline === undefined ? {} : { salaryTimeline: overrides.salaryTimeline }),
});

export const personalPerson = person({
  name: 'Personal fixture',
  entries: [
    entry({ id: 'gave', amount: 101.6, type: 'Gave' }),
    entry({ id: 'received', amount: 41.4, type: 'Received' }),
  ],
});

export const workPerson = person({
  id: 'work-person',
  name: 'Work fixture',
  entries: [
    entry({ id: 'salary', amount: 500, category: 'salary' }),
    entry({ id: 'gift-gave', amount: 50, category: 'gift' }),
    entry({ id: 'gift-received', amount: 20, type: 'Received', category: 'gift' }),
    entry({ id: 'uncategorized', amount: 999 }),
  ],
});

export const weeklySalaryPerson = (overrides: Partial<Person> = {}): Person =>
  person({
    id: 'salary-person',
    name: 'Salary fixture',
    salaryAmount: 400,
    salaryStartDate: '2026-03-01',
    salaryPayPeriodWeeks: 1,
    salaryPayDelayMode: 'none',
    ...overrides,
  });

export const legacyStagesPerson: LegacyPerson = {
  id: 'legacy-person',
  name: 'Legacy stages',
  customPersonField: { preserved: true },
  stages: [
    {
      currency: 'USD',
      closed: true,
      stageMetadata: 'keep indirectly only on raw snapshot',
      entries: [{ id: 'old', amount: 10, type: 'Gave', date: '2025-01-01', customEntry: 'old' }],
    },
    {
      currency: 'CAD',
      closed: false,
      entries: [{ id: 'new', amount: 5, type: 'Received', date: '2026-01-01', customEntry: 'new' }],
    },
  ],
};
