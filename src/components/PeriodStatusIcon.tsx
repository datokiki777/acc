import type { PeriodStatus } from '../domain/salary';

// Small stroke icons, one per pay-period state, so the state never depends on color alone.
const PATHS: Record<PeriodStatus, React.ReactNode> = {
  paid: <path d="m5 13 4 4L19 7" />,
  partial: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentcolor" />
    </>
  ),
  overdue: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5M12 16v.01" />
    </>
  ),
  upcoming: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
};

export function PeriodStatusIcon({ status }: { status: PeriodStatus }) {
  return (
    <svg aria-hidden="true" className="period-status-icon" viewBox="0 0 24 24">
      {PATHS[status]}
    </svg>
  );
}
