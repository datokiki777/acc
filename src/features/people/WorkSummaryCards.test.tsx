import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createAccReactDatabase, type AccReactDatabase } from '../../db/database';
import { createAppRepository } from '../../db/repository';
import { personTotals } from '../../domain/balances';
import {
  calculatePeriodStatuses,
  calculateSalary,
  getEffectiveTimeline,
  type PeriodSummary,
} from '../../domain/salary';
import { createAppStore } from '../../store/app-store';
import { AppStoreProvider } from '../../store/provider';
import { date, entry, weeklySalaryPerson } from '../../test/fixtures/golden';
import { paidThrough, visiblePeriods } from './period-strip';
import { PayrollSummaryCard } from './WorkSummaryCards';

function period(payDate: string, status: PeriodSummary['status']): PeriodSummary {
  return {
    periodStartDate: payDate,
    periodEndDate: payDate,
    payDate,
    amount: 1000,
    paidAmount: status === 'paid' ? 1000 : 0,
    status,
  };
}

describe('period strip helpers', () => {
  it('keeps everything when there are few periods', () => {
    const periods = [period('2026-09-01', 'paid'), period('2026-09-15', 'upcoming')];
    expect(visiblePeriods(periods)).toEqual(periods);
  });

  it('slides to the newest five, keeping one settled period before the first unpaid one', () => {
    const periods = [
      period('2026-07-01', 'paid'),
      period('2026-07-15', 'paid'),
      period('2026-07-29', 'paid'),
      period('2026-08-12', 'partial'),
      period('2026-08-26', 'overdue'),
      period('2026-09-09', 'overdue'),
      period('2026-09-23', 'upcoming'),
    ];
    expect(visiblePeriods(periods).map((item) => item.payDate)).toEqual([
      '2026-07-29',
      '2026-08-12',
      '2026-08-26',
      '2026-09-09',
      '2026-09-23',
    ]);
  });

  it('shows the latest five when everything is paid', () => {
    const periods = ['01', '02', '03', '04', '05', '06', '07'].map((day) =>
      period(`2026-09-${day}`, 'paid'),
    );
    expect(visiblePeriods(periods).map((item) => item.payDate)).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
  });

  it('reports the date paid through, and whether anything is still open', () => {
    expect(
      paidThrough([
        period('2026-09-01', 'paid'),
        period('2026-09-15', 'paid'),
        period('2026-09-29', 'overdue'),
      ]),
    ).toEqual({ date: '2026-09-15', allPaid: false });
    expect(paidThrough([period('2026-09-01', 'overdue')])).toEqual({ date: null, allPaid: false });
    expect(paidThrough([period('2026-09-01', 'paid')])).toEqual({
      date: '2026-09-01',
      allPaid: true,
    });
  });
});

describe('PayrollSummaryCard period strip', () => {
  let database: AccReactDatabase;

  afterEach(async () => {
    cleanup();
    database.close();
    await database.delete();
  });

  function renderCard(
    overrides: Parameters<typeof weeklySalaryPerson>[0],
    reference: Date,
    onOpenPeriods = () => undefined,
  ) {
    database = createAccReactDatabase(`payroll-card-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    const person = weeklySalaryPerson(overrides);
    render(
      <AppStoreProvider store={store}>
        <PayrollSummaryCard
          currency="EUR"
          onOpenPeriods={onOpenPeriods}
          onSyncPayDate={() => undefined}
          periods={calculatePeriodStatuses(person, reference)}
          salary={calculateSalary(person, reference)}
          timeline={getEffectiveTimeline(person)}
          totals={personTotals(person)}
        />
      </AppStoreProvider>,
    );
  }

  const crew = {
    salaryAmount: 3000,
    salaryStartDate: '2026-07-01',
    salaryPayPeriodWeeks: 2,
    salaryPayDelayMode: 'none' as const,
    entries: [entry({ id: 'p1', amount: 4000, category: 'salary', date: '2026-08-30' })],
  };

  it('shows where things stand: paid through, then a dot and pay date per period', () => {
    renderCard(crew, date(2026, 9, 20));
    const strip = screen.getByRole('button', { name: 'Show pay periods' });
    expect(within(strip).getByText('Paid through 29.07')).toBeInTheDocument();
    expect(
      Array.from(strip.querySelectorAll('.period-strip-item small')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['29.07', '12.08', '26.08', '09.09', '23.09']);
    expect(Array.from(strip.querySelectorAll('.period-dot')).map((dot) => dot.className)).toEqual([
      'period-dot is-paid',
      'period-dot is-partial',
      'period-dot is-overdue',
      'period-dot is-overdue',
      'period-dot is-upcoming',
    ]);
  });

  it('opens the full list when tapped', async () => {
    const onOpenPeriods = vi.fn();
    renderCard(crew, date(2026, 9, 20), onOpenPeriods);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show pay periods' }));
    expect(onOpenPeriods).toHaveBeenCalledTimes(1);
  });

  it('shows an ended salary’s remaining payments in date order', () => {
    renderCard(
      {
        salaryAmount: 4000,
        salaryStartDate: '2026-09-30',
        salaryPayPeriodWeeks: 1,
        salaryPayDelayMode: '2weeks' as const,
        salaryEndDate: '2026-10-12',
        entries: [],
      },
      date(2026, 10, 13),
    );
    const strip = screen.getByRole('button', { name: 'Show pay periods' });
    expect(
      Array.from(strip.querySelectorAll('.period-strip-item small')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['21.10', '26.10']);
    // Nothing settled yet, so there's no 'paid through' line.
    expect(within(strip).queryByText(/Paid through/)).not.toBeInTheDocument();
  });
});
