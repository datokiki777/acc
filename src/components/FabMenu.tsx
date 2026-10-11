import { useTranslation } from '../i18n/useTranslation';
import { BottomSheet } from './BottomSheet';

interface FabMenuProps {
  personLabel: string;
  onAddPerson: () => void;
  onAddEntry: () => void;
  onClose: () => void;
}

export function FabMenu({ personLabel, onAddPerson, onAddEntry, onClose }: FabMenuProps) {
  const t = useTranslation();
  return (
    <BottomSheet onClose={onClose} title={t('Add')}>
      <div className="fab-menu-options">
        <button
          aria-label={`${t('Add')} ${personLabel}`}
          className="fab-menu-option"
          onClick={onAddPerson}
          type="button"
        >
          <span className="fab-menu-icon">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
              <path d="M4 20.5c1.6-3.6 4.6-5.5 8-5.5s6.4 1.9 8 5.5" />
            </svg>
          </span>
          <span className="fab-menu-text">
            <span>
              {t('Add')} {personLabel}
            </span>
            <small>{t('Create a new record')}</small>
          </span>
        </button>
        <button
          aria-label={t('Add Entry')}
          className="fab-menu-option"
          onClick={onAddEntry}
          type="button"
        >
          <span className="fab-menu-icon">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
              <path d="M14 4v5h5" />
              <path d="M12 12v6M9 15h6" />
            </svg>
          </span>
          <span className="fab-menu-text">
            <span>{t('Add Entry')}</span>
            <small>
              {t('Choose a')} {personLabel.toLowerCase()} {t('to log it for')}
            </small>
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
