import { PeriodStatusIcon } from '../../components/PeriodStatusIcon';
import type { PeriodSummary } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import { formatDate } from '../../utils/format';
import { paidThrough, visiblePeriods } from './period-strip';

interface PeriodStripProps {
  periods: PeriodSummary[];
  onOpen: () => void;
}

export function PeriodStrip({ periods, onOpen }: PeriodStripProps) {
  const t = useTranslation();
  if (periods.length === 0) return null;
  const shown = visiblePeriods(periods);
  const { date, allPaid } = paidThrough(periods);

  return (
    <button
      aria-label={t('Show pay periods')}
      className="period-strip"
      onClick={onOpen}
      type="button"
    >
      {(allPaid || date) && (
        <span className="period-strip-summary">
          {allPaid
            ? t('All paid')
            : t('Paid through {date}').replace('{date}', formatDate(date ?? '').slice(0, 5))}
        </span>
      )}
      <span className="period-strip-row">
        {shown.map((period) => (
          <span className="period-strip-item" key={`${period.periodEndDate}-${period.payDate}`}>
            <span className={`period-dot is-${period.status}`}>
              <PeriodStatusIcon status={period.status} />
            </span>
            <small>{formatDate(period.payDate).slice(0, 5)}</small>
          </span>
        ))}
      </span>
    </button>
  );
}
