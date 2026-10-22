import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { BottomSheet } from '../../components/BottomSheet';
import { PickerField } from '../../components/PickerField';
import { useAppNavigation, useUnsavedForm } from '../../app/useAppNavigation';
import { addDays, computeSalaryPayDate } from '../../domain/pay-dates';
import { calculateSalary, describeFirstPeriod, getRestDays } from '../../domain/salary';
import { PAY_DELAY_OPTIONS } from '../../domain/salary-options';
import { useTranslation } from '../../i18n/useTranslation';
import { useAppStore } from '../../store/hooks';
import type { PayDelayMode } from '../../types/domain';
import { formatDate, formatMoney, localDateString } from '../../utils/format';

interface SyncForm {
  adjustmentAmount: number;
  effectiveDate: string;
  amount: number;
  payDelayMode: PayDelayMode;
  periodWeeks: number;
  restDays: number[];
  cycleDate: string;
}

// Monday first, as a working week reads; the numbers are Date.getDay() values (0 = Sunday).
const WEEK: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export function SalarySyncSheet() {
  const t = useTranslation();
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  const sync = useAppStore((state) => state.syncSalary);
  const setRestDays = useAppStore((state) => state.setSalaryRestDays);
  const setCycleDate = useAppStore((state) => state.setSalaryCycleDate);
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
      restDays: person ? getRestDays(person) : [0],
      cycleDate: person?.salaryCycleDate ?? '',
    },
  });
  const payDelayMode = useWatch({ control, name: 'payDelayMode' });
  const watchedEffectiveDate = useWatch({ control, name: 'effectiveDate' });
  const watchedPeriodWeeks = useWatch({ control, name: 'periodWeeks' });
  const restDays = useWatch({ control, name: 'restDays' });
  const watchedCycleDate = useWatch({ control, name: 'cycleDate' });
  const watchedAmount = useWatch({ control, name: 'amount' });
  useUnsavedForm(isDirty);
  if (!person || !salary) return null;
  const wasConfigured = Boolean(person.salaryAmount && person.salaryStartDate);

  const toggleRestDay = (day: number) => {
    const next = restDays.includes(day)
      ? restDays.filter((item) => item !== day)
      : [...restDays, day];
    // Resting all seven days would leave nothing to price a working day with.
    if (next.length >= 7) return;
    setValue('restDays', next, { shouldDirty: true });
  };

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

  // Only offered when setting a salary up for the first time: that's when the start and the cycle
  // can differ. (For someone already set up it lives in the salary history's starting point.)
  const firstPeriod = !wasConfigured
    ? describeFirstPeriod({
        startDate: watchedEffectiveDate,
        cycleDate: watchedCycleDate,
        periodWeeks: previewPeriodWeeks,
        monthly: Number(watchedAmount) || 0,
        restDays,
      })
    : null;

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
      await setRestDays(person.id, values.restDays);
      if (!wasConfigured) await setCycleDate(person.id, values.cycleDate);
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update salary');
    }
  });

  return (
    <BottomSheet
      onClose={requestClose}
      title={wasConfigured ? t('Change Salary') : t('Set Up Salary')}
    >
      <form autoComplete="off" className="form-grid" onSubmit={(event) => void submit(event)}>
        {wasConfigured && (
          <p className="inline-note">
            {t('Earned but not yet paid:')}{' '}
            <strong>{formatMoney(owed, salary.currency, false)}</strong>
          </p>
        )}
        {wasConfigured && (
          <button
            className="text-button"
            onClick={() => openSheet('salary-history', person.id)}
            type="button"
          >
            ✎ {t('Correct or add a past salary change…')}
          </button>
        )}
        <label className="field">
          <span>{wasConfigured ? t('New cycle start date') : t('Salary start date')}</span>
          <input autoComplete="off" type="date" {...register('effectiveDate')} />
          {wasConfigured && <small>{t('Only resets the schedule if you change this date.')}</small>}
        </label>
        {!wasConfigured && (
          <label className="field">
            <span>
              {t('Cycle starts on')} <small>{t('optional')}</small>
            </span>
            <input autoComplete="off" type="date" {...register('cycleDate')} />
            <small>{t('Set it if the pay cycle starts on a different day than work did.')}</small>
          </label>
        )}
        {firstPeriod && (
          <p className="inline-note">
            {t('Short first period')}: {formatDate(firstPeriod.startDate)} –{' '}
            {formatDate(firstPeriod.endDate)} · {firstPeriod.workingDays} {t('days')} ·{' '}
            <strong>{formatMoney(firstPeriod.amount, person.currency, false)}</strong>
          </p>
        )}
        <label className="field">
          <span>{wasConfigured ? t('New monthly salary') : t('Monthly salary')}</span>
          <input
            autoComplete="off"
            inputMode="decimal"
            min={0}
            step={1}
            type="number"
            {...register('amount', { valueAsNumber: true })}
          />
          {wasConfigured && (
            <small>
              {t('Applies from the date above onward. Leave as-is to keep the current rate.')}
            </small>
          )}
        </label>
        <label className="field">
          <span>{t('Pay period (weeks)')}</span>
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
            {t(
              'How often salaries recur — 2 means every 2 weeks, going forward from the date above.',
            )}
          </small>
        </label>
        <div className="field choice-panel">
          <span>{t('Rest days')}</span>
          <div className="weekday-row">
            {WEEK.map((item) => (
              <button
                aria-pressed={restDays.includes(item.day)}
                className={
                  restDays.includes(item.day) ? 'choice-button is-selected' : 'choice-button'
                }
                key={item.day}
                onClick={() => toggleRestDay(item.day)}
                type="button"
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          <small>
            {t('Not charged when work stops. One working day = monthly salary ÷')}{' '}
            {4 * (7 - restDays.length)}
          </small>
        </div>
        <PickerField
          label={t('Payment timing')}
          onChange={(next) => setValue('payDelayMode', next as PayDelayMode, { shouldDirty: true })}
          options={PAY_DELAY_OPTIONS}
          value={payDelayMode}
        />
        <div className="schedule-preview">
          <div>
            <small>{t('Period ends')}</small>
            <strong>{formatDate(previewDueDate)}</strong>
          </div>
          <div>
            <small>{t("You'll be paid")}</small>
            <strong className={previewDueDate !== previewPayDate ? 'is-delayed' : undefined}>
              {formatDate(previewPayDate)}
            </strong>
          </div>
        </div>
        {previewDueDate !== previewPayDate && (
          <p className="inline-note">
            {t('Payment timing adds a delay')} <em>{t('on top of')}</em>{' '}
            {t(
              'the pay period above — it doesn\'t change how often periods happen. Pick "No delay" if you just want to be paid the day each period ends.',
            )}
          </p>
        )}
        {wasConfigured && (
          <label className="field">
            <span>{t('One-time adjustment')}</span>
            <input
              autoComplete="off"
              inputMode="decimal"
              min={0}
              step={1}
              type="number"
              {...register('adjustmentAmount', { valueAsNumber: true })}
            />
            <small>
              {t(
                "Records an extra payment today, if you type an amount here. Leave at 0 to add nothing — this won't happen automatically.",
              )}
            </small>
          </label>
        )}
        {error && <p className="form-error">{t(error)}</p>}
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
