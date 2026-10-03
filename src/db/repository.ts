import type { AppMode, ThemeMode } from '../types/domain';
import type {
  BackupMetadata,
  CloudSyncMetadata,
  MetadataRecord,
  PersistedPerson,
} from '../types/persistence';
import { ACC_REACT_SCHEMA_VERSION, type AccReactDatabase } from './database';

export interface AppRepository {
  initialize(): Promise<void>;
  getPeople(mode: AppMode): Promise<PersistedPerson[]>;
  replacePeople(mode: AppMode, people: readonly PersistedPerson[]): Promise<void>;
  replaceAll(personal: readonly PersistedPerson[], work: readonly PersistedPerson[]): Promise<void>;
  transactAll<T>(operation: (repository: AppRepository) => Promise<T>): Promise<T>;
  getMode(): Promise<AppMode>;
  setMode(mode: AppMode): Promise<void>;
  getTagFilter(): Promise<string>;
  setTagFilter(tag: string): Promise<void>;
  getTheme(): Promise<ThemeMode>;
  setTheme(theme: ThemeMode): Promise<void>;
  getPrivacyMode(): Promise<boolean>;
  setPrivacyMode(enabled: boolean): Promise<void>;
  getBackupMetadata(): Promise<BackupMetadata>;
  setBackupMetadata(metadata: BackupMetadata): Promise<void>;
  getCloudSyncMetadata(): Promise<CloudSyncMetadata | null>;
  setCloudSyncMetadata(metadata: CloudSyncMetadata | null): Promise<void>;
  getSchemaVersion(): Promise<number>;
}

function clonePeople(people: readonly PersistedPerson[]): PersistedPerson[] {
  return structuredClone([...people]);
}

export class DexieAppRepository implements AppRepository {
  public constructor(private readonly database: AccReactDatabase) {}

  public async initialize(): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.modeData,
      this.database.settings,
      this.database.metadata,
      async () => {
        const now = new Date().toISOString();
        if (!(await this.database.modeData.get('personal'))) {
          await this.database.modeData.add({ mode: 'personal', people: [], updatedAt: now });
        }
        if (!(await this.database.modeData.get('work'))) {
          await this.database.modeData.add({ mode: 'work', people: [], updatedAt: now });
        }
        if (!(await this.database.settings.get('activeMode'))) {
          await this.database.settings.add({ key: 'activeMode', value: 'personal' });
        }
        if (!(await this.database.settings.get('theme'))) {
          await this.database.settings.add({ key: 'theme', value: 'system' });
        }
        if (!(await this.database.settings.get('privacyMode'))) {
          await this.database.settings.add({ key: 'privacyMode', value: false });
        }
        if (!(await this.database.settings.get('workTagFilter'))) {
          await this.database.settings.add({ key: 'workTagFilter', value: '' });
        }
        if (!(await this.database.metadata.get('backup'))) {
          await this.database.metadata.add({
            key: 'backup',
            value: { lastBackup: '', count: 0 } satisfies BackupMetadata,
          });
        }
        await this.database.metadata.put({
          key: 'schemaVersion',
          value: ACC_REACT_SCHEMA_VERSION,
        });
      },
    );
  }

  public async getPeople(mode: AppMode): Promise<PersistedPerson[]> {
    const record = await this.database.modeData.get(mode);
    return clonePeople(record?.people ?? []);
  }

  public async replacePeople(mode: AppMode, people: readonly PersistedPerson[]): Promise<void> {
    await this.database.modeData.put({
      mode,
      people: clonePeople(people),
      updatedAt: new Date().toISOString(),
    });
  }

  public async replaceAll(
    personal: readonly PersistedPerson[],
    work: readonly PersistedPerson[],
  ): Promise<void> {
    await this.database.transaction('rw', this.database.modeData, async () => {
      await this.replacePeople('personal', personal);
      await this.replacePeople('work', work);
    });
  }

  public async transactAll<T>(operation: (repository: AppRepository) => Promise<T>): Promise<T> {
    return this.database.transaction('rw', this.database.modeData, async () => operation(this));
  }

  public async getMode(): Promise<AppMode> {
    const record = await this.database.settings.get('activeMode');
    return record?.value === 'work' ? 'work' : 'personal';
  }

  public async setMode(mode: AppMode): Promise<void> {
    await this.database.settings.put({ key: 'activeMode', value: mode });
  }

  public async getTagFilter(): Promise<string> {
    const record = await this.database.settings.get('workTagFilter');
    return typeof record?.value === 'string' ? record.value : '';
  }

  public async setTagFilter(tag: string): Promise<void> {
    await this.database.settings.put({ key: 'workTagFilter', value: tag });
  }

  public async getTheme(): Promise<ThemeMode> {
    const record = await this.database.settings.get('theme');
    const value = record?.value;
    return value === 'dark' || value === 'light' ? value : 'system';
  }

  public async setTheme(theme: ThemeMode): Promise<void> {
    await this.database.settings.put({ key: 'theme', value: theme });
  }

  public async getPrivacyMode(): Promise<boolean> {
    const record = await this.database.settings.get('privacyMode');
    return record?.value === true;
  }

  public async setPrivacyMode(enabled: boolean): Promise<void> {
    await this.database.settings.put({ key: 'privacyMode', value: enabled });
  }

  public async getBackupMetadata(): Promise<BackupMetadata> {
    const record = await this.database.metadata.get('backup');
    const value = record?.value;
    if (!value || typeof value !== 'object') return { lastBackup: '', count: 0 };
    const candidate = value as Partial<BackupMetadata>;
    return {
      lastBackup: typeof candidate.lastBackup === 'string' ? candidate.lastBackup : '',
      count: Number.isFinite(candidate.count) ? Number(candidate.count) : 0,
      ...(typeof candidate.dataSignature === 'string'
        ? { dataSignature: candidate.dataSignature }
        : {}),
      ...(Array.isArray(candidate.entrySignatures)
        ? {
            entrySignatures: candidate.entrySignatures.filter(
              (signature): signature is string => typeof signature === 'string',
            ),
          }
        : {}),
      ...(Number.isFinite(candidate.entryCount)
        ? { entryCount: Number(candidate.entryCount) }
        : {}),
    };
  }

  public async setBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const record: MetadataRecord = { key: 'backup', value: structuredClone(metadata) };
    await this.database.metadata.put(record);
  }

  public async getCloudSyncMetadata(): Promise<CloudSyncMetadata | null> {
    const record = await this.database.metadata.get('cloudSync');
    const value = record?.value as Partial<CloudSyncMetadata> | undefined;
    if (!value || typeof value.signature !== 'string' || typeof value.syncedAt !== 'string') {
      return null;
    }
    return { signature: value.signature, syncedAt: value.syncedAt };
  }

  public async setCloudSyncMetadata(metadata: CloudSyncMetadata | null): Promise<void> {
    const record: MetadataRecord = { key: 'cloudSync', value: metadata };
    await this.database.metadata.put(record);
  }

  public async getSchemaVersion(): Promise<number> {
    const record = await this.database.metadata.get('schemaVersion');
    return typeof record?.value === 'number' ? record.value : ACC_REACT_SCHEMA_VERSION;
  }
}

export function createAppRepository(database: AccReactDatabase): AppRepository {
  return new DexieAppRepository(database);
}
