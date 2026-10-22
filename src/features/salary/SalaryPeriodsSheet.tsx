import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import { calculatePeriodStatuses } from '../../domain/salary';
import { useTranslation } from '../../i18n/useTranslation';
import { useAppStore } from '../../store/hooks';
import { PeriodList } from './PeriodList';

export function SalaryPeriodsSheet() {
  const t = useTranslation();
  const { requestClose } = useAppNavigation();
  const openSheet = useAppStore((state) => state.openSheet);
  const personId = useAppStore((state) => state.ui.personId);
  const person = useAppStore((state) =>
    state.peopleByMode.work.find((candidate) => candidate.id === personId),
  );
  if (!person) return null;

  return (
    <BottomSheet onClose={requestClose} title={t('Pay periods')}>
      <button
        className="text-button payroll-action period-add-adjustment"
        onClick={() => openSheet('salary-adjustment', person.id, null)}
        type="button"
      >
        + {t('Add adjustment')}
      </button>
      <PeriodList
        currency={person.currency}
        onEditAdjustment={(id) => openSheet('salary-adjustment', person.id, id)}
        periods={calculatePeriodStatuses(person, new Date())}
      />
    </BottomSheet>
  );
}
