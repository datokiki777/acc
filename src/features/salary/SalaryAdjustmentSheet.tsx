import { useState } from 'react';

import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { calculatePeriodStatuses, getRestDays } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import { useAppStore } from '../../store/hooks';
import type { SalaryAdjustment, SalaryAdjustmentType } from '../../types/domain';
import { formatMoney, localDateString } from '../../utils/format';

const TYPES: { value: SalaryAdjustmentType; label: string }[] = [
  { value: 'stoppage', label: 'Stoppage' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'deduction', label: 'Deduction' },
];

function makeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `adj-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

interface FormState {
  type: SalaryAdjustmentType;
  startDate: string;
  endDate: string;
  amountText: string;
  /** Stoppage only: the amount was typed in, instead of following the daily rate. */
  amountEdited: boolean;
  note: string;
}

export function SalaryAdjustmentSheet() {
  const t = useTranslation();
  const personId = useAppStore((state) => state.ui.personId);
  const adjustmentId = useAppStore((state) => state.ui.entryId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  const setAdjustments = useAppStore((state) => state.setSalaryAdjustments);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const existing = person?.salaryAdjustments?.find((item) => item.id === adjustmentId);

  const [initial] = useState<FormState>(() => {
    const today = localDateString();
    return existing
      ? {
          type: existing.type,
          startDate: existing.startDate,
          endDate: existing.endDate ?? existing.startDate,
          amountText: existing.amount === undefined ? '' : String(existing.amount),
          amountEdited: existing.type === 'stoppage' && existing.amount !== undefined,
          note: existing.note ?? '',
        }
      : {
          type: 'stoppage',
          startDate: today,
          endDate: today,
          amountText: '',
          amountEdited: false,
          note: '',
        };
  });
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedForm(isDirty);

  if (!person) return null;
  const isStoppage = form.type === 'stoppage';
  const others = (person.salaryAdjustments ?? []).filter((item) => item.id !== existing?.id);

  function validate(): string {
    if (!form.startDate) return 'Pick a date';
    if (isStoppage && form.endDate < form.startDate)
      return 'The last day can’t be before the first';
    if (!isStoppage && !(Number(form.amountText) > 0)) return 'Enter an amount';
    if (
      isStoppage &&
      form.amountEdited &&
      !(form.amountText.trim() !== '' && Number(form.amountText) >= 0)
    )
      return 'Enter an amount';
    return '';
  }

  // withCustom = false gives the stoppage as the daily rate would price it, ignoring a typed amount
  // — that's the 'calculated' figure shown next to a corrected one.
  function build(id: string, withCustom = true): SalaryAdjustment {
    const note = form.note.trim();
    return {
      id,
      type: form.type,
      startDate: form.startDate,
      ...(isStoppage ? { endDate: form.endDate || form.startDate } : {}),
      ...(isStoppage ? {} : { amount: Math.round(Number(form.amountText)) }),
      ...(isStoppage && withCustom && form.amountEdited
        ? { amount: Math.round(Number(form.amountText)) }
        : {}),
      ...(note ? { note } : {}),
    };
  }

  function effectOf(candidate: SalaryAdjustment) {
    const periods = calculatePeriodStatuses(
      { ...person!, salaryAdjustments: [...others, candidate] },
      new Date(),
    );
    const applied = periods.flatMap((period) =>
      period.adjustments.filter((item) => item.id === candidate.id),
    );
    return {
      applied: applied.length,
      net: applied.reduce((sum, item) => sum + item.amount, 0),
      days: applied.reduce((sum, item) => sum + (item.days ?? 0), 0),
    };
  }

  const datesValid = Boolean(form.startDate) && !(isStoppage && form.endDate < form.startDate);
  const calculated =
    isStoppage && datesValid ? Math.abs(effectOf(build(existing?.id ?? 'preview', false)).net) : 0;
  const shownAmount = form.amountEdited
    ? form.amountText
    : calculated > 0
      ? String(calculated)
      : '';

  // What this would do to the pay periods, worked out the same way the periods themselves are —
  // so the number shown here is exactly the one that lands after saving.
  let preview = '';
  if (!validate()) {
    const effect = effectOf(build(existing?.id ?? 'preview'));
    if (effect.applied > 0) {
      preview = `${effect.days > 0 ? `${effect.days} ${t('days')} · ` : ''}${effect.net < 0 ? '−' : '+'}${formatMoney(Math.abs(effect.net), person.currency, false)}`;
    }
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setIsSubmitting(true);
    try {
      const next = existing
        ? (person!.salaryAdjustments ?? []).map((item) =>
            item.id === existing.id ? build(existing.id) : item,
          )
        : [...(person!.salaryAdjustments ?? []), build(makeId())];
      await setAdjustments(person!.id, next);
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function remove() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      window.setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setIsSubmitting(true);
    try {
      await setAdjustments(
        person!.id,
        (person!.salaryAdjustments ?? []).filter((item) => item.id !== existing?.id),
      );
      closeAfterSave();
    } finally {
      setIsSubmitting(false);
    }
  }

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError('');
  };

  return (
    <BottomSheet
      onClose={requestClose}
      title={existing ? t('Edit adjustment') : t('Add adjustment')}
    >
      <div className="form-grid">
        <div className="field choice-panel">
          <span>{t('Kind')}</span>
          <div className="choice-row">
            {TYPES.map((item) => (
              <button
                aria-pressed={form.type === item.value}
                className={form.type === item.value ? 'choice-button is-selected' : 'choice-button'}
                key={item.value}
                onClick={() => update({ type: item.value })}
                type="button"
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        </div>

        {isStoppage ? (
          <div className="salary-history-edit-row">
            <label className="field">
              <span>{t('First day of the stoppage')}</span>
              <input
                autoComplete="off"
                onChange={(event) =>
                  update({
                    startDate: event.target.value,
                    endDate: form.endDate < event.target.value ? event.target.value : form.endDate,
                  })
                }
                type="date"
                value={form.startDate}
              />
            </label>
            <label className="field">
              <span>{t('Last day of the stoppage')}</span>
              <input
                autoComplete="off"
                min={form.startDate}
                onChange={(event) => update({ endDate: event.target.value })}
                type="date"
                value={form.endDate}
              />
            </label>
          </div>
        ) : (
          <div className="salary-history-edit-row">
            <label className="field">
              <span>{t('Date')}</span>
              <input
                autoComplete="off"
                onChange={(event) => update({ startDate: event.target.value })}
                type="date"
                value={form.startDate}
              />
            </label>
            <label className="field">
              <span>{t('Amount')}</span>
              <input
                autoComplete="off"
                inputMode="decimal"
                min={0}
                onChange={(event) => update({ amountText: event.target.value })}
                step={1}
                type="number"
                value={form.amountText}
              />
            </label>
          </div>
        )}

        {isStoppage && (
          <label className="field">
            <span>{t('Amount to deduct')}</span>
            <input
              autoComplete="off"
              inputMode="decimal"
              min={0}
              onChange={(event) => update({ amountText: event.target.value, amountEdited: true })}
              step={1}
              type="number"
              value={shownAmount}
            />
            <small>
              {form.amountEdited
                ? `${t('Calculated:')} ${formatMoney(calculated, person.currency, false)}`
                : t('Change it if it should be different, for example for half a day.')}
            </small>
          </label>
        )}
        {isStoppage && form.amountEdited && (
          <button
            className="text-button"
            onClick={() => update({ amountEdited: false, amountText: '' })}
            type="button"
          >
            {t('Reset to calculated')}
          </button>
        )}

        {isStoppage && (
          <p className="inline-note">
            {t('One working day = monthly salary ÷')} {4 * (7 - getRestDays(person).length)}
          </p>
        )}
        {preview && (
          <p className="adjustment-preview" role="status">
            {preview}
          </p>
        )}

        <label className="field">
          <span>
            {t('Note')} <small>{t('optional')}</small>
          </span>
          <input
            autoComplete="off"
            maxLength={120}
            onChange={(event) => update({ note: event.target.value })}
            type="text"
            value={form.note}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary-button" onClick={requestClose} type="button">
            {t('Cancel')}
          </button>
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => void save()}
            type="button"
          >
            {t('Save')}
          </button>
        </div>
        {existing && (
          <button
            className="danger-button full-button"
            disabled={isSubmitting}
            onClick={() => void remove()}
            type="button"
          >
            {confirmingDelete ? t('Tap again to delete') : t('Delete')}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
