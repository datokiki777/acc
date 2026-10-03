import 'fake-indexeddb/auto';

import { createAccReactDatabase, type AccReactDatabase } from './database';
import { createAppRepository, type AppRepository } from './repository';
import { person } from '../test/fixtures/golden';
import type { PersistedPerson } from '../types/persistence';

describe('Dexie application repository', () => {
  let database: AccReactDatabase;
  let repository: AppRepository;

  beforeEach(async () => {
    database = createAccReactDatabase(`acc-react-test-${crypto.randomUUID()}`);
    repository = createAppRepository(database);
    await repository.initialize();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('uses the clean React schema and initializes defaults', async () => {
    expect(database.name).toContain('acc-react-test-');
    expect(await repository.getPeople('personal')).toEqual([]);
    expect(await repository.getPeople('work')).toEqual([]);
    expect(await repository.getMode()).toBe('personal');
    expect(await repository.getTagFilter()).toBe('');
    expect(await repository.getTheme()).toBe('system');
    expect(await repository.getSchemaVersion()).toBe(1);
  });

  it('keeps Personal and Work records isolated', async () => {
    const personal = person({ id: 'same-id', name: 'Personal' }) as PersistedPerson;
    const work = person({ id: 'same-id', name: 'Work' }) as PersistedPerson;
    await repository.replacePeople('personal', [personal]);
    await repository.replacePeople('work', [work]);
    expect((await repository.getPeople('personal'))[0]?.name).toBe('Personal');
    expect((await repository.getPeople('work'))[0]?.name).toBe('Work');
  });

  it('persists mode, theme, backup metadata, and data across repository reloads', async () => {
    await repository.replacePeople('personal', [person({ id: 'persisted' }) as PersistedPerson]);
    await repository.setMode('work');
    await repository.setTagFilter('Badelix');
    await repository.setTheme('dark');
    await repository.setBackupMetadata({ lastBackup: '2026-08-06T10:00:00.000Z', count: 3 });
    database.close();

    database = createAccReactDatabase(database.name);
    repository = createAppRepository(database);
    await repository.initialize();

    expect((await repository.getPeople('personal'))[0]?.id).toBe('persisted');
    expect(await repository.getMode()).toBe('work');
    expect(await repository.getTagFilter()).toBe('Badelix');
    expect(await repository.getTheme()).toBe('dark');
    expect(await repository.getBackupMetadata()).toEqual({
      lastBackup: '2026-08-06T10:00:00.000Z',
      count: 3,
    });
  });
});
