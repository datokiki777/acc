import 'fake-indexeddb/auto';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createAccReactDatabase, type AccReactDatabase } from '../db/database';
import { createAppRepository } from '../db/repository';
import { createAppStore, type PersonDraft } from '../store/app-store';
import { AppStoreProvider } from '../store/provider';
import { App } from './App';

function draft(name: string): PersonDraft {
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

function swipe(element: HTMLElement, startX: number, endX: number, endY = 20) {
  fireEvent.pointerDown(element, {
    button: 0,
    clientX: startX,
    clientY: 20,
    isPrimary: true,
    pointerId: 1,
  });
  fireEvent.pointerMove(element, {
    clientX: endX,
    clientY: endY,
    isPrimary: true,
    pointerId: 1,
  });
  fireEvent.pointerUp(element, {
    clientX: endX,
    clientY: endY,
    isPrimary: true,
    pointerId: 1,
  });
}

async function longPress(element: HTMLElement) {
  fireEvent.pointerDown(element, {
    button: 0,
    clientX: 160,
    clientY: 20,
    isPrimary: true,
    pointerId: 2,
  });
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 550)));
  fireEvent.pointerUp(element, {
    clientX: 160,
    clientY: 20,
    isPrimary: true,
    pointerId: 2,
  });
}

async function findPersonSummary(name: string) {
  const label = await screen.findByText(name, { selector: '.person-name-row strong' });
  const summary = label.closest('button');
  expect(summary).toBeInstanceOf(HTMLButtonElement);
  return summary as HTMLButtonElement;
}

function pressBrowserBack() {
  act(() => window.history.back());
}

describe('ACC application', () => {
  let database: AccReactDatabase;

  beforeEach(() => {
    database = createAccReactDatabase(`app-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    cleanup();
    database.close();
    await database.delete();
  });

  function renderApp() {
    const store = createAppStore({ repository: createAppRepository(database) });
    render(
      <AppStoreProvider store={store}>
        <App />
      </AppStoreProvider>,
    );
    return store;
  }

  it('renders the initialized application shell', async () => {
    const store = renderApp();

    await waitFor(() => expect(store.getState().initialized).toBe(true), { timeout: 3000 });
    expect(screen.getByRole('heading', { name: 'No records yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open app menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Statistics' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(navigation).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('button', { name: 'Stats' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: 'Backup' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(within(navigation).getByRole('switch', { name: 'Hide amounts' })).toBeInTheDocument();
  });

  it('uses bottom navigation for existing screens and theme settings', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('PDF person')));
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });

    await user.click(within(navigation).getByRole('button', { name: 'Stats' }));
    expect(screen.getByRole('dialog', { name: 'Statistics' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(within(navigation).getByRole('button', { name: 'Backup' }));
    const backup = screen.getByRole('dialog', { name: 'Data & Backup' });
    expect(backup).toBeVisible();
    expect(within(backup).getByRole('heading', { name: 'PDF Reports' })).toBeVisible();
    expect(within(backup).getByRole('button', { name: 'Export All Data PDF' })).toBeEnabled();
    await user.click(within(backup).getByRole('button', { name: 'Choose person for PDF' }));
    const personPicker = screen.getByRole('dialog', { name: 'Choose person' });
    expect(personPicker).toBeVisible();
    await user.click(within(personPicker).getByRole('button', { name: /PDF person/ }));
    expect(within(backup).getByRole('button', { name: 'Export Person PDF' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(within(navigation).getByRole('button', { name: /theme/i }));
    expect(store.getState().theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('uses browser Back to collapse an expanded card', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Back target')));

    const summary = await findPersonSummary('Back target');
    await user.click(summary);
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'true'));
    pressBrowserBack();
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'false'));
    act(() => window.history.forward());
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'true'));
  });

  it('blurs the collapsed balance in privacy mode and reveals it when the card is expanded', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      const person = await store.getState().addPerson(draft('Private target'));
      await store
        .getState()
        .addEntry(person.id, { amount: 40, type: 'Gave', date: '2026-08-01', comment: '' });
    });
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });

    await user.click(within(navigation).getByRole('switch', { name: 'Hide amounts' }));

    const summary = await findPersonSummary('Private target');
    const balance = within(summary).getByText('40€');
    expect(balance).toHaveClass('money-masked');

    await user.click(summary);
    await waitFor(() => expect(balance).not.toHaveClass('money-masked'));
  });

  it('uses browser Back to close sheets and Backup', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    expect(screen.getByRole('dialog', { name: 'Add Person' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add Person' })).not.toBeInTheDocument(),
    );

    await user.click(within(navigation).getByRole('button', { name: 'Stats' }));
    expect(screen.getByRole('dialog', { name: 'Statistics' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Statistics' })).not.toBeInTheDocument(),
    );
    expect(within(navigation).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(navigation).getByRole('button', { name: 'Backup' }));
    expect(screen.getByRole('dialog', { name: 'Data & Backup' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Data & Backup' })).not.toBeInTheDocument(),
    );
    expect(within(navigation).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('closes the FAB menu and person picker with browser Back', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('dialog', { name: 'Add' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Entry' }));
    expect(screen.getByRole('dialog', { name: 'Add entry for…' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add entry for…' })).not.toBeInTheDocument(),
    );
  });

  it('closes confirmation dialogs before changing the underlying Back state', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Modal Back target')));

    const summary = await findPersonSummary('Modal Back target');
    swipe(summary, 240, 120);
    await user.click(screen.getByRole('button', { name: 'Delete Modal Back target' }));
    expect(screen.getByRole('dialog', { name: 'Delete?' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete?' })).not.toBeInTheDocument(),
    );
    expect(store.getState().peopleByMode.personal).toHaveLength(1);
  });

  it('protects modified forms from Back while unchanged forms close directly', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add Person' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Unsaved person');
    pressBrowserBack();
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(screen.getByRole('dialog', { name: 'Add Person' })).toBeVisible();
    await user.click(within(discard).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Add Person' })).toBeVisible();

    pressBrowserBack();
    const discardAgain = await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(within(discardAgain).getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add Person' })).not.toBeInTheDocument(),
    );
    expect(store.getState().peopleByMode.personal).toHaveLength(0);
  });

  it('collapses an archived card without changing the Archived filter on Back', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      const person = await store.getState().addPerson(draft('Archived Back target'));
      personId = person.id;
      await store.getState().toggleArchive(person.id);
    });

    await user.click(screen.getByRole('button', { name: /Archived 1/ }));
    const summary = await findPersonSummary('Archived Back target');
    await user.click(summary);
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'true'));
    pressBrowserBack();
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'false'));
    expect(store.getState().filter).toBe('archived');

    pressBrowserBack();
    expect(store.getState().filter).toBe('archived');
    expect(store.getState().expandedPersonId).toBeNull();
    expect(store.getState().peopleByMode.personal[0]?.id).toBe(personId);
  });

  it('does not add navigation history when Active or Archived is selected', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const initialLength = window.history.length;

    await user.click(screen.getByRole('button', { name: /Archived 0/ }));
    expect(store.getState().filter).toBe('archived');
    expect(window.history.length).toBe(initialLength);

    await user.click(screen.getByRole('button', { name: /Active 0/ }));
    expect(store.getState().filter).toBe('active');
    expect(window.history.length).toBe(initialLength);
  });

  it('does not add history entries when the current bottom tab is tapped repeatedly', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    const initialLength = window.history.length;

    await user.click(within(navigation).getByRole('button', { name: 'Home' }));
    await user.click(within(navigation).getByRole('button', { name: 'Home' }));
    expect(window.history.length).toBe(initialLength);
  });

  it('keeps Personal and Work data isolated when switching modes', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: 'ACC is loading' }));
    await act(async () => store.getState().addPerson(draft('Personal contact')));

    expect(await screen.findByText('Personal contact')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Work' }));

    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Personal contact')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No records yet' })).toBeInTheDocument();
  });

  it('applies and persists an explicitly selected theme', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    const themeButton = within(navigation).getByRole('button', { name: /theme/i });

    // Starts at 'system'; each tap cycles dark -> light -> system.
    await user.click(themeButton);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(store.getState().theme).toBe('dark');

    await user.click(within(navigation).getByRole('button', { name: /theme/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(store.getState().theme).toBe('light');

    await user.click(within(navigation).getByRole('button', { name: /theme/i }));
    expect(store.getState().theme).toBe('system');
  });

  it('keeps system theme preference while reacting to phone theme changes', async () => {
    let systemDark = false;
    const listeners = new Set<() => void>();
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = () =>
      ({
        get matches() {
          return systemDark;
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList;
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    expect(store.getState().theme).toBe('system');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    systemDark = true;
    act(() => listeners.forEach((listener) => listener()));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(store.getState().theme).toBe('system');
    window.matchMedia = originalMatchMedia;
  });

  it('configures mobile text inputs without personal autofill', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    const search = screen.getByRole('searchbox', { name: 'Search by name' });
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search).toHaveAttribute('autocapitalize', 'none');
    expect(search).toHaveAttribute('inputmode', 'search');

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    const name = screen.getByRole('textbox', { name: /^Name$/ });
    const tag = screen.getByRole('textbox', { name: 'Tag optional' });
    expect(name).toHaveAttribute('autocomplete', 'off');
    expect(name).toHaveAttribute('autocapitalize', 'words');
    expect(tag).toHaveAttribute('autocomplete', 'off');
    expect(tag).toHaveAttribute('spellcheck', 'false');
  });

  it('reveals swipe actions, snaps back small swipes, and preserves normal expansion', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Swipe target')));

    const summary = await findPersonSummary('Swipe target');
    const deleteAction = screen.getByLabelText('Delete Swipe target');
    swipe(summary, 220, 190);
    expect(deleteAction).toHaveAttribute('tabindex', '-1');
    expect(summary).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await user.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');

    await user.click(summary);
    swipe(summary, 240, 120);
    await waitFor(() => expect(deleteAction).toHaveAttribute('tabindex', '0'));
    expect(summary).toHaveStyle({ transform: 'translate3d(-92px, 0, 0)' });
  });

  it('archives and unarchives through intentional right swipes', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Archive target')));

    let summary = await findPersonSummary('Archive target');
    swipe(summary, 100, 220);
    const archiveAction = screen.getByRole('button', { name: 'Archive Archive target' });
    await waitFor(() => expect(archiveAction).toHaveAttribute('tabindex', '0'));
    await user.click(archiveAction);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(store.getState().peopleByMode.personal[0]?.archived).toBe(true));

    await user.click(screen.getByRole('button', { name: /Archived 1/ }));
    summary = await findPersonSummary('Archive target');
    swipe(summary, 100, 220);
    const unarchiveAction = screen.getByRole('button', { name: 'Unarchive Archive target' });
    await waitFor(() => expect(unarchiveAction).toHaveAttribute('tabindex', '0'));
    await user.click(unarchiveAction);
    await user.click(await screen.findByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(store.getState().peopleByMode.personal[0]?.archived).toBe(false));
  });

  it('keeps only one swipe open and ignores vertical scroll gestures', async () => {
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('First target'));
      await store.getState().addPerson(draft('Second target'));
    });

    const firstSummary = await findPersonSummary('First target');
    const secondSummary = await findPersonSummary('Second target');
    const firstDelete = screen.getByLabelText('Delete First target');
    const secondDelete = screen.getByLabelText('Delete Second target');

    swipe(firstSummary, 240, 120);
    await waitFor(() => expect(firstDelete).toHaveAttribute('tabindex', '0'));
    swipe(secondSummary, 240, 120);
    await waitFor(() => {
      expect(firstDelete).toHaveAttribute('tabindex', '-1');
      expect(secondDelete).toHaveAttribute('tabindex', '0');
    });

    fireEvent.pointerDown(screen.getByRole('searchbox', { name: 'Search by name' }));
    await waitFor(() => expect(secondDelete).toHaveAttribute('tabindex', '-1'));
    swipe(secondSummary, 180, 186, 110);
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 550)));
    expect(secondDelete).toHaveAttribute('tabindex', '-1');
    expect(secondSummary).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
    expect(screen.queryByRole('dialog', { name: 'Edit Person' })).not.toBeInTheDocument();
  });

  it('requires the custom ACC dialog before swipe deletion', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Delete target')));

    const summary = await findPersonSummary('Delete target');
    swipe(summary, 240, 120);
    await user.click(screen.getByRole('button', { name: 'Delete Delete target' }));

    let dialog = screen.getByRole('dialog', { name: 'Delete?' });
    expect(
      within(dialog).getByText('Are you sure you want to delete Delete target?'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().peopleByMode.personal).toHaveLength(1);

    swipe(summary, 240, 120);
    await user.click(screen.getByRole('button', { name: 'Delete Delete target' }));
    dialog = screen.getByRole('dialog', { name: 'Delete?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(store.getState().peopleByMode.personal).toHaveLength(0));
  });

  it('adds an entry via the FAB menu and person picker', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().addPerson(draft('Riley')));
    await act(async () => store.getState().addPerson(draft('Sam')));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Entry' }));

    const picker = await screen.findByRole('dialog', { name: 'Add entry for…' });
    await user.click(within(picker).getByRole('button', { name: /Riley/ }));

    const entryDialog = await screen.findByRole('dialog', { name: 'Add Entry · Riley' });
    await user.type(within(entryDialog).getByRole('spinbutton', { name: 'Amount' }), '42');
    await user.click(within(entryDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const riley = store
        .getState()
        .peopleByMode.personal.find((person) => person.name === 'Riley');
      expect(riley?.entries).toHaveLength(1);
    });
    const sam = store.getState().peopleByMode.personal.find((person) => person.name === 'Sam');
    expect(sam?.entries).toHaveLength(0);
  });

  it('prompts to add a person first when the FAB entry picker has nothing to show', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Entry' }));

    const picker = await screen.findByRole('dialog', { name: 'Add entry for…' });
    expect(picker.querySelector('.mini-empty')).toHaveTextContent(/No persons yet/i);
  });

  it('creates a person and an entry through the touch UI', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: 'ACC is loading' }));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Taylor');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const summary = await findPersonSummary('Taylor');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Add Entry/ }));
    const amount = screen.getByRole('spinbutton', { name: 'Amount' });
    expect(amount).toHaveValue(null);
    expect(amount).toHaveAttribute('placeholder', '0');
    const gave = screen.getByRole('button', { name: /Gave/ });
    const received = screen.getByRole('button', { name: /Received/ });
    expect(gave).toHaveAttribute('aria-pressed', 'true');
    expect(gave).toHaveClass('choice-gave', 'is-selected');
    await user.click(received);
    expect(received).toHaveAttribute('aria-pressed', 'true');
    expect(received).toHaveClass('choice-received', 'is-selected');
    await user.click(gave);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Amount is required');
    await user.type(amount, '75');
    const georgianComment =
      'გრძელი ქართული კომენტარი, რომელიც ბარათში მაქსიმუმ ორ ხაზად უნდა გამოჩნდეს';
    await user.type(screen.getByRole('textbox', { name: /Comment/ }), georgianComment);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const comment = await screen.findByText(georgianComment);
    expect(comment).toHaveClass('entry-comment');
    const entrySurface = comment.closest('.entry-card-surface');
    expect(entrySurface).toBeInstanceOf(HTMLDivElement);
    expect(screen.queryByRole('button', { name: 'Edit entry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete entry/ })).not.toBeInTheDocument();
    expect(store.getState().peopleByMode.personal[0]?.entries[0]).toMatchObject({
      amount: 75,
      type: 'Gave',
      comment: georgianComment,
    });

    await user.click(entrySurface as HTMLDivElement);
    expect(screen.queryByRole('dialog', { name: 'Edit Entry' })).not.toBeInTheDocument();
    await longPress(entrySurface as HTMLDivElement);
    expect(screen.getByRole('dialog', { name: 'Edit Entry' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(75);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    swipe(entrySurface as HTMLDivElement, 240, 120);
    const entryDelete = screen.getByRole('button', { name: /Delete entry dated/ });
    expect(entryDelete).toHaveAttribute('tabindex', '0');
    await user.click(entryDelete);
    let dialog = screen.getByRole('dialog', { name: 'Delete entry?' });
    expect(within(dialog).getByText('Are you sure you want to delete this entry?')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().peopleByMode.personal[0]?.entries).toHaveLength(1);

    swipe(entrySurface as HTMLDivElement, 240, 120);
    await user.click(screen.getByRole('button', { name: /Delete entry dated/ }));
    dialog = screen.getByRole('dialog', { name: 'Delete entry?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(store.getState().peopleByMode.personal[0]?.entries).toHaveLength(0));

    expect(screen.queryByRole('button', { name: /Archive Taylor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Taylor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await longPress(summary);
    expect(screen.getByRole('dialog', { name: 'Edit Person' })).toBeVisible();
    expect(summary).toHaveAttribute('aria-expanded', 'true');
  }, 15_000);

  it('keeps entry swipes isolated, closes the previous entry, and preserves vertical intent', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      const person = await store.getState().addPerson(draft('Entry swipe target'));
      personId = person.id;
      await store.getState().addEntry(person.id, {
        amount: 10,
        type: 'Gave',
        date: '2026-07-01',
        comment: 'First entry',
      });
      await store.getState().addEntry(person.id, {
        amount: 20,
        type: 'Received',
        date: '2026-07-02',
        comment: 'Second entry',
      });
    });

    const summary = await findPersonSummary('Entry swipe target');
    await user.click(summary);
    const firstSurface = screen.getByText('First entry').closest('.entry-card-surface');
    const secondSurface = screen.getByText('Second entry').closest('.entry-card-surface');
    expect(firstSurface).toBeInstanceOf(HTMLDivElement);
    expect(secondSurface).toBeInstanceOf(HTMLDivElement);
    const firstShell = firstSurface?.closest('.entry-swipe-shell');
    const secondShell = secondSurface?.closest('.entry-swipe-shell');
    const firstDelete = within(firstShell as HTMLElement).getByLabelText(/Delete entry dated/);
    const secondDelete = within(secondShell as HTMLElement).getByLabelText(/Delete entry dated/);

    swipe(firstSurface as HTMLElement, 240, 120);
    await waitFor(() => expect(firstDelete).toHaveAttribute('tabindex', '0'));
    expect(summary).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
    expect(screen.queryByRole('dialog', { name: 'Edit Entry' })).not.toBeInTheDocument();

    swipe(secondSurface as HTMLElement, 240, 120);
    await waitFor(() => {
      expect(firstDelete).toHaveAttribute('tabindex', '-1');
      expect(secondDelete).toHaveAttribute('tabindex', '0');
    });

    fireEvent.pointerDown(screen.getByRole('searchbox', { name: 'Search by name' }));
    await waitFor(() => expect(secondDelete).toHaveAttribute('tabindex', '-1'));
    fireEvent.pointerDown(secondSurface as HTMLElement, {
      button: 0,
      clientX: 180,
      clientY: 20,
      isPrimary: true,
      pointerId: 3,
    });
    fireEvent.pointerMove(secondSurface as HTMLElement, {
      clientX: 186,
      clientY: 110,
      isPrimary: true,
      pointerId: 3,
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 550)));
    fireEvent.pointerUp(secondSurface as HTMLElement, {
      clientX: 186,
      clientY: 110,
      isPrimary: true,
      pointerId: 3,
    });
    expect(secondDelete).toHaveAttribute('tabindex', '-1');
    expect(secondSurface).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
    expect(screen.queryByRole('dialog', { name: 'Edit Entry' })).not.toBeInTheDocument();
    expect(store.getState().peopleByMode.personal[0]?.id).toBe(personId);
    expect(store.getState().peopleByMode.personal[0]?.entries).toHaveLength(2);
  });

  it('asks for an effective date when the salary amount changes, then banks the old rate', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('Raise target'),
        salaryEnabled: true,
        salaryAmount: 2000,
        salaryStartDate: '2026-07-01',
      });
      personId = person.id;
    });

    const summary = await findPersonSummary('Raise target');
    await longPress(summary);
    const editDialog = screen.getByRole('dialog', { name: 'Edit Team' });
    const amountField = within(editDialog).getByRole('spinbutton', { name: 'Monthly salary' });
    await user.clear(amountField);
    await user.type(amountField, '3000');
    await user.click(within(editDialog).getByRole('button', { name: 'Save' }));

    const prompt = await screen.findByRole('dialog', { name: 'Apply new salary from…' });
    const dateField = within(prompt).getByLabelText('Effective date');
    fireEvent.change(dateField, { target: { value: '2026-08-06' } });
    await user.click(within(prompt).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryAmount).toBe(3000);
      expect(person?.salaryPeriodAnchorDate).toBe('2026-08-06');
      expect(person?.salaryAccruedBaseline).toBeGreaterThan(0);
    });
  }, 15_000);

  it('rebuilds the salary timeline from the Manage Salary History editor, reachable from Change Salary', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('History target'),
        salaryEnabled: true,
        salaryAmount: 2000,
        salaryStartDate: '2026-07-29',
        salaryPayPeriodWeeks: 2,
      });
      personId = person.id;
    });

    const summary = await findPersonSummary('History target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });
    await user.click(
      within(syncDialog).getByRole('button', { name: /Correct or add a past salary change/ }),
    );

    const historyDialog = await screen.findByRole('dialog', { name: 'Manage Salary History' });
    await user.click(within(historyDialog).getByRole('button', { name: '+ Add change' }));
    const dateInputs = historyDialog.querySelectorAll('input[type="date"]');
    const amountInputs = historyDialog.querySelectorAll('input[type="number"]');
    fireEvent.change(dateInputs[0]!, { target: { value: '2026-08-12' } });
    fireEvent.change(amountInputs[1]!, { target: { value: '3000' } });
    await user.click(within(historyDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryAmount).toBe(3000);
      expect(person?.salaryPeriodAnchorDate).toBe('2026-08-12');
      // One completed 2-week period (29/07-12/08) at the OLD 2000/month rate = 1000 owed.
      expect(person?.salaryAccruedBaseline).toBe(1000);
      expect(person?.salaryHistory).toEqual([
        { effectiveDate: '2026-08-12', previousAmount: 2000, newAmount: 3000 },
      ]);
    });
  }, 15_000);

  it('shows the first 10 entries and collapses the rest into independently expandable chunks', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      const person = await store.getState().addPerson(draft('Many entries'));
      for (let i = 0; i < 12; i += 1) {
        await store.getState().addEntry(person.id, {
          amount: i + 1,
          type: 'Gave',
          date: `2026-08-${String((i % 27) + 1).padStart(2, '0')}`,
          comment: `entry-${i}`,
        });
      }
    });

    const summary = await findPersonSummary('Many entries');
    await user.click(summary);
    const card = summary.closest('.person-card') as HTMLElement;
    await waitFor(() =>
      expect(within(card).getAllByText(/entry-11|entry-2/).length).toBeGreaterThan(0),
    );

    // The two oldest entries (entry-0, entry-1) are collapsed behind one chunk toggle.
    expect(within(card).queryByText('entry-0')).not.toBeInTheDocument();
    expect(within(card).queryByText('entry-1')).not.toBeInTheDocument();
    expect(within(card).getByText('entry-11')).toBeInTheDocument();

    const toggle = within(card).getByRole('button', { name: /Show 2 older entries/ });
    await user.click(toggle);
    expect(within(card).getByText('entry-0')).toBeInTheDocument();
    expect(within(card).getByText('entry-1')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /Hide 2 older entries/ }));
    expect(within(card).queryByText('entry-0')).not.toBeInTheDocument();
  });

  it('lets picking a Top Balances row filter the chart to that person, and toggling clears it', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      const alex = await store.getState().addPerson(draft('Alex Balance'));
      await store
        .getState()
        .addEntry(alex.id, { amount: 50, type: 'Gave', date: '2026-08-01', comment: '' });
      const sam = await store.getState().addPerson(draft('Sam Balance'));
      await store
        .getState()
        .addEntry(sam.id, { amount: 30, type: 'Gave', date: '2026-08-02', comment: '' });
    });

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    await user.click(within(navigation).getByRole('button', { name: 'Stats' }));
    const statsDialog = screen.getByRole('dialog', { name: 'Statistics' });

    const alexRow = within(statsDialog).getByRole('button', { name: /Alex Balance/ });
    await user.click(alexRow);
    expect(alexRow).toHaveClass('is-selected');
    expect(within(statsDialog).getByRole('button', { name: /✕ Alex Balance/ })).toBeInTheDocument();

    await user.click(alexRow);
    expect(alexRow).not.toHaveClass('is-selected');
    expect(
      within(statsDialog).queryByRole('button', { name: /✕ Alex Balance/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps payroll totals inside one summary card with only compact bottom actions', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('Payroll target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-01-01',
      });
      await store.getState().addEntry(person.id, {
        amount: 1500,
        type: 'Gave',
        date: '2026-07-31',
        comment: 'Salary payment',
        category: 'salary',
      });
    });

    const summary = await findPersonSummary('Payroll target');
    await user.click(summary);
    const payroll = screen.getByText('Payroll', { selector: 'strong' }).closest('.payroll-panel');
    expect(payroll).toBeInstanceOf(HTMLElement);
    expect(within(payroll as HTMLElement).getByText('Net')).toBeInTheDocument();
    expect((payroll as HTMLElement).querySelector('.payroll-totals-row')).toBeInTheDocument();
    expect(
      screen.queryByText('Archive', { selector: '.card-actions button' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Delete', { selector: '.card-actions button' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add Entry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Team PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Person PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('separates payroll, other totals, and categorized entries in expanded work cards', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('Mixed work target'),
        salaryEnabled: true,
        salaryAmount: 3200,
        salaryStartDate: '2026-06-01',
      });
      await store.getState().addEntry(person.id, {
        amount: 1600,
        type: 'Gave',
        date: '2026-07-15',
        comment: 'Salary payment',
        category: 'salary',
      });
      await store.getState().addEntry(person.id, {
        amount: 250,
        type: 'Gave',
        date: '2026-07-20',
        comment: 'Other payment',
        category: 'gift',
      });
      await store.getState().addEntry(person.id, {
        amount: 50,
        type: 'Received',
        date: '2026-07-21',
        comment: 'Other return',
        category: 'gift',
      });
    });

    const summary = await findPersonSummary('Mixed work target');
    await user.click(summary);

    const details = summary.closest('.person-card')?.querySelector('.work-person-details');
    const payroll = details?.querySelector('.payroll-panel');
    const other = details?.querySelector('.other-summary-panel');
    expect(details).toBeInstanceOf(HTMLElement);
    expect(payroll).toBeInstanceOf(HTMLElement);
    expect(other).toBeInstanceOf(HTMLElement);
    expect(within(other as HTMLElement).getByText('Other balance')).toBeInTheDocument();
    expect((other as HTMLElement).querySelector('.other-totals-row')).toHaveTextContent('250');
    expect((other as HTMLElement).querySelector('.other-totals-row')).toHaveTextContent('50');
    expect(within(other as HTMLElement).getAllByText(/200/)).toHaveLength(1);

    const salaryEntry = screen.getByText('Salary payment').closest('.entry-card-surface');
    const otherEntry = screen.getByText('Other payment').closest('.entry-card-surface');
    expect(salaryEntry?.querySelector('.entry-kind')).toHaveClass('entry-kind-salary');
    expect(salaryEntry).toHaveClass('entry-card-surface');
    expect(otherEntry).toHaveClass('entry-card-surface');
  });

  it('uses a dedicated Other summary for non-salary work cards', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson(draft('Other work target'));
      await store.getState().addEntry(person.id, {
        amount: 300,
        type: 'Gave',
        date: '2026-08-01',
        comment: '',
        category: 'gift',
      });
      await store.getState().addEntry(person.id, {
        amount: 80,
        type: 'Received',
        date: '2026-08-02',
        comment: '',
        category: 'gift',
      });
    });

    const summary = await findPersonSummary('Other work target');
    await user.click(summary);
    const card = summary.closest('.person-card');
    const other = card?.querySelector('.other-summary-panel');
    expect(card).toHaveClass('is-other-card');
    expect(card).not.toHaveClass('is-salary-card');
    expect(other).toBeInstanceOf(HTMLElement);
    expect(card?.querySelector('.payroll-panel')).not.toBeInTheDocument();
    expect((other as HTMLElement).querySelector('.other-totals-row')).toHaveTextContent('300');
    expect((other as HTMLElement).querySelector('.other-totals-row')).toHaveTextContent('80');
    expect(within(other as HTMLElement).getAllByText(/220/)).toHaveLength(1);
  });

  it('uses semantic money pills for positive, negative, zero, entry, and net values', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('Zero balance'));
      const positive = await store
        .getState()
        .addPerson(draft('ძალიან გრძელი ქართული სახელი თანხის ბარათის შესამოწმებლად'));
      await store.getState().addEntry(positive.id, {
        amount: 150,
        type: 'Gave',
        date: '2026-08-07',
        comment: 'ქართული კომენტარი',
      });
      const negative = await store.getState().addPerson(draft('Negative balance'));
      await store.getState().addEntry(negative.id, {
        amount: 100,
        type: 'Received',
        date: '2026-08-07',
        comment: '',
      });
      const large = await store.getState().addPerson(draft('Large balance'));
      await store.getState().addEntry(large.id, {
        amount: 125000,
        type: 'Gave',
        date: '2026-08-07',
        comment: '',
      });
    });

    const zeroSummary = await findPersonSummary('Zero balance');
    expect(zeroSummary.querySelector('.balance-value')).toHaveClass(
      'money-value-pill',
      'money-neutral',
    );
    const positiveSummary = await findPersonSummary(
      'ძალიან გრძელი ქართული სახელი თანხის ბარათის შესამოწმებლად',
    );
    expect(positiveSummary.querySelector('.balance-value')).toHaveClass('money-positive');
    const negativeSummary = await findPersonSummary('Negative balance');
    expect(negativeSummary.querySelector('.balance-value')).toHaveClass('money-negative');
    expect(negativeSummary.querySelector('.balance-value')).toHaveTextContent('100€');
    expect(negativeSummary.querySelector('.balance-value')).not.toHaveTextContent('-');
    const largeSummary = await findPersonSummary('Large balance');
    expect(largeSummary.querySelector('.balance-value')).toHaveClass('money-amount-lg');
    expect(largeSummary.querySelector('.balance-value')).toHaveTextContent('125000€');

    await user.click(positiveSummary);
    expect(screen.getByText('150€', { selector: '.entry-amount' })).toHaveClass('money-positive');
    expect(screen.getByText('150€', { selector: '.money-net-pill' })).toHaveClass('money-positive');
    await user.click(positiveSummary);
    await user.click(negativeSummary);
    expect(screen.getByText('100€', { selector: '.entry-amount' })).toHaveClass('money-negative');
  });
});
