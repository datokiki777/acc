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

  it('lists the newest first, led by the work period, with status, partial progress and pay date', () => {
    database = createAccReactDatabase(`period-list-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    // Two-week payment delay: each period is paid 14 days after it ends.
    const periods: PeriodSummary[] = [
      {
        periodStartDate: '2026-09-09',
        periodEndDate: '2026-09-23',
        payDate: '2026-10-07',
        amount: 1500,
        baseAmount: 1500,
        adjustments: [],
        paidAmount: 1500,
        status: 'paid',
      },
      {
        periodStartDate: '2026-09-23',
        periodEndDate: '2026-10-07',
        payDate: '2026-10-21',
        amount: 1500,
        baseAmount: 1500,
        adjustments: [],
        paidAmount: 500,
        status: 'partial',
      },
      {
        periodStartDate: '2026-10-07',
        periodEndDate: '2026-10-21',
        payDate: '2026-11-04',
        amount: 1500,
        baseAmount: 1500,
        adjustments: [],
        paidAmount: 0,
        status: 'upcoming',
      },
    ];
    render(
      <AppStoreProvider store={store}>
        <PeriodList currency="EUR" periods={periods} />
      </AppStoreProvider>,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^\d\d\.\d\d\.\d{4} – /).textContent)).toEqual([
      '07.10.2026 – 21.10.2026',
      '23.09.2026 – 07.10.2026',
      '09.09.2026 – 23.09.2026',
    ]);
    expect(within(rows[0]!).getByText('Upcoming')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Pay date 04.11.2026')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Partly paid · 500€ \/ 1500€/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Paid')).toBeInTheDocument();
  });

  it('leaves out the pay date when it is the same day the period ends', () => {
    database = createAccReactDatabase(`period-list-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    render(
      <AppStoreProvider store={store}>
        <PeriodList
          currency="EUR"
          periods={[
            {
              periodStartDate: '2026-09-09',
              periodEndDate: '2026-09-23',
              payDate: '2026-09-23',
              amount: 1500,
              baseAmount: 1500,
              adjustments: [],
              paidAmount: 0,
              status: 'overdue',
            },
          ]}
        />
      </AppStoreProvider>,
    );
    expect(screen.queryByText(/Pay date/)).not.toBeInTheDocument();
  });
});
