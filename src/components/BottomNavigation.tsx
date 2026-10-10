import type { TranslateFn } from '../i18n/useTranslation';
import type { ThemeMode } from '../types/domain';

export type AppDestination = 'home' | 'statistics' | 'backup';

interface BottomNavigationProps {
  active: AppDestination;
  language: string;
  onCycleLanguage: () => void;
  onCycleTheme: () => void;
  onNavigate: (destination: AppDestination) => void;
  onTogglePrivacy: () => void;
  privacyMode: boolean;
  t: TranslateFn;
  theme: ThemeMode;
}

const items: Array<{ destination: AppDestination; label: string }> = [
  { destination: 'home', label: 'Home' },
  { destination: 'statistics', label: 'Stats' },
  { destination: 'backup', label: 'Backup' },
];

const THEME_ICON: Record<ThemeMode, string> = {
  dark: '🌙',
  light: '☀️',
  system: '🌗',
};

const THEME_LABEL: Record<ThemeMode, string> = {
  dark: 'Dark theme',
  light: 'Light theme',
  system: 'System theme',
};

export function BottomNavigation({
  active,
  language,
  onCycleLanguage,
  onCycleTheme,
  onNavigate,
  onTogglePrivacy,
  privacyMode,
  t,
  theme,
}: BottomNavigationProps) {
  return (
    <nav aria-label={t('Primary navigation')} className="bottom-navigation">
      {items.map((item) => (
        <button
          aria-current={active === item.destination ? 'page' : undefined}
          className={active === item.destination ? 'is-active' : undefined}
          key={item.destination}
          onClick={() => onNavigate(item.destination)}
          type="button"
        >
          <NavigationIcon destination={item.destination} />
          <span>{t(item.label)}</span>
        </button>
      ))}
      <button aria-label={t(THEME_LABEL[theme])} onClick={onCycleTheme} type="button">
        <span aria-hidden="true" className="nav-emoji-icon">
          {THEME_ICON[theme]}
        </span>
        <span>{t('Theme')}</span>
      </button>
      <button
        aria-checked={privacyMode}
        aria-label={t('Hide amounts')}
        onClick={onTogglePrivacy}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="nav-emoji-icon">
          {privacyMode ? '🙈' : '👁️'}
        </span>
        <span>{t('Hide')}</span>
      </button>
      <button aria-label={t('Language')} onClick={onCycleLanguage} type="button">
        <span aria-hidden="true" className="nav-emoji-icon nav-language-icon">
          {language.toUpperCase()}
        </span>
        <span>{t('Language')}</span>
      </button>
    </nav>
  );
}

function NavigationIcon({ destination }: { destination: AppDestination }) {
  if (destination === 'home') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m3 11 9-8 9 8v9H6v-9M9 20v-6h6v6" />
      </svg>
    );
  }
  if (destination === 'statistics') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20" />
      </svg>
    );
  }
  if (destination === 'backup') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    );
  }
  return null;
}
