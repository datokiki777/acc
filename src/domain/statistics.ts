import type {
  AppMode,
  Currency,
  MonthlyStatistics,
  PayrollOverview,
  PayrollPayDateGroup,
  Person,
  StatisticsResult,
  TopBalanceResult,
} from '../types/domain';
import { personOpenBalance } from './balances';
import { normalizeAmount } from './entries';
import { calculateSalary, getSalarySettings } from './salary';

export type StatisticsScope = 'active' | 'archived' | 'all';

export function peopleForStatisticsScope(
  people: readonly Person[],
  scope: StatisticsScope,
): Person[] {
  if (scope === 'archived') return people.filter((person) => person.archived);
  if (scope === 'all') return [...people];
  return people.filter((person) => !person.archived);
}

export function balanceTotalsByCurrency(
  people: readonly Person[],
  mode: AppMode,
): Partial<Record<Currency, number>> {
  return people.reduce<Partial<Record<Currency, number>>>((totals, person) => {
    totals[person.currency] = (totals[person.currency] ?? 0) + personOpenBalance(person, mode);
    return totals;
  }, {});
}

export function monthlyBreakdown(
  people: readonly Person[],
  referenceDate: Date,
  monthsBack = 6,
): MonthlyStatistics[] {
  const buckets: MonthlyStatistics[] = [];
  const bucketIndex = new Map<string, number>();

  for (let index = monthsBack - 1; index >= 0; index -= 1) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    bucketIndex.set(key, buckets.length);
    buckets.push({
      key,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      gave: 0,
      received: 0,
    });
  }

  people.forEach((person) => {
    person.entries.forEach((entry) => {
      const key = entry.date.slice(0, 7);
      const index = bucketIndex.get(key);
      if (index === undefined) return;
      const bucket = buckets[index];
      if (!bucket) return;
      const amount = normalizeAmount(entry.amount);
      if (entry.type === 'Gave') bucket.gave += amount;
      else if (entry.type === 'Received') bucket.received += amount;
    });
  });

  return buckets;
}

export function topBalances(
  people: readonly Person[],
  mode: AppMode,
  limit = 5,
): TopBalanceResult[] {
  return people
    .map((person) => ({
      id: person.id,
      name: person.name,
      balance: personOpenBalance(person, mode),
      currency: person.currency,
    }))
    .filter((person) => Math.abs(person.balance) > 0.000001)
    .sort((first, second) => Math.abs(second.balance) - Math.abs(first.balance))
    .slice(0, limit);
}

export function calculateStatistics(
  allPeople: readonly Person[],
  mode: AppMode,
  scope: StatisticsScope,
  referenceDate: Date,
): StatisticsResult {
  const people = peopleForStatisticsScope(allPeople, scope);
  let entryCount = 0;
  let entryAmountSum = 0;
  let mostActiveName: string | null = null;
  let mostActiveCount = 0;

  people.forEach((person) => {
    const count = person.entries.length;
    entryCount += count;
    entryAmountSum += person.entries.reduce((sum, entry) => sum + normalizeAmount(entry.amount), 0);
    if (count > mostActiveCount) {
      mostActiveCount = count;
      mostActiveName = person.name;
    }
  });

  return {
    peopleCount: people.length,
    balancesByCurrency: balanceTotalsByCurrency(people, mode),
    monthly: monthlyBreakdown(people, referenceDate),
    entryCount,
    averageEntry: entryCount ? Math.round(entryAmountSum / entryCount) : 0,
    mostActiveName,
    mostActiveCount,
    topBalances: topBalances(people, mode),
  };
}

export function calculatePayrollOverview(
  people: readonly Person[],
  referenceDate: Date,
): PayrollOverview | null {
  const rows = people.flatMap((person) => {
    if (!getSalarySettings(person)) return [];
    const summary = calculateSalary(person, referenceDate);
    return [
      {
        name: person.name,
        due: summary.due,
        upcoming: summary.upcoming,
        nextPayDate: summary.nextPayDate,
        daysUntilNextPay: summary.daysUntilNextPay,
        paySoon: summary.paySoon,
        ended: summary.ended,
        currency: summary.currency,
      },
    ];
  });
  if (!rows.length) return null;

  const totalsByCurrency: PayrollOverview['totalsByCurrency'] = {};
  rows.forEach((row) => {
    const totals = totalsByCurrency[row.currency] ?? { due: 0, upcoming: 0 };
    totals.due += row.due;
    totals.upcoming += row.upcoming;
    totalsByCurrency[row.currency] = totals;
  });

  const groups = new Map<string, PayrollPayDateGroup['rows']>();
  rows.forEach((row) => {
    // 'ended' only means the salary schedule itself has finished — it says nothing about whether
    // the final installment has been paid. As long as there's a real upcoming amount and a date
    // for it, the row belongs in its date group just like anyone still actively salaried; leaving
    // 'ended' people out here silently dropped their name from every date group while their money
    // stayed counted in the currency totals above.
    if (!row.nextPayDate || row.upcoming <= 0) return;
    const group = groups.get(row.nextPayDate) ?? [];
    group.push(row);
    groups.set(row.nextPayDate, group);
  });

  const payDates = [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, groupedRows]) => ({
      date,
      rows: groupedRows.sort((first, second) => second.upcoming - first.upcoming),
    }));
  const overdueRows = rows
    .filter((row) => row.due > 0)
    .sort((first, second) => second.due - first.due);

  return { totalsByCurrency, payDates, overdueRows };
}

export function payDateGroupDisplay(group: PayrollPayDateGroup): {
  total: number;
  currency: Currency | null;
} {
  return {
    total: group.rows.reduce((sum, row) => sum + row.upcoming, 0),
    currency: group.rows[0]?.currency ?? null,
  };
}
