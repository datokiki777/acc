import 'fake-indexeddb/auto';

import { createAccReactDatabase, type AccReactDatabase } from '../db/database';
import { createAppRepository, type AppRepository } from '../db/repository';
import { personOpenBalance } from '../domain/balances';
import type { ExportedBackupData } from '../types/domain';
import type { PersistedPerson } from '../types/persistence';
import {
  applyInspectedBackup,
  createBackupExport,
  inspectBackupText,
  RestoreVerificationError,
} from './backup';
import { verifyRestoredData } from './restore-verification';

const REFERENCE_DATE = new Date(2026, 7, 6, 12);

function fixtureBackup(): ExportedBackupData {
  return {
    personal: [
      {
        id: 'personal-1',
        name: 'Personal person',
        currency: 'EUR',
        archived: true,
        customPerson: 'preserve',
        entries: [
          {
            id: 'personal-entry',
            amount: 125,
            type: 'Gave',
            date: '2026-07-01',
            customEntry: { source: 'legacy' },
          },
        ],
      },
    ],
    work: [
      {
        id: 'work-1',
        name: 'Work person',
        currency: 'USD',
        salaryAmount: 400,
        salaryStartDate: '2026-07-01',
        salaryPayPeriodWeeks: 1,
        salaryPayDelayMode: '2weeks',
        salaryPeriodAnchorDate: '2026-07-03',
        salaryAccruedBaseline: 50,
        entries: [
          {
            id: 'salary-entry',
            amount: 100,
            type: 'Gave',
            date: '2026-07-08',
            comment: '[Salary] legacy payment',
          },
        ],
      },
    ],
    exportDate: '2026-08-01T10:00:00.000Z',
  };
}

describe('legacy-compatible backup services', () => {
  let database: AccReactDatabase;
  let repository: AppRepository;

  beforeEach(async () => {
    database = createAccReactDatabase(`backup-test-${crypto.randomUUID()}`);
    repository = createAppRepository(database);
    await repository.initialize();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('inspects unversioned legacy JSON and preserves settings and unknown fields', () => {
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    expect(inspection.valid).toBe(true);
    if (!inspection.valid) throw new Error('Expected valid inspection');
    expect(inspection.counts).toEqual({ personalPeople: 1, workPeople: 1, entries: 2 });
    expect(inspection.normalized.personal[0]).toMatchObject({
      id: 'personal-1',
      archived: true,
      customPerson: 'preserve',
    });
    expect(inspection.normalized.work[0]).toMatchObject({
      salaryPeriodAnchorDate: '2026-07-03',
      salaryAccruedBaseline: 50,
      salaryPayDelayMode: '2weeks',
    });
  });

  it('rejects malformed JSON without changing React data', async () => {
    await repository.replacePeople('personal', [
      {
        id: 'existing',
        name: 'Existing',
        currency: 'EUR',
        entries: [],
      },
    ]);
    const inspection = inspectBackupText('{not-json', 'broken.json');
    expect(inspection.valid).toBe(false);
    expect((await repository.getPeople('personal'))[0]?.id).toBe('existing');
  });

  it('replaces both React modes and verifies the restore', async () => {
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');
    const report = await applyInspectedBackup(repository, inspection, 'replace', REFERENCE_DATE);
    expect(report.success).toBe(true);
    expect(report.personal.personCount).toBe(1);
    expect(report.work.entryCount).toBe(1);
    expect((await repository.getPeople('work'))[0]?.currency).toBe('USD');
  });

  it('merges with existing data using legacy ID rules', async () => {
    await repository.replacePeople('personal', [
      {
        id: 'personal-1',
        name: 'Current name wins',
        currency: 'EUR',
        entries: [],
      },
    ]);
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');
    await applyInspectedBackup(repository, inspection, 'merge', REFERENCE_DATE);
    const people = await repository.getPeople('personal');
    expect(people).toHaveLength(1);
    expect(people[0]?.name).toBe('Current name wins');
    expect(people[0]?.entries[0]?.id).toBe('personal-entry');
  });

  it('exports and re-imports a legacy-compatible round trip', async () => {
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');
    await applyInspectedBackup(repository, inspection, 'replace', REFERENCE_DATE);
    const exported = await createBackupExport(repository, REFERENCE_DATE);
    const roundTrip = inspectBackupText(JSON.stringify(exported), 'round-trip.json');
    expect(roundTrip.valid).toBe(true);
    if (!roundTrip.valid) throw new Error('Expected valid round trip');
    expect(roundTrip.normalized).toEqual(inspection.normalized);
  });

  it('preserves salary history, baseline, and anchor date through a full export/import round trip', async () => {
    const backup: ExportedBackupData = {
      personal: [],
      work: [
        {
          id: 'rati',
          name: 'Rati',
          currency: 'EUR',
          entries: [],
          salaryAmount: 3000,
          salaryStartDate: '2026-07-29',
          salaryPayPeriodWeeks: 2,
          salaryPeriodAnchorDate: '2026-08-12',
          salaryAccruedBaseline: 1000,
          salaryHistory: [{ effectiveDate: '2026-08-12', previousAmount: 2000, newAmount: 3000 }],
        } as unknown as ExportedBackupData['work'][number],
      ],
      exportDate: REFERENCE_DATE.toISOString(),
    };
    const inspection = inspectBackupText(JSON.stringify(backup), 'salary-history.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');
    await applyInspectedBackup(repository, inspection, 'replace', REFERENCE_DATE);

    const exported = await createBackupExport(repository, REFERENCE_DATE);
    const savedPerson = exported.work.find((person) => person.id === 'rati');
    expect(savedPerson?.salaryHistory).toEqual([
      { effectiveDate: '2026-08-12', previousAmount: 2000, newAmount: 3000 },
    ]);
    expect(savedPerson?.salaryAccruedBaseline).toBe(1000);
    expect(savedPerson?.salaryPeriodAnchorDate).toBe('2026-08-12');

    // Re-import the export and confirm it still round-trips cleanly.
    const roundTrip = inspectBackupText(JSON.stringify(exported), 'round-trip-2.json');
    expect(roundTrip.valid).toBe(true);
    if (!roundTrip.valid) throw new Error('Expected valid round trip');
    const roundTripPerson = roundTrip.normalized.work.find((person) => person.id === 'rati');
    expect(roundTripPerson?.salaryHistory).toEqual([
      { effectiveDate: '2026-08-12', previousAmount: 2000, newAmount: 3000 },
    ]);
  });

  it('detects checksum differences', () => {
    const expected: PersistedPerson = {
      id: 'person',
      name: 'Person',
      currency: 'EUR',
      entries: [],
    };
    const actual: PersistedPerson = { ...expected, currency: 'USD' };
    const report = verifyRestoredData(
      { personal: [expected], work: [] },
      { personal: [actual], work: [] },
      REFERENCE_DATE,
    );
    expect(report.success).toBe(false);
    expect(report.failures).toContain('personal: currencyChecksum did not match');
  });

  it('rolls back replacement when post-write verification fails', async () => {
    const existing: PersistedPerson = {
      id: 'existing',
      name: 'Existing data',
      currency: 'EUR',
      entries: [],
    };
    await repository.replacePeople('personal', [existing]);
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');

    const failingRepository: AppRepository = {
      initialize: () => repository.initialize(),
      getPeople: (mode) => repository.getPeople(mode),
      replacePeople: (mode, people) => repository.replacePeople(mode, people),
      replaceAll: (personal, work) => repository.replaceAll(personal, work),
      getMode: () => repository.getMode(),
      setMode: (mode) => repository.setMode(mode),
      getTheme: () => repository.getTheme(),
      setTheme: (theme) => repository.setTheme(theme),
      getPrivacyMode: () => repository.getPrivacyMode(),
      setPrivacyMode: (enabled) => repository.setPrivacyMode(enabled),
      getCloudSyncMetadata: () => repository.getCloudSyncMetadata(),
      setCloudSyncMetadata: (metadata) => repository.setCloudSyncMetadata(metadata),
      getBackupMetadata: () => repository.getBackupMetadata(),
      setBackupMetadata: (metadata) => repository.setBackupMetadata(metadata),
      getSchemaVersion: () => repository.getSchemaVersion(),
      transactAll: (operation) =>
        repository.transactAll((transactionRepository) => {
          const corruptTransaction: AppRepository = {
            ...failingRepository,
            replaceAll: (personal, work) => transactionRepository.replaceAll(personal, work),
            getPeople: async (mode) => {
              const people = await transactionRepository.getPeople(mode);
              if (mode !== 'personal' || !people[0]) return people;
              return [{ ...people[0], currency: 'CAD' }, ...people.slice(1)];
            },
          };
          return operation(corruptTransaction);
        }),
    };

    await expect(
      applyInspectedBackup(failingRepository, inspection, 'replace', REFERENCE_DATE),
    ).rejects.toBeInstanceOf(RestoreVerificationError);
    expect(await repository.getPeople('personal')).toEqual([existing]);
    expect(await repository.getPeople('work')).toEqual([]);
  });

  it('keeps balance and legacy salary behavior after import', async () => {
    const inspection = inspectBackupText(JSON.stringify(fixtureBackup()), 'legacy.json');
    if (!inspection.valid) throw new Error('Expected valid inspection');
    await applyInspectedBackup(repository, inspection, 'replace', REFERENCE_DATE);
    const personal = (await repository.getPeople('personal'))[0]!;
    const work = (await repository.getPeople('work'))[0]!;
    expect(personOpenBalance(personal, 'personal')).toBe(125);
    expect(personOpenBalance(work, 'work')).toBe(100);
  });
});
