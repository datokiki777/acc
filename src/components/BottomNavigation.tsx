import type { TranslateFn } from '../i18n/useTranslation';
import type { ThemeMode } from '../types/domain';

export type AppDestination = 'home' | 'statistics' | 'settings';

interface BottomNavigationProps {
  active: AppDestination;
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
  { destination: 'settings', label: 'Settings' },
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
  if (destination === 'settings') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.32.43.57.78.67.33.1.69.1 1.02 0H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    );
  }
  return null;
}
