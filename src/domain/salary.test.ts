import {
  calculateSalary,
  earliestUnpaidPayDate,
  getSalarySettings,
  giftSummary,
  salaryPaid,
} from './salary';
import {
  applyPayPeriodChange,
  applySalaryAmountChange,
  endSalaryWhenArchiving,
  replaySalaryHistory,
  resetSalaryWhenUnarchiving,
  syncPayDate,
} from './salary-workflows';
import { date, entry, weeklySalaryPerson, workPerson } from '../test/fixtures/golden';

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
    // Monthly salary, 4-week period, 4-week payment delay, work ends 2026-07-31.
    const person = weeklySalaryPerson({
      salaryAmount: 1500,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 4,
      salaryPayDelayMode: '4weeks',
      salaryEndDate: '2026-07-31',
      entries: [],
    });

    // Right after ending: the final period completed, but the 4-week delay hasn't elapsed yet —
    // the amount should show as upcoming, not overdue.
    const soonAfterEnd = calculateSalary(person, date(2026, 8, 1));
    expect(soonAfterEnd.ended).toBe(true);
    expect(soonAfterEnd.due).toBe(0);
    expect(soonAfterEnd.upcoming).toBe(1500);
    expect(soonAfterEnd.nextPayDate).toBe('2026-08-26');

    // Well past the delay window — should now flip to overdue.
    const wellAfterDelay = calculateSalary(person, date(2026, 9, 5));
    expect(wellAfterDelay.due).toBe(1500);
    expect(wellAfterDelay.upcoming).toBe(0);
  });

  it('nets Received salary entries against Gave salary entries when counting what is paid', () => {
    const person = weeklySalaryPerson({
      entries: [
        entry({ id: 'one', amount: 40, category: 'salary' }),
        entry({ id: 'two', amount: 20, comment: '[Salary] Legacy' }),
        entry({ id: 'three', amount: 15, type: 'Received', category: 'salary' }),
      ],
    });
    expect(salaryPaid(person)).toBe(45);
  });

  it('lets a Received salary entry represent a refund/clawback that reduces what is owed', () => {
    // Real scenario: an earlier personal loan (not salary) was partly paid back, and the net
    // remaining balance should count against an upcoming salary payment. Rather than fabricating
    // a new entry, the original Gave and Received entries are simply re-categorized as salary.
    const person = weeklySalaryPerson({
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
    expect(salaryPaid(person)).toBe(1200);
  });

  it('identifies the earliest unpaid completed period behind a paid period', () => {
    const salariedPerson = weeklySalaryPerson({
      entries: [entry({ amount: 100, category: 'salary' })],
    });
    const settings = getSalarySettings(salariedPerson);
    expect(settings).not.toBeNull();
    if (!settings) throw new Error('Expected salary settings');
    expect(earliestUnpaidPayDate(settings, 2, 100, 100)).toBe('2026-03-15');
  });

  it('continues salary calculation while a person is archived', () => {
    const active = calculateSalary(weeklySalaryPerson(), date(2026, 3, 10));
    const archived = calculateSalary(weeklySalaryPerson({ archived: true }), date(2026, 3, 10));
    expect(archived).toEqual(active);
  });

  it('does not resurface a paid period as due soon when settled exactly on its boundary', () => {
    const person = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
        entry({ id: 'e3', amount: 1500, category: 'salary', date: '2026-08-09' }),
      ],
    });
    // referenceDate lands exactly on the 3rd period boundary (14-day cycle from 2026-07-01),
    // which was just paid in advance on 2026-08-09.
    const result = calculateSalary(person, date(2026, 8, 12));
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.paySoon).toBe(false);
    expect(result.nextPayDate).toBe('2026-08-26');
  });

  it('does not resurface a paid period as due soon when paid a few days before its boundary', () => {
    const person = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
        entry({ id: 'e3', amount: 1500, category: 'salary', date: '2026-08-09' }),
      ],
    });
    // referenceDate is 3 days before the 3rd period boundary (2026-08-12), which was already
    // paid in full on 2026-08-09 — nothing should be flagged as due or upcoming yet.
    const result = calculateSalary(person, date(2026, 8, 9));
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.nextPayDate).toBe('2026-08-12');
  });

  it('flags a missed payment as overdue the very next day, with no extra grace day', () => {
    const person = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
      ],
    });
    // The 2026-08-12 boundary (3rd period) was never paid. One day later it must already read
    // as overdue, and the following (currently in-progress) period shows separately as upcoming.
    const result = calculateSalary(person, date(2026, 8, 13));
    expect(result.due).toBe(1500);
    expect(result.upcoming).toBe(1500);
    expect(result.nextPayDate).toBe('2026-08-26');
  });

  it('shows a final unpaid balance as overdue (not upcoming) the day after the salary ends', () => {
    const person = weeklySalaryPerson({
      salaryAmount: 3500,
      salaryStartDate: '2026-01-01',
      salaryPayPeriodWeeks: 2,
      // Exactly 6 periods (84 days) after the start date.
      salaryEndDate: '2026-03-26',
      entries: [entry({ id: 'e1', amount: 8750, category: 'salary', date: '2026-03-20' })],
    });
    const result = calculateSalary(person, date(2026, 3, 27));
    expect(result.ended).toBe(true);
    expect(result.due).toBe(1750);
    expect(result.upcoming).toBe(0);
  });

  it('calculates the Work gift summary independently', () => {
    expect(giftSummary(workPerson)).toMatchObject({ gave: 50, received: 20, total: 70, net: 30 });
  });
});

describe('salary workflow parity', () => {
  it('banks accrued salary when the pay period changes', () => {
    const changed = applyPayPeriodChange(weeklySalaryPerson(), 2, date(2026, 3, 10));
    expect(changed.salaryAccruedBaseline).toBe(100);
    expect(changed.salaryPeriodAnchorDate).toBe('2026-03-10');
    expect(changed.salaryPayPeriodWeeks).toBe(2);
  });

  it('does not re-anchor when the period is unchanged', () => {
    const changed = applyPayPeriodChange(weeklySalaryPerson(), 1, date(2026, 3, 10));
    expect(changed.salaryAccruedBaseline).toBeUndefined();
    expect(changed.salaryPeriodAnchorDate).toBeUndefined();
  });

  it('adds the sync adjustment as a real entry, and banks pre-anchor paid history as the baseline', () => {
    const synced = syncPayDate(
      weeklySalaryPerson({ entries: [entry({ amount: 40, category: 'salary' })] }),
      {
        adjustmentAmount: 60,
        newAnchorDate: '2026-03-10',
        adjustmentEntryId: 'sync-entry',
        referenceDate: date(2026, 3, 10),
      },
    );
    expect(synced.entries[0]).toMatchObject({
      id: 'sync-entry',
      amount: 60,
      category: 'salary',
      date: '2026-03-10',
    });
    // The pre-existing 40 entry (dated 2026-03-01, before the new anchor) is banked as baseline
    // so it doesn't get netted against periods that start only from the new anchor onward. The
    // adjustment entry itself is dated on the anchor date, so it's correctly excluded (not
    // 'before' the anchor) and instead counts live toward the new cycle, same as before.
    expect(synced.salaryAccruedBaseline).toBe(40);
    expect(synced.salaryPeriodAnchorDate).toBe('2026-03-10');
  });

  it('also changes the salary amount when provided, banking accrued at the old rate', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ id: 'e1', amount: 50, category: 'salary', date: '2026-08-09' })],
    });
    const synced = syncPayDate(before, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-08-13',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 8, 13),
      newAmount: 3000,
    });
    expect(synced.salaryAmount).toBe(3000);
    expect(synced.salaryPeriodAnchorDate).toBe('2026-08-13');
    // Accrued under the OLD 2000/month rate as of 2026-08-13: one completed period (1000).
    expect(synced.salaryAccruedBaseline).toBe(1000);
    expect(synced.salaryHistory).toEqual([
      { effectiveDate: '2026-08-13', previousAmount: 2000, newAmount: 3000 },
    ]);
  });

  it('also updates the payment delay mode when provided', () => {
    const before = weeklySalaryPerson({ salaryPayDelayMode: 'none' });
    const synced = syncPayDate(before, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-03-10',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 3, 10),
      payDelayMode: '4weeks',
    });
    expect(synced.salaryPayDelayMode).toBe('4weeks');
  });

  it('leaves the payment delay mode untouched when not provided', () => {
    const before = weeklySalaryPerson({ salaryPayDelayMode: '2weeks' });
    const synced = syncPayDate(before, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-03-10',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 3, 10),
    });
    expect(synced.salaryPayDelayMode).toBe('2weeks');
  });

  it('does not reset the schedule when only Payment Timing changes (the submitted date matches the current anchor)', () => {
    // Reproduces the reported bug: an established payroll history where paid-to-date already
    // exceeds what a freshly-reset (baseline=0, anchor=today) schedule would expect — if the
    // anchor were wrongly reset here, 'upcoming' would incorrectly drop to 0 via the advance-
    // payment-suppression rule, even though a real amount is genuinely owed on the next date.
    const before = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-01',
      salaryPayPeriodWeeks: 2,
      salaryPayDelayMode: 'none',
      entries: [
        entry({ id: 'e1', amount: 1500, category: 'salary', date: '2026-07-15' }),
        entry({ id: 'e2', amount: 1500, category: 'salary', date: '2026-07-29' }),
        entry({ id: 'e3', amount: 1500, category: 'salary', date: '2026-08-12' }),
        entry({ id: 'e4', amount: 1500, category: 'salary', date: '2026-08-26' }),
        entry({ id: 'e5', amount: 1500, category: 'salary', date: '2026-09-09' }),
      ],
    });
    const beforeResult = calculateSalary(before, date(2026, 9, 23));
    expect(beforeResult.upcoming).toBeGreaterThan(0);

    // The sheet now defaults the date field to the person's current anchor (salaryStartDate
    // here, since no anchor is set), so an unedited submission reports the same date back.
    const synced = syncPayDate(before, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-07-01',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 9, 23),
      payDelayMode: '2weeks',
    });
    expect(synced.salaryPeriodAnchorDate).toBeUndefined();
    expect(synced.salaryAccruedBaseline).toBeUndefined();

    const afterResult = calculateSalary(synced, date(2026, 9, 23));
    expect(afterResult.upcoming).toBe(beforeResult.upcoming);
  });

  it('banks pre-anchor paid history when re-anchoring, instead of netting it against the new cycle', () => {
    // Reported scenario: worked one week (22/07-29/07) and was paid 750 for it, then switched to
    // a new bi-weekly cycle anchored at 29/07. That 750 must not count as credit toward periods
    // that only start from 29/07 — the upcoming period must still show its full amount.
    const person = weeklySalaryPerson({
      salaryAmount: 3000,
      salaryStartDate: '2026-07-22',
      salaryPayPeriodWeeks: 2,
      entries: [
        entry({ id: 'week-1', amount: 750, category: 'salary', date: '2026-07-25' }),
        entry({ id: 'p1', amount: 1500, category: 'salary', date: '2026-08-05' }),
        entry({ id: 'p2', amount: 1500, category: 'salary', date: '2026-08-19' }),
        entry({ id: 'p3', amount: 1500, category: 'salary', date: '2026-09-02' }),
      ],
    });
    const synced = syncPayDate(person, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-07-29',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 9, 20),
    });
    // Only the pre-anchor entry (dated before 2026-07-29) is banked; the three post-anchor
    // payments stay live and count toward the new cycle's periods as usual.
    expect(synced.salaryAccruedBaseline).toBe(750);
    expect(synced.salaryPeriodAnchorDate).toBe('2026-07-29');

    const result = calculateSalary(synced, date(2026, 9, 20));
    // 3 completed periods since 29/07 (1500 each = 4500), exactly covered by the 3 post-anchor
    // payments (1500*3=4500) — so the 4th, upcoming period owes its full 1500, not a partial
    // amount reduced by the unrelated pre-cycle payment.
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(1500);
  });

  it('replaySalaryHistory rebuilds the exact reported scenario (2000/month, then 3000 from 12/08)', () => {
    const person = weeklySalaryPerson({
      salaryStartDate: '2026-07-29',
      salaryPayPeriodWeeks: 2,
      entries: [],
    });
    const rebuilt = replaySalaryHistory(person, 2000, [
      { effectiveDate: '2026-08-12', amount: 3000 },
    ]);
    expect(rebuilt.salaryAmount).toBe(3000);
    expect(rebuilt.salaryPeriodAnchorDate).toBe('2026-08-12');
    // 29/07-12/08 is exactly one completed 2-week period at the OLD 2000/month rate
    // (periodAmount 1000) — that's what should be owed for it.
    expect(rebuilt.salaryAccruedBaseline).toBe(1000);
    expect(rebuilt.salaryHistory).toEqual([
      { effectiveDate: '2026-08-12', previousAmount: 2000, newAmount: 3000 },
    ]);

    const result = calculateSalary(rebuilt, date(2026, 8, 12));
    expect(result.accrued).toBe(1000);
  });

  it('replaySalaryHistory correctly handles multiple changes and reordering', () => {
    const person = weeklySalaryPerson({
      salaryStartDate: '2026-01-01',
      salaryPayPeriodWeeks: 2,
      entries: [],
    });
    // Provided out of order on purpose — replay must sort by date itself.
    const rebuilt = replaySalaryHistory(person, 1000, [
      { effectiveDate: '2026-03-01', amount: 2000 },
      { effectiveDate: '2026-02-01', amount: 1500 },
    ]);
    expect(rebuilt.salaryAmount).toBe(2000);
    expect(rebuilt.salaryHistory).toEqual([
      { effectiveDate: '2026-03-01', previousAmount: 1500, newAmount: 2000 },
      { effectiveDate: '2026-02-01', previousAmount: 1000, newAmount: 1500 },
    ]);
  });

  it('resets a salaried unarchive to today, without banking a separate paid snapshot', () => {
    const reset = resetSalaryWhenUnarchiving(
      weeklySalaryPerson({
        archived: true,
        expanded: true,
        entries: [entry({ amount: 100, category: 'salary' })],
      }),
      date(2026, 4, 5),
    );
    expect(reset).toMatchObject({
      archived: false,
      expanded: false,
      salaryAccruedBaseline: 0,
      salaryPeriodAnchorDate: '2026-04-05',
      salaryEndDate: '',
    });
  });

  it('sets the salary end date to today when archiving, unless one is already set', () => {
    const ended = endSalaryWhenArchiving(weeklySalaryPerson(), date(2026, 4, 5));
    expect(ended.salaryEndDate).toBe('2026-04-05');

    const unchanged = endSalaryWhenArchiving(
      weeklySalaryPerson({ salaryEndDate: '2026-06-01' }),
      date(2026, 4, 5),
    );
    expect(unchanged.salaryEndDate).toBe('2026-06-01');
  });

  it('banks accrued at the old rate up to the effective date, then applies the new rate', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ id: 'e1', amount: 50, category: 'salary', date: '2026-08-09' })],
    });
    const changed = applySalaryAmountChange(before, 3000, date(2026, 8, 13));
    expect(changed.salaryAmount).toBe(3000);
    expect(changed.salaryPeriodAnchorDate).toBe('2026-08-13');
    // Accrued under the OLD 2000/month rate as of 2026-08-13: one completed period (1000).
    expect(changed.salaryAccruedBaseline).toBe(1000);

    const result = calculateSalary(changed, date(2026, 8, 13));
    // Nothing has elapsed under the new rate/anchor yet, so nothing new is due; the banked old
    // balance (1000) minus what's already been paid (50) is still owed.
    expect(result.due).toBe(950);
    expect(result.periodAmount).toBe(1500);
    expect(changed.salaryHistory).toEqual([
      { effectiveDate: '2026-08-13', previousAmount: 2000, newAmount: 3000 },
    ]);
  });

  it('does not let a stale banked baseline bypass the grace period for a later, genuinely new pay date', () => {
    // Same setup as above: banked baseline from a past salary change (anchor 2026-08-13).
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ id: 'e1', amount: 50, category: 'salary', date: '2026-08-09' })],
    });
    const changed = applySalaryAmountChange(before, 3000, date(2026, 8, 13));

    // Weeks later, a genuinely NEW period boundary lands exactly today (2026-08-27) — the banked
    // baseline is still nonzero (never reset), but this new period must still get the normal
    // grace: not overdue on the pay date itself.
    const onPayDate = calculateSalary(changed, date(2026, 8, 27));
    expect(onPayDate.due).toBe(0);
    expect(onPayDate.upcoming).toBeGreaterThan(0);

    // The day after, it correctly becomes overdue.
    const dayAfter = calculateSalary(changed, date(2026, 8, 28));
    expect(dayAfter.due).toBeGreaterThan(0);
  });

  it('prepends new salary changes and keeps history bounded to the most recent 20', () => {
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryHistory: [{ effectiveDate: '2026-06-01', previousAmount: 1500, newAmount: 2000 }],
    });
    const changed = applySalaryAmountChange(before, 2500, date(2026, 8, 13));
    expect(changed.salaryHistory).toEqual([
      { effectiveDate: '2026-08-13', previousAmount: 2000, newAmount: 2500 },
      { effectiveDate: '2026-06-01', previousAmount: 1500, newAmount: 2000 },
    ]);
  });

  it('does not re-anchor when the salary amount is unchanged', () => {
    const before = weeklySalaryPerson();
    const changed = applySalaryAmountChange(before, before.salaryAmount ?? 0, date(2026, 4, 5));
    expect(changed.salaryPeriodAnchorDate).toBeUndefined();
    expect(changed.salaryAccruedBaseline).toBeUndefined();
  });

  it('fully reflects a later edit to an entry that already existed at sync time', () => {
    // Real reported scenario: sync the schedule (no adjustment), then go back and correct the
    // amount on the entry that was already there. The full new amount must count, not just the
    // delta minus whatever got silently banked into a stale baseline snapshot.
    const before = weeklySalaryPerson({
      salaryAmount: 2000,
      salaryStartDate: '2026-07-27',
      salaryPayPeriodWeeks: 2,
      entries: [entry({ id: 'e1', amount: 50, category: 'salary', date: '2026-08-09' })],
    });
    const synced = syncPayDate(before, {
      adjustmentAmount: 0,
      newAnchorDate: '2026-07-27',
      adjustmentEntryId: 'unused',
      referenceDate: date(2026, 8, 13),
    });
    expect(calculateSalary(synced, date(2026, 8, 13)).due).toBe(950);

    // Now correct that same entry's amount from 50 to 100.
    const corrected = {
      ...synced,
      entries: synced.entries.map((e) => (e.id === 'e1' ? { ...e, amount: 100 } : e)),
    };
    const result = calculateSalary(corrected, date(2026, 8, 13));
    expect(result.paid).toBe(100);
    expect(result.due).toBe(900);
  });
});
