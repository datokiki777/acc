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
import { calculateSalary } from '../domain/salary';
import { TAG_COLORS } from '../domain/tag-colors';
import { createAppStore, type PersonDraft } from '../store/app-store';
import { AppStoreProvider } from '../store/provider';
import { App } from './App';
import { localDateString } from '../utils/format';

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

  it('shows a spinner on the startup screen until the app is actually ready, then fades it out', async () => {
    const store = renderApp();
    const startup = screen.getByRole('status', { name: 'ACC is loading' });
    expect(within(startup).getByText('ACC')).toBeInTheDocument();
    // Right after mount, initialize() hasn't resolved yet — the spinner should be showing,
    // not a fixed timer deciding when to leave.
    expect(startup.querySelector('.startup-spinner')).toBeInTheDocument();

    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: 'ACC is loading' }));
  });

  it('opens the Add Entry picker when launched from the "Add entry" home-screen shortcut', async () => {
    window.history.pushState(null, '', '/?shortcut=add-entry&other=kept');
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    await screen.findByRole('dialog', { name: 'Add entry for…' });
    // The shortcut param is stripped so Back/refresh doesn't reopen the picker, but any other
    // query params are left alone.
    expect(window.location.search).toBe('?other=kept');

    window.history.replaceState(null, '', '/');
  });

  it('opens the pay-period list from the strip on a salaried card', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const started = new Date();
    started.setDate(started.getDate() - 60);
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Strip team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: localDateString(started),
      });
    });

    await user.click(await findPersonSummary('Strip team'));
    await user.click(await screen.findByRole('button', { name: 'Show pay periods' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pay periods' });
    // Sixty days of a two-week salary: several periods, all in the list.
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(2);
  });

  it('records a stoppage from the pay-period list, shows its effect, then edits and deletes it', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const started = new Date();
    started.setDate(started.getDate() - 60);
    // Monday to Thursday of last week: always four working days, whatever today is.
    const from = new Date();
    from.setDate(from.getDate() - 8);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(to.getDate() + 3);
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Breakdown team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: localDateString(started),
      });
    });

    await user.click(await findPersonSummary('Breakdown team'));
    await user.click(await screen.findByRole('button', { name: 'Show pay periods' }));
    await user.click(await screen.findByRole('button', { name: '+ Add adjustment' }));

    const form = await screen.findByRole('dialog', { name: 'Add adjustment' });
    fireEvent.change(within(form).getByLabelText('First day of the stoppage'), {
      target: { value: localDateString(from) },
    });
    fireEvent.change(within(form).getByLabelText('Last day of the stoppage'), {
      target: { value: localDateString(to) },
    });
    // Four days at the period's daily rate: the preview says so before anything is saved.
    expect(await within(form).findByRole('status')).toHaveTextContent(/^4 days · −\d+€$/);
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const periods = await screen.findByRole('dialog', { name: 'Pay periods' });
    const line = await within(periods).findAllByRole('button', {
      name: /^Stoppage · \d days · −\d+€/,
    });
    expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toHaveLength(1);

    await user.click(line[0]!);
    const edit = await screen.findByRole('dialog', { name: 'Edit adjustment' });
    await user.click(within(edit).getByRole('button', { name: 'Delete' }));
    await user.click(within(edit).getByRole('button', { name: 'Tap again to delete' }));
    await waitFor(() =>
      expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toBeUndefined(),
    );
  });

  it('closes the Add Team form for good once the salary set-up it leads into is saved', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().setMode('work'));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Team' }));
    const form = await screen.findByRole('dialog', { name: 'Add Team' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Roof crew');
    await user.click(within(form).getByRole('checkbox', { name: 'Salaried employee' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    // Saving a salaried team hands over to the salary set-up…
    const setup = await screen.findByRole('dialog', { name: 'Set Up Salary' });
    fireEvent.change(within(setup).getByLabelText('Salary start date'), {
      target: { value: '2026-07-01' },
    });
    await user.type(within(setup).getByRole('spinbutton', { name: 'Monthly salary' }), '3000');
    await user.click(within(setup).getByRole('button', { name: 'Save' }));

    // …and once that is saved, nothing is left open — not the Add Team form behind it.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.getState().peopleByMode.work.map((person) => person.name)).toEqual(['Roof crew']);
    expect(store.getState().peopleByMode.work[0]?.salaryAmount).toBe(3000);
  });

  it('lets a stoppage amount be corrected, then reset back to the calculated one', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const started = new Date();
    started.setDate(started.getDate() - 60);
    // Monday to Thursday of last week: always four working days, whatever today is.
    const from = new Date();
    from.setDate(from.getDate() - 8);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(to.getDate() + 3);
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Half day team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: localDateString(started),
      });
    });

    await user.click(await findPersonSummary('Half day team'));
    await user.click(await screen.findByRole('button', { name: 'Show pay periods' }));
    await user.click(await screen.findByRole('button', { name: '+ Add adjustment' }));
    const form = await screen.findByRole('dialog', { name: 'Add adjustment' });
    fireEvent.change(within(form).getByLabelText('First day of the stoppage'), {
      target: { value: localDateString(from) },
    });
    fireEvent.change(within(form).getByLabelText('Last day of the stoppage'), {
      target: { value: localDateString(to) },
    });

    // Untouched, the amount is the calculated one: 4 working days x 125.
    const amount = within(form).getByLabelText(/^Amount to deduct/);
    expect(amount).toHaveValue(500);
    // Correct it (say a half day was worked): the preview follows, the calculated figure stays.
    await user.clear(amount);
    await user.type(amount, '437');
    expect(await within(form).findByRole('status')).toHaveTextContent(/^4 days · −437€$/);
    expect(within(form).getByText('Calculated: 500€')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const periods = await screen.findByRole('dialog', { name: 'Pay periods' });
    const lines = await within(periods).findAllByRole('button', { name: /^Stoppage · / });
    expect(lines.map((line) => line.textContent).join(' ')).toMatch(/−\d+€/);
    expect(store.getState().peopleByMode.work[0]?.salaryAdjustments?.[0]?.amount).toBe(437);

    // Reopen it: the typed amount is there, and Reset puts it back on the daily rate.
    await user.click(lines[0]!);
    const edit = await screen.findByRole('dialog', { name: 'Edit adjustment' });
    expect(within(edit).getByLabelText(/^Amount to deduct/)).toHaveValue(437);
    await user.click(within(edit).getByRole('button', { name: 'Reset to calculated' }));
    expect(within(edit).getByLabelText(/^Amount to deduct/)).toHaveValue(500);
    await user.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(store.getState().peopleByMode.work[0]?.salaryAdjustments?.[0]).not.toHaveProperty(
        'amount',
      ),
    );
  });

  it('records an adjustment straight from the Add Entry form, without going through Payroll', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Quick team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });

    await user.click(await findPersonSummary('Quick team'));
    await user.click(screen.getByRole('button', { name: /Add Entry/ }));
    const entry = await screen.findByRole('dialog', { name: /Add Entry/ });
    await user.click(within(entry).getByRole('button', { name: 'Adjustment' }));

    // The entry form hands over to the adjustment form — starting today, as it just happened.
    const form = await screen.findByRole('dialog', { name: 'Add adjustment' });
    expect(screen.queryByRole('dialog', { name: /Add Entry/ })).not.toBeInTheDocument();
    expect(within(form).getByLabelText('First day of the stoppage')).toHaveValue(localDateString());
    await user.click(within(form).getByRole('button', { name: 'Bonus' }));
    await user.type(within(form).getByLabelText(/^Amount/), '100');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    // Saved, and nothing is left open behind it — not the entry form it came from.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toMatchObject([
      { type: 'bonus', amount: 100, startDate: localDateString() },
    ]);
    // 'Paid now' is on by default, so the money handed over is on record too — not left as owed.
    expect(store.getState().peopleByMode.work[0]?.entries).toMatchObject([
      { amount: 100, type: 'Gave', category: 'salary', date: localDateString() },
    ]);
  });

  it('records no payment for a bonus when Paid now is switched off', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Later bonus team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const team = store.getState().peopleByMode.work[0]!;
    act(() => store.getState().openSheet('salary-adjustment', team.id));

    const form = await screen.findByRole('dialog', { name: 'Add adjustment' });
    await user.click(within(form).getByRole('button', { name: 'Bonus' }));
    await user.type(within(form).getByLabelText(/^Amount/), '250');
    await user.click(within(form).getByRole('checkbox', { name: 'Paid now' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toHaveLength(1),
    );
    expect(store.getState().peopleByMode.work[0]?.entries).toEqual([]);
  });

  it('deletes an adjustment by swiping its row and confirming, like an entry', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Swipe team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const team = store.getState().peopleByMode.work[0]!;
    await act(async () => {
      await store
        .getState()
        .setSalaryAdjustments(team.id, [
          { id: 'b1', type: 'bonus', startDate: '2026-07-10', amount: 100, note: 'good month' },
        ]);
    });

    await user.click(await findPersonSummary('Swipe team'));
    await user.click(await screen.findByRole('button', { name: /1 adjustment/ }));
    swipe(await screen.findByRole('button', { name: /good month/ }), 240, 120);
    await user.click(await screen.findByRole('button', { name: /^Delete adjustment · Bonus/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete adjustment?' });
    expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toHaveLength(1);
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toBeUndefined(),
    );
  });

  it('only offers Adjustment for someone with a salary, and not when editing an entry', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson(draft('No salary team'));
      await store.getState().addPerson({
        ...draft('Salaried team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const [plain, salaried] = ['No salary team', 'Salaried team'].map((name) =>
      store.getState().peopleByMode.work.find((person) => person.name === name)!,
    );
    await act(async () => {
      await store.getState().addEntry(salaried!.id, {
        amount: 50,
        type: 'Gave',
        date: '2026-08-01',
        comment: '',
        category: 'salary',
      });
    });

    await user.click(await findPersonSummary(plain!.name));
    await user.click(screen.getByRole('button', { name: /Add Entry/ }));
    const noSalary = await screen.findByRole('dialog', { name: /Add Entry/ });
    expect(within(noSalary).getByRole('button', { name: 'Salary' })).toBeInTheDocument();
    expect(within(noSalary).queryByRole('button', { name: 'Adjustment' })).not.toBeInTheDocument();
    pressBrowserBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Editing an existing entry of the salaried team: it is an entry being changed, not a new
    // record, so there's no hand-over to the adjustment form.
    const entryId = store.getState().peopleByMode.work.find((person) => person.id === salaried!.id)
      ?.entries[0]?.id;
    expect(entryId).toBeTruthy();
    act(() => store.getState().openSheet('entry-form', salaried!.id, entryId));
    const editing = await screen.findByRole('dialog', { name: 'Edit Entry' });
    expect(within(editing).queryByRole('button', { name: 'Adjustment' })).not.toBeInTheDocument();
  });

  it('sets a cycle date when setting a salary up, showing the short first period before saving', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().setMode('work'));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: 'Add Team' }));
    const form = await screen.findByRole('dialog', { name: 'Add Team' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Cycle crew');
    await user.click(within(form).getByRole('checkbox', { name: 'Salaried employee' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const setup = await screen.findByRole('dialog', { name: 'Set Up Salary' });
    // Work starts on a Wednesday; the pay cycle starts the Monday after.
    fireEvent.change(within(setup).getByLabelText('Salary start date'), {
      target: { value: '2026-08-12' },
    });
    await user.type(within(setup).getByRole('spinbutton', { name: 'Monthly salary' }), '3000');
    fireEvent.change(within(setup).getByLabelText(/^Cycle starts on/), {
      target: { value: '2026-08-17' },
    });
    // Wed-Sat is four working days at 3000 / 24 = 125.
    expect(
      await within(setup).findByText(/Short first period: 12\.08\.2026 – 17\.08\.2026 · 4 days/),
    ).toHaveTextContent('500€');
    await user.click(within(setup).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.getState().peopleByMode.work[0]?.salaryCycleDate).toBe('2026-08-17');
  });

  it('lets someone already set up opt in to a cycle date from the salary history', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Existing crew'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-08-12',
      });
    });
    expect(store.getState().peopleByMode.work[0]?.salaryCycleDate).toBeUndefined();

    await user.click(await findPersonSummary('Existing crew'));
    await user.click(await screen.findByRole('button', { name: /Change Salary/ }));
    const sync = await screen.findByRole('dialog', { name: 'Change Salary' });
    await user.click(within(sync).getByRole('button', { name: /past salary change/ }));
    const history = await screen.findByRole('dialog', { name: 'Manage Salary History' });
    fireEvent.change(within(history).getByLabelText(/^Cycle starts on/), {
      target: { value: '2026-08-17' },
    });
    expect(await within(history).findByText(/Short first period/)).toHaveTextContent('500€');
    await user.click(within(history).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(store.getState().peopleByMode.work[0]?.salaryCycleDate).toBe('2026-08-17'),
    );
  });

  it("shows a team's adjustments as one line on its card, opening into the list and its editor", async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Adjusted team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const team = store.getState().peopleByMode.work[0]!;
    await act(async () => {
      await store
        .getState()
        .setSalaryAdjustments(team.id, [
          { id: 'b1', type: 'bonus', startDate: '2026-07-10', amount: 100, note: 'good month' },
        ]);
    });

    await user.click(await findPersonSummary('Adjusted team'));
    const toggle = await screen.findByRole('button', { name: /1 adjustment/ });
    expect(within(toggle).getByText('+100€')).toBeInTheDocument();
    await user.click(toggle);
    await user.click(await screen.findByRole('button', { name: /good month/ }));
    expect(await screen.findByRole('dialog', { name: 'Edit adjustment' })).toBeVisible();
  });

  it('a bonus and its payment are linked: edited together, shown as a bonus, deleted together', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Linked team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const team = store.getState().peopleByMode.work[0]!;
    const current = () => store.getState().peopleByMode.work[0]!;

    // Add a bonus with the default 'Paid now': the payment is recorded and linked to it.
    act(() => store.getState().openSheet('salary-adjustment', team.id));
    let form = await screen.findByRole('dialog', { name: 'Add adjustment' });
    await user.click(within(form).getByRole('button', { name: 'Bonus' }));
    await user.type(within(form).getByLabelText(/^Amount/), '250');
    await user.type(within(form).getByLabelText(/^Note/), 'two days');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(current().salaryAdjustments).toHaveLength(1));
    const adjustmentId = current().salaryAdjustments![0]!.id;
    expect(current().entries).toHaveLength(1);
    expect(current().entries[0]).toMatchObject({
      amount: 250,
      comment: 'two days',
      adjustmentId,
    });

    // In the entries it reads as a bonus, in its own colour, not as plain Salary.
    await user.click(await findPersonSummary('Linked team'));
    const bonusTitle = document.querySelector('.entry-kind-bonus');
    expect(bonusTitle).toHaveTextContent('Bonus');

    // Editing the bonus keeps its payment in step.
    act(() => store.getState().openSheet('salary-adjustment', team.id, adjustmentId));
    form = await screen.findByRole('dialog', { name: 'Edit adjustment' });
    expect(within(form).getByRole('checkbox', { name: 'Paid now' })).toBeChecked();
    const amount = within(form).getByLabelText(/^Amount/);
    await user.clear(amount);
    await user.type(amount, '300');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(current().entries[0]?.amount).toBe(300));
    expect(current().entries).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Switching 'Paid now' off removes the payment but keeps the bonus.
    act(() => store.getState().openSheet('salary-adjustment', team.id, adjustmentId));
    form = await screen.findByRole('dialog', { name: 'Edit adjustment' });
    await user.click(within(form).getByRole('checkbox', { name: 'Paid now' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(current().entries).toEqual([]));
    expect(current().salaryAdjustments).toHaveLength(1);
  });

  it('one delete removes a bonus and its payment, and the confirmation says so', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Cascade team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });
    const team = store.getState().peopleByMode.work[0]!;
    await act(async () => {
      await store
        .getState()
        .setSalaryAdjustments(team.id, [
          { id: 'b1', type: 'bonus', startDate: '2026-07-10', amount: 100, note: 'good month' },
        ]);
      await store.getState().setAdjustmentPayment(team.id, 'b1', {
        amount: 100,
        type: 'Gave',
        date: '2026-07-10',
        comment: 'good month',
        category: 'salary',
      });
    });

    await user.click(await findPersonSummary('Cascade team'));
    await user.click(await screen.findByRole('button', { name: /1 adjustment/ }));
    swipe(await screen.findByRole('button', { name: /good month/ }), 240, 120);
    await user.click(await screen.findByRole('button', { name: /^Delete adjustment · Bonus/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete adjustment?' });
    expect(
      within(confirm).getByText(/The payment recorded with it will be deleted too\./),
    ).toBeVisible();
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(store.getState().peopleByMode.work[0]?.entries).toEqual([]));
    expect(store.getState().peopleByMode.work[0]?.salaryAdjustments).toBeUndefined();
  });

  it('lets you choose the rest days in Change Salary, and keeps Sunday as the default', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Rest day team'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
      });
    });

    await user.click(await findPersonSummary('Rest day team'));
    await user.click(await screen.findByRole('button', { name: /Change Salary/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Change Salary' });

    // Only Sunday is a rest day to begin with: 6 working days x 4 weeks = 24.
    expect(within(dialog).getByRole('button', { name: 'Sun' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: 'Sat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(dialog).getByText(/monthly salary ÷ 24/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Sat' }));
    expect(within(dialog).getByText(/monthly salary ÷ 20/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.getState().peopleByMode.work[0]?.salaryRestDays).toEqual([0, 6]);
  });

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
    expect(within(navigation).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
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

    await user.click(within(navigation).getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    await user.click(within(settings).getByRole('button', { name: 'Backup & Data' }));
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

  it('switches the whole app language from Settings, and remembers the choice', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });

    expect(within(navigation).getByText('Stats')).toBeInTheDocument();
    expect(within(navigation).queryByText('სტატისტიკა')).not.toBeInTheDocument();

    await user.click(within(navigation).getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    const languagePicker = within(settings).getByRole('group', { name: 'Language' });
    expect(within(languagePicker).getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(languagePicker).getByRole('button', { name: 'ქართული' }));
    expect(store.getState().language).toBe('ka');
    // The whole app is now in Georgian — the nav bar behind Settings, and Settings itself.
    expect(screen.getByRole('navigation', { name: 'მთავარი ნავიგაცია' })).toBeInTheDocument();
    expect(within(navigation).getByText('სტატისტიკა')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'პარამეტრები' })).toBeInTheDocument();
    expect(within(languagePicker).getByRole('button', { name: 'ქართული' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(languagePicker).getByRole('button', { name: 'English' }));
    expect(store.getState().language).toBe('en');
    expect(within(navigation).getByText('Stats')).toBeInTheDocument();

    // Pick Georgian again and confirm it survives a reload, same as theme/tagFilter do.
    await user.click(within(languagePicker).getByRole('button', { name: 'ქართული' }));
    expect(store.getState().language).toBe('ka');
    const reloaded = createAppStore({ repository: createAppRepository(database) });
    await reloaded.getState().initialize();
    expect(reloaded.getState().language).toBe('ka');
  });

  it('translates the Home screen (search, filters, mode switch, empty state) once Georgian is picked', async () => {
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));

    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No records yet' })).toBeInTheDocument();

    await act(async () => store.getState().setLanguage('ka'));

    expect(screen.getByPlaceholderText('ძებნა')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /აქტიური/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /დაარქ\./ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'პირადი' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'სამუშაო' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ჯერ არაფერია დამატებული' })).toBeInTheDocument();
  });

  it('translates the Payroll panel into Georgian', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Salaried team'),
        salaryEnabled: true,
        salaryAmount: 2000,
        salaryStartDate: '2026-07-01',
      });
      await store.getState().setLanguage('ka');
    });

    const summary = await findPersonSummary('Salaried team');
    await user.click(summary);

    expect(screen.getByText('ხელფასი')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ხელ\. შეცვლა/ })).toBeInTheDocument();
    expect(screen.getByText('დაწყება')).toBeInTheDocument();
    expect(screen.getByText('გადახდილი')).toBeInTheDocument();
  });

  it('translates the Entry form into Georgian, including a validation error', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('Georgian entry person'));
      await store.getState().setLanguage('ka');
    });

    const summary = await findPersonSummary('Georgian entry person');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /ჩანაწერის დამატება/ }));
    const dialog = screen.getByRole('dialog', { name: /ჩანაწერის დამატება/ });

    expect(within(dialog).getByText('თანხა')).toBeInTheDocument();
    expect(within(dialog).getByText('თარიღი')).toBeInTheDocument();
    expect(within(dialog).getByText('კომენტარი')).toBeInTheDocument();
    expect(within(dialog).getByText('არასავალდებულო')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'გაუქმება' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'შენახვა' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'შენახვა' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('თანხა სავალდებულოა');
  });

  it('translates the Person form into Georgian, including a validation error', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => store.getState().setLanguage('ka'));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('button', { name: /ადამიანი/ }));
    const dialog = screen.getByRole('dialog', { name: /ადამიანი/ });

    expect(within(dialog).getByText('სახელი')).toBeInTheDocument();
    expect(within(dialog).getByText('ტეგი')).toBeInTheDocument();
    expect(within(dialog).getByText('ვალუტა')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'გაუქმება' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'შენახვა' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('სახელი სავალდებულოა');
  });

  it('translates Change Salary, including the payment-timing picker options', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Already salaried'),
        salaryEnabled: true,
        salaryAmount: 2000,
        salaryStartDate: '2026-07-01',
      });
      await store.getState().setLanguage('ka');
    });

    const summary = await findPersonSummary('Already salaried');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /ხელ\. შეცვლა/ }));
    const dialog = screen.getByRole('dialog', { name: 'ხელ. შეცვლა' });

    expect(within(dialog).getByText('ახალი ციკლის დაწყების თარიღი')).toBeInTheDocument();
    expect(within(dialog).getByText('ახალი ყოველთვიური ხელფასი')).toBeInTheDocument();
    expect(within(dialog).getByText('გადახდის პერიოდი (კვირებში)')).toBeInTheDocument();
    expect(within(dialog).getByText('პერიოდი სრულდება')).toBeInTheDocument();
    expect(within(dialog).getByText('გადაგეხდება')).toBeInTheDocument();

    expect(within(dialog).getByText('გადახდის დრო')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', {
        name: 'დაყოვნების გარეშე — გადაიხდება პერიოდის დასრულების დღესვე',
      }),
    );
    const timingDialog = screen.getByRole('dialog', { name: 'გადახდის დრო' });
    expect(
      within(timingDialog).getByText('დაყოვნების გარეშე — გადაიხდება პერიოდის დასრულების დღესვე'),
    ).toBeInTheDocument();
    expect(
      within(timingDialog).getByText('გადაიხდება პერიოდის დასრულებიდან 2 კვირაში'),
    ).toBeInTheDocument();
  });

  it('translates Manage Salary History into Georgian, including a validation error', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('History person'),
        salaryEnabled: true,
        salaryAmount: 2000,
        salaryStartDate: '2026-07-01',
      });
      await store.getState().setLanguage('ka');
    });

    const summary = await findPersonSummary('History person');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /ხელ\. შეცვლა/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'ხელ. შეცვლა' });
    await user.click(within(syncDialog).getByRole('button', { name: /წარსული ხელფასის ცვლილება/ }));
    const historyDialog = screen.getByRole('dialog', { name: 'ხელფასის ისტორიის მართვა' });

    expect(within(historyDialog).getByText('საწყისი წერტილი')).toBeInTheDocument();
    expect(within(historyDialog).getByText('დაწყების თარიღი')).toBeInTheDocument();
    expect(within(historyDialog).getByText('საწყისი ხელფასი')).toBeInTheDocument();
    expect(
      within(historyDialog).getByRole('button', { name: /დაამატე ცვლილება/ }),
    ).toBeInTheDocument();

    const dateField = within(historyDialog).getByLabelText(/დაწყების თარიღი/);
    fireEvent.change(dateField, { target: { value: '' } });
    await user.click(within(historyDialog).getByRole('button', { name: 'შენახვა' }));
    expect(
      await within(historyDialog).findByText('ყველა ჩანაწერს თარიღი სჭირდება'),
    ).toBeInTheDocument();
  });

  it('translates confirmation dialogs into Georgian (delete, archive, discard)', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('Confirm person'));
      await store.getState().setLanguage('ka');
    });

    const summary = await findPersonSummary('Confirm person');
    swipe(summary, 100, 220);
    await user.click(screen.getByRole('button', { name: /დაარქივება Confirm person/ }));
    expect(screen.getByRole('dialog', { name: 'დავაარქივო?' })).toBeVisible();
    expect(
      screen.getByText('დარწმუნებული ხარ, რომ გინდა დაარქივო Confirm person?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'გაუქმება' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'დაარქივება' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'გაუქმება' }));
    expect(screen.queryByRole('dialog', { name: 'დავაარქივო?' })).not.toBeInTheDocument();

    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /ჩანაწერის დამატება/ }));
    const entryDialog = screen.getByRole('dialog', { name: /ჩანაწერის დამატება/ });
    await user.type(within(entryDialog).getByRole('spinbutton'), '5');
    pressBrowserBack();
    const discard = await screen.findByRole('dialog', { name: 'გავაუქმო ცვლილებები?' });
    expect(discard).toBeVisible();
    expect(screen.getByText('შენახული არ გაქვს ცვლილებები, დაიკარგება.')).toBeInTheDocument();
    expect(
      within(discard).getByRole('button', { name: 'გავაგრძელო რედაქტირება' }),
    ).toBeInTheDocument();
    expect(within(discard).getByRole('button', { name: 'გაუქმება' })).toBeInTheDocument();
  });

  it('translates Statistics into Georgian', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('Stats person'));
      await store.getState().setLanguage('ka');
    });

    await user.click(screen.getByRole('button', { name: 'სტატისტიკა' }));
    const dialog = screen.getByRole('dialog', { name: 'სტატისტიკა' });

    expect(within(dialog).getByRole('button', { name: 'აქტიური' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'დაარქ.' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'ყველა' })).toBeInTheDocument();
    expect(within(dialog).getByText('ადამიანები')).toBeInTheDocument();
    expect(within(dialog).getByText('ბალანსი')).toBeInTheDocument();
    expect(within(dialog).getByText('ბოლო 6 თვე')).toBeInTheDocument();
    expect(within(dialog).getByText('მისცა', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('მიიღო', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('სწრაფი შეჯამება')).toBeInTheDocument();
    expect(within(dialog).getByText('ჩანაწერები')).toBeInTheDocument();
    expect(within(dialog).getByText('საშუალო')).toBeInTheDocument();
    expect(within(dialog).getByText('ყველაზე აქტიური')).toBeInTheDocument();
    expect(within(dialog).getByText('ტოპ ბალანსები')).toBeInTheDocument();
    // No entries yet, so balance is 0 and Top Balances is empty — confirms that empty state too.
    expect(within(dialog).getByText('ღია ბალანსი არ არის')).toBeInTheDocument();
  });

  it('translates Data & Backup into Georgian, including the health card and PDF picker', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().addPerson(draft('Backup person'));
      await store.getState().setLanguage('ka');
    });

    await user.click(screen.getByRole('button', { name: 'პარამეტრები' }));
    const settings = screen.getByRole('dialog', { name: 'პარამეტრები' });
    await user.click(within(settings).getByRole('button', { name: /ბექაფი და მონაცემები/ }));
    const dialog = screen.getByRole('dialog', { name: 'მონაცემები და ბექაფი' });

    // Health card: no backup has ever been made, so this is the 'No backup yet' branch —
    // confirms the reconstructed detail text (not a direct t(health.detail) lookup) is correct.
    expect(within(dialog).getByText('ჯერ არ არის ბექაფი')).toBeInTheDocument();
    expect(
      within(dialog).getByText('გააკეთე JSON ბექაფი, რომ დაიცვა ამ მოწყობილობის მონაცემები.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'JSON ექსპორტი' })).toBeInTheDocument();
    expect(within(dialog).getByText('ღრუბლოვანი ბექაფი')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'შესვლა' })).toBeInTheDocument();
    expect(within(dialog).getByText('PDF რეპორტები')).toBeInTheDocument();
    expect(within(dialog).getByText('ACC-ის მონაცემების მიმოხილვა')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /ადამიანის არჩევა/ }));
    const picker = screen.getByRole('dialog', { name: 'ადამიანის არჩევა' });
    expect(within(picker).getByText('Backup person')).toBeInTheDocument();
    expect(within(picker).getByPlaceholderText('ადამიანების ძებნა')).toBeInTheDocument();
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

    await user.click(within(navigation).getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    await user.click(within(settings).getByRole('button', { name: 'Backup & Data' }));
    expect(screen.getByRole('dialog', { name: 'Data & Backup' })).toBeVisible();
    // Backup was reached by drilling into Settings, so Back returns one level — to Settings —
    // not all the way home.
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Data & Backup' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    pressBrowserBack();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument(),
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

  it('only shows the tag filter button in Work mode, filters the list and Statistics by it, and remembers the choice', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: 'ACC is loading' }));

    expect(screen.queryByRole('button', { name: 'Filter by tag' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: 'Filter by tag' })).toBeInTheDocument();

    await act(async () => {
      await store.getState().addPerson({
        ...draft('D-Builder team'),
        tagLabel: 'D-Builder',
        tagColor: TAG_COLORS[1],
      });
      // Same color as Badelix team below, different (typo'd) label — must group with it under
      // one filter entry, not split off into its own.
      await store.getState().addPerson({
        ...draft('badelix typo team'),
        tagLabel: 'badelix',
        tagColor: TAG_COLORS[0],
      });
      await store.getState().addPerson({
        ...draft('Badelix team'),
        tagLabel: 'Badelix',
        tagColor: TAG_COLORS[0],
      });
    });
    expect(await screen.findByText('Badelix team')).toBeInTheDocument();
    expect(screen.getByText('D-Builder team')).toBeInTheDocument();
    expect(screen.getByText('badelix typo team')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter by tag' }));
    expect(screen.getByRole('heading', { name: 'Filter by tag' })).toBeInTheDocument();
    const options = screen.getByRole('listbox');
    expect(within(options).getByRole('option', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Always All plus the fixed 3-color palette — never text labels, and never one entry per
    // label (the typo'd team doesn't get its own entry).
    expect(within(options).getAllByRole('option')).toHaveLength(1 + TAG_COLORS.length);
    await user.click(within(options).getByRole('option', { name: `Tag color ${TAG_COLORS[0]}` }));

    // Selecting applies immediately and closes the sheet.
    expect(screen.queryByRole('heading', { name: 'Filter by tag' })).not.toBeInTheDocument();
    expect(screen.getByText('Badelix team')).toBeInTheDocument();
    expect(screen.getByText('badelix typo team')).toBeInTheDocument();
    expect(screen.queryByText('D-Builder team')).not.toBeInTheDocument();

    // Statistics respects the same filter: both Badelix-colored teams are counted.
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    const teamsLabel = within(screen.getByRole('dialog')).getByText('Teams');
    expect(teamsLabel.nextElementSibling).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Switching to Personal hides the button but keeps the choice; switching back restores it.
    await user.click(screen.getByRole('button', { name: 'Personal' }));
    expect(screen.queryByRole('button', { name: 'Filter by tag' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.queryByText('D-Builder team')).not.toBeInTheDocument();
    expect(store.getState().tagFilter).toBe(TAG_COLORS[0]);
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
    // Empty and with no grey '0' hint either — it looked like a value that had to be deleted.
    expect(amount).not.toHaveAttribute('placeholder');
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

  it('banks the old rate when the salary amount changes through Change Salary', async () => {
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
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });
    const amountField = within(syncDialog).getByRole('spinbutton', { name: /monthly salary/i });
    await user.clear(amountField);
    await user.type(amountField, '3000');
    await user.click(within(syncDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryAmount).toBe(3000);
    });
  }, 15_000);

  it('editing Team no longer shows salary amount/schedule fields; toggling salary on opens Change Salary to configure it', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson(draft('Fresh hire'));
    });

    const summary = await findPersonSummary('Fresh hire');
    await longPress(summary);
    const editDialog = screen.getByRole('dialog', { name: 'Edit Team' });
    expect(
      within(editDialog).queryByRole('spinbutton', { name: /monthly salary/i }),
    ).not.toBeInTheDocument();
    expect(
      within(editDialog).queryByRole('spinbutton', { name: /Pay period/i }),
    ).not.toBeInTheDocument();

    await user.click(within(editDialog).getByRole('checkbox', { name: 'Salaried employee' }));
    await user.click(within(editDialog).getByRole('button', { name: 'Save' }));

    const setupDialog = await screen.findByRole('dialog', { name: 'Set Up Salary' });
    const startDateField = within(setupDialog).getByLabelText('Salary start date');
    fireEvent.change(startDateField, { target: { value: '2026-09-01' } });
    const amountField = within(setupDialog).getByRole('spinbutton', { name: /monthly salary/i });
    await user.clear(amountField);
    await user.type(amountField, '2500');
    await user.click(within(setupDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store
        .getState()
        .peopleByMode.work.find((candidate) => candidate.name === 'Fresh hire');
      expect(person?.salaryAmount).toBe(2500);
      expect(person?.salaryStartDate).toBe('2026-09-01');
    });
  }, 15_000);

  it('keeps an archived (finished working) salaried person visible in Active until their balance is fully paid', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      // Started well in the past with a 1-week period and no entries at all, so there's
      // definitely an unpaid balance by the time this test runs, regardless of today's exact date.
      const created = await store.getState().addPerson({
        ...draft('Finished worker'),
        salaryEnabled: true,
        salaryAmount: 400,
        salaryStartDate: '2026-01-01',
        salaryPayPeriodWeeks: 1,
      });
      personId = created.id;
      await store.getState().toggleArchive(personId);
    });

    // Still shows under the default Active filter — the outstanding balance keeps them visible.
    expect(await findPersonSummary('Finished worker')).toBeInTheDocument();

    // Fully settle the balance with one large payment.
    await act(async () => {
      await store.getState().addEntry(personId, {
        amount: 100000,
        type: 'Gave',
        date: new Date().toISOString().slice(0, 10),
        comment: '',
        category: 'salary',
      });
    });

    // Now that it's settled, they disappear from Active (still findable under Archived).
    await waitFor(() => expect(screen.queryByText('Finished worker')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Archived/ }));
    expect(await findPersonSummary('Finished worker')).toBeInTheDocument();
  }, 15_000);

  it('changes the pay period cadence through the Change Salary form', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('Cadence target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-08-06',
        salaryPayPeriodWeeks: 1,
      });
      personId = person.id;
    });

    const summary = await findPersonSummary('Cadence target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });

    const periodField = within(syncDialog).getByRole('spinbutton', {
      name: /Pay period/,
    });
    await user.clear(periodField);
    await user.type(periodField, '2');
    await user.click(within(syncDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryPayPeriodWeeks).toBe(2);
    });
  }, 15_000);

  it('does not silently create a phantom advance-payment entry when only Pay period is changed', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      // Started a while back with a 1-week period, so there's a real accrued/owed balance —
      // exactly the risky condition where a stale 'One-time adjustment' pre-fill used to bite.
      const person = await store.getState().addPerson({
        ...draft('No phantom entry target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-01',
        salaryPayPeriodWeeks: 1,
      });
      personId = person.id;
    });
    const entriesBefore = store.getState().peopleByMode.work.find((p) => p.id === personId)!.entries
      .length;

    const summary = await findPersonSummary('No phantom entry target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });

    const adjustmentField = within(syncDialog).getByRole('spinbutton', {
      name: /One-time adjustment/,
    });
    expect((adjustmentField as HTMLInputElement).value).toBe('0');

    const periodField = within(syncDialog).getByRole('spinbutton', { name: /Pay period/ });
    await user.clear(periodField);
    await user.type(periodField, '2');
    await user.click(within(syncDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryPayPeriodWeeks).toBe(2);
      expect(person?.entries.length).toBe(entriesBefore);
    });
  }, 15_000);

  it('shows a live preview that separates the period-end date from the actual pay date when a delay applies', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Preview target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-09-09',
        salaryPayPeriodWeeks: 2,
      });
    });

    const summary = await findPersonSummary('Preview target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });

    const preview = syncDialog.querySelector('.schedule-preview') as HTMLElement;
    expect(preview).toBeInTheDocument();
    expect(within(preview).getByText('Period ends')).toBeInTheDocument();
    expect(within(preview).getByText("You'll be paid")).toBeInTheDocument();
    const [periodEndsValue, paidByValue] = preview.querySelectorAll('strong');
    expect(periodEndsValue?.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(paidByValue?.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  }, 15_000);

  it('the schedule preview always shows the first period from the chosen date, independent of what today happens to be', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      await store.getState().setMode('work');
      await store.getState().addPerson({
        ...draft('Deterministic preview target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        // Deliberately a start date well in the past relative to whenever this test runs, so a
        // 'today'-dependent preview would show a much later period than the very first one.
        salaryStartDate: '2020-01-01',
        salaryPayPeriodWeeks: 2,
      });
    });

    const summary = await findPersonSummary('Deterministic preview target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });
    const preview = syncDialog.querySelector('.schedule-preview') as HTMLElement;

    // The very first 2-week period from 2020-01-01 ends 2020-01-15, regardless of today's date.
    const [periodEndsValue] = preview.querySelectorAll('strong');
    expect(periodEndsValue?.textContent).toBe('15.01.2020');

    // Changing Pay period must reactively change this, distinctly from the (today-independent)
    // value above.
    const periodField = within(syncDialog).getByRole('spinbutton', { name: /Pay period/ });
    await user.clear(periodField);
    await user.type(periodField, '1');
    await waitFor(() => {
      const [updated] = preview.querySelectorAll('strong');
      expect(updated?.textContent).toBe('08.01.2020');
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
    const rows = historyDialog.querySelectorAll('.salary-history-edit-card');
    expect(rows.length).toBe(2);
    const newRow = rows[1]!;
    const dateInput = newRow.querySelector('input[type="date"]')!;
    const amountInput = newRow.querySelector('input[inputmode="decimal"]')!;
    fireEvent.change(dateInput, { target: { value: '2026-08-12' } });
    fireEvent.change(amountInput, { target: { value: '3000' } });
    await user.click(within(historyDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryAmount).toBe(3000);
      expect(person?.salaryPeriodAnchorDate).toBe('2026-08-12');
      // One completed 2-week period (29/07-12/08) at the OLD 2000/month rate = 1000 owed.
      const owed = calculateSalary(person!, new Date(2026, 7, 12, 12));
      expect(owed.accrued).toBe(1000);
    });
  }, 15_000);

  it('lets a pre-filled amount field in Manage Salary History be fully cleared and retyped', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    let personId = '';
    await act(async () => {
      await store.getState().setMode('work');
      const person = await store.getState().addPerson({
        ...draft('Clear field target'),
        salaryEnabled: true,
        salaryAmount: 3000,
        salaryStartDate: '2026-07-29',
        salaryPayPeriodWeeks: 2,
      });
      personId = person.id;
    });

    const summary = await findPersonSummary('Clear field target');
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: /Change Salary/ }));
    const syncDialog = screen.getByRole('dialog', { name: 'Change Salary' });
    await user.click(
      within(syncDialog).getByRole('button', { name: /Correct or add a past salary change/ }),
    );

    const historyDialog = await screen.findByRole('dialog', { name: 'Manage Salary History' });
    // Starting salary is pre-filled with 3000 (the person's current rate, no history yet).
    const startingSalaryInput = historyDialog.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(startingSalaryInput.value).toBe('3000');

    // Clearing it fully, then typing a fresh number, must result in exactly that number — not a
    // value stuck prefixed with a leftover 0 (e.g. '02000') because the field snapped back to 0
    // on every keystroke instead of allowing a truly empty intermediate state.
    await user.clear(startingSalaryInput);
    expect(startingSalaryInput.value).toBe('');
    await user.type(startingSalaryInput, '2000');
    expect(startingSalaryInput.value).toBe('2000');

    await user.click(within(historyDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const person = store.getState().peopleByMode.work.find((p) => p.id === personId);
      expect(person?.salaryAmount).toBe(2000);
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

  it('shows entries in date order, not insertion order, so a backdated entry lands in its correct spot', async () => {
    const user = userEvent.setup();
    const store = renderApp();
    await waitFor(() => expect(store.getState().initialized).toBe(true));
    await act(async () => {
      const person = await store.getState().addPerson(draft('Dated target'));
      // Added in this order: recent, middle, then a backdated one last — insertion order would
      // put 'backdated' first (most recently added); date order must put it last instead.
      await store
        .getState()
        .addEntry(person.id, { amount: 10, type: 'Gave', date: '2026-09-20', comment: 'recent' });
      await store
        .getState()
        .addEntry(person.id, { amount: 20, type: 'Gave', date: '2026-09-10', comment: 'middle' });
      await store.getState().addEntry(person.id, {
        amount: 30,
        type: 'Gave',
        date: '2026-08-01',
        comment: 'backdated',
      });
    });

    const summary = await findPersonSummary('Dated target');
    await user.click(summary);
    const card = summary.closest('.person-card') as HTMLElement;
    await waitFor(() => expect(within(card).getByText('recent')).toBeInTheDocument());

    const commentNodes = card.querySelectorAll('.entry-comment');
    const order = Array.from(commentNodes).map((node) => node.textContent);
    expect(order).toEqual(['recent', 'middle', 'backdated']);
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
