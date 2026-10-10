/**
 * The whole translation system in one small, additive piece: every UI string is written in
 * English directly in its component (as it always was), and that English text doubles as the
 * lookup key here. A language with no entry for a key — or the 'en' language itself — simply
 * falls back to the key, i.e. the English original. This is what keeps adding a language free of
 * any risk to existing code or tests: nothing already written needs to change, and English never
 * depends on this file at all.
 *
 * Adding a language later is just adding one more entry to `dictionaries` below — translate()
 * and the language-switcher UI need no changes to pick it up.
 */

export const DEFAULT_LANGUAGE = 'en';

const ka: Record<string, string> = {
  Home: 'მთავარი',
  Stats: 'სტატისტიკა',
  Backup: 'ბექაფი',
  Theme: 'თემა',
  Hide: 'დამალვა',
  Language: 'ენა',
  'Dark theme': 'მუქი თემა',
  'Light theme': 'ნათელი თემა',
  'System theme': 'სისტემური თემა',
  'Hide amounts': 'თანხების დამალვა',
  'Show amounts': 'თანხების ჩვენება',
  'Primary navigation': 'მთავარი ნავიგაცია',
};

const dictionaries: Record<string, Record<string, string>> = { ka };

export const AVAILABLE_LANGUAGES: string[] = [DEFAULT_LANGUAGE, ...Object.keys(dictionaries)];

export function translate(language: string, key: string): string {
  if (language === DEFAULT_LANGUAGE) return key;
  return dictionaries[language]?.[key] ?? key;
}
