import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';

import { createAccReactDatabase, type AccReactDatabase } from '../../db/database';
import { createAppRepository } from '../../db/repository';
import type { PeriodSummary } from '../../domain/salary';
import { createAppStore } from '../../store/app-store';
import { AppStoreProvider } from '../../store/provider';
import { PeriodList } from './PeriodList';

describe('PeriodList', () => {
  let database: AccReactDatabase;

  afterEach(async () => {
    cleanup();
    database.close();
    await database.delete();
  });

  it('lists the newest first, with status text, partial progress and the work period', () => {
    database = createAccReactDatabase(`period-list-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    const periods: PeriodSummary[] = [
      {
        periodStartDate: '2026-07-01',
        periodEndDate: '2026-07-15',
        payDate: '2026-07-15',
        amount: 1500,
        paidAmount: 1500,
        status: 'paid',
      },
      {
        periodStartDate: '2026-07-15',
        periodEndDate: '2026-07-29',
        payDate: '2026-07-29',
        amount: 1500,
        paidAmount: 500,
        status: 'partial',
      },
      {
        periodStartDate: '2026-07-29',
        periodEndDate: '2026-08-12',
        payDate: '2026-08-12',
        amount: 1500,
        paidAmount: 0,
        status: 'overdue',
      },
    ];
    render(
      <AppStoreProvider store={store}>
        <PeriodList currency="EUR" periods={periods} />
      </AppStoreProvider>,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^\d\d\.\d\d\.\d{4}$/).textContent)).toEqual([
      '12.08.2026',
      '29.07.2026',
      '15.07.2026',
    ]);
    expect(within(rows[0]!).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Partly paid · 500€ \/ 1500€/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Paid')).toBeInTheDocument();
    expect(
      within(rows[2]!).getByText(/Work period 01\.07\.2026 – 15\.07\.2026/),
    ).toBeInTheDocument();
  });
});
