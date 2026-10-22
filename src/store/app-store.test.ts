import 'fake-indexeddb/auto';

import { vi } from 'vitest';

import { createAccReactDatabase, type AccReactDatabase } from '../db/database';
import { createAppRepository } from '../db/repository';
import { calculateSalary } from '../domain/salary';
import type { CloudBackupEntry } from '../services/cloud-backup';
import type { CloudService, PersonDraft } from './app-store';
import { createAppStore } from './app-store';

const NOW = new Date(2026, 7, 6, 12);

function personalDraft(name = 'Alex'): PersonDraft {
  return {
    name,
    currency: 'EUR',
    tagLabel: '',
    tagColor: '',
    salaryEnabled: false,
    salaryAmount: 0,
    salaryStartDate: '',
    salaryEndDate: '',
    salaryPayPeriodWeeks: 2,
    salaryPayDelayMode: 'none',
  };
}

function salaryDraft(): PersonDraft {
  return {
    ...personalDraft('Employee'),
    salaryEnabled: true,
    salaryAmount: 400,
    salaryStartDate: '2026-07-01',
    salaryPayPeriodWeeks: 1,
    salaryPayDelayMode: '2weeks',
  };
}

describe('Zustand application actions', () => {
  let database: AccReactDatabase;
  let ids: string[];

  beforeEach(() => {
    database = createAccReactDatabase(`store-test-${crypto.randomUUID()}`);
    ids = ['person-id', 'entry-id', 'sync-id', 'next-id'];
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  function makeStore(cloud?: CloudService) {
    return createAppStore({
      repository: createAppRepository(database),
      now: () => new Date(NOW),
      createId: () => ids.shift() ?? crypto.randomUUID(),
      ...(cloud ? { cloud } : {}),
    });
  }

  function makeMockCloud(overrides: Partial<CloudService> = {}): CloudService {
    const cloudUser = {
      uid: 'user-1',
      displayName: 'Alex',
      email: 'alex@example.com',
      photoURL: null,
    };
    return {
      onCloudAuthChange: () => () => {},
      signInWithEmail: () => Promise.resolve(cloudUser),
      registerWithEmail: () => Promise.resolve(cloudUser),
      signOutOfCloud: async () => {},
      saveBackupToCloud: () => Promise.resolve(),
      listCloudBackups: () => Promise.resolve([]),
      fetchCloudBackupPayload: () => Promise.resolve('{}'),
      ...overrides,
    };
  }

  it('initializes and persists mode, theme, search, filter, and expanded state', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().setTheme('dark');
    store.getState().setSearch('alex');
    store.getState().setFilter('archived');
    store.getState().setExpandedPerson('person-id');
    expect(store.getState()).toMatchObject({
      initialized: true,
      mode: 'work',
      theme: 'dark',
      search: 'alex',
      filter: 'archived',
      expandedPersonId: 'person-id',
    });
  });

  it('persists the tag filter across a reload and leaves it untouched by switching modes', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setTagFilter('Badelix');
    await store.getState().setMode('personal');
    // Switching modes clears search/filter/expanded selection, but the tag filter is a Work-only
    // concern the UI simply hides outside Work — it isn't reset by the mode switch itself.
    expect(store.getState().tagFilter).toBe('Badelix');
    await store.getState().setMode('work');
    expect(store.getState().tagFilter).toBe('Badelix');

    const reloaded = createAppStore({
      repository: createAppRepository(database),
      now: () => new Date(NOW),
      createId: () => crypto.randomUUID(),
    });
    await reloaded.getState().initialize();
    expect(reloaded.getState().tagFilter).toBe('Badelix');
  });

  it('defaults to English and persists a chosen language across a reload', async () => {
    const store = makeStore();
    await store.getState().initialize();
    expect(store.getState().language).toBe('en');
    await store.getState().setLanguage('ka');
    expect(store.getState().language).toBe('ka');

    const reloaded = createAppStore({
      repository: createAppRepository(database),
      now: () => new Date(NOW),
      createId: () => crypto.randomUUID(),
    });
    await reloaded.getState().initialize();
    expect(reloaded.getState().language).toBe('ka');
  });

  it('performs person and entry CRUD with undo', async () => {
    const store = makeStore();
    await store.getState().initialize();
    const created = await store.getState().addPerson(personalDraft());
    expect(created.id).toBe('person-id');
    await store.getState().editPerson(created.id, personalDraft('Edited'));
    expect(store.getState().peopleByMode.personal[0]?.name).toBe('Edited');

    const addedEntry = await store.getState().addEntry(created.id, {
      amount: 100.6,
      type: 'Received',
      date: '2026-08-06',
      comment: 'Loan',
    });
    expect(addedEntry).toMatchObject({ id: 'entry-id', amount: 101, type: 'Received' });
    await store.getState().editEntry(created.id, addedEntry.id, {
      amount: 75,
      type: 'Gave',
      date: '2026-08-05',
      comment: 'Edited entry',
    });
    expect(store.getState().peopleByMode.personal[0]?.entries[0]).toMatchObject({
      amount: 75,
      type: 'Gave',
    });
    await store.getState().deleteEntry(created.id, addedEntry.id);
    expect(store.getState().peopleByMode.personal[0]?.entries).toHaveLength(0);
    await store.getState().undoLastDeletion();
    expect(store.getState().peopleByMode.personal[0]?.entries).toHaveLength(1);

    await store.getState().deletePerson(created.id);
    expect(store.getState().peopleByMode.personal).toHaveLength(0);
    await store.getState().undoLastDeletion();
    expect(store.getState().peopleByMode.personal[0]?.id).toBe(created.id);
  });

  it('keeps Personal and Work CRUD isolated', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().addPerson(personalDraft('Personal'));
    await store.getState().setMode('work');
    await store.getState().addPerson(personalDraft('Work'));
    expect(store.getState().peopleByMode.personal[0]?.name).toBe('Personal');
    expect(store.getState().peopleByMode.work[0]?.name).toBe('Work');
  });

  it('integrates salary entries, sync, archive, and unarchive', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    const employee = await store.getState().addPerson(salaryDraft());
    await store.getState().addEntry(employee.id, {
      amount: 100,
      type: 'Received',
      date: '2026-07-08',
      comment: 'Pay',
      category: 'salary',
    });
    const paid = store.getState().peopleByMode.work[0]!;
    expect(paid.entries[0]?.type).toBe('Received');

    await store.getState().syncSalary(employee.id, 0, '2026-08-01', undefined, undefined, 2);
    const changed = store.getState().peopleByMode.work[0]!;
    expect(changed.salaryPeriodAnchorDate).toBe('2026-08-01');
    expect(changed.salaryPayPeriodWeeks).toBe(2);

    await store.getState().syncSalary(employee.id, 50, '2026-08-01');
    const synced = store.getState().peopleByMode.work[0]!;
    expect(synced.salaryPeriodAnchorDate).toBe('2026-08-01');
    expect(synced.entries[0]?.category).toBe('salary');

    await store.getState().toggleArchive(employee.id);
    const archived = store.getState().peopleByMode.work[0]!;
    expect(archived.archived).toBe(true);
    expect(archived.salaryEndDate).toBe('2026-08-06');

    await store.getState().toggleArchive(employee.id);
    const unarchived = store.getState().peopleByMode.work[0]!;
    expect(unarchived.archived).toBe(false);
    expect(unarchived.salaryEndDate).toBe('');
    expect(unarchived.salaryPeriodAnchorDate).toBe('2026-08-06');
    expect(calculateSalary(unarchived, NOW).enabled).toBe(true);
  });

  it('does not overwrite an already-set salary end date when archiving', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;

    await store.getState().editPerson(employee.id, {
      ...salaryDraft(),
      salaryEndDate: '2026-09-01',
    });
    await store.getState().toggleArchive(employee.id);
    const archived = store.getState().peopleByMode.work[0]!;
    expect(archived.archived).toBe(true);
    expect(archived.salaryEndDate).toBe('2026-09-01');
  });

  it('leaves non-salaried people unaffected by the salary end date logic when archived', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().addPerson(personalDraft('Casual'));
    const person = store.getState().peopleByMode.personal[0]!;

    await store.getState().toggleArchive(person.id);
    const archived = store.getState().peopleByMode.personal[0]!;
    expect(archived.archived).toBe(true);
    expect(archived.salaryEndDate).toBeFalsy();
  });

  it('correcting the starting segment via Manage Salary History changes the whole schedule downstream', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;

    await store.getState().syncSalary(employee.id, 0, '2026-08-06', undefined, 'none', 2);
    const afterPeriodChange = store.getState().peopleByMode.work[0]!;
    expect(afterPeriodChange.salaryPeriodAnchorDate).toBe('2026-08-06');

    // Correct the actual starting date/segment via Manage Salary History, replacing the whole
    // timeline in one shot — no separate baseline to keep in sync afterward.
    await store
      .getState()
      .updateSalaryTimeline(employee.id, [
        { effectiveDate: '2026-07-20', amount: 400, periodWeeks: 2, payDelayMode: 'none' },
      ]);
    const corrected = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(corrected.salaryStartDate).toBe('2026-07-20');
    expect(corrected.salaryPeriodAnchorDate).toBe('2026-07-20');
    expect(calculateSalary(corrected, NOW).nextPayDate).toBe('2026-08-17');
  });

  it('saves a cycle date, clears it when empty, and drops it with the salary', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;

    await store.getState().setSalaryCycleDate(employee.id, '2026-07-06');
    expect(store.getState().peopleByMode.work[0]!.salaryCycleDate).toBe('2026-07-06');
    const reloaded = (await createAppRepository(database).getPeople('work'))[0]!;
    expect(reloaded.salaryCycleDate).toBe('2026-07-06');

    await store.getState().setSalaryCycleDate(employee.id, '');
    expect(store.getState().peopleByMode.work[0]!.salaryCycleDate).toBeUndefined();

    await store.getState().setSalaryCycleDate(employee.id, '2026-07-06');
    await store.getState().editPerson(employee.id, { ...salaryDraft(), salaryEnabled: false });
    expect(store.getState().peopleByMode.work[0]!.salaryCycleDate).toBeUndefined();
  });

  it('saves the chosen rest days, treating Sunday-only as the unset default', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;

    await store.getState().setSalaryRestDays(employee.id, [6, 0]);
    expect(store.getState().peopleByMode.work[0]!.salaryRestDays).toEqual([0, 6]);
    const reloaded = (await createAppRepository(database).getPeople('work'))[0]!;
    expect(reloaded.salaryRestDays).toEqual([0, 6]);

    await store.getState().setSalaryRestDays(employee.id, []);
    expect(store.getState().peopleByMode.work[0]!.salaryRestDays).toEqual([]);

    await store.getState().setSalaryRestDays(employee.id, [0]);
    expect(store.getState().peopleByMode.work[0]!.salaryRestDays).toBeUndefined();
  });

  it('saves salary adjustments, which change what the period is worth and survive a reload', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;
    const before = calculateSalary(employee, new Date(2026, 6, 10, 12)).accrued;

    await store.getState().setSalaryAdjustments(employee.id, [
      {
        id: 'adj-1',
        type: 'stoppage',
        startDate: '2026-07-02',
        endDate: '2026-07-03',
        note: 'car',
      },
    ]);
    const adjusted = store.getState().peopleByMode.work[0]!;
    expect(adjusted.salaryAdjustments).toHaveLength(1);
    // 400/month over 24 working days (Sunday off) is 16.67 a day: two days off the first period.
    expect(calculateSalary(adjusted, new Date(2026, 6, 10, 12)).accrued).toBe(before - 33);

    const reloaded = (await createAppRepository(database).getPeople('work'))[0]!;
    expect(reloaded.salaryAdjustments).toEqual(adjusted.salaryAdjustments);

    await store.getState().setSalaryAdjustments(employee.id, []);
    expect(store.getState().peopleByMode.work[0]!.salaryAdjustments).toBeUndefined();
  });

  it("drops a person's adjustments along with the rest of the salary when it is switched off", async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;
    await store
      .getState()
      .setSalaryAdjustments(employee.id, [
        { id: 'adj-1', type: 'bonus', startDate: '2026-07-02', amount: 50 },
      ]);

    await store.getState().editPerson(employee.id, { ...salaryDraft(), salaryEnabled: false });
    expect(store.getState().peopleByMode.work[0]!.salaryAdjustments).toBeUndefined();
  });

  it('a schedule change genuinely tracks a shortfall from a completed-but-unpaid period, then a later entry edit stays live', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;

    const placeholder = await store.getState().addEntry(employee.id, {
      amount: 10,
      type: 'Gave',
      date: '2026-07-05',
      comment: '',
      category: 'salary',
    });

    // Re-anchoring to a later date — the original 1-week segment (2026-07-01 to 2026-07-08)
    // genuinely completed one period (7 days), only 10 of which was paid. Nothing needs banking
    // separately: calculateSalary derives this live from the timeline and entries every time.
    await store.getState().syncSalary(employee.id, 0, '2026-07-08');
    const reanchored = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(calculateSalary(reanchored, new Date(2026, 6, 10, 12)).accrued).toBe(100);
    // 90 shortfall from the old segment's one completed period (only 10 of 100 paid), plus the
    // new segment's own freshly-started period (100).
    expect(calculateSalary(reanchored, new Date(2026, 6, 10, 12)).upcoming).toBe(190);

    // Deleting that entry afterward is immediately reflected — no stale baseline anywhere.
    await store.getState().deleteEntry(employee.id, placeholder.id);
    const afterDelete = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(calculateSalary(afterDelete, new Date(2026, 6, 10, 12)).upcoming).toBe(200);
  });

  it('changes the pay period cadence via Change Salary, re-anchoring to the chosen date (not always today)', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    // salaryDraft() starts on a 1-week period at 400/month.
    await store.getState().addPerson(salaryDraft());
    const employee = store.getState().peopleByMode.work[0]!;
    expect(Number(employee.salaryPayPeriodWeeks)).toBe(1);

    await store
      .getState()
      .syncSalary(employee.id, 0, employee.salaryStartDate!, undefined, undefined, 2);

    const changed = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(changed.salaryPayPeriodWeeks).toBe(2);
    // Re-anchored to the date that was actually passed in (the person's own salaryStartDate
    // here), NOT the reference date ('today') — this is the fix for the reported bug where a
    // period change always re-anchored to today regardless of what date was chosen in the form.
    expect(changed.salaryPeriodAnchorDate).toBe(employee.salaryStartDate);
  });

  it('reported scenario: changing Payment Timing must not silently keep an old, wrong period length', async () => {
    const store = makeStore();
    await store.getState().initialize();
    await store.getState().setMode('work');
    await store
      .getState()
      .addPerson({ ...salaryDraft(), salaryAmount: 3000, salaryStartDate: '2026-08-06' });
    const employee = store.getState().peopleByMode.work[0]!;
    // Starts on a 1-week period — changing ONLY Payment Timing must leave this untouched (this
    // documents the actual, correct behavior: Payment Timing and Pay period are independent).
    expect(Number(employee.salaryPayPeriodWeeks)).toBe(1);

    await store
      .getState()
      .syncSalary(employee.id, 0, employee.salaryStartDate!, undefined, '2weeks');
    const timingOnly = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(timingOnly.salaryPayPeriodWeeks).toBe(1);

    // Now actually set the intended 2-week cadence via the new Pay period field, alongside
    // Payment Timing in the same submission — both must apply correctly together. The person
    // starts exactly on the reference date, so there's no pre-existing accrual to bank,
    // isolating the period-change effect cleanly.
    await store
      .getState()
      .syncSalary(employee.id, 0, timingOnly.salaryStartDate!, undefined, '2weeks', 2);
    const both = store.getState().peopleByMode.work.find((p) => p.id === employee.id)!;
    expect(both.salaryPayPeriodWeeks).toBe(2);
    expect(both.salaryPayDelayMode).toBe('2weeks');

    // One full 2-week period at 3000/month is 1500 — not 3000 (a leftover monthly-equivalent
    // misreading, or the old 1-week period's amount of 750, would both be wrong here).
    const referenceDate = new Date(`${both.salaryPeriodAnchorDate}T12:00:00`);
    referenceDate.setDate(referenceDate.getDate() + 14);
    const result = calculateSalary(both, referenceDate);
    expect(result.upcoming + result.due).toBe(1500);
  });

  it('reloads persisted application data in a new store', async () => {
    const first = makeStore();
    await first.getState().initialize();
    await first.getState().addPerson(personalDraft('Persist me'));

    const second = makeStore();
    await second.getState().initialize();
    expect(second.getState().peopleByMode.personal[0]?.name).toBe('Persist me');
  });

  it('records successful JSON exports in backup metadata', async () => {
    const repository = createAppRepository(database);
    const store = createAppStore({ repository, now: () => new Date(NOW) });
    await store.getState().initialize();

    const exported = await store.getState().exportBackup();

    expect(exported.exportDate).toBe(NOW.toISOString());
    expect(await repository.getBackupMetadata()).toMatchObject({
      lastBackup: NOW.toISOString(),
      count: 1,
      entryCount: 0,
    });
    expect(store.getState().backupMetadata.dataSignature).toBeTruthy();
  });

  it('signs in, saves to the cloud, lists backups, and fetches a chosen payload', async () => {
    const historyEntries: CloudBackupEntry[] = [
      { id: 'latest', kind: 'latest', label: 'Latest Cloud - 21/08/2026', savedAt: '2026-08-21' },
      { id: '2026-08-20', kind: 'history', label: 'History - 20/08/2026', savedAt: '2026-08-20' },
    ];
    let savedUid = '';
    let listedWithDate: Date | null = null;
    const cloud = makeMockCloud({
      saveBackupToCloud: (uid) => {
        savedUid = uid;
        return Promise.resolve();
      },
      listCloudBackups: (_uid, referenceDate) => {
        listedWithDate = referenceDate;
        return Promise.resolve(historyEntries);
      },
      fetchCloudBackupPayload: () => Promise.resolve(JSON.stringify({ personal: [], work: [] })),
    });
    const store = makeStore(cloud);
    await store.getState().initialize();
    expect(store.getState().cloudUser).toBeNull();

    await store.getState().signInCloud('alex@example.com', 'password123');
    expect(store.getState().cloudUser).toMatchObject({ uid: 'user-1', email: 'alex@example.com' });

    await store.getState().saveToCloud();
    expect(savedUid).toBe('user-1');
    expect(store.getState().cloudError).toBeNull();

    await store.getState().refreshCloudBackups();
    expect(store.getState().cloudBackups).toEqual(historyEntries);
    expect(listedWithDate).toEqual(NOW);

    const payload = await store.getState().fetchCloudBackupPayload('latest');
    expect(JSON.parse(payload)).toEqual({ personal: [], work: [] });

    await store.getState().signOutCloud();
    expect(store.getState().cloudUser).toBeNull();
    expect(store.getState().cloudBackups).toEqual([]);
  });

  it('surfaces cloud errors without saving a payload', async () => {
    const cloud = makeMockCloud({
      saveBackupToCloud: () => Promise.reject(new Error('network down')),
    });
    const store = makeStore(cloud);
    await store.getState().initialize();
    await store.getState().signInCloud('alex@example.com', 'password123');

    await store.getState().saveToCloud();
    expect(store.getState().cloudError).toBe('network down');
    expect(store.getState().cloudBusy).toBe(false);
  });

  it('refuses cloud actions before signing in', async () => {
    const cloud = makeMockCloud();
    const store = makeStore(cloud);
    await store.getState().initialize();

    await store.getState().saveToCloud();
    expect(store.getState().cloudError).toBe('Sign in first');

    await expect(store.getState().fetchCloudBackupPayload('latest')).rejects.toThrow(
      'Sign in first',
    );
  });

  it('subscribes to cloud auth changes only once even if initCloudAuth is called repeatedly', async () => {
    let subscribeCount = 0;
    const cloud = makeMockCloud({
      onCloudAuthChange: () => {
        subscribeCount += 1;
        return () => {};
      },
    });
    const store = makeStore(cloud);
    await store.getState().initialize();

    store.getState().initCloudAuth();
    store.getState().initCloudAuth();
    store.getState().initCloudAuth();
    await Promise.resolve();

    expect(subscribeCount).toBe(1);
  });

  it('creates a new cloud account via registerCloud', async () => {
    let registeredWith: [string, string] | null = null;
    const cloud = makeMockCloud({
      registerWithEmail: (email, password) => {
        registeredWith = [email, password];
        return Promise.resolve({
          uid: 'new-user',
          displayName: null,
          email,
          photoURL: null,
        });
      },
    });
    const store = makeStore(cloud);
    await store.getState().initialize();

    await store.getState().registerCloud('new@example.com', 'strongpass');
    expect(registeredWith).toEqual(['new@example.com', 'strongpass']);
    expect(store.getState().cloudUser).toMatchObject({ uid: 'new-user', email: 'new@example.com' });
  });

  it('auto-syncs a while after local data changes, once signed in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let saveCount = 0;
      const cloud = makeMockCloud({
        saveBackupToCloud: () => {
          saveCount += 1;
          return Promise.resolve();
        },
      });
      const store = makeStore(cloud);
      await store.getState().initialize();
      await store.getState().signInCloud('alex@example.com', 'password123');

      await store.getState().addPerson(personalDraft('Auto-sync target'));
      expect(saveCount).toBe(0); // not yet — still within the debounce window

      await vi.advanceTimersByTimeAsync(31_000);
      expect(saveCount).toBe(1);
      expect(store.getState().cloudSyncMetadata).not.toBeNull();

      // No further local changes — a second debounce tick should not sync again.
      await vi.advanceTimersByTimeAsync(31_000);
      expect(saveCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('detects and syncs unsaved local changes as soon as sign-in resolves on a new session', async () => {
    let saveCount = 0;
    const cloud = makeMockCloud({
      saveBackupToCloud: () => {
        saveCount += 1;
        return Promise.resolve();
      },
    });
    const store = makeStore(cloud);
    await store.getState().initialize();
    await store.getState().signInCloud('alex@example.com', 'password123');
    await store.getState().addPerson(personalDraft('Was offline'));
    expect(saveCount).toBe(0);

    // Simulate reopening the app already signed in (no debounce involved).
    await store.getState().autoSyncIfNeeded();
    expect(saveCount).toBe(1);

    // Already in sync — calling it again should not trigger another save.
    await store.getState().autoSyncIfNeeded();
    expect(saveCount).toBe(1);
  });
});
