import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';

import { createAccReactDatabase, type AccReactDatabase } from '../../db/database';
import { createAppRepository } from '../../db/repository';
import { personTotals } from '../../domain/balances';
import {
  calculateSalary,
  calculateUpcomingPayments,
  getEffectiveTimeline,
} from '../../domain/salary';
import { createAppStore } from '../../store/app-store';
import { AppStoreProvider } from '../../store/provider';
import { date, weeklySalaryPerson } from '../../test/fixtures/golden';
import { PayrollSummaryCard } from './WorkSummaryCards';

describe('PayrollSummaryCard upcoming schedule', () => {
  let database: AccReactDatabase;

  afterEach(async () => {
    cleanup();
    database.close();
    await database.delete();
  });

  function renderCard(overrides: Parameters<typeof weeklySalaryPerson>[0], reference: Date) {
    database = createAccReactDatabase(`payroll-card-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    const person = weeklySalaryPerson(overrides);
    render(
      <AppStoreProvider store={store}>
        <PayrollSummaryCard
          currency="EUR"
          onSyncPayDate={() => undefined}
          salary={calculateSalary(person, reference)}
          timeline={getEffectiveTimeline(person)}
          totals={personTotals(person)}
          upcomingPayments={calculateUpcomingPayments(person, reference)}
        />
      </AppStoreProvider>,
    );
  }

  const endedTeam = {
    salaryAmount: 4000,
    salaryStartDate: '2026-09-30',
    salaryPayPeriodWeeks: 1,
    salaryPayDelayMode: '2weeks' as const,
    salaryEndDate: '2026-10-12',
    entries: [],
  };

  it('shows an ended team’s payments one per pay date, since it has no single next-pay date', () => {
    renderCard(endedTeam, date(2026, 10, 13));
    const schedule = screen.getByText('Upcoming payments').closest('div') as HTMLElement;
    const rows = within(schedule).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['21.10.20261000€', '26.10.20261000€']);
  });

  it('stays out of the way for an ongoing salary with just one payment coming', () => {
    renderCard(
      {
        ...endedTeam,
        salaryEndDate: '',
        salaryStartDate: '2026-10-01',
        salaryPayDelayMode: 'none',
      },
      date(2026, 10, 3),
    );
    expect(screen.queryByText('Upcoming payments')).not.toBeInTheDocument();
  });
});
