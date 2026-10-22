import {
  calculatePeriodStatuses,
  calculateSalary,
  calculateUpcomingPayments,
  getEffectiveTimeline,
  getRestDays,
  giftSummary,
  hasOutstandingSalaryBalance,
  salaryPaid,
} from './salary';
import {
  applyChangeSalary,
  applyTimelineChange,
  endSalaryWhenArchiving,
  replaceTimeline,
  resetSalaryWhenUnarchiving,
} from './salary-workflows';
import type { SalaryAdjustment } from '../types/domain';
import { date, entry, person, weeklySalaryPerson, workPerson } from '../test/fixtures/golden';

describe('salary calculation parity', () => {
  it('returns a disabled result without amount and start date', () => {
    expect(calculateSalary(weeklySalaryPerson({ salaryAmount: 0 }), date(2026, 3, 8)).enabled).toBe(
      false,
    );
  });

  it('calculates period amount and exact completed-period boundary', () => {
    const result = calculateSalary(weeklySalaryPerson(), date(2026, 3, 8));
    expect(result.periodAmount).toBe(100);
    expect(result.completedPeriods).toBe(1);
    expect(result.accrued).toBe(100);
    // Pay date 2026-03-08 falls exactly on the reference date — already due today, not upcoming.
    expect(result.due).toBe(100);
    expect(result.upcoming).toBe(0);
    expect(result.nextPayDate).toBe('2026-03-15');
  });

  it.each([
    [date(2026, 3, 7), 0, 100, '2026-03-08', 1, true],
    [date(2026, 3, 8), 100, 0, '2026-03-15', 7, false],
    [date(2026, 3, 9), 100, 100, '2026-03-15', 6, false],
    [date(2026, 3, 10), 100, 100, '2026-03-15', 5, false],
  ] as const)(
    'has no grace period at all: due the moment the pay date arrives, today included, at %s',
    (referenceDate, due, upcoming, nextPayDate, until, paySoon) => {
      const result = calculateSalary(weeklySalaryPerson(), referenceDate);
      expect(result.due).toBe(due);
      expect(result.upcoming).toBe(upcoming);
      expect(result.nextPayDate).toBe(nextPayDate);
      expect(result.daysUntilNextPay).toBe(until);
      expect(result.paySoon).toBe(paySoon);
    },
  );

  it.each([
    ['2weeks', '2026-03-22'],
    ['4weeks', '2026-04-05'],
    ['firstOfMonth', '2026-04-01'],
  ] as const)('uses the earliest unpaid delayed pay date for %s', (mode, payDate) => {
    const result = calculateSalary(
      weeklySalaryPerson({ salaryPayDelayMode: mode }),
      date(2026, 3, 8),
    );
    expect(result.due).toBe(0);
    expect(result.nextPayDate).toBe(payDate);
  });

  it('caps accrual and forecasts at the salary end date', () => {
    const result = calculateSalary(
      weeklySalaryPerson({ salaryEndDate: '2026-03-15' }),
      date(2026, 4, 1),
    );
    expect(result.ended).toBe(true);
    expect(result.days).toBe(14);
    expect(result.completedPeriods).toBe(2);
    expect(result.accrued).toBe(200);
    expect(result.due).toBe(200);
    expect(result.upcoming).toBe(0);
    expect(result.daysUntilNextPay).toBeNull();
  });

  it('respects the configured payment delay even after the salary has ended', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 1500,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 4,
      salaryPayDelayMode: '4weeks',
      salaryEndDate: '2026-07-31',
      entries: [],
    });
    const soonAfterEnd = calculateSalary(employee, date(2026, 8, 1));
    expect(soonAfterEnd.ended).toBe(true);
    expect(soonAfterEnd.due).toBe(0);
    expect(soonAfterEnd.upcoming).toBe(1500);
    expect(soonAfterEnd.nextPayDate).toBe('2026-08-26');

    const wellAfterDelay = calculateSalary(employee, date(2026, 9, 5));
    expect(wellAfterDelay.due).toBe(1500);
    expect(wellAfterDelay.upcoming).toBe(0);
  });

  it('nets Received salary entries against Gave salary entries when counting what is paid', () => {
    const employee = weeklySalaryPerson({
      entries: [
        entry({ id: 'one', amount: 40, category: 'salary' }),
        entry({ id: 'two', amount: 20, comment: '[Salary] Legacy' }),
        entry({ id: 'three', amount: 15, type: 'Received', category: 'salary' }),
      ],
    });
    expect(salaryPaid(employee)).toBe(45);
  });

  it('lets a Received salary entry represent a refund/clawback that reduces what is owed', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'loan', amount: 1500, category: 'salary', date: '2026-08-09' }),
        entry({
          id: 'partial-refund',
          amount: 300,
          type: 'Received',
          category: 'salary',
          date: '2026-08-10',
        }),
      ],
    });
    expect(salaryPaid(employee)).toBe(1200);
  });

  it('continues salary calculation while a person is archived', () => {
    const active = calculateSalary(weeklySalaryPerson(), date(2026, 3, 10));
    const archived = calculateSalary(weeklySalaryPerson({ archived: true }), date(2026, 3, 10));
    expect(archived).toEqual(active);
  });

  it('does not resurface a paid period as due soon when settled exactly on its boundary', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
        entry({ id: 'e3', amount: 1500, category: 'salary', date: '2026-08-09' }),
      ],
    });
    const result = calculateSalary(employee, date(2026, 8, 12));
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.paySoon).toBe(false);
    expect(result.nextPayDate).toBe('2026-08-26');
  });

  it('does not resurface a paid period as due soon when paid a few days before its boundary', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
        entry({ id: 'e3', amount: 1500, category: 'salary', date: '2026-08-09' }),
      ],
    });
    const result = calculateSalary(employee, date(2026, 8, 9));
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.nextPayDate).toBe('2026-08-12');
  });

  it('flags a missed payment as overdue the day after, with no extra grace day', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
      ],
    });
    const result = calculateSalary(employee, date(2026, 8, 13));
    expect(result.due).toBe(1500);
    expect(result.upcoming).toBe(1500);
    expect(result.nextPayDate).toBe('2026-08-26');
  });

  it('shows a final unpaid balance as overdue (not upcoming) the day after the salary ends', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3500,
      salaryStartDate: '2026-01-01',
      salaryPayPeriodWeeks: 2,
      salaryEndDate: '2026-03-26',
      entries: [entry({ id: 'e1', amount: 8750, category: 'salary', date: '2026-03-20' })],
    });
    const result = calculateSalary(employee, date(2026, 3, 27));
    expect(result.ended).toBe(true);
    expect(result.due).toBe(1750);
    expect(result.upcoming).toBe(0);
  });

  it('calculates the Work gift summary independently', () => {
    expect(giftSummary(workPerson)).toMatchObject({ gave: 50, received: 20, total: 70, net: 30 });
  });
});

describe('getEffectiveTimeline (legacy migration)', () => {
  it('returns empty for an unconfigured person', () => {
    expect(getEffectiveTimeline(person({ entries: [] }))).toEqual([]);
  });

  it('uses salaryTimeline directly when present, sorted ascending', () => {
    const timeline = getEffectiveTimeline(
      weeklySalaryPerson({
        salaryTimeline: [
          { effectiveDate: '2026-08-01', amount: 3000, periodWeeks: 2, payDelayMode: 'none' },
          { effectiveDate: '2026-07-01', amount: 2500, periodWeeks: 1, payDelayMode: 'none' },
        ],
      }),
    );
    expect(timeline.map((segment) => segment.effectiveDate)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('reconstructs one segment from plain legacy fields with no history', () => {
    const timeline = getEffectiveTimeline(
      weeklySalaryPerson({ salaryAmount: 2000, salaryStartDate: '2026-06-01' }),
    );
    expect(timeline).toEqual([
      { effectiveDate: '2026-06-01', amount: 2000, periodWeeks: 1, payDelayMode: 'none' },
    ]);
  });

  it('reconstructs multiple segments from legacy salaryHistory', () => {
    const timeline = getEffectiveTimeline(
      weeklySalaryPerson({
        salaryAmount: 3000,
        salaryStartDate: '2026-06-01',
        salaryPayPeriodWeeks: 2,
        salaryHistory: [
          { effectiveDate: '2026-08-01', previousAmount: 2500, newAmount: 3000 },
          { effectiveDate: '2026-07-01', previousAmount: 2000, newAmount: 2500 },
        ],
      }),
    );
    expect(timeline).toEqual([
      { effectiveDate: '2026-06-01', amount: 2000, periodWeeks: 2, payDelayMode: 'none' },
      { effectiveDate: '2026-07-01', amount: 2500, periodWeeks: 2, payDelayMode: 'none' },
      { effectiveDate: '2026-08-01', amount: 3000, periodWeeks: 2, payDelayMode: 'none' },
    ]);
  });

  it('adds a segment for a legacy plain re-anchor (no matching history entry)', () => {
    const timeline = getEffectiveTimeline(
      weeklySalaryPerson({
        salaryAmount: 2000,
        salaryStartDate: '2026-06-01',
        salaryPeriodAnchorDate: '2026-08-01',
      }),
    );
    expect(timeline).toEqual([
      { effectiveDate: '2026-06-01', amount: 2000, periodWeeks: 1, payDelayMode: 'none' },
      { effectiveDate: '2026-08-01', amount: 2000, periodWeeks: 1, payDelayMode: 'none' },
    ]);
  });
});

describe('applyTimelineChange', () => {
  it('creates the first segment for a brand-new salary', () => {
    const configured = applyTimelineChange(person({ entries: [] }), {
      effectiveDate: '2026-09-09',
      amount: 3000,
      periodWeeks: 2,
      payDelayMode: '2weeks',
    });
    expect(getEffectiveTimeline(configured)).toEqual([
      { effectiveDate: '2026-09-09', amount: 3000, periodWeeks: 2, payDelayMode: '2weeks' },
    ]);
    expect(configured.salaryAmount).toBe(3000);
    expect(configured.salaryStartDate).toBe('2026-09-09');
  });

  it('appends a new segment, carrying forward whatever is not specified', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
    });
    const changed = applyTimelineChange(before, { effectiveDate: '2026-09-09', amount: 3000 });
    expect(getEffectiveTimeline(changed)).toEqual([
      { effectiveDate: '2026-07-01', amount: 2000, periodWeeks: 2, payDelayMode: 'none' },
      { effectiveDate: '2026-09-09', amount: 3000, periodWeeks: 2, payDelayMode: 'none' },
    ]);
  });

  it('replaces the segment at the same date rather than duplicating it', () => {
    const before = applyTimelineChange(person({ entries: [] }), {
      effectiveDate: '2026-09-09',
      amount: 3000,
      periodWeeks: 2,
    });
    const corrected = applyTimelineChange(before, { effectiveDate: '2026-09-09', amount: 3500 });
    expect(getEffectiveTimeline(corrected)).toEqual([
      { effectiveDate: '2026-09-09', amount: 3500, periodWeeks: 2, payDelayMode: 'none' },
    ]);
  });

  it('reported scenario: the exact reported 2000-for-one-period-then-3000 case', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-29',
      salaryPayPeriodWeeks: 2,
      entries: [],
    });
    const changed = applyTimelineChange(before, { effectiveDate: '2026-08-12', amount: 3000 });
    const result = calculateSalary(changed, date(2026, 8, 12));
    expect(result.accrued).toBe(1000);
    expect(result.periodAmount).toBe(1500);
  });
});

describe('replaceTimeline (Manage Salary History)', () => {
  it('rebuilds the whole timeline from a corrected/edited list', () => {
    const before = weeklySalaryPerson({ salaryAmount: 2000, salaryStartDate: '2026-07-01' });
    const corrected = replaceTimeline(before, [
      { effectiveDate: '2026-06-01', amount: 1800, periodWeeks: 1, payDelayMode: 'none' },
      { effectiveDate: '2026-07-01', amount: 2000, periodWeeks: 2, payDelayMode: '2weeks' },
    ]);
    expect(getEffectiveTimeline(corrected)).toEqual([
      { effectiveDate: '2026-06-01', amount: 1800, periodWeeks: 1, payDelayMode: 'none' },
      { effectiveDate: '2026-07-01', amount: 2000, periodWeeks: 2, payDelayMode: '2weeks' },
    ]);
    expect(corrected.salaryStartDate).toBe('2026-06-01');
    expect(corrected.salaryAmount).toBe(2000);
  });

  it('reported scenario: correcting to 2000/month then 3000 from 12/08, computed correctly afterward', () => {
    const before = weeklySalaryPerson({ salaryAmount: 3000, salaryStartDate: '2026-07-29' });
    const corrected = replaceTimeline(before, [
      { effectiveDate: '2026-07-29', amount: 2000, periodWeeks: 2, payDelayMode: 'none' },
      { effectiveDate: '2026-08-12', amount: 3000, periodWeeks: 2, payDelayMode: 'none' },
    ]);
    const result = calculateSalary(corrected, date(2026, 8, 12));
    expect(result.accrued).toBe(1000);
  });
});

describe('applyChangeSalary (the whole Change Salary form)', () => {
  it('fully configures a brand-new, never-salaried person', () => {
    const configured = applyChangeSalary(person({ entries: [] }), {
      effectiveDate: '2026-09-09',
      amount: 3000,
      payDelayMode: '2weeks',
      periodWeeks: 2,
      referenceDate: date(2026, 9, 9),
    });
    expect(configured.salaryAmount).toBe(3000);
    expect(configured.salaryStartDate).toBe('2026-09-09');
    const result = calculateSalary(configured, date(2026, 9, 9));
    expect(result.enabled).toBe(true);
    expect(result.periodAmount).toBe(1500);
  });

  it('records a one-time adjustment as a real entry, dated today', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ amount: 40, category: 'salary' })],
    });
    const changed = applyChangeSalary(before, {
      effectiveDate: '2026-07-27',
      adjustmentAmount: 60,
      adjustmentEntryId: 'sync-entry',
      referenceDate: date(2026, 8, 13),
    });
    expect(changed.entries[0]).toMatchObject({
      id: 'sync-entry',
      amount: 60,
      category: 'salary',
      date: '2026-08-13',
    });
  });

  it('a period change re-anchors to the chosen date, not today', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-22',
      salaryPayPeriodWeeks: 1,
      salaryPayDelayMode: 'none',
      entries: [{ id: 'old1', amount: 5240, type: 'Gave', date: '2026-08-01', category: 'salary' }],
    });
    const after = applyChangeSalary(before, {
      effectiveDate: '2026-09-09',
      payDelayMode: '2weeks',
      periodWeeks: 2,
      referenceDate: date(2026, 9, 26),
    });
    const timeline = getEffectiveTimeline(after);
    expect(timeline[timeline.length - 1]!.effectiveDate).toBe('2026-09-09');
    for (const [month, day] of [
      [9, 20],
      [9, 23],
      [9, 26],
      [9, 30],
      [10, 1],
    ] as const) {
      expect(calculateSalary(after, date(2026, month, day)).nextPayDate).toBe('2026-10-07');
    }
  });
});

describe('resetSalaryWhenUnarchiving / endSalaryWhenArchiving', () => {
  it('re-anchors to today at the same rate/period/timing and clears the end date', () => {
    const archived = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      salaryEndDate: '2026-08-01',
      archived: true,
      expanded: true,
      entries: [entry({ amount: 100, category: 'salary' })],
    });
    const reset = resetSalaryWhenUnarchiving(archived, date(2026, 9, 5));
    expect(reset).toMatchObject({ archived: false, expanded: false, salaryEndDate: '' });
    const timeline = getEffectiveTimeline(reset);
    expect(timeline[timeline.length - 1]).toEqual({
      effectiveDate: '2026-09-05',
      amount: 3000,
      periodWeeks: 2,
      payDelayMode: 'none',
    });
  });

  it('sets the end date only once, keeping an already-set one', () => {
    const withEndDate = weeklySalaryPerson({ salaryEndDate: '2026-03-01' });
    const archived = endSalaryWhenArchiving(withEndDate, date(2026, 4, 1));
    expect(archived.salaryEndDate).toBe('2026-03-01');

    const withoutEndDate = weeklySalaryPerson({ salaryEndDate: '' });
    const nowEnded = endSalaryWhenArchiving(withoutEndDate, date(2026, 4, 1));
    expect(nowEnded.salaryEndDate).toBe('2026-04-01');
  });
});

describe('hasOutstandingSalaryBalance', () => {
  it('true for an ended employee with an unpaid final period, false once paid', () => {
    const stillOwed = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-29',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      salaryEndDate: '2026-09-23',
      entries: [
        entry({ id: 'p1', amount: 1500, category: 'salary', date: '2026-08-12' }),
        entry({ id: 'p2', amount: 1500, category: 'salary', date: '2026-08-26' }),
        entry({ id: 'p3', amount: 1500, category: 'salary', date: '2026-09-09' }),
      ],
    });
    expect(hasOutstandingSalaryBalance(stillOwed, date(2026, 9, 26))).toBe(true);

    const settled = {
      ...stillOwed,
      entries: [
        ...stillOwed.entries,
        entry({ id: 'final', amount: 1500, category: 'salary', date: '2026-09-26' }),
      ],
    };
    expect(hasOutstandingSalaryBalance(settled, date(2026, 9, 26))).toBe(false);
  });
});

describe('reported scenarios: end-to-end regression coverage', () => {
  it('Rati: a large lifetime-paid total from before a re-anchor must not make the schedule think a period is already paid', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-29',
      salaryPayPeriodWeeks: 1,
      salaryPayDelayMode: 'none',
      entries: [{ id: 'old1', amount: 4500, type: 'Gave', date: '2026-08-15', category: 'salary' }],
    });
    const after = applyChangeSalary(before, {
      effectiveDate: '2026-09-09',
      payDelayMode: '2weeks',
      periodWeeks: 2,
      referenceDate: date(2026, 9, 9),
    });
    // Already due on its own pay date (10-07), not the day after — so nextPayDate skips ahead
    // to the following period on 10-07 itself, same as it does on 10-08.
    expect(calculateSalary(after, date(2026, 10, 7)).nextPayDate).toBe('2026-10-21');
    expect(calculateSalary(after, date(2026, 10, 7)).due).toBeGreaterThan(0);
    expect(calculateSalary(after, date(2026, 10, 8)).due).toBeGreaterThan(0);
    expect(calculateSalary(after, date(2026, 10, 8)).nextPayDate).toBe('2026-10-21');
  });

  it('Dima: an ended employee after a period-change re-anchor still shows the final period owed', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-08-12',
      salaryPayPeriodWeeks: 1,
      salaryPayDelayMode: 'none',
      entries: [
        { id: 'p1', amount: 500, type: 'Gave', date: '2026-08-19', category: 'salary' },
        { id: 'p2', amount: 500, type: 'Gave', date: '2026-08-26', category: 'salary' },
        { id: 'p3', amount: 500, type: 'Gave', date: '2026-09-02', category: 'salary' },
      ],
    });
    const reanchored = applyChangeSalary(before, {
      effectiveDate: '2026-09-09',
      periodWeeks: 2,
      referenceDate: date(2026, 9, 9),
    });
    const ended = {
      ...reanchored,
      salaryEndDate: '2026-09-23',
      entries: [
        ...reanchored.entries,
        {
          id: 'p4',
          amount: 120,
          type: 'Gave' as const,
          date: '2026-09-20',
          category: 'salary' as const,
        },
        {
          id: 'p5',
          amount: 500,
          type: 'Gave' as const,
          date: '2026-09-20',
          category: 'salary' as const,
        },
        {
          id: 'p6',
          amount: 1000,
          type: 'Gave' as const,
          date: '2026-09-19',
          category: 'salary' as const,
        },
      ],
    };
    const result = calculateSalary(ended, date(2026, 9, 27));
    expect(result.ended).toBe(true);
    expect(result.due + result.upcoming).toBeGreaterThan(0);
  });

  it('a phantom advance-payment entry causes a genuine skip-ahead (confirms the math is right when the data says so)', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: '2weeks',
      entries: [
        { id: 'phantom', amount: 1500, type: 'Gave', date: '2026-09-09', category: 'salary' },
      ],
    });
    expect(calculateSalary(employee, date(2026, 9, 26)).nextPayDate).toBe('2026-10-21');
  });

  it('a clean 2-week period with a 2-week delay never double-counts', () => {
    const employee = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: '2weeks',
      entries: [],
    });
    for (const day of [10, 20, 23, 26, 30]) {
      expect(calculateSalary(employee, date(2026, 9, day)).nextPayDate).toBe('2026-10-07');
    }
    for (const day of [1, 5]) {
      expect(calculateSalary(employee, date(2026, 10, day)).nextPayDate).toBe('2026-10-07');
    }
    // On 10-07 itself the first period is already due (no grace even on its own pay date), so
    // nextPayDate has already moved on to the following period.
    expect(calculateSalary(employee, date(2026, 10, 7)).nextPayDate).toBe('2026-10-21');
  });

  it('editing or deleting a pre-anchor entry keeps the schedule correct automatically (no separate recalibration step)', () => {
    const withPlaceholder = weeklySalaryPerson({
      salaryStartDate: '2026-07-22',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ id: 'placeholder', amount: 10, category: 'salary', date: '2026-07-25' })],
    });
    const reanchored = applyChangeSalary(withPlaceholder, {
      effectiveDate: '2026-07-29',
      referenceDate: date(2026, 7, 29),
    });
    // The re-anchor cuts the first segment 7 days in — its nearest-week remainder (1 week) is
    // credited immediately as its own completed installment: 400 * (1/4) = 100.
    expect(calculateSalary(reanchored, date(2026, 7, 29)).accrued).toBe(100);

    const afterDelete = { ...reanchored, entries: [] };
    const before = calculateSalary(reanchored, date(2026, 8, 12));
    const after = calculateSalary(afterDelete, date(2026, 8, 12));
    expect(after.paid).toBe(before.paid - 10);
  });

  it('Eliko: a same-terms re-anchor 7 days in credits that week instead of losing it', () => {
    const eliko = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-22',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      entries: [{ id: 'lump', amount: 5250, type: 'Gave', date: '2026-07-22', category: 'salary' }],
    });
    const reanchored = applyChangeSalary(eliko, {
      effectiveDate: '2026-07-29',
      referenceDate: date(2026, 7, 29),
    });
    const result = calculateSalary(reanchored, date(2026, 9, 27));
    // 1 credited week (750) + 4 completed 2-week periods (6000) = 6750 accrued; paid 5250 →
    // 1500 due, with the still-open period (2250 upcoming... wait, one more period) upcoming.
    expect(result.accrued).toBe(6750);
    expect(result.due).toBe(1500);
    expect(result.upcoming).toBe(1500);
  });

  it('Giorgi: Upcoming never double-counts the still-open period alongside the finished one awaiting its delay', () => {
    const giorgi = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: '2weeks',
      entries: [],
    });
    // 09/09 -> 23/09 is one finished period (paid 07/10, still in the future); 23/09 -> 07/10 is
    // the second period, still in progress as of 27/09 — it hasn't been earned yet and must not
    // appear anywhere in due/upcoming.
    const result = calculateSalary(giorgi, date(2026, 9, 27));
    expect(result.accrued).toBe(1500);
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(1500);
    expect(result.nextPayDate).toBe('2026-10-07');
  });
});

describe('calculateUpcomingPayments', () => {
  // 4000/month on a 1-week period = 1000 per week, paid 2 weeks after each period ends. Worked
  // 09-30 to 10-12: one full week (pays 10-21) plus a 5-day tail that rounds to a week (pays
  // 10-26, the cutoff plus the same delay).
  const endedTeam = (overrides = {}) =>
    weeklySalaryPerson({
      salaryAmount: 4000,
      salaryStartDate: '2026-09-30',
      salaryPayPeriodWeeks: 1,
      salaryPayDelayMode: '2weeks',
      salaryEndDate: '2026-10-12',
      entries: [],
      ...overrides,
    });

  it('lists each pay date separately with its own amount instead of one lump sum', () => {
    const team = endedTeam();
    const payments = calculateUpcomingPayments(team, date(2026, 10, 13));
    expect(payments).toEqual([
      { date: '2026-10-21', amount: 1000 },
      { date: '2026-10-26', amount: 1000 },
    ]);
    // Same installments, same waterfall as the headline number — just not collapsed.
    expect(calculateSalary(team, date(2026, 10, 13)).upcoming).toBe(2000);
  });

  it('only lists what is still uncovered once part of it has been paid, oldest date first', () => {
    const team = endedTeam({
      entries: [entry({ id: 'p1', amount: 1000, category: 'salary', date: '2026-10-13' })],
    });
    // The first 1000 settles the 10-21 payment, leaving only the 10-26 one.
    expect(calculateUpcomingPayments(team, date(2026, 10, 13))).toEqual([
      { date: '2026-10-26', amount: 1000 },
    ]);
  });

  it('drops a payment from the list the moment its own date arrives (it is due, not upcoming)', () => {
    const team = endedTeam();
    expect(calculateUpcomingPayments(team, date(2026, 10, 21))).toEqual([
      { date: '2026-10-26', amount: 1000 },
    ]);
  });

  it('is empty for someone with no salary at all', () => {
    expect(
      calculateUpcomingPayments(weeklySalaryPerson({ salaryAmount: 0 }), date(2026, 3, 8)),
    ).toEqual([]);
  });
});

describe('calculatePeriodStatuses', () => {
  const crew = (overrides = {}) =>
    weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      entries: [],
      ...overrides,
    });
  const reference = date(2026, 9, 20);

  it('labels each period paid, partial, overdue or upcoming from the payments made so far', () => {
    // 1500 per period; 4000 paid covers two periods, then 1000 of the third.
    const person = crew({
      entries: [entry({ id: 'p1', amount: 4000, category: 'salary', date: '2026-08-30' })],
    });
    const periods = calculatePeriodStatuses(person, reference);
    expect(periods.map((period) => [period.payDate, period.status, period.paidAmount])).toEqual([
      ['2026-07-15', 'paid', 1500],
      ['2026-07-29', 'paid', 1500],
      ['2026-08-12', 'partial', 1000],
      ['2026-08-26', 'overdue', 0],
      ['2026-09-09', 'overdue', 0],
      ['2026-09-23', 'upcoming', 0],
    ]);
  });

  it("carries each period's own start and end dates", () => {
    const [first, second] = calculatePeriodStatuses(crew(), reference);
    expect([first?.periodStartDate, first?.periodEndDate]).toEqual(['2026-07-01', '2026-07-15']);
    expect([second?.periodStartDate, second?.periodEndDate]).toEqual(['2026-07-15', '2026-07-29']);
  });

  it('always agrees with the due and upcoming totals calculateSalary reports', () => {
    const person = crew({
      entries: [entry({ id: 'p1', amount: 4000, category: 'salary', date: '2026-08-30' })],
    });
    const owed = calculatePeriodStatuses(person, reference).reduce(
      (sum, period) => sum + (period.amount - period.paidAmount),
      0,
    );
    const salary = calculateSalary(person, reference);
    expect(owed).toBe(salary.due + salary.upcoming);
  });

  it('shows the in-progress period as paid when it was paid in advance', () => {
    // Started 08-18: one completed period (ends 09-01) plus the one in progress (ends 09-15).
    const person = crew({
      salaryStartDate: '2026-08-18',
      entries: [entry({ id: 'p1', amount: 3000, category: 'salary', date: '2026-09-10' })],
    });
    const periods = calculatePeriodStatuses(person, date(2026, 9, 12));
    expect(periods.map((period) => [period.payDate, period.status])).toEqual([
      ['2026-09-01', 'paid'],
      ['2026-09-15', 'paid'],
    ]);
  });

  it('reports a delayed salary as paid through the work period end, not the later pay date', () => {
    // A real case: 3000/month on two-week periods from 12.08; from 09.09 the salary is paid two
    // weeks after each period ends. 6000 paid covers four periods — the last one is the work
    // through 07.10, which falls due on 21.10. 'Paid through' must say 07.10.
    const person = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryTimeline: [
        { effectiveDate: '2026-08-12', amount: 3000, periodWeeks: 2, payDelayMode: 'none' },
        { effectiveDate: '2026-09-09', amount: 3000, periodWeeks: 2, payDelayMode: '2weeks' },
      ],
      entries: [entry({ id: 'p1', amount: 6000, category: 'salary', date: '2026-10-21' })],
    });
    const periods = calculatePeriodStatuses(person, date(2026, 10, 22));
    expect(periods.map((period) => [period.periodEndDate, period.payDate, period.status])).toEqual([
      ['2026-08-26', '2026-08-26', 'paid'],
      ['2026-09-09', '2026-09-09', 'paid'],
      ['2026-09-23', '2026-10-07', 'paid'],
      ['2026-10-07', '2026-10-21', 'paid'],
      ['2026-10-21', '2026-11-04', 'upcoming'],
    ]);
  });

  it('covers the tail period of an ended salary and is empty without any salary', () => {
    const ended = weeklySalaryPerson({
      salaryAmount: 4000,
      salaryStartDate: '2026-09-30',
      salaryPayPeriodWeeks: 1,
      salaryPayDelayMode: '2weeks',
      salaryEndDate: '2026-10-12',
      entries: [entry({ id: 'p1', amount: 1000, category: 'salary', date: '2026-10-13' })],
    });
    const periods = calculatePeriodStatuses(ended, date(2026, 10, 13));
    expect(periods.map((period) => [period.payDate, period.status])).toEqual([
      ['2026-10-21', 'paid'],
      ['2026-10-26', 'upcoming'],
    ]);
    expect(
      calculatePeriodStatuses(weeklySalaryPerson({ salaryAmount: 0 }), date(2026, 3, 8)),
    ).toEqual([]);
  });
});

describe('salary adjustments', () => {
  // 3000/month on two-week periods from 09.09, no delay: 1500 per period, 3000/28 per day.
  const crew = (adjustments: SalaryAdjustment[], overrides = {}) =>
    weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      salaryAdjustments: adjustments,
      entries: [],
      ...overrides,
    });
  const reference = date(2026, 10, 10);
  const byPayDate = (person: ReturnType<typeof crew>) =>
    Object.fromEntries(
      calculatePeriodStatuses(person, reference).map((period) => [period.payDate, period]),
    );

  it('charges a stoppage at the daily rate to the period that holds those days', () => {
    // The car broke down: Wed 30.09 to Sat 03.10, four working days, all inside the period
    // 23.09 - 07.10. Sunday is a rest day, so a day is 3000 / 24 = 125.
    const periods = byPayDate(
      crew([{ id: 'a', type: 'stoppage', startDate: '2026-09-30', endDate: '2026-10-03' }]),
    );
    expect(periods['2026-10-07']).toMatchObject({
      baseAmount: 1500,
      amount: 1000,
      adjustments: [{ id: 'a', type: 'stoppage', days: 4, amount: -500 }],
    });
    // Its neighbours are untouched.
    expect(periods['2026-09-23']).toMatchObject({ amount: 1500, adjustments: [] });
    expect(periods['2026-10-21']).toMatchObject({ amount: 1500, adjustments: [] });
  });

  it('splits a stoppage across the periods it runs through, each day charged once', () => {
    // Mon 05.10 - Sat 10.10 is six working days: two in the period ending 07.10 (05, 06), four in
    // the next.
    const periods = byPayDate(
      crew([{ id: 'a', type: 'stoppage', startDate: '2026-10-05', endDate: '2026-10-10' }]),
    );
    expect(periods['2026-10-07']?.adjustments).toEqual([
      { id: 'a', type: 'stoppage', days: 2, amount: -250 },
    ]);
    expect(periods['2026-10-21']?.adjustments).toEqual([
      { id: 'a', type: 'stoppage', days: 4, amount: -500 },
    ]);
  });

  it('adds a bonus and takes off a deduction on the period that holds their date', () => {
    const periods = byPayDate(
      crew([
        { id: 'b', type: 'bonus', startDate: '2026-09-25', amount: 200 },
        { id: 'd', type: 'deduction', startDate: '2026-09-26', amount: 50 },
      ]),
    );
    expect(periods['2026-10-07']).toMatchObject({ baseAmount: 1500, amount: 1650 });
    expect(periods['2026-10-07']?.adjustments.map((item) => item.amount)).toEqual([200, -50]);
  });

  it('never lets a period go below zero', () => {
    const periods = byPayDate(
      crew([{ id: 'd', type: 'deduction', startDate: '2026-09-25', amount: 5000 }]),
    );
    expect(periods['2026-10-07']).toMatchObject({ baseAmount: 1500, amount: 0 });
  });

  it('still counts a bonus dated before the first period or after the last', () => {
    const periods = calculatePeriodStatuses(
      crew([
        { id: 'early', type: 'bonus', startDate: '2026-08-01', amount: 100 },
        { id: 'late', type: 'bonus', startDate: '2027-01-01', amount: 300 },
      ]),
      reference,
    );
    expect(periods[0]?.amount).toBe(1600);
    expect(periods[periods.length - 1]?.amount).toBe(1800);
  });

  it('flows into what is owed: due and upcoming agree with the adjusted periods', () => {
    const person = crew([
      { id: 'a', type: 'stoppage', startDate: '2026-09-30', endDate: '2026-10-03' },
      { id: 'b', type: 'bonus', startDate: '2026-09-12', amount: 100 },
    ]);
    const periods = calculatePeriodStatuses(person, reference);
    const salary = calculateSalary(person, reference);
    expect(salary.due + salary.upcoming).toBe(
      periods.reduce((sum, period) => sum + (period.amount - period.paidAmount), 0),
    );
    // 1500 + 100 (first period), 1000 (stoppage period), 1500 (forecast) — nothing paid yet.
    expect(salary.due + salary.upcoming).toBe(1600 + 1000 + 1500);
  });

  it('changes nothing when there are no adjustments', () => {
    const plain = crew([]);
    const without = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-09-09',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      entries: [],
    });
    expect(calculateSalary(plain, reference)).toEqual(calculateSalary(without, reference));
    expect(calculatePeriodStatuses(plain, reference)).toEqual(
      calculatePeriodStatuses(without, reference),
    );
  });

  it('does not charge a Sunday: it is a rest day', () => {
    // Fri 02.10 - Mon 05.10 is four calendar days but three working ones (the Sunday is free).
    const periods = byPayDate(
      crew([{ id: 'a', type: 'stoppage', startDate: '2026-10-02', endDate: '2026-10-05' }]),
    );
    expect(periods['2026-10-07']?.adjustments).toEqual([
      { id: 'a', type: 'stoppage', days: 3, amount: -375 },
    ]);
    // A stoppage that is only a Sunday costs nothing and leaves no trace.
    const sundayOnly = byPayDate(
      crew([{ id: 'b', type: 'stoppage', startDate: '2026-10-04', endDate: '2026-10-04' }]),
    );
    expect(sundayOnly['2026-10-07']).toMatchObject({ amount: 1500, adjustments: [] });
  });

  it('follows the rest days chosen for the person', () => {
    const stoppage: SalaryAdjustment = {
      id: 'a',
      type: 'stoppage',
      startDate: '2026-09-30',
      endDate: '2026-10-03',
    };
    // Saturday and Sunday off: 20 working days a month, 150 a day, and the Saturday is free —
    // Wed, Thu, Fri are charged.
    expect(
      byPayDate(crew([stoppage], { salaryRestDays: [0, 6] }))['2026-10-07']?.adjustments,
    ).toEqual([{ id: 'a', type: 'stoppage', days: 3, amount: -450 }]);
    // No rest days at all: every day counts, a month is 28 of them (107.14 a day).
    expect(byPayDate(crew([stoppage], { salaryRestDays: [] }))['2026-10-07']?.adjustments).toEqual([
      { id: 'a', type: 'stoppage', days: 4, amount: -429 },
    ]);
  });
});

describe('getRestDays', () => {
  it('defaults to Sunday, tidies what is stored, and never rests every day', () => {
    expect(getRestDays(crewPerson())).toEqual([0]);
    expect(getRestDays(crewPerson({ salaryRestDays: [6, 0, 6, 9, -1, 2.5] }))).toEqual([0, 6]);
    expect(getRestDays(crewPerson({ salaryRestDays: [] }))).toEqual([]);
    expect(getRestDays(crewPerson({ salaryRestDays: [0, 1, 2, 3, 4, 5, 6] }))).toEqual([]);
  });
});

function crewPerson(overrides = {}) {
  return weeklySalaryPerson({ salaryAmount: 3000, entries: [], ...overrides });
}
