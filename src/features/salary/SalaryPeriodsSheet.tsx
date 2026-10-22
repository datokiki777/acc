import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import { calculatePeriodStatuses } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import { useAppStore } from '../../store/hooks';
import { PeriodList } from './PeriodList';

export function SalaryPeriodsSheet() {
  const t = useTranslation();
  const { requestClose } = useAppNavigation();
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  if (!person) return null;

  return (
    <BottomSheet onClose={requestClose} title={t('Pay periods')}>
      <PeriodList
        currency={person.currency}
        periods={calculatePeriodStatuses(person, new Date())}
      />
    </BottomSheet>
  );
}
