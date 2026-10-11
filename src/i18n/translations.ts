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
  Settings: 'პარამეტრები',
  Theme: 'თემა',
  Hide: 'დამალვა',
  Language: 'ენა',
  'Dark theme': 'მუქი თემა',
  'Light theme': 'ნათელი თემა',
  'System theme': 'სისტემური თემა',
  'Hide amounts': 'თანხების დამალვა',
  'Primary navigation': 'მთავარი ნავიგაცია',
  'Backup & Data': 'ბექაფი და მონაცემები',
  'Export, import, and cloud sync': 'ექსპორტი, იმპორტი და ღრუბლოვანი სინქი',

  // Home screen: search, filters, mode switch
  'Search by name': 'ძებნა სახელით',
  Search: 'ძებნა',
  'People filter': 'ფილტრი',
  Active: 'აქტიური',
  Archived: 'დაარქივებული',
  'Account mode': 'ანგარიშის რეჟიმი',
  Personal: 'პირადი',
  Work: 'სამუშაო',
  Teams: 'გუნდები',
  People: 'ადამიანები',

  // Home screen: empty states
  'No matches': 'არაფერი მოიძებნა',
  'No matches for this tag': 'ამ ტეგზე არაფერი მოიძებნა',
  'No archived people': 'დაარქივებული არავინაა',
  'No records yet': 'ჯერ არაფერია დამატებული',
  'Try another name.': 'სცადე სხვა სახელი.',
  'Try a different tag, or All.': 'სცადე სხვა ტეგი, ან აირჩიე ყველა.',
  'Archived records will appear here.': 'დაარქივებული ჩანაწერები აქ გამოჩნდება.',
  'Tap the plus button to add your first person.':
    'დააჭირე + ღილაკს პირველი ჩანაწერის დასამატებლად.',

  // Person card
  Unarchive: 'დაბრუნება',
  Archive: 'დაარქივება',
  Delete: 'წაშლა',
  Overdue: 'ვადაგადაცილებული',
  entry: 'ჩანაწერი',
  entries: 'ჩანაწერი',
  Net: 'სუფთა',
  Entries: 'ჩანაწერები',
  Show: 'ჩვენება',
  'older entries': 'ძველი ჩანაწერი',
  'No entries yet': 'ჩანაწერები ჯერ არ არის',
  'Add Entry': 'ჩანაწერის დამატება',
};

const dictionaries: Record<string, Record<string, string>> = { ka };

export const AVAILABLE_LANGUAGES: string[] = [DEFAULT_LANGUAGE, ...Object.keys(dictionaries)];

export function translate(language: string, key: string): string {
  if (language === DEFAULT_LANGUAGE) return key;
  return dictionaries[language]?.[key] ?? key;
}
