import { useState } from 'react';

import type { PeriodSummary } from '../../domain/salary';
import { useTranslation, type TranslateFn } from '../../i18n/useTranslation';
import type { Currency, SalaryAdjustment } from '../../types/domain';
import { formatDate, formatMoney } from '../../utils/format';
import { summarizeAdjustments, type AdjustmentRow } from './adjustments-summary';

interface AdjustmentsSummaryProps {
  adjustments: SalaryAdjustment[];
  periods: PeriodSummary[];
  currency: Currency;
  onEdit: (adjustmentId: string) => void;
  onAdd: () => void;
}

function tone(amount: number): string {
  return amount < 0 ? 'is-negative' : amount > 0 ? 'is-positive' : 'is-zero';
}

function signed(amount: number, currency: Currency): string {
  return `${amount < 0 ? '−' : amount > 0 ? '+' : ''}${formatMoney(Math.abs(amount), currency, false)}`;
}

function label(row: AdjustmentRow, t: TranslateFn): string {
  if (row.type === 'bonus') return t('Bonus');
  if (row.type === 'deduction') return t('Deduction');
  return row.days > 0 ? `${t('Stoppage')} · ${row.days} ${t('days')}` : t('Stoppage');
}

/**
 * One quiet line on the team card — how many adjustments there are and what they came to — that
 * opens into the list on a tap. Closed it costs a single row; the detail is there when wanted.
 */
export function AdjustmentsSummary({
  adjustments,
  periods,
  currency,
  onEdit,
  onAdd,
}: AdjustmentsSummaryProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  if (adjustments.length === 0) return null;
  const { rows, total } = summarizeAdjustments(adjustments, periods);

  return (
    <section className="adjustments-summary">
      <button
        aria-expanded={open}
        className="adjustments-summary-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="adjustments-summary-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>
        </span>
        <span className="adjustments-summary-text">
          <strong>
            {rows.length} {rows.length === 1 ? t('adjustment') : t('adjustments')}
          </strong>
          <small>
            {rows.map((row) => `${label(row, t)} ${signed(row.net, currency)}`).join(' · ')}
          </small>
        </span>
        <strong className={`adjustments-amount ${tone(total)}`}>{signed(total, currency)}</strong>
        <svg
          aria-hidden="true"
          className={open ? 'adjustments-chevron is-open' : 'adjustments-chevron'}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="adjustments-summary-list">
          {rows.map((row) => (
            <button
              className="adjustments-row"
              key={row.id}
              onClick={() => onEdit(row.id)}
              type="button"
            >
              <span className={`adjustments-row-icon ${tone(row.net)}`} aria-hidden="true">
                {row.type === 'bonus' ? '+' : '−'}
              </span>
              <span className="adjustments-row-text">
                <strong>{label(row, t)}</strong>
                <small>
                  {formatDate(row.startDate)}
                  {row.endDate ? ` – ${formatDate(row.endDate)}` : ''}
                  {row.note ? ` · ${row.note}` : ''}
                </small>
              </span>
              <strong className={`adjustments-amount ${tone(row.net)}`}>
                {signed(row.net, currency)}
              </strong>
            </button>
          ))}
          <button className="text-button adjustments-add" onClick={onAdd} type="button">
            + {t('Add adjustment')}
          </button>
        </div>
      )}
    </section>
  );
}
