import { PeriodStatusIcon } from '../../components/PeriodStatusIcon';
import type { PeriodSummary } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import type { Currency } from '../../types/domain';
import { formatDate, formatMoney } from '../../utils/format';
import { nextPayment, paidThrough, visiblePeriods } from './period-strip';

interface PeriodStripProps {
  periods: PeriodSummary[];
  currency: Currency;
  /** The day the next payment falls due; empty when none is coming. */
  nextPayDate: string;
  onOpen: () => void;
}

/**
 * The pay periods as a card of their own: a dot per period, where the work is paid up to, and the
 * next payment with what it is for. One tap target — anywhere on it opens the full list.
 */
export function PeriodStrip({ periods, currency, nextPayDate, onOpen }: PeriodStripProps) {
  const t = useTranslation();
  if (periods.length === 0) return null;
  const shown = visiblePeriods(periods);
  const { date, allPaid } = paidThrough(periods);
  const next = nextPayment(periods, nextPayDate);

  return (
    <button
      aria-label={t('Show pay periods')}
      className="period-strip"
      onClick={onOpen}
      type="button"
    >
      <span className="period-strip-header">
        <span>{t('Pay periods')}</span>
        <svg aria-hidden="true" className="period-strip-chevron" viewBox="0 0 24 24">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
      {(allPaid || date) && (
        <span className="period-strip-summary">
          {allPaid
            ? t('All paid')
            : t('Work paid through {date}').replace('{date}', formatDate(date ?? '').slice(0, 5))}
        </span>
      )}
      <span className="period-strip-row">
        {shown.map((period) => (
          <span className="period-strip-item" key={`${period.periodEndDate}-${period.payDate}`}>
            <span className={`period-dot is-${period.status}`}>
              <PeriodStatusIcon status={period.status} />
            </span>
            <small>{formatDate(period.periodEndDate).slice(0, 5)}</small>
          </span>
        ))}
      </span>
      {next && (
        <span className="period-strip-next">
          <span className="period-strip-next-text">
            <small>{t('Next pay')}</small>
            <strong>{formatDate(nextPayDate)}</strong>
            <small>
              {t('Worked')} {formatDate(next.workedFrom).slice(0, 5)} –{' '}
              {formatDate(next.workedTo).slice(0, 5)}
            </small>
          </span>
          <strong className="period-strip-next-amount">
            {formatMoney(next.amount, currency, false)}
          </strong>
        </span>
      )}
    </button>
  );
}
