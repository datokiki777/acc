import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { BottomSheet } from '../../components/BottomSheet';
import { PickerField } from '../../components/PickerField';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { calculateSalary } from '../../domain/salary';
import { PAY_DELAY_OPTIONS } from '../../domain/salary-options';
import { useAppStore } from '../../store/hooks';
import type { PayDelayMode } from '../../types/domain';
import { formatMoney, localDateString } from '../../utils/format';

interface SyncForm {
  adjustmentAmount: number;
  newAnchorDate: string;
  newAmount: number;
  payDelayMode: PayDelayMode;
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
      adjustmentAmount: owed,
      newAnchorDate: person?.salaryPeriodAnchorDate ?? person?.salaryStartDate ?? localDateString(),
      newAmount: person?.salaryAmount ?? 0,
      payDelayMode: person?.salaryPayDelayMode ?? 'none',
    },
  });
  const payDelayMode = useWatch({ control, name: 'payDelayMode' });
  useUnsavedForm(isDirty);
  if (!person || !salary) return null;

  const submit = handleSubmit(async (values) => {
    if (!values.newAnchorDate) {
      setError('New cycle date is required');
      return;
    }
    try {
      const newAmount = Number(values.newAmount);
      await sync(
        person.id,
        values.adjustmentAmount,
        values.newAnchorDate,
        Number.isFinite(newAmount) && newAmount > 0 ? newAmount : undefined,
        values.payDelayMode,
      );
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update salary');
    }
  });

  return (
    <BottomSheet onClose={requestClose} title="Change Salary">
      <form autoComplete="off" className="form-grid" onSubmit={(event) => void submit(event)}>
        <p className="inline-note">
          Earned but not yet paid: <strong>{formatMoney(owed, salary.currency, false)}</strong>
        </p>
        <button
          className="text-button"
          onClick={() => openSheet('salary-history', person.id)}
          type="button"
        >
          ✎ Correct or add a past salary change…
        </button>
        <label className="field">
          <span>New cycle start date</span>
          <input autoComplete="off" type="date" {...register('newAnchorDate')} />
          <small>Only resets the schedule if you change this date.</small>
        </label>
        <label className="field">
          <span>New monthly salary</span>
          <input
            autoComplete="off"
            inputMode="decimal"
            min={0}
            step={1}
            type="number"
            {...register('newAmount', { valueAsNumber: true })}
          />
          <small>Applies from the date above onward. Leave as-is to keep the current rate.</small>
        </label>
        <PickerField
          label="Payment timing"
          onChange={(next) => setValue('payDelayMode', next as PayDelayMode, { shouldDirty: true })}
          options={PAY_DELAY_OPTIONS}
          value={payDelayMode}
        />
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
          <small>An extra payment to record on the date above, if any.</small>
        </label>
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
