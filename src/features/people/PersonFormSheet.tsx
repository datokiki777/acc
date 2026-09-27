import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { BottomSheet } from '../../components/BottomSheet';
import { PickerField } from '../../components/PickerField';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { TAG_COLORS } from '../../domain/tag-colors';
import type { PersonDraft } from '../../store/app-store';
import { useAppStore } from '../../store/hooks';
import type { Currency } from '../../types/domain';

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'EUR', label: 'EUR €' },
  { value: 'USD', label: 'USD $' },
  { value: 'GEL', label: 'GEL ₾' },
  { value: 'CAD', label: 'CAD C$' },
];

const personSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  currency: z.enum(['EUR', 'USD', 'GEL', 'CAD']),
  tagLabel: z.string().trim().max(20),
  tagColor: z.string(),
  salaryEnabled: z.boolean(),
  salaryAmount: z.number().min(0),
  salaryStartDate: z.string(),
  salaryEndDate: z.string(),
  salaryPayPeriodWeeks: z.number().int().min(1).max(52),
  salaryPayDelayMode: z.enum(['none', '2weeks', '4weeks', 'firstOfMonth']),
});

export function PersonFormSheet() {
  const mode = useAppStore((state) => state.mode);
  const people = useAppStore((state) => state.peopleByMode[state.mode]);
  const personId = useAppStore((state) => state.ui.personId);
  const addPerson = useAppStore((state) => state.addPerson);
  const editPerson = useAppStore((state) => state.editPerson);
  const openSheet = useAppStore((state) => state.openSheet);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const existing = people.find((person) => person.id === personId);
  const [formError, setFormError] = useState('');
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<PersonDraft>({
    defaultValues: {
      name: existing?.name ?? '',
      currency: existing?.currency ?? 'EUR',
      tagLabel: existing?.tagLabel ?? '',
      tagColor: existing?.tagColor ?? '',
      salaryEnabled: Boolean(existing?.salaryAmount && existing.salaryStartDate),
      salaryAmount: existing?.salaryAmount ?? 0,
      salaryStartDate: existing?.salaryStartDate ?? '',
      salaryEndDate: existing?.salaryEndDate ?? '',
      salaryPayPeriodWeeks: Number(existing?.salaryPayPeriodWeeks ?? existing?.salaryPayDay ?? 2),
      salaryPayDelayMode: existing?.salaryPayDelayMode ?? 'none',
    },
  });
  const salaryEnabled = useWatch({ control, name: 'salaryEnabled' });
  const tagColor = useWatch({ control, name: 'tagColor' });
  const currency = useWatch({ control, name: 'currency' });
  useUnsavedForm(isDirty);

  const wasSalaried = Boolean(existing?.salaryAmount && existing.salaryStartDate);

  const submit = handleSubmit(async (raw) => {
    const result = personSchema.safeParse(raw);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    try {
      const newlyEnabled = result.data.salaryEnabled && !wasSalaried;
      let savedId: string;
      if (existing) {
        await editPerson(existing.id, result.data);
        savedId = existing.id;
      } else {
        savedId = (await addPerson(result.data)).id;
      }
      if (newlyEnabled) {
        // Amount, start date, and schedule are no longer collected here — Change Salary is the
        // one place that configures a salary, including for the very first time.
        openSheet('salary-sync', savedId);
      } else {
        closeAfterSave();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save');
    }
  });

  return (
    <BottomSheet
      onClose={requestClose}
      title={
        existing
          ? `Edit ${mode === 'work' ? 'Team' : 'Person'}`
          : `Add ${mode === 'work' ? 'Team' : 'Person'}`
      }
    >
      <form autoComplete="off" className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Name</span>
          <input
            autoCapitalize="words"
            autoComplete="off"
            autoFocus
            enterKeyHint="next"
            inputMode="text"
            maxLength={80}
            placeholder="Example: John"
            spellCheck={false}
            {...register('name')}
          />
        </label>

        <label className="field">
          <span>
            Tag <small>optional</small>
          </span>
          <input
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="next"
            inputMode="text"
            maxLength={20}
            placeholder="Family, Work…"
            spellCheck={false}
            {...register('tagLabel')}
          />
        </label>
        <div className="color-picker" role="group" aria-label="Tag color">
          <button
            aria-label="No tag color"
            className={
              !tagColor ? 'color-swatch is-selected color-none' : 'color-swatch color-none'
            }
            onClick={() => setValue('tagColor', '', { shouldDirty: true })}
            type="button"
          >
            ×
          </button>
          {TAG_COLORS.map((color) => (
            <button
              aria-label={`Tag color ${color}`}
              className={tagColor === color ? 'color-swatch is-selected' : 'color-swatch'}
              key={color}
              onClick={() => setValue('tagColor', color, { shouldDirty: true })}
              style={{ background: color }}
              type="button"
            />
          ))}
        </div>

        <PickerField
          disabled={Boolean(existing)}
          label="Currency"
          onChange={(next) => setValue('currency', next as Currency, { shouldDirty: true })}
          options={CURRENCY_OPTIONS}
          value={currency}
        />

        {mode === 'work' && (
          <>
            <label className="toggle-field">
              <span>Salaried employee</span>
              <input type="checkbox" {...register('salaryEnabled')} />
            </label>
            {salaryEnabled && wasSalaried && (
              <label className="field">
                <span>
                  Salary end date <small>optional</small>
                </span>
                <input autoComplete="off" type="date" {...register('salaryEndDate')} />
              </label>
            )}
            {salaryEnabled && !wasSalaried && (
              <p className="inline-note">
                Save, then set the monthly amount, start date, and schedule in Change Salary.
              </p>
            )}
          </>
        )}

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
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
