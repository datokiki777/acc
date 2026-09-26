import type { PayDelayMode } from '../types/domain';

export const PAY_DELAY_OPTIONS: { value: PayDelayMode; label: string }[] = [
  { value: 'none', label: 'No delay — paid the day the period ends' },
  { value: '2weeks', label: 'Paid 2 weeks after the period ends' },
  { value: '4weeks', label: 'Paid 4 weeks after the period ends' },
  { value: 'firstOfMonth', label: 'Paid on the 1st of the following month' },
];
