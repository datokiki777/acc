import type { AppMode, Entry, Person } from './domain';

export type PersistedEntry = Entry & Record<string, unknown>;

export type PersistedPerson = Omit<Person, 'entries'> &
  Record<string, unknown> & {
    entries: PersistedEntry[];
  };

export interface ModeDataRecord {
  mode: AppMode;
  people: PersistedPerson[];
  updatedAt: string;
}

export type SettingKey = 'activeMode' | 'theme' | 'privacyMode' | 'workTagFilter';

export interface SettingRecord {
  key: SettingKey;
  value: boolean | string;
}

export interface MetadataRecord {
  key: 'backup' | 'schemaVersion' | 'cloudSync';
  value: unknown;
}

export interface CloudSyncMetadata {
  signature: string;
  syncedAt: string;
}

export interface BackupMetadata {
  lastBackup: string;
  count: number;
  dataSignature?: string;
  entrySignatures?: string[];
  entryCount?: number;
}

export interface ReactBackupData {
  personal: PersistedPerson[];
  work: PersistedPerson[];
  exportDate: string;
  schemaVersion?: number;
}
