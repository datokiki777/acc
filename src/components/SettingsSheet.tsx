import { useAppNavigation } from '../app/useAppNavigation';
import { AVAILABLE_LANGUAGES } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import { useAppStore } from '../store/hooks';
import { BottomSheet } from './BottomSheet';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ka: 'ქართული',
};

export function SettingsSheet() {
  const { requestClose } = useAppNavigation();
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const openSheet = useAppStore((state) => state.openSheet);
  const t = useTranslation();

  return (
    <BottomSheet onClose={requestClose} title={t('Settings')}>
      <div className="settings-section">
        <div className="settings-heading">
          <span>{t('Language')}</span>
        </div>
        <div aria-label={t('Language')} className="segmented-control" role="group">
          {AVAILABLE_LANGUAGES.map((code) => (
            <button
              aria-pressed={language === code}
              className={language === code ? 'is-active' : undefined}
              key={code}
              onClick={() => void setLanguage(code)}
              type="button"
            >
              {LANGUAGE_NAMES[code] ?? code}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <button
          aria-label={t('Backup & Data')}
          className="settings-row settings-row-button"
          onClick={() => openSheet('backup')}
          type="button"
        >
          <span aria-hidden="true" className="settings-heading">
            <span>{t('Backup & Data')}</span>
            <small>{t('Export, import, and cloud sync')}</small>
          </span>
          <svg aria-hidden="true" className="picker-chevron" viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </BottomSheet>
  );
}
