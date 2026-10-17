import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { useTranslation } from '../../i18n/useTranslation';
import type { EntryDraft } from '../../store/app-store';
import { useAppStore } from '../../store/hooks';
import { localDateString } from '../../utils/format';

const entrySchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Amount is required')
    .refine((value) => Number.isFinite(Number(value)), 'Enter a valid amount')
    .transform(Number)
    .pipe(z.number().min(1, 'Amount must be at least 1')),
  type: z.enum(['Gave', 'Received']),
  date: z.string().min(1, 'Date is required'),
  comment: z.string(),
  category: z.enum(['salary', 'gift']).optional(),
});

type EntryFormValues = Omit<EntryDraft, 'amount'> & { amount: string };

export function EntryFormSheet() {
  const t = useTranslation();
  const mode = useAppStore((state) => state.mode);
  const personId = useAppStore((state) => state.ui.personId);
  const entryId = useAppStore((state) => state.ui.entryId);
  const people = useAppStore((state) => state.peopleByMode[state.mode]);
  const addEntry = useAppStore((state) => state.addEntry);
  const editEntry = useAppStore((state) => state.editEntry);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const person = people.find((candidate) => candidate.id === personId);
  const existing = person?.entries.find((candidate) => candidate.id === entryId);
  const [formError, setFormError] = useState('');
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<EntryFormValues>({
    defaultValues: {
      amount: existing ? String(existing.amount) : '',
      type: existing?.type ?? 'Gave',
      date: existing?.date ?? localDateString(),
      comment: existing?.comment ?? '',
      ...(mode === 'work' ? { category: existing?.category ?? 'gift' } : {}),
    },
  });
  const type = useWatch({ control, name: 'type' });
  const category = useWatch({ control, name: 'category' });
  useUnsavedForm(isDirty);
  if (!person) return null;

  const submit = handleSubmit(async (raw) => {
    const { category: ignoredCategory, ...personalEntry } = raw;
    void ignoredCategory;
    const candidate = mode === 'work' ? raw : personalEntry;
    const result = entrySchema.safeParse(candidate);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? 'Check the entry');
      return;
    }
    const draft: EntryDraft = {
      amount: result.data.amount,
      type: result.data.type,
      date: result.data.date,
      comment: result.data.comment,
      ...(result.data.category ? { category: result.data.category } : {}),
    };
    try {
      if (existing) await editEntry(person.id, existing.id, draft);
      else await addEntry(person.id, draft);
      closeAfterSave();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save entry');
    }
  });

  return (
    <BottomSheet
      onClose={requestClose}
      title={existing ? t('Edit Entry') : `${t('Add Entry')} · ${person.name}`}
    >
      <form autoComplete="off" className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>{t('Amount')}</span>
          <input
            autoComplete="off"
            autoFocus
            inputMode="decimal"
            min={1}
            step={1}
            type="number"
            {...register('amount')}
          />
        </label>

        {mode === 'work' && (
          <div className="field choice-panel kind-panel">
            <span>{t('Kind')}</span>
            <div className="choice-row">
              <button
                aria-pressed={category === 'salary'}
                className={category === 'salary' ? 'choice-button is-selected' : 'choice-button'}
                onClick={() => setValue('category', 'salary', { shouldDirty: true })}
                type="button"
              >
                {t('Salary')}
              </button>
              <button
                aria-pressed={category === 'gift'}
                className={category === 'gift' ? 'choice-button is-selected' : 'choice-button'}
                onClick={() => setValue('category', 'gift', { shouldDirty: true })}
                type="button"
              >
                {t('Other')}
              </button>
            </div>
          </div>
        )}

        <div className="field choice-panel">
          <span>{category === 'salary' ? t('Direction') : t('Type')}</span>
          <div className="choice-row">
            <button
              aria-pressed={type === 'Gave'}
              className={
                type === 'Gave' ? 'choice-button is-selected choice-gave' : 'choice-button'
              }
              onClick={() => setValue('type', 'Gave', { shouldDirty: true })}
              type="button"
            >
              {category === 'salary' ? `↗ ${t('Paid')}` : `↗ ${t('Gave')}`}
            </button>
            <button
              aria-pressed={type === 'Received'}
              className={
                type === 'Received' ? 'choice-button is-selected choice-received' : 'choice-button'
              }
              onClick={() => setValue('type', 'Received', { shouldDirty: true })}
              type="button"
            >
              {category === 'salary' ? `↘ ${t('Refunded')}` : `↘ ${t('Received')}`}
            </button>
          </div>
        </div>

        <label className="field">
          <span>{t('Date')}</span>
          <input autoComplete="off" type="date" {...register('date')} />
        </label>
        <label className="field">
          <span>
            {t('Comment')} <small>{t('optional')}</small>
          </span>
          <textarea
            autoCapitalize="sentences"
            autoComplete="off"
            inputMode="text"
            rows={3}
            spellCheck
            {...register('comment')}
          />
        </label>
        {formError && (
          <p className="form-error" role="alert">
            {t(formError)}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary-button" onClick={requestClose} type="button">
            {t('Cancel')}
          </button>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {t('Save')}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
