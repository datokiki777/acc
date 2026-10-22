import type { PeriodSummary } from '../../domain/salary';
import type { SalaryAdjustment } from '../../types/domain';

export interface AdjustmentRow {
  id: string;
  type: SalaryAdjustment['type'];
  startDate: string;
  endDate?: string;
  note?: string;
  /** What it actually did to the pay periods: negative takes money off, positive adds. */
  net: number;
  /** Working days charged (stoppages). */
  days: number;
}

/**
 * Every recorded adjustment with its real effect, newest first, plus the combined effect. The
 * effect comes from the pay periods themselves (where it landed, after sharing between periods and
 * the floor at zero) rather than from the typed figure, so the numbers shown here always match
 * what the periods say.
 */
export function summarizeAdjustments(
  adjustments: SalaryAdjustment[],
  periods: PeriodSummary[],
): { rows: AdjustmentRow[]; total: number } {
  const rows = adjustments.map((adjustment) => {
    const applied = periods.flatMap((period) =>
      period.adjustments.filter((item) => item.id === adjustment.id),
    );
    return {
      id: adjustment.id,
      type: adjustment.type,
      startDate: adjustment.startDate,
      ...(adjustment.endDate && adjustment.endDate !== adjustment.startDate
        ? { endDate: adjustment.endDate }
        : {}),
      ...(adjustment.note ? { note: adjustment.note } : {}),
      net: applied.reduce((sum, item) => sum + item.amount, 0),
      days: applied.reduce((sum, item) => sum + (item.days ?? 0), 0),
    };
  });
  rows.sort((first, second) =>
    first.startDate < second.startDate ? 1 : first.startDate > second.startDate ? -1 : 0,
  );
  return { rows, total: rows.reduce((sum, row) => sum + row.net, 0) };
}
