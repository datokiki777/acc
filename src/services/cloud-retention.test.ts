import {
  CLOUD_HISTORY_MAX_RECORDS,
  historyExpiry,
  planHistoryRetention,
  type HistoryDoc,
} from './cloud-retention';

/** n consecutive daily copies, the newest on `last` (a Date), oldest first. */
function daily(count: number, last: Date): HistoryDoc[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(last.getFullYear(), last.getMonth(), last.getDate() - (count - 1 - index));
    const key = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    ].join('-');
    return { id: key, expireAtMs: Number.MAX_SAFE_INTEGER };
  });
}

describe('cloud history retention', () => {
  it("keeps the newest 30 copies, today's included, and drops the oldest as a new day arrives", () => {
    const today = new Date(2026, 9, 30);
    // 30 kept copies plus today's new one: 31, so exactly the oldest goes.
    const docs = daily(31, today);
    const plan = planHistoryRetention(docs, today);
    expect(CLOUD_HISTORY_MAX_RECORDS).toBe(30);
    expect(plan.remove).toEqual([docs[0]!.id]);
  });

  it('removes nothing while there are 30 or fewer', () => {
    const today = new Date(2026, 9, 30);
    expect(planHistoryRetention(daily(30, today), today).remove).toEqual([]);
    expect(planHistoryRetention(daily(5, today), today).remove).toEqual([]);
  });

  it('keeps the last 30 through a long pause instead of wiping them (an age rule would)', () => {
    // The last 30 copies end on 01.05; the app wasn't used until 15.08, three and a half months
    // later. Saving today adds one copy: only the single oldest goes, the rest stay.
    const docs = [...daily(30, new Date(2026, 4, 1)), ...daily(1, new Date(2026, 7, 15))];
    const plan = planHistoryRetention(docs, new Date(2026, 7, 15));
    expect(plan.remove).toEqual(['2026-04-02']);
  });

  it('lets copies older than six months go, even when there are fewer than 30', () => {
    const docs: HistoryDoc[] = [
      { id: '2026-05-01', expireAtMs: Number.MAX_SAFE_INTEGER },
      { id: '2026-08-01', expireAtMs: Number.MAX_SAFE_INTEGER },
      { id: '2026-12-14', expireAtMs: Number.MAX_SAFE_INTEGER },
    ];
    // On 15.12 the 01.05 copy is seven and a half months old; the 01.08 one is not yet six.
    expect(planHistoryRetention(docs, new Date(2026, 11, 15)).remove).toEqual(['2026-05-01']);
  });

  it('ignores documents whose id is not a date: they are neither counted nor removed', () => {
    const today = new Date(2026, 9, 30);
    const docs = [...daily(30, today), { id: 'notes' }, { id: '2026-13-45x' }];
    expect(planHistoryRetention(docs, today).remove).toEqual([]);
  });

  it("raises a short stored expiry to six months from the copy's own day, once", () => {
    const today = new Date(2026, 9, 30);
    const old30DayExpiry = new Date(2026, 10, 29).getTime(); // the earlier rule: day + 30
    const plan = planHistoryRetention(
      [
        { id: '2026-10-30', expireAtMs: old30DayExpiry },
        { id: '2026-10-29' }, // none stored at all
        { id: '2026-10-28', expireAtMs: new Date(2027, 3, 28).getTime() }, // already right
      ],
      today,
    );
    expect(plan.remove).toEqual([]);
    expect(plan.refreshExpiry).toEqual([
      { id: '2026-10-30', expireAt: new Date(2027, 3, 30) },
      { id: '2026-10-29', expireAt: new Date(2027, 3, 29) },
    ]);
  });

  it('gives a copy an expiry six months after its day', () => {
    expect(historyExpiry('2026-10-30')).toEqual(new Date(2027, 3, 30));
    expect(() => historyExpiry('latest')).toThrow();
  });
});
