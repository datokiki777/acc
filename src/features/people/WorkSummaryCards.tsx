import { useState } from 'react';

import type { PersonTotals } from '../../domain/balances';
import type { GiftSummary, PeriodSummary } from '../../domain/salary';
import { useTranslation, type TranslateFn } from '../../i18n/useTranslation';
import type { SalaryCalculationResult, SalaryTimelineEntry } from '../../types/domain';
import type { PersistedPerson } from '../../types/persistence';
import { formatDate, formatMoney } from '../../utils/format';
import { PeriodStrip } from './PeriodStrip';

function moneyTone(value: number) {
  return value > 0 ? 'money-positive' : value < 0 ? 'money-negative' : 'money-neutral';
}

function moneyScale(value: number, currency: PersistedPerson['currency']) {
  const length = formatMoney(value, currency, false).length;
  return length >= 8 ? 'money-amount-xl' : length >= 7 ? 'money-amount-lg' : '';
}

interface FlowTotalsRowProps {
  className: string;
  currency: PersistedPerson['currency'];
  gave: number;
  net: number;
  received: number;
  t: TranslateFn;
}

function FlowTotalsRow({ className, currency, gave, net, received, t }: FlowTotalsRowProps) {
  return (
    <div className={className}>
      <span>
        <small>{t('Gave')}</small>
        <strong className={moneyTone(gave)}>{formatMoney(gave, currency, false)}</strong>
      </span>
      <span>
        <small>{t('Received')}</small>
        <strong className={moneyTone(-received)}>{formatMoney(received, currency, false)}</strong>
      </span>
      <span className="money-summary-pair">
        <small>{t('Net')}</small>
        <strong
          className={`money-value-pill money-net-pill ${moneyTone(net)} ${moneyScale(net, currency)}`}
        >
          {formatMoney(net, currency, false)}
        </strong>
      </span>
    </div>
  );
}

interface PayrollSummaryCardProps {
  currency: PersistedPerson['currency'];
  onSyncPayDate: () => void;
  salary: SalaryCalculationResult;
  timeline: SalaryTimelineEntry[];
  totals: PersonTotals;
  periods: PeriodSummary[];
  onOpenPeriods: () => void;
}

const PAY_DELAY_LABELS: Record<string, string> = {
  none: 'no delay',
  '2weeks': '+2w delay',
  '4weeks': '+4w delay',
  firstOfMonth: '1st of next month',
};

export function PayrollSummaryCard({
  currency,
  onSyncPayDate,
  salary,
  timeline,
  totals,
  periods,
  onOpenPeriods,
}: PayrollSummaryCardProps) {
  const t = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);
  // The starting segment isn't a 'change' in its own right, so only show it as history once
  // there's actually been at least one change since.
  const changes = timeline.length > 1 ? timeline.slice(1) : [];

  return (
    <section className="payroll-panel work-summary-panel">
      <div className="panel-heading">
        <div>
          <strong>{t('Payroll')}</strong>
          <small>
            {formatMoney(salary.monthly, salary.currency, false)} / {t('month')} · {t('every')}{' '}
            {salary.periodWeeks}
            {t('w')}
          </small>
        </div>
        <div className="payroll-pills">
          {salary.due > 0 && (
            <span className="money-pill overdue">
              {t('Overdue')} {formatMoney(salary.due, salary.currency, false)}
            </span>
          )}
          {salary.upcoming > 0 && (
            <span className={`money-pill upcoming ${salary.paySoon ? 'soon' : ''}`}>
              {salary.paySoon ? t('Due soon') : t('Upcoming')}{' '}
              {formatMoney(salary.upcoming, salary.currency, false)}
            </span>
          )}
        </div>
      </div>
      <PeriodStrip onOpen={onOpenPeriods} periods={periods} />
      <div className="panel-grid">
        <span>
          {t('Started')} <strong>{salary.startDate ? formatDate(salary.startDate) : '—'}</strong>
        </span>
        <span>
          {t('Paid')} <strong>{formatMoney(salary.paid, salary.currency, false)}</strong>
        </span>
        <span>
          {salary.ended ? t('Ended') : t('Next pay')}{' '}
          <strong>{formatDate(salary.ended ? salary.endDate : salary.nextPayDate)}</strong>
        </span>
      </div>
      <div className="payroll-secondary-actions">
        <button className="text-button payroll-action" onClick={onSyncPayDate} type="button">
          <svg aria-hidden="true" className="payroll-action-icon" viewBox="0 0 24 24">
            <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {t('Change Salary')}
        </button>
        {changes.length > 0 && (
          <button
            aria-expanded={historyOpen}
            className="text-button payroll-action"
            onClick={() => setHistoryOpen((open) => !open)}
            type="button"
          >
            <svg
              aria-hidden="true"
              className={
                historyOpen
                  ? 'payroll-action-icon payroll-action-chevron is-open'
                  : 'payroll-action-icon payroll-action-chevron'
              }
              viewBox="0 0 24 24"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            {t('Salary history')} ({changes.length})
          </button>
        )}
      </div>
      {historyOpen && changes.length > 0 && (
        <ul className="salary-history-list">
          {changes.map((change) => (
            <li key={change.effectiveDate}>
              <span className="salary-history-date">{formatDate(change.effectiveDate)}</span>
              <span className="salary-history-change">
                <strong>{formatMoney(change.amount, currency, false)}</strong> · {t('every')}{' '}
                {change.periodWeeks}
                {t('w')} · {t(PAY_DELAY_LABELS[change.payDelayMode] ?? change.payDelayMode)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <FlowTotalsRow
        className="payroll-totals-row"
        currency={currency}
        gave={totals.gave}
        net={totals.balance}
        received={totals.received}
        t={t}
      />
    </section>
  );
}

interface OtherSummaryCardProps {
  summary: GiftSummary;
}

export function OtherSummaryCard({ summary }: OtherSummaryCardProps) {
  const t = useTranslation();
  return (
    <section className="other-summary-panel work-summary-panel">
      <div className="other-panel-heading">
        <span>
          <strong>{t('Other')}</strong>
          <small>{t('Other balance')}</small>
        </span>
        <strong
          className={`money-value-pill ${moneyTone(summary.net)} ${moneyScale(summary.net, summary.currency)}`}
        >
          {formatMoney(summary.net, summary.currency, false)}
        </strong>
      </div>
      <div className="other-totals-row">
        <span>
          <small>{t('Gave')}</small>
          <strong className={moneyTone(summary.gave)}>
            {formatMoney(summary.gave, summary.currency, false)}
          </strong>
        </span>
        <span>
          <small>{t('Received')}</small>
          <strong className={moneyTone(-summary.received)}>
            {formatMoney(summary.received, summary.currency, false)}
          </strong>
        </span>
      </div>
    </section>
  );
}
