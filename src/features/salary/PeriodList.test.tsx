import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

  it('shows what adjusted a period, with the original amount, and lets you open each one', async () => {
    database = createAccReactDatabase(`period-list-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    const onEdit = vi.fn();
    render(
      <AppStoreProvider store={store}>
        <PeriodList
          currency="EUR"
          onEditAdjustment={onEdit}
          periods={[
            {
              periodStartDate: '2026-09-23',
              periodEndDate: '2026-10-07',
              payDate: '2026-10-07',
              amount: 1071,
              baseAmount: 1500,
              adjustments: [
                { id: 'a1', type: 'stoppage', days: 4, amount: -429, note: 'car broke down' },
                { id: 'a2', type: 'bonus', amount: 100 },
              ],
              paidAmount: 0,
              status: 'overdue',
            },
          ]}
        />
      </AppStoreProvider>,
    );

    const row = screen.getByRole('listitem');
    // The adjusted amount leads; the original is shown struck through beside it.
    expect(within(row).getByText('1071€')).toBeInTheDocument();
    expect(within(row).getByText('1500€')).toBeInTheDocument();
    await userEvent
      .setup()
      .click(
        within(row).getByRole('button', { name: 'Stoppage · 4 days · −429€ · car broke down' }),
      );
    expect(onEdit).toHaveBeenCalledWith('a1');
    expect(within(row).getByRole('button', { name: 'Bonus · +100€' })).toBeInTheDocument();
  });
});
