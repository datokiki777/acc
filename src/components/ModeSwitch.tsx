import type { TranslateFn } from '../i18n/useTranslation';
import type { AppMode } from '../types/shell';

interface ModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  t: TranslateFn;
}

export function ModeSwitch({ mode, onChange, t }: ModeSwitchProps) {
  return (
    <div aria-label={t('Account mode')} className="segmented-control" role="group">
      <button
        aria-pressed={mode === 'personal'}
        className={mode === 'personal' ? 'is-active' : undefined}
        onClick={() => onChange('personal')}
        type="button"
      >
        {t('Personal')}
      </button>
      <button
        aria-pressed={mode === 'work'}
        className={mode === 'work' ? 'is-active' : undefined}
        onClick={() => onChange('work')}
        type="button"
      >
        {t('Work')}
      </button>
    </div>
  );
}
