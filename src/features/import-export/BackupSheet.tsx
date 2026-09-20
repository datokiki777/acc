import { useEffect, useMemo, useRef, useState } from 'react';

import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import {
  downloadBackup,
  inspectBackupText,
  type BackupInspection,
  type ImportMode,
} from '../../services/backup';
import {
  analyzeBackupHealth,
  collectDataInsights,
  createBackupSnapshot,
} from '../../services/backup-health';
import {
  buildAllPdfReport,
  buildPersonPdfReport,
  openPdfPrintDialog,
} from '../../services/pdf-report';
import type { AppMode } from '../../types/domain';
import { useAppStore } from '../../store/hooks';

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function BackupSheet() {
  const { requestClose } = useAppNavigation();
  const importBackup = useAppStore((state) => state.importBackup);
  const exportBackup = useAppStore((state) => state.exportBackup);
  const report = useAppStore((state) => state.lastRestoreReport);
  const peopleByMode = useAppStore((state) => state.peopleByMode);
  const backupMetadata = useAppStore((state) => state.backupMetadata);
  const cloudUser = useAppStore((state) => state.cloudUser);
  const cloudBackups = useAppStore((state) => state.cloudBackups);
  const cloudBusy = useAppStore((state) => state.cloudBusy);
  const cloudError = useAppStore((state) => state.cloudError);
  const cloudSyncMetadata = useAppStore((state) => state.cloudSyncMetadata);
  const initCloudAuth = useAppStore((state) => state.initCloudAuth);
  const signInCloud = useAppStore((state) => state.signInCloud);
  const registerCloud = useAppStore((state) => state.registerCloud);
  const signOutCloud = useAppStore((state) => state.signOutCloud);
  const saveToCloud = useAppStore((state) => state.saveToCloud);
  const refreshCloudBackups = useAppStore((state) => state.refreshCloudBackups);
  const fetchCloudBackupPayload = useAppStore((state) => state.fetchCloudBackupPayload);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [restoreSource, setRestoreSource] = useState<'file' | 'cloud' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudMode, setCloudMode] = useState<'signIn' | 'register'>('signIn');
  const [deviceStorage, setDeviceStorage] = useState<StorageEstimate | null>(null);
  const [pdfMode, setPdfMode] = useState<AppMode>('personal');
  const [pdfPersonId, setPdfPersonId] = useState('');
  const [pdfPickerOpen, setPdfPickerOpen] = useState(false);
  const [pdfPickerSearch, setPdfPickerSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const currentData = useMemo(
    () => ({ personal: peopleByMode.personal, work: peopleByMode.work }),
    [peopleByMode],
  );
  const health = useMemo(
    () => analyzeBackupHealth(backupMetadata, currentData),
    [backupMetadata, currentData],
  );
  const insights = useMemo(() => collectDataInsights(currentData), [currentData]);
  const cloudSignature = useMemo(
    () => createBackupSnapshot(currentData).dataSignature,
    [currentData],
  );
  const cloudPendingChanges = Boolean(
    cloudSyncMetadata && cloudSyncMetadata.signature !== cloudSignature,
  );
  const pdfPeople = peopleByMode[pdfMode];
  const pdfPerson = pdfPeople.find((person) => person.id === pdfPersonId) ?? pdfPeople[0];
  const filteredPdfPeople = pdfPeople.filter((person) =>
    person.name.toLocaleLowerCase().includes(pdfPickerSearch.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    initCloudAuth();
  }, [initCloudAuth]);

  useEffect(() => {
    let active = true;
    if (!navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((estimate) => {
      if (active) setDeviceStorage(estimate);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pdfPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        setPdfPickerOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [pdfPickerOpen]);

  async function exportJson() {
    setError('');
    try {
      downloadBackup(await exportBackup());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed');
    }
  }

  function exportPdf() {
    setError('');
    try {
      openPdfPrintDialog(buildAllPdfReport(currentData));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF report could not open');
    }
  }

  function exportIndividualPdf() {
    if (!pdfPerson) return;
    setError('');
    try {
      openPdfPrintDialog(buildPersonPdfReport(pdfPerson, pdfMode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF report could not open');
    }
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setReplaceConfirmed(false);
    setRestoreSource('file');
    setInspection(inspectBackupText(await file.text(), file.name));
  }

  async function handleSaveToCloud() {
    setError('');
    await saveToCloud();
  }

  async function submitCloudAuth() {
    setError('');
    if (cloudMode === 'signIn') await signInCloud(cloudEmail.trim(), cloudPassword);
    else await registerCloud(cloudEmail.trim(), cloudPassword);
  }

  async function openCloudPicker() {
    setError('');
    setCloudPickerOpen(true);
    await refreshCloudBackups();
  }

  async function selectCloudEntry(entryId: string, label: string) {
    setError('');
    try {
      const payload = await fetchCloudBackupPayload(entryId);
      setReplaceConfirmed(false);
      setRestoreSource('cloud');
      setInspection(inspectBackupText(payload, label));
      setCloudPickerOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load from the cloud');
    }
  }

  async function restore(mode: ImportMode) {
    if (!inspection?.valid) return;
    if (mode === 'replace' && !replaceConfirmed) return;
    setBusy(true);
    setError('');
    try {
      await importBackup(inspection, mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet onClose={requestClose} title="Data & Backup" wide>
      <section className={`backup-health-card is-${health.tone}`}>
        <div className="backup-health-heading">
          <span className="backup-health-icon" aria-hidden="true">
            {health.tone === 'safe' ? '✓' : health.tone === 'warning' ? '!' : '×'}
          </span>
          <div>
            <h3>{health.label}</h3>
            <p>{health.detail}</p>
          </div>
        </div>
        <div className="backup-health-facts">
          <div>
            <span>Last JSON backup</span>
            <strong>
              {backupMetadata.lastBackup
                ? new Date(backupMetadata.lastBackup).toLocaleString()
                : 'Never'}
            </strong>
          </div>
          <div>
            <span>Not backed up</span>
            <strong>
              {health.trackingAvailable
                ? `${health.pendingEntryCount} entries`
                : 'Tracking unavailable'}
            </strong>
          </div>
        </div>
      </section>

      <div className="backup-actions-main">
        <button className="primary-button" onClick={() => void exportJson()} type="button">
          Export JSON
        </button>
        <button className="secondary-button" onClick={() => fileRef.current?.click()} type="button">
          Choose backup
        </button>
        <input
          accept="application/json,.json"
          hidden
          onChange={(event) => void selectFile(event.target.files?.[0])}
          ref={fileRef}
          type="file"
        />
      </div>
      <p className="backup-format-note">
        JSON is the restorable backup format for importing data back into ACC.
      </p>

      <section className="cloud-backup-card" aria-label="Cloud backup">
        <div className="backup-section-heading">
          <div>
            <span>Cross-device</span>
            <h3>Cloud Backup</h3>
          </div>
        </div>
        {cloudUser ? (
          <>
            <div className="cloud-account-row">
              <span>{cloudUser.email ?? cloudUser.displayName ?? 'Signed in'}</span>
              <button className="text-button" onClick={() => void signOutCloud()} type="button">
                Sign out
              </button>
            </div>
            <p className={`cloud-sync-status ${cloudPendingChanges ? 'is-pending' : 'is-synced'}`}>
              {cloudSyncMetadata
                ? `${cloudPendingChanges ? '⏳ Pending — last synced' : '✓ Synced'} ${new Date(cloudSyncMetadata.syncedAt).toLocaleString()}`
                : '○ Not synced yet'}
            </p>
            <div className="backup-actions-main">
              <button
                className="secondary-button"
                disabled={cloudBusy}
                onClick={() => void handleSaveToCloud()}
                type="button"
              >
                ☁ Save to cloud now
              </button>
              <button
                className="secondary-button"
                disabled={cloudBusy}
                onClick={() => void openCloudPicker()}
                type="button"
              >
                ☁ Load from cloud
              </button>
            </div>
          </>
        ) : (
          <div className="cloud-auth-form">
            <div className="field">
              <span>Email</span>
              <input
                autoCapitalize="off"
                autoComplete="email"
                onChange={(event) => setCloudEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={cloudEmail}
              />
            </div>
            <div className="field">
              <span>Password</span>
              <input
                autoComplete={cloudMode === 'signIn' ? 'current-password' : 'new-password'}
                onChange={(event) => setCloudPassword(event.target.value)}
                placeholder="••••••••"
                type="password"
                value={cloudPassword}
              />
            </div>
            <button
              className="primary-button"
              disabled={cloudBusy || !cloudEmail.trim() || !cloudPassword}
              onClick={() => void submitCloudAuth()}
              type="button"
            >
              {cloudMode === 'signIn' ? 'Sign in' : 'Create account'}
            </button>
            <button
              className="text-button"
              onClick={() => setCloudMode(cloudMode === 'signIn' ? 'register' : 'signIn')}
              type="button"
            >
              {cloudMode === 'signIn'
                ? "Don't have an account? Create one"
                : 'Have an account? Sign in'}
            </button>
          </div>
        )}
        {cloudError && <p className="form-error">{cloudError}</p>}
      </section>

      {cloudPickerOpen && (
        <BottomSheet onClose={() => setCloudPickerOpen(false)} title="Restore source">
          {cloudBusy && cloudBackups.length === 0 ? (
            <p className="mini-empty">Loading…</p>
          ) : cloudBackups.length === 0 ? (
            <p className="mini-empty">No cloud backups yet.</p>
          ) : (
            <div className="picker-options">
              {cloudBackups.map((entry) => (
                <button
                  className="picker-option"
                  key={entry.id}
                  onClick={() => void selectCloudEntry(entry.id, entry.label)}
                  type="button"
                >
                  <span className="picker-option-text">
                    <span>{entry.label}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      <section className="individual-pdf-card" aria-label="Individual PDF export">
        <div className="backup-section-heading">
          <div>
            <span>Readable documents</span>
            <h3>PDF Reports</h3>
          </div>
        </div>
        <button className="secondary-button all-data-pdf-button" onClick={exportPdf} type="button">
          Export All Data PDF
        </button>
        <div className="pdf-section-label">
          <span>Single report</span>
          <strong>Person / Team PDF</strong>
        </div>
        <div className="pdf-mode-switch" role="group" aria-label="PDF report type">
          {(['personal', 'work'] as const).map((mode) => (
            <button
              aria-pressed={pdfMode === mode}
              className={pdfMode === mode ? 'is-selected' : ''}
              onClick={() => {
                setPdfMode(mode);
                setPdfPersonId(peopleByMode[mode][0]?.id ?? '');
                setPdfPickerOpen(false);
                setPdfPickerSearch('');
              }}
              type="button"
              key={mode}
            >
              {mode === 'personal'
                ? `Personal (${peopleByMode.personal.length})`
                : `Work (${peopleByMode.work.length})`}
            </button>
          ))}
        </div>
        <div className="individual-pdf-controls">
          <label>
            <span>{pdfMode === 'personal' ? 'Choose person' : 'Choose team'}</span>
            <button
              aria-label={pdfMode === 'personal' ? 'Choose person for PDF' : 'Choose team for PDF'}
              className="pdf-person-trigger"
              disabled={!pdfPeople.length}
              onClick={() => {
                setPdfPickerSearch('');
                setPdfPickerOpen(true);
              }}
              type="button"
            >
              <span>{pdfPerson?.name ?? 'No records'}</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </label>
          <button
            className="secondary-button"
            disabled={!pdfPerson}
            onClick={exportIndividualPdf}
            type="button"
          >
            Export {pdfMode === 'personal' ? 'Person' : 'Team'} PDF
          </button>
        </div>
        <p className="backup-format-note pdf-format-note">
          PDF opens the phone print screen—choose “Save as PDF”.
        </p>
      </section>

      {pdfPickerOpen && (
        <div
          className="pdf-picker-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPdfPickerOpen(false);
          }}
        >
          <section
            aria-label={pdfMode === 'personal' ? 'Choose person' : 'Choose team'}
            aria-modal="true"
            className="pdf-picker-dialog"
            role="dialog"
          >
            <header>
              <div>
                <span>PDF report</span>
                <h3>{pdfMode === 'personal' ? 'Choose person' : 'Choose team'}</h3>
              </div>
              <button
                aria-label="Close PDF selection"
                className="icon-button"
                onClick={() => setPdfPickerOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <label className="pdf-picker-search">
              <span className="sr-only">Search names</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                autoFocus
                onChange={(event) => setPdfPickerSearch(event.target.value)}
                placeholder={pdfMode === 'personal' ? 'Search people' : 'Search teams'}
                type="search"
                value={pdfPickerSearch}
              />
            </label>
            <div className="pdf-picker-list">
              {filteredPdfPeople.map((person) => (
                <button
                  className={person.id === pdfPerson?.id ? 'is-selected' : ''}
                  key={person.id}
                  onClick={() => {
                    setPdfPersonId(person.id);
                    setPdfPickerOpen(false);
                  }}
                  type="button"
                >
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {person.currency} · {person.entries.length}{' '}
                      {person.entries.length === 1 ? 'entry' : 'entries'}
                      {person.archived ? ' · Archived' : ''}
                    </small>
                  </span>
                  <span aria-hidden="true">{person.id === pdfPerson?.id ? '✓' : '›'}</span>
                </button>
              ))}
              {!filteredPdfPeople.length && <p>No matching records</p>}
            </div>
          </section>
        </div>
      )}

      <section className="backup-insights" aria-label="Data and device insights">
        <div className="backup-section-heading">
          <div>
            <span>On this device</span>
            <h3>ACC data overview</h3>
          </div>
          <strong>{formatBytes(deviceStorage?.usage)}</strong>
        </div>
        <div className="backup-insight-grid">
          <div>
            <span>Personal</span>
            <strong>{insights.people}</strong>
          </div>
          <div>
            <span>Work teams</span>
            <strong>{insights.teams}</strong>
          </div>
          <div>
            <span>Entries</span>
            <strong>{insights.entries}</strong>
          </div>
          <div>
            <span>Archived</span>
            <strong>{insights.archived}</strong>
          </div>
          <div>
            <span>Data file</span>
            <strong>{formatBytes(insights.dataBytes)}</strong>
          </div>
          <div>
            <span>Backup exports</span>
            <strong>{backupMetadata.count}</strong>
          </div>
        </div>
        <dl className="backup-detail-list">
          <div>
            <dt>Currencies</dt>
            <dd>{insights.currencies.join(', ') || 'None yet'}</dd>
          </div>
          <div>
            <dt>Entry range</dt>
            <dd>
              {insights.oldestEntryDate && insights.newestEntryDate
                ? `${insights.oldestEntryDate} — ${insights.newestEntryDate}`
                : 'No entries yet'}
            </dd>
          </div>
          <div>
            <dt>Device storage quota</dt>
            <dd>{formatBytes(deviceStorage?.quota)}</dd>
          </div>
        </dl>
        <p className="backup-storage-note">
          Device usage includes ACC local data and offline app files. It can vary by browser.
        </p>
      </section>

      {inspection && (
        <section className={`backup-inspection ${inspection.valid ? 'valid' : 'invalid'}`}>
          <h3>Backup safety check</h3>
          <dl>
            <div>
              <dt>Filename</dt>
              <dd>{inspection.filename}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>{inspection.valid ? 'Valid' : 'Failed'}</dd>
            </div>
            <div>
              <dt>Personal</dt>
              <dd>{inspection.counts.personalPeople}</dd>
            </div>
            <div>
              <dt>Work</dt>
              <dd>{inspection.counts.workPeople}</dd>
            </div>
            <div>
              <dt>Entries</dt>
              <dd>{inspection.counts.entries}</dd>
            </div>
            <div>
              <dt>Export date</dt>
              <dd>
                {inspection.exportDate
                  ? new Date(inspection.exportDate).toLocaleString()
                  : 'Not provided'}
              </dd>
            </div>
          </dl>
          {!inspection.valid && (
            <ul className="error-list">
              {inspection.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {inspection.valid && (
            <>
              {restoreSource === 'cloud' && (
                <p className="cloud-restore-note">
                  This is a snapshot from a specific moment. <strong>Merge</strong> only adds what's
                  missing — it won't remove anything added since then. To fully go back to this
                  exact point in time, use <strong>Replace</strong> below.
                </p>
              )}
              <button
                className="secondary-button full-button"
                disabled={busy}
                onClick={() => void restore('merge')}
                type="button"
              >
                Merge with current data
              </button>
              <label className="replace-confirm">
                <input
                  checked={replaceConfirmed}
                  onChange={(event) => setReplaceConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>I understand Replace will overwrite all React Personal and Work data.</span>
              </label>
              <button
                className="danger-button full-button"
                disabled={!replaceConfirmed || busy}
                onClick={() => void restore('replace')}
                type="button"
              >
                Replace all React data
              </button>
            </>
          )}
        </section>
      )}

      {report && (
        <section className={`restore-report ${report.success ? 'success' : 'failure'}`}>
          <h3>
            {report.success ? 'Restore verified successfully' : 'Restore verification failed'}
          </h3>
          <p>
            Personal: {report.personal.personCount} people · {report.personal.entryCount} entries
          </p>
          <p>
            Work: {report.work.personCount} people · {report.work.entryCount} entries
          </p>
          {report.failures.map((failure) => (
            <p key={failure}>{failure}</p>
          ))}
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
