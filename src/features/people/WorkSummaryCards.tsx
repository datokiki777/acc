import { useState } from 'react';

import type { PersonTotals } from '../../domain/balances';
import type { GiftSummary } from '../../domain/salary';
import type { SalaryCalculationResult, SalaryTimelineEntry } from '../../types/domain';
import type { PersistedPerson } from '../../types/persistence';
import { formatDate, formatMoney } from '../../utils/format';

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
}

function FlowTotalsRow({ className, currency, gave, net, received }: FlowTotalsRowProps) {
  return (
    <div className={className}>
      <span>
        <small>Gave</small>
        <strong className={moneyTone(gave)}>{formatMoney(gave, currency, false)}</strong>
      </span>
      <span>
        <small>Received</small>
        <strong className={moneyTone(-received)}>{formatMoney(received, currency, false)}</strong>
      </span>
      <span className="money-summary-pair">
        <small>Net</small>
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
}: PayrollSummaryCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  // The starting segment isn't a 'change' in its own right, so only show it as history once
  // there's actually been at least one change since.
  const changes = timeline.length > 1 ? timeline.slice(1) : [];

  return (
    <section className="payroll-panel work-summary-panel">
      <div className="panel-heading">
        <div>
          <strong>Payroll</strong>
          <small>
            {formatMoney(salary.monthly, salary.currency, false)} / month · every{' '}
            {salary.periodWeeks}w
          </small>
        </div>
        <div className="payroll-pills">
          {salary.due > 0 && (
            <span className="money-pill overdue">
              Overdue {formatMoney(salary.due, salary.currency, false)}
            </span>
          )}
          {salary.upcoming > 0 && (
            <span className={`money-pill upcoming ${salary.paySoon ? 'soon' : ''}`}>
              {salary.paySoon ? 'Due soon' : 'Upcoming'}{' '}
              {formatMoney(salary.upcoming, salary.currency, false)}
            </span>
          )}
        </div>
      </div>
      <div className="panel-grid">
        <span>
          Started <strong>{salary.startDate ? formatDate(salary.startDate) : '—'}</strong>
        </span>
        <span>
          Paid <strong>{formatMoney(salary.paid, salary.currency, false)}</strong>
        </span>
        <span>
          {salary.ended ? 'Ended' : 'Next pay'}{' '}
          <strong>{formatDate(salary.ended ? salary.endDate : salary.nextPayDate)}</strong>
        </span>
      </div>
      <div className="payroll-secondary-actions">
        <button className="text-button" onClick={onSyncPayDate} type="button">
          ↻ Change Salary
        </button>
        {changes.length > 0 && (
          <button
            aria-expanded={historyOpen}
            className="text-button"
            onClick={() => setHistoryOpen((open) => !open)}
            type="button"
          >
            {historyOpen ? '▾' : '▸'} Salary history ({changes.length})
          </button>
        )}
      </div>
      {historyOpen && changes.length > 0 && (
        <ul className="salary-history-list">
          {changes.map((change) => (
            <li key={change.effectiveDate}>
              <span className="salary-history-date">{formatDate(change.effectiveDate)}</span>
              <span className="salary-history-change">
                <strong>{formatMoney(change.amount, currency, false)}</strong> · every{' '}
                {change.periodWeeks}w ·{' '}
                {PAY_DELAY_LABELS[change.payDelayMode] ?? change.payDelayMode}
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
      />
    </section>
  );
}

interface OtherSummaryCardProps {
  summary: GiftSummary;
}

export function OtherSummaryCard({ summary }: OtherSummaryCardProps) {
  return (
    <section className="other-summary-panel work-summary-panel">
      <div className="other-panel-heading">
        <span>
          <strong>Other</strong>
          <small>Other balance</small>
        </span>
        <strong
          className={`money-value-pill ${moneyTone(summary.net)} ${moneyScale(summary.net, summary.currency)}`}
        >
          {formatMoney(summary.net, summary.currency, false)}
        </strong>
      </div>
      <div className="other-totals-row">
        <span>
          <small>Gave</small>
          <strong className={moneyTone(summary.gave)}>
            {formatMoney(summary.gave, summary.currency, false)}
          </strong>
        </span>
        <span>
          <small>Received</small>
          <strong className={moneyTone(-summary.received)}>
            {formatMoney(summary.received, summary.currency, false)}
          </strong>
        </span>
      </div>
    </section>
  );
}
