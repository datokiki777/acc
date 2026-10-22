import { PeriodStatusIcon } from '../../components/PeriodStatusIcon';
import type { PeriodStatus, PeriodSummary } from '../../domain/salary';
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
}

/** Newest and upcoming first — what you'd look for is at the top, the settled history below. */
export function PeriodList({ periods, currency }: PeriodListProps) {
  const t = useTranslation();
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
            <strong>{formatDate(period.payDate)}</strong>
            <small>
              {t(STATUS_LABELS[period.status])}
              {period.status === 'partial' &&
                ` · ${formatMoney(period.paidAmount, currency, false)} / ${formatMoney(period.amount, currency, false)}`}
            </small>
            <small className="period-list-range">
              {t('Work period')} {formatDate(period.periodStartDate)} –{' '}
              {formatDate(period.periodEndDate)}
            </small>
          </span>
          <strong className="period-list-amount">
            {formatMoney(period.amount, currency, false)}
          </strong>
        </li>
      ))}
    </ul>
  );
}
