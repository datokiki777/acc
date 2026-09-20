import { useMemo, useState } from 'react';

import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import { useAppStore } from '../../store/hooks';
import { formatDate, formatMoney, localDateString } from '../../utils/format';

interface TimelineRow {
  id: string;
  effectiveDate: string;
  amount: number;
}

function makeRowId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function SalaryHistorySheet() {
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  const updateTimeline = useAppStore((state) => state.updateSalaryTimeline);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedHistory = useMemo(
    () =>
      [...(person?.salaryHistory ?? [])].sort((first, second) =>
        first.effectiveDate < second.effectiveDate
          ? -1
          : first.effectiveDate > second.effectiveDate
            ? 1
            : 0,
      ),
    [person],
  );
  const [initialAmount, setInitialAmount] = useState(() =>
    sortedHistory.length > 0 ? sortedHistory[0]!.previousAmount : (person?.salaryAmount ?? 0),
  );
  const [rows, setRows] = useState<TimelineRow[]>(() =>
    sortedHistory.map((change) => ({
      id: makeRowId(),
      effectiveDate: change.effectiveDate,
      amount: change.newAmount,
    })),
  );

  if (!person) return null;
  const currency = person.salaryCurrency ?? person.currency;

  function addRow() {
    setRows((current) => [
      ...current,
      { id: makeRowId(), effectiveDate: localDateString(), amount: person?.salaryAmount ?? 0 },
    ]);
  }

  function updateRow(id: string, patch: Partial<Omit<TimelineRow, 'id'>>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function submit() {
    setError('');
    if (rows.some((row) => !row.effectiveDate)) {
      setError('Every change needs a date');
      return;
    }
    setIsSubmitting(true);
    try {
      await updateTimeline(
        person!.id,
        initialAmount,
        rows.map(({ effectiveDate, amount }) => ({ effectiveDate, amount })),
      );
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update salary history');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BottomSheet onClose={requestClose} title="Manage Salary History">
      <div className="form-grid">
        <p className="inline-note">
          Correct or add any past salary change — the schedule and amounts owed recalculate from
          this full timeline.
        </p>
        <label className="field">
          <span>Starting salary (from {formatDate(person.salaryStartDate ?? '')})</span>
          <input
            autoComplete="off"
            inputMode="decimal"
            min={0}
            onChange={(event) => setInitialAmount(Number(event.target.value))}
            step={1}
            type="number"
            value={initialAmount}
          />
        </label>
        {rows.map((row) => (
          <div className="salary-history-edit-row" key={row.id}>
            <input
              autoComplete="off"
              onChange={(event) => updateRow(row.id, { effectiveDate: event.target.value })}
              type="date"
              value={row.effectiveDate}
            />
            <input
              autoComplete="off"
              inputMode="decimal"
              min={0}
              onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) })}
              step={1}
              type="number"
              value={row.amount}
            />
            <button
              aria-label="Remove this change"
              className="text-button"
              onClick={() => removeRow(row.id)}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="text-button" onClick={addRow} type="button">
          + Add change
        </button>
        <p className="inline-note">
          Current rate: <strong>{formatMoney(person.salaryAmount ?? 0, currency, false)}</strong>
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="secondary-button" onClick={requestClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => void submit()}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
