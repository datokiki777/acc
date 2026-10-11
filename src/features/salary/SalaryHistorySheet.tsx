import { useState } from 'react';

import { BottomSheet } from '../../components/BottomSheet';
import { PickerField } from '../../components/PickerField';
import { useAppNavigation } from '../../app/useAppNavigation';
import { getEffectiveTimeline } from '../../domain/salary';
import { PAY_DELAY_OPTIONS } from '../../domain/salary-options';
import { useTranslation } from '../../i18n/useTranslation';
import { useAppStore } from '../../store/hooks';
import type { PayDelayMode } from '../../types/domain';
import { localDateString } from '../../utils/format';

interface TimelineRow {
  id: string;
  effectiveDate: string;
  amountText: string;
  periodWeeksText: string;
  payDelayMode: PayDelayMode;
}

function makeRowId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function parseAmount(text: string): number {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function parsePeriodWeeks(text: string): number {
  const value = Number(text);
  return Number.isFinite(value) && value >= 1 ? Math.min(52, Math.round(value)) : 2;
}

export function SalaryHistorySheet() {
  const t = useTranslation();
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  const updateTimeline = useAppStore((state) => state.updateSalaryTimeline);
  const { closeAfterSave, requestClose } = useAppNavigation();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rows, setRows] = useState<TimelineRow[]>(() => {
    if (!person) return [];
    const timeline = getEffectiveTimeline(person);
    if (timeline.length > 0) {
      return timeline.map((segment) => ({
        id: makeRowId(),
        effectiveDate: segment.effectiveDate,
        amountText: String(segment.amount),
        periodWeeksText: String(segment.periodWeeks),
        payDelayMode: segment.payDelayMode,
      }));
    }
    return [
      {
        id: makeRowId(),
        effectiveDate: localDateString(),
        amountText: '0',
        periodWeeksText: '2',
        payDelayMode: 'none',
      },
    ];
  });

  if (!person) return null;
  const wasConfigured = rows.length > 0 && Boolean(person.salaryAmount && person.salaryStartDate);

  function addRow() {
    const last = rows[rows.length - 1];
    setRows((current) => [
      ...current,
      {
        id: makeRowId(),
        effectiveDate: localDateString(),
        amountText: last?.amountText ?? '0',
        periodWeeksText: last?.periodWeeksText ?? '2',
        payDelayMode: last?.payDelayMode ?? 'none',
      },
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
    if (rows.length === 0) {
      setError('At least one entry is required');
      return;
    }
    if (rows.some((row) => !row.effectiveDate)) {
      setError('Every entry needs a date');
      return;
    }
    setIsSubmitting(true);
    try {
      await updateTimeline(
        person!.id,
        rows.map((row) => ({
          effectiveDate: row.effectiveDate,
          amount: parseAmount(row.amountText),
          periodWeeks: parsePeriodWeeks(row.periodWeeksText),
          payDelayMode: row.payDelayMode,
        })),
      );
      closeAfterSave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update salary history');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BottomSheet onClose={requestClose} title={t('Manage Salary History')}>
      <div className="form-grid">
        <p className="inline-note">
          {wasConfigured
            ? t(
                'Correct or add any past change — amount, pay period, or payment timing. Everything owed recalculates from this full timeline.',
              )
            : t(
                'Add the starting salary — amount, pay period, and payment timing, from the date it began.',
              )}
        </p>
        {rows.map((row, index) => (
          <div className="salary-history-edit-card" key={row.id}>
            <div className="salary-history-edit-card-heading">
              <strong>{index === 0 ? t('Starting point') : `${t('Change')} ${index + 1}`}</strong>
              {rows.length > 1 && (
                <button
                  aria-label={t('Remove this entry')}
                  className="text-button"
                  onClick={() => removeRow(row.id)}
                  type="button"
                >
                  ✕ {t('Remove')}
                </button>
              )}
            </div>
            <div className="salary-history-edit-row">
              <label className="field">
                <span>{index === 0 ? t('Starting date') : t('Change date')}</span>
                <input
                  autoComplete="off"
                  onChange={(event) => updateRow(row.id, { effectiveDate: event.target.value })}
                  type="date"
                  value={row.effectiveDate}
                />
              </label>
              <label className="field">
                <span>{index === 0 ? t('Starting salary') : t('New monthly salary')}</span>
                <input
                  autoComplete="off"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => updateRow(row.id, { amountText: event.target.value })}
                  step={1}
                  type="number"
                  value={row.amountText}
                />
              </label>
            </div>
            <div className="salary-history-edit-row">
              <label className="field">
                <span>{t('Pay period (weeks)')}</span>
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  max={52}
                  min={1}
                  onChange={(event) => updateRow(row.id, { periodWeeksText: event.target.value })}
                  step={1}
                  type="number"
                  value={row.periodWeeksText}
                />
              </label>
              <PickerField
                label={t('Payment timing')}
                onChange={(next) => updateRow(row.id, { payDelayMode: next as PayDelayMode })}
                options={PAY_DELAY_OPTIONS}
                value={row.payDelayMode}
              />
            </div>
          </div>
        ))}
        <button className="text-button" onClick={addRow} type="button">
          + {t('Add change')}
        </button>
        {error && <p className="form-error">{t(error)}</p>}
        <div className="form-actions">
          <button className="secondary-button" onClick={requestClose} type="button">
            {t('Cancel')}
          </button>
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={() => void submit()}
            type="button"
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
