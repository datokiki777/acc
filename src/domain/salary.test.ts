import {
  calculateSalary,
  getEffectiveTimeline,
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
    expect(result.upcoming).toBe(100);
    expect(result.nextPayDate).toBe('2026-03-08');
  });

  it.each([
    [date(2026, 3, 7), 0, 100, '2026-03-08', 1, true],
    [date(2026, 3, 8), 0, 100, '2026-03-08', 0, true],
    [date(2026, 3, 9), 100, 100, '2026-03-15', 6, false],
    [date(2026, 3, 10), 100, 100, '2026-03-15', 5, false],
  ] as const)(
    'preserves grace and upcoming behavior at %s',
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

  it('flags a missed payment as overdue the very next day, with no extra grace day', () => {
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
    expect(calculateSalary(after, date(2026, 10, 7)).nextPayDate).toBe('2026-10-07');
    expect(calculateSalary(after, date(2026, 10, 7)).due).toBe(0);
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
    for (const day of [1, 5, 7]) {
      expect(calculateSalary(employee, date(2026, 10, day)).nextPayDate).toBe('2026-10-07');
    }
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
    expect(calculateSalary(reanchored, date(2026, 7, 29)).accrued).toBe(0);

    const afterDelete = { ...reanchored, entries: [] };
    const before = calculateSalary(reanchored, date(2026, 8, 12));
    const after = calculateSalary(afterDelete, date(2026, 8, 12));
    expect(after.paid).toBe(before.paid - 10);
  });
});
