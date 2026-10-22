import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createAccReactDatabase, type AccReactDatabase } from '../../db/database';
import { createAppRepository } from '../../db/repository';
import { calculatePeriodStatuses } from '../../domain/salary';
import { createAppStore } from '../../store/app-store';
import { AppStoreProvider } from '../../store/provider';
import { date, weeklySalaryPerson } from '../../test/fixtures/golden';
import type { SalaryAdjustment } from '../../types/domain';
import { summarizeAdjustments } from './adjustments-summary';
import { AdjustmentsSummary } from './AdjustmentsSummary';

// 3000/month on two-week periods from 09.09, Sunday off (125 a working day).
const adjustments: SalaryAdjustment[] = [
  {
    id: 'stop',
    type: 'stoppage',
    startDate: '2026-09-30',
    endDate: '2026-10-03',
    note: 'car broke down',
  },
  { id: 'bonus', type: 'bonus', startDate: '2026-09-25', amount: 100 },
];
const periods = () =>
  calculatePeriodStatuses(
    weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      salaryAdjustments: adjustments,
      entries: [],
    }),
    date(2026, 10, 10),
  );

describe('summarizeAdjustments', () => {
  it('lists the newest first with the effect each one really had, and the total', () => {
    const { rows, total } = summarizeAdjustments(adjustments, periods());
    expect(rows.map((row) => [row.id, row.net, row.days])).toEqual([
      ['stop', -500, 4],
      ['bonus', 100, 0],
    ]);
    expect(total).toBe(-400);
  });

  it('reports a zero effect for one that landed on nothing', () => {
    const { rows, total } = summarizeAdjustments(
      [{ id: 'sunday', type: 'stoppage', startDate: '2026-10-04', endDate: '2026-10-04' }],
      periods(),
    );
    expect(rows[0]?.net).toBe(0);
    expect(total).toBe(0);
  });
});

describe('AdjustmentsSummary', () => {
  let database: AccReactDatabase;

  afterEach(async () => {
    cleanup();
    database.close();
    await database.delete();
  });

  function renderSummary(list: SalaryAdjustment[], handlers = {}) {
    database = createAccReactDatabase(`adjustments-${crypto.randomUUID()}`);
    const store = createAppStore({ repository: createAppRepository(database) });
    const onEdit = vi.fn();
    const onAdd = vi.fn();
    render(
      <AppStoreProvider store={store}>
        <AdjustmentsSummary
          adjustments={list}
          currency="EUR"
          onAdd={onAdd}
          onEdit={onEdit}
          periods={periods()}
          {...handlers}
        />
      </AppStoreProvider>,
    );
    return { onEdit, onAdd };
  }

  it('is one closed line — the count, the net, and a short breakdown — until opened', () => {
    renderSummary(adjustments);
    const toggle = screen.getByRole('button', { expanded: false });
    expect(within(toggle).getByText('2 adjustments')).toBeInTheDocument();
    expect(within(toggle).getByText('−400€')).toBeInTheDocument();
    expect(within(toggle).getByText('Stoppage · 4 days −500€ · Bonus +100€')).toBeInTheDocument();
    // The list isn't there until it's opened.
    expect(screen.queryByText('car broke down', { exact: false })).not.toBeInTheDocument();
  });

  it('opens into the list, where each one can be edited and a new one added', async () => {
    const user = userEvent.setup();
    const { onEdit, onAdd } = renderSummary(adjustments);
    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /^Stoppage · 4 days/ });
    expect(within(row).getByText('30.09.2026 – 03.10.2026 · car broke down')).toBeInTheDocument();
    await user.click(row);
    expect(onEdit).toHaveBeenCalledWith('stop');

    await user.click(screen.getByRole('button', { name: '+ Add adjustment' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('takes no room at all when there are no adjustments', () => {
    const { container } = render(<div />);
    renderSummary([]);
    expect(container.querySelector('.adjustments-summary')).toBeNull();
    expect(screen.queryByText(/adjustment/)).not.toBeInTheDocument();
  });
});
