import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomNavigation, type AppDestination } from '../components/BottomNavigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FabMenu } from '../components/FabMenu';
import { InstallPrompt } from '../components/InstallPrompt';
import { ModeSwitch } from '../components/ModeSwitch';
import { PersonPickerSheet } from '../components/PersonPickerSheet';
import { SettingsSheet } from '../components/SettingsSheet';
import { StartupScreen } from '../components/StartupScreen';
import { UndoToast } from '../components/UndoToast';
import { filterByTag } from '../domain/people-sort';
import { hasOutstandingSalaryBalance } from '../domain/salary';
import { BackupSheet } from '../features/import-export/BackupSheet';
import { PeopleList } from '../features/people/PeopleList';
import { PersonFormSheet } from '../features/people/PersonFormSheet';
import { TagFilterSheet } from '../features/people/TagFilterSheet';
import { SalaryHistorySheet } from '../features/salary/SalaryHistorySheet';
import { SalaryAdjustmentSheet } from '../features/salary/SalaryAdjustmentSheet';
import { SalaryPeriodsSheet } from '../features/salary/SalaryPeriodsSheet';
import { SalarySyncSheet } from '../features/salary/SalarySyncSheet';
import { StatisticsSheet } from '../features/statistics/StatisticsSheet';
import { EntryFormSheet } from '../features/transactions/EntryFormSheet';
import { useThemeEffect } from '../hooks/useThemeEffect';
import { useTranslation } from '../i18n/useTranslation';
import type { SheetName } from '../store/app-store';
import { useAppStore } from '../store/hooks';
import type { ThemeMode } from '../types/domain';
import type { PersistedPerson } from '../types/persistence';
import { AppNavigationProvider } from './AppNavigationProvider';

interface Confirmation {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  tertiaryLabel?: string;
  action: () => Promise<void>;
  tertiaryAction?: () => Promise<void>;
}

interface NavigationSnapshot {
  entryId: string | null;
  expandedPersonId: string | null;
  personId: string | null;
  sheet: SheetName;
}

interface AccHistoryState {
  acc: true;
  depth: number;
  snapshot: NavigationSnapshot;
}

function snapshotKey(snapshot: NavigationSnapshot) {
  return JSON.stringify(snapshot);
}

function isAccHistoryState(value: unknown): value is AccHistoryState {
  return Boolean(value && typeof value === 'object' && (value as Partial<AccHistoryState>).acc);
}

function nextTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ['dark', 'light', 'system'];
  return order[(order.indexOf(current) + 1) % order.length]!;
}

function hasMeaningfulNavigationState(snapshot: NavigationSnapshot) {
  return snapshot.sheet !== 'none' || snapshot.expandedPersonId !== null;
}

export function App() {
  const initialize = useAppStore((state) => state.initialize);
  const initCloudAuth = useAppStore((state) => state.initCloudAuth);
  const initialized = useAppStore((state) => state.initialized);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const clearError = useAppStore((state) => state.clearError);
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const t = useTranslation();
  const privacyMode = useAppStore((state) => state.privacyMode);
  const setPrivacyMode = useAppStore((state) => state.setPrivacyMode);
  const people = useAppStore((state) => state.peopleByMode[state.mode]);
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const filter = useAppStore((state) => state.filter);
  const setFilter = useAppStore((state) => state.setFilter);
  const tagFilter = useAppStore((state) => state.tagFilter);
  const expandedPersonId = useAppStore((state) => state.expandedPersonId);
  const setExpandedPerson = useAppStore((state) => state.setExpandedPerson);
  const openSheet = useAppStore((state) => state.openSheet);
  const closeSheet = useAppStore((state) => state.closeSheet);
  const sheet = useAppStore((state) => state.ui.sheet);
  const sheetPersonId = useAppStore((state) => state.ui.personId);
  const sheetEntryId = useAppStore((state) => state.ui.entryId);
  const deletePerson = useAppStore((state) => state.deletePerson);
  const deleteEntry = useAppStore((state) => state.deleteEntry);
  const toggleArchive = useAppStore((state) => state.toggleArchive);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [entryPersonPickerOpen, setEntryPersonPickerOpen] = useState(false);
  const dirtyRef = useRef(false);
  const confirmationRef = useRef<Confirmation | null>(null);
  const fabMenuOpenRef = useRef(false);
  const entryPersonPickerOpenRef = useRef(false);
  const historyReadyRef = useRef(false);
  const historyDepthRef = useRef(0);
  const lastSnapshotKeyRef = useRef('');
  const ignoredSnapshotKeyRef = useRef('');
  const returningAfterBlockedBackRef = useRef<
    'confirmation' | 'dirty' | 'fabMenu' | 'personPicker' | null
  >(null);
  useThemeEffect(theme);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!initialized) return;
    // Defer starting the Firebase cloud-sync module (a large chunk, fetched + parsed on demand)
    // until just after the first paint, so it isn't competing with the initial render for the
    // browser's attention. Auto-sync still kicks in automatically moments later on its own —
    // this only delays when that starts, never whether it does.
    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (callback: () => void) => window.setTimeout(callback, 1);
    const cancelIdle = typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout;
    const handle = idle(() => initCloudAuth());
    return () => cancelIdle(handle);
  }, [initialized, initCloudAuth]);

  useEffect(() => {
    if (!initialized) return;
    // Launched from the home-screen icon's long-press shortcut (see pwa.ts) — go straight to
    // 'pick who to add an entry for', same as tapping + then Add Entry. The query param is
    // stripped right after so a refresh or Back doesn't reopen it. setState is deferred into a
    // timeout rather than called straight from the effect body, same as the idle-deferred cloud
    // auth above.
    const params = new URLSearchParams(window.location.search);
    if (params.get('shortcut') !== 'add-entry') return;
    params.delete('shortcut');
    const query = params.toString();
    const cleanedUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', cleanedUrl);
    const timer = window.setTimeout(() => setEntryPersonPickerOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [initialized]);

  useEffect(() => {
    confirmationRef.current = confirmation;
  }, [confirmation]);

  useEffect(() => {
    fabMenuOpenRef.current = fabMenuOpen;
  }, [fabMenuOpen]);

  useEffect(() => {
    entryPersonPickerOpenRef.current = entryPersonPickerOpen;
  }, [entryPersonPickerOpen]);

  // The tag filter only narrows what's shown while browsing Work — it never restricts which
  // team an entry can be added for (the person picker below keeps using the unfiltered `people`),
  // and it doesn't exist in Personal mode at all.
  const visiblePeople = mode === 'work' ? filterByTag(people, tagFilter) : people;
  const stillOwedArchived = visiblePeople.filter(
    (person) =>
      person.archived && mode === 'work' && hasOutstandingSalaryBalance(person, new Date()),
  );
  const activeCount =
    visiblePeople.filter((person) => !person.archived).length + stillOwedArchived.length;
  const archivedCount = visiblePeople.filter((person) => person.archived).length;
  const activeDestination: AppDestination =
    sheet === 'statistics'
      ? 'statistics'
      : sheet === 'settings' || sheet === 'backup'
        ? 'settings'
        : 'home';

  const navigationSnapshot = useMemo<NavigationSnapshot>(
    () => ({
      entryId: sheetEntryId,
      expandedPersonId,
      personId: sheetPersonId,
      sheet,
    }),
    [expandedPersonId, sheet, sheetEntryId, sheetPersonId],
  );
  const navigationSnapshotRef = useRef(navigationSnapshot);

  useEffect(() => {
    navigationSnapshotRef.current = navigationSnapshot;
  }, [navigationSnapshot]);

  const applyNavigationSnapshot = useCallback(
    (snapshot: NavigationSnapshot) => {
      if (snapshot.sheet === 'none') closeSheet();
      else openSheet(snapshot.sheet, snapshot.personId, snapshot.entryId);
      setExpandedPerson(snapshot.expandedPersonId);
    },
    [closeSheet, openSheet, setExpandedPerson],
  );

  const reportFormDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // When a sheet is swapped for another (not stacked on top), the next navigation snapshot takes
  // over the current history entry instead of adding one — otherwise Back from the second sheet
  // would land on the first, which is already finished (e.g. a saved Add Team form).
  const replaceNextSnapshotRef = useRef(false);
  const replaceSheet = useCallback(
    (nextSheet: SheetName, personId: string | null) => {
      replaceNextSnapshotRef.current = true;
      openSheet(nextSheet, personId);
    },
    [openSheet],
  );

  const closeAfterSave = useCallback(() => {
    dirtyRef.current = false;
    if (historyReadyRef.current && historyDepthRef.current > 0) {
      window.history.back();
      return;
    }
    closeSheet();
    setExpandedPerson(null);
  }, [closeSheet, setExpandedPerson]);

  const showDiscardConfirmation = useCallback(() => {
    const next: Confirmation = {
      title: t('Discard changes?'),
      message: t('Your unsaved changes will be lost.'),
      cancelLabel: t('Keep editing'),
      confirmLabel: t('Discard'),
      action: () => {
        closeAfterSave();
        return Promise.resolve();
      },
    };
    confirmationRef.current = next;
    setConfirmation(next);
  }, [closeAfterSave, t]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) showDiscardConfirmation();
    else closeAfterSave();
  }, [closeAfterSave, showDiscardConfirmation]);

  useEffect(() => {
    if (!initialized) return;
    const key = snapshotKey(navigationSnapshot);

    if (!historyReadyRef.current) {
      const baseState: AccHistoryState = { acc: true, depth: 0, snapshot: navigationSnapshot };
      window.history.replaceState(baseState, '');
      window.history.pushState({ ...baseState, depth: 1 }, '');
      historyReadyRef.current = true;
      historyDepthRef.current = 1;
      lastSnapshotKeyRef.current = key;
      return;
    }

    if (ignoredSnapshotKeyRef.current === key) {
      ignoredSnapshotKeyRef.current = '';
      lastSnapshotKeyRef.current = key;
      return;
    }
    if (lastSnapshotKeyRef.current === key) return;

    if (replaceNextSnapshotRef.current) {
      replaceNextSnapshotRef.current = false;
      window.history.replaceState(
        { acc: true, depth: historyDepthRef.current, snapshot: navigationSnapshot },
        '',
      );
      lastSnapshotKeyRef.current = key;
      return;
    }

    const depth = historyDepthRef.current + 1;
    const nextState: AccHistoryState = { acc: true, depth, snapshot: navigationSnapshot };
    window.history.pushState(nextState, '');
    historyDepthRef.current = depth;
    lastSnapshotKeyRef.current = key;
  }, [initialized, navigationSnapshot]);

  useEffect(() => {
    if (!initialized) return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as unknown;
      const returning = returningAfterBlockedBackRef.current;

      if (returning) {
        returningAfterBlockedBackRef.current = null;
        if (isAccHistoryState(state)) historyDepthRef.current = state.depth;
        if (returning === 'dirty') showDiscardConfirmation();
        return;
      }

      if (confirmationRef.current) {
        confirmationRef.current = null;
        setConfirmation(null);
        returningAfterBlockedBackRef.current = 'confirmation';
        window.history.forward();
        return;
      }

      if (entryPersonPickerOpenRef.current) {
        entryPersonPickerOpenRef.current = false;
        setEntryPersonPickerOpen(false);
        returningAfterBlockedBackRef.current = 'personPicker';
        window.history.forward();
        return;
      }

      if (fabMenuOpenRef.current) {
        fabMenuOpenRef.current = false;
        setFabMenuOpen(false);
        returningAfterBlockedBackRef.current = 'fabMenu';
        window.history.forward();
        return;
      }

      const current = navigationSnapshotRef.current;
      if (
        dirtyRef.current &&
        ['person-form', 'entry-form', 'salary-sync'].includes(current.sheet)
      ) {
        returningAfterBlockedBackRef.current = 'dirty';
        window.history.forward();
        return;
      }

      if (!isAccHistoryState(state)) return;
      if (
        !hasMeaningfulNavigationState(current) &&
        snapshotKey(state.snapshot) === snapshotKey(current)
      ) {
        window.history.back();
        return;
      }

      const key = snapshotKey(state.snapshot);
      historyDepthRef.current = state.depth;
      ignoredSnapshotKeyRef.current = key;
      lastSnapshotKeyRef.current = key;
      applyNavigationSnapshot(state.snapshot);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyNavigationSnapshot, initialized, showDiscardConfirmation]);

  function confirmPersonDelete(person: PersistedPerson) {
    setConfirmation({
      title: t('Delete?'),
      message: `${t('Are you sure you want to delete')} ${person.name}?`,
      action: () => deletePerson(person.id),
    });
  }

  function confirmToggleArchive(person: PersistedPerson) {
    const isSalaried = mode === 'work' && Boolean(person.salaryAmount && person.salaryStartDate);

    if (!person.archived) {
      setConfirmation({
        title: t('Archive?'),
        message:
          isSalaried && !person.salaryEndDate
            ? `${t('Archive')} ${person.name}? ${t('Salary will stop accruing as of today.')}`
            : `${t('Are you sure you want to archive')} ${person.name}?`,
        confirmLabel: t('Archive'),
        confirmVariant: 'primary',
        action: () => toggleArchive(person.id),
      });
      return;
    }

    if (!isSalaried) {
      setConfirmation({
        title: t('Unarchive?'),
        message: `${t('Are you sure you want to unarchive')} ${person.name}?`,
        confirmLabel: t('Unarchive'),
        confirmVariant: 'primary',
        action: () => toggleArchive(person.id),
      });
      return;
    }

    setConfirmation({
      title: t('Unarchive?'),
      message: `${t('Unarchive')} ${person.name}? ${t('Salary tracking will resume from today — you can adjust the dates first if needed.')}`,
      confirmLabel: t('Resume from today'),
      confirmVariant: 'primary',
      tertiaryLabel: t('Edit dates first'),
      action: () => toggleArchive(person.id),
      tertiaryAction: async () => {
        await toggleArchive(person.id);
        openSheet('person-form', person.id);
      },
    });
  }

  function confirmEntryDelete(person: PersistedPerson, entryId: string) {
    setConfirmation({
      title: t('Delete entry?'),
      message: t('Are you sure you want to delete this entry?'),
      action: () => deleteEntry(person.id, entryId),
    });
  }

  function navigate(destination: AppDestination) {
    if (destination === activeDestination) return;
    if (destination === 'home') closeSheet();
    if (destination === 'statistics') openSheet('statistics');
    if (destination === 'settings') openSheet('settings');
  }

  return (
    <AppNavigationProvider
      closeAfterSave={closeAfterSave}
      replaceSheet={replaceSheet}
      reportFormDirty={reportFormDirty}
      requestClose={requestClose}
    >
      <StartupScreen />
      <div className="app-shell">
        <header className="app-header real-header">
          <div className="browse-controls-row">
            <label className="search-field">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.5 16.5 4 4" />
              </svg>
              <input
                aria-label={t('Search by name')}
                autoCapitalize="none"
                autoComplete="off"
                enterKeyHint="search"
                inputMode="search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search')}
                spellCheck={false}
                type="search"
                value={search}
              />
            </label>
            <div aria-label={t('People filter')} className="filter-switch" role="group">
              <button
                className={filter === 'active' ? 'is-selected' : ''}
                onClick={() => setFilter('active')}
                type="button"
              >
                {t('Active')} <span>{activeCount}</span>
              </button>
              <button
                className={filter === 'archived' ? 'is-selected' : ''}
                onClick={() => setFilter('archived')}
                type="button"
              >
                {t('Archived')} <span>{archivedCount}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="app-content real-content">
          {(loading || !initialized) && (
            <section className="empty-card">
              <div className="loading-spinner" />
              <h1>Loading ACC</h1>
            </section>
          )}
          {initialized && (
            <PeopleList
              onDeleteEntry={confirmEntryDelete}
              onDeletePerson={confirmPersonDelete}
              onToggleArchive={confirmToggleArchive}
            />
          )}
        </main>
      </div>

      {initialized && (
        <div className="mode-switch-bar">
          <ModeSwitch mode={mode} onChange={(next) => void setMode(next)} t={t} />
        </div>
      )}
      {initialized && mode === 'work' && (
        <button
          aria-label="Filter by tag"
          className={tagFilter ? 'fab fab-left has-tag' : 'fab fab-left'}
          onClick={() => openSheet('tag-filter')}
          style={tagFilter ? { background: tagFilter } : undefined}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
            <circle cx="6.75" cy="6.75" r="0.75" />
          </svg>
        </button>
      )}
      {initialized && (
        <button aria-label="Add" className="fab" onClick={() => setFabMenuOpen(true)} type="button">
          +
        </button>
      )}
      {initialized && (
        <BottomNavigation
          active={activeDestination}
          onCycleTheme={() => void setTheme(nextTheme(theme))}
          onNavigate={navigate}
          onTogglePrivacy={() => void setPrivacyMode(!privacyMode)}
          privacyMode={privacyMode}
          t={t}
          theme={theme}
        />
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={clearError} type="button">
            ×
          </button>
        </div>
      )}
      <UndoToast />
      <InstallPrompt />

      {sheet === 'person-form' && <PersonFormSheet />}
      {sheet === 'entry-form' && <EntryFormSheet />}
      {sheet === 'salary-sync' && <SalarySyncSheet />}
      {sheet === 'salary-history' && <SalaryHistorySheet />}
      {sheet === 'salary-periods' && <SalaryPeriodsSheet />}
      {sheet === 'salary-adjustment' && <SalaryAdjustmentSheet />}
      {sheet === 'statistics' && <StatisticsSheet />}
      {sheet === 'settings' && <SettingsSheet />}
      {sheet === 'backup' && <BackupSheet />}
      {sheet === 'tag-filter' && <TagFilterSheet />}
      {fabMenuOpen && (
        <FabMenu
          onAddEntry={() => {
            setFabMenuOpen(false);
            setEntryPersonPickerOpen(true);
          }}
          onAddPerson={() => {
            setFabMenuOpen(false);
            openSheet('person-form');
          }}
          onClose={() => setFabMenuOpen(false)}
          personLabel={mode === 'work' ? t('Team') : t('Person')}
        />
      )}
      {entryPersonPickerOpen && (
        <PersonPickerSheet
          mode={mode}
          onClose={() => setEntryPersonPickerOpen(false)}
          onSelect={(person) => {
            setEntryPersonPickerOpen(false);
            openSheet('entry-form', person.id);
          }}
          people={people}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          {...(confirmation.cancelLabel ? { cancelLabel: confirmation.cancelLabel } : {})}
          {...(confirmation.confirmLabel ? { confirmLabel: confirmation.confirmLabel } : {})}
          {...(confirmation.confirmVariant ? { confirmVariant: confirmation.confirmVariant } : {})}
          {...(confirmation.tertiaryLabel ? { tertiaryLabel: confirmation.tertiaryLabel } : {})}
          message={confirmation.message}
          onCancel={() => {
            confirmationRef.current = null;
            setConfirmation(null);
          }}
          onConfirm={async () => {
            await confirmation.action();
            confirmationRef.current = null;
            setConfirmation(null);
          }}
          {...(confirmation.tertiaryAction
            ? {
                onTertiary: async () => {
                  await confirmation.tertiaryAction?.();
                  confirmationRef.current = null;
                  setConfirmation(null);
                },
              }
            : {})}
          title={confirmation.title}
        />
      )}
    </AppNavigationProvider>
  );
}
