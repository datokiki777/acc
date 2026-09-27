import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { BottomSheet } from '../../components/BottomSheet';
import { PickerField } from '../../components/PickerField';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { addDays, computeSalaryPayDate } from '../../domain/pay-dates';
import { calculateSalary } from '../../domain/salary';
import { PAY_DELAY_OPTIONS } from '../../domain/salary-options';
import { useAppStore } from '../../store/hooks';
import type { PayDelayMode } from '../../types/domain';
import { formatDate, formatMoney, localDateString } from '../../utils/format';

interface SyncForm {
  adjustmentAmount: number;
  effectiveDate: string;
  amount: number;
  payDelayMode: PayDelayMode;
  periodWeeks: number;
}

export function SalarySyncSheet() {
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  const sync = useAppStore((state) => state.syncSalary);
  const openSheet = useAppStore((state) => state.openSheet);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const [error, setError] = useState('');
  const salary = person ? calculateSalary(person, new Date()) : null;
  const owed = salary ? Math.max(0, salary.accrued - salary.paid) : 0;
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty, isSubmitting },
  } = useForm<SyncForm>({
    defaultValues: {
      adjustmentAmount: 0,
      effectiveDate: person?.salaryPeriodAnchorDate ?? person?.salaryStartDate ?? localDateString(),
      amount: person?.salaryAmount ?? 0,
      payDelayMode: person?.salaryPayDelayMode ?? 'none',
      periodWeeks: Number(person?.salaryPayPeriodWeeks ?? person?.salaryPayDay ?? 2),
    },
  });
  const payDelayMode = useWatch({ control, name: 'payDelayMode' });
  const watchedEffectiveDate = useWatch({ control, name: 'effectiveDate' });
  const watchedPeriodWeeks = useWatch({ control, name: 'periodWeeks' });
  useUnsavedForm(isDirty);
  if (!person || !salary) return null;
  const wasConfigured = Boolean(person.salaryAmount && person.salaryStartDate);

  const previewDate = watchedEffectiveDate || person.salaryStartDate || localDateString();
  const previewPeriodWeeks =
    Number.isFinite(watchedPeriodWeeks) && watchedPeriodWeeks > 0
      ? watchedPeriodWeeks
      : Number(person.salaryPayPeriodWeeks ?? person.salaryPayDay ?? 2);
  // Deliberately independent of 'today': always the FIRST period from the chosen start date, so
  // the preview stays a stable, predictable readout of "date + period + timing" alone — it won't
  // silently jump ahead to a later period just because today happens to already be past the
  // first one.
  const previewDueDate = addDays(previewDate, previewPeriodWeeks * 7);
  const previewPayDate = computeSalaryPayDate(previewDueDate, payDelayMode);

  const submit = handleSubmit(async (values) => {
    if (!values.effectiveDate) {
      setError(wasConfigured ? 'New cycle date is required' : 'Start date is required');
      return;
    }
    const amount = Number(values.amount);
    if (!(Number.isFinite(amount) && amount > 0)) {
      setError('Monthly salary is required');
      return;
    }
    try {
      await sync(
        person.id,
        values.adjustmentAmount,
        values.effectiveDate,
        amount,
        values.payDelayMode,
        values.periodWeeks,
      );
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update salary');
    }
  });

  return (
    <BottomSheet onClose={requestClose} title={wasConfigured ? 'Change Salary' : 'Set Up Salary'}>
      <form autoComplete="off" className="form-grid" onSubmit={(event) => void submit(event)}>
        {wasConfigured && (
          <p className="inline-note">
            Earned but not yet paid: <strong>{formatMoney(owed, salary.currency, false)}</strong>
          </p>
        )}
        {wasConfigured && (
          <button
            className="text-button"
            onClick={() => openSheet('salary-history', person.id)}
            type="button"
          >
            ✎ Correct or add a past salary change…
          </button>
        )}
        <label className="field">
          <span>{wasConfigured ? 'New cycle start date' : 'Salary start date'}</span>
          <input autoComplete="off" type="date" {...register('effectiveDate')} />
          {wasConfigured && <small>Only resets the schedule if you change this date.</small>}
        </label>
        <label className="field">
          <span>{wasConfigured ? 'New monthly salary' : 'Monthly salary'}</span>
          <input
            autoComplete="off"
            inputMode="decimal"
            min={0}
            step={1}
            type="number"
            {...register('amount', { valueAsNumber: true })}
          />
          {wasConfigured && (
            <small>Applies from the date above onward. Leave as-is to keep the current rate.</small>
          )}
        </label>
        <label className="field">
          <span>Pay period (weeks)</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            max={52}
            min={1}
            step={1}
            type="number"
            {...register('periodWeeks', { valueAsNumber: true })}
          />
          <small>
            How often salaries recur — 2 means every 2 weeks, going forward from the date above.
          </small>
        </label>
        <PickerField
          label="Payment timing"
          onChange={(next) => setValue('payDelayMode', next as PayDelayMode, { shouldDirty: true })}
          options={PAY_DELAY_OPTIONS}
          value={payDelayMode}
        />
        <div className="schedule-preview">
          <div>
            <small>Period ends</small>
            <strong>{formatDate(previewDueDate)}</strong>
          </div>
          <div>
            <small>You'll be paid</small>
            <strong className={previewDueDate !== previewPayDate ? 'is-delayed' : undefined}>
              {formatDate(previewPayDate)}
            </strong>
          </div>
        </div>
        {previewDueDate !== previewPayDate && (
          <p className="inline-note">
            Payment timing adds a delay <em>on top of</em> the pay period above — it doesn't change
            how often periods happen. Pick "No delay" if you just want to be paid the day each
            period ends.
          </p>
        )}
        {wasConfigured && (
          <label className="field">
            <span>One-time adjustment</span>
            <input
              autoComplete="off"
              inputMode="decimal"
              min={0}
              step={1}
              type="number"
              {...register('adjustmentAmount', { valueAsNumber: true })}
            />
            <small>
              Records an extra payment today, if you type an amount here. Leave at 0 to add nothing
              — this won't happen automatically.
            </small>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="secondary-button" onClick={requestClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            Save
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
