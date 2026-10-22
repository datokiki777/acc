import { PeriodStatusIcon } from '../../components/PeriodStatusIcon';
import type { AppliedAdjustment, PeriodStatus, PeriodSummary } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import type { Currency } from '../../types/domain';
import { formatDate, formatMoney } from '../../utils/format';

const STATUS_LABELS: Record<PeriodStatus, string> = {
  paid: 'Paid',
  partial: 'Partly paid',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
};

interface PeriodListProps {
  periods: PeriodSummary[];
  currency: Currency;
  onEditAdjustment?: (adjustmentId: string) => void;
}

/** Newest and upcoming first — what you'd look for is at the top, the settled history below. */
export function PeriodList({ periods, currency, onEditAdjustment }: PeriodListProps) {
  const t = useTranslation();
  const describe = (item: AppliedAdjustment) => {
    const label =
      item.type === 'stoppage'
        ? `${t('Stoppage')} · ${item.days ?? 0} ${t('days')}`
        : item.type === 'bonus'
          ? t('Bonus')
          : t('Deduction');
    const sign = item.amount < 0 ? '−' : '+';
    return `${label} · ${sign}${formatMoney(Math.abs(item.amount), currency, false)}${item.note ? ` · ${item.note}` : ''}`;
  };
  return (
    <ul className="period-list">
      {[...periods].reverse().map((period) => (
        <li
          className={`period-list-row is-${period.status}`}
          key={`${period.periodEndDate}-${period.payDate}`}
        >
          <span className="period-list-icon">
            <PeriodStatusIcon status={period.status} />
          </span>
          <span className="period-list-text">
            <strong>
              {formatDate(period.periodStartDate)} – {formatDate(period.periodEndDate)}
            </strong>
            <small>
              {t(STATUS_LABELS[period.status])}
              {period.status === 'partial' &&
                ` · ${formatMoney(period.paidAmount, currency, false)} / ${formatMoney(period.amount, currency, false)}`}
            </small>
            {period.payDate !== period.periodEndDate && (
              <small className="period-list-range">
                {t('Pay date')} {formatDate(period.payDate)}
              </small>
            )}
            {period.adjustments.map((item) => (
              <button
                className={`period-adjustment ${item.amount < 0 ? 'is-negative' : 'is-positive'}`}
                key={item.id}
                onClick={() => onEditAdjustment?.(item.id)}
                type="button"
              >
                {describe(item)}
              </button>
            ))}
          </span>
          <span className="period-list-amounts">
            <strong className="period-list-amount">
              {formatMoney(period.amount, currency, false)}
            </strong>
            {period.baseAmount !== period.amount && (
              <small className="period-list-base">
                {formatMoney(period.baseAmount, currency, false)}
              </small>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
