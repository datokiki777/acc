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

  // Payroll panel
  Payroll: 'ხელფასი',
  month: 'თვეში',
  every: 'ყოველ',
  w: 'კვ',
  'Due soon': 'მალე გადასახდელი',
  Upcoming: 'მომავალი',
  Started: 'დაწყება',
  Paid: 'გადახდილი',
  Ended: 'დასრულდა',
  'Next pay': 'შემდეგი გადახდა',
  'Change Salary': 'ხელფასის შეცვლა',
  'Salary history': 'ხელფასის ისტორია',
  'no delay': 'დაყოვნების გარეშე',
  '+2w delay': '+2კვ დაყოვნება',
  '+4w delay': '+4კვ დაყოვნება',
  '1st of next month': 'მომავალი თვის 1-ელი',
  Other: 'სხვა',
  'Other balance': 'სხვა ბალანსი',
  Gave: 'მისცა',
  Received: 'მიიღო',

  // Entry form
  'Edit Entry': 'ჩანაწერის რედაქტირება',
  Amount: 'თანხა',
  Kind: 'ტიპი',
  Salary: 'ხელფასი',
  Direction: 'მიმართულება',
  Type: 'სახეობა',
  Refunded: 'დაბრუნებული',
  Date: 'თარიღი',
  Comment: 'კომენტარი',
  optional: 'არასავალდებულო',
  Cancel: 'გაუქმება',
  Save: 'შენახვა',
  'Amount is required': 'თანხა სავალდებულოა',
  'Enter a valid amount': 'შეიყვანე სწორი თანხა',
  'Amount must be at least 1': 'თანხა უნდა იყოს მინიმუმ 1',
  'Date is required': 'თარიღი სავალდებულოა',
  'Check the entry': 'გადაამოწმე ჩანაწერი',
  'Could not save entry': 'ჩანაწერის შენახვა ვერ მოხერხდა',

  // Person form
  Edit: 'რედაქტირება',
  Add: 'დამატება',
  Team: 'გუნდი',
  Person: 'ადამიანი',
  Name: 'სახელი',
  'Example: John': 'მაგალითად: გიორგი',
  Tag: 'ტეგი',
  'Family, Work…': 'ოჯახი, სამუშაო…',
  'Tag color': 'ტეგის ფერი',
  'No tag color': 'ფერის გარეშე',
  Currency: 'ვალუტა',
  'Salaried employee': 'ხელფასიანი თანამშრომელი',
  'Salary end date': 'ხელფასის დასრულების თარიღი',
  'Save, then set the monthly amount, start date, and schedule in Change Salary.':
    'შეინახე, შემდეგ დააყენე ყოველთვიური თანხა, დაწყების თარიღი და გრაფიკი „ხელფასის შეცვლაში".',
  'Name is required': 'სახელი სავალდებულოა',
  'Check the form': 'გადაამოწმე ფორმა',
  'Could not save': 'ვერ შევინახეთ',

  // FAB "Add" menu
  'Create a new record': 'შექმენი ახალი ჩანაწერი',
  'Choose a': 'აირჩიე',
  'to log it for': 'რომლისთვისაც დაამატო',

  // Change Salary / Set Up Salary form
  'Set Up Salary': 'ხელფასის დაყენება',
  'Earned but not yet paid:': 'გამომუშავებული, მაგრამ გადაუხდელი:',
  'Correct or add a past salary change…': 'შეასწორე ან დაამატე წარსული ხელფასის ცვლილება…',
  'New cycle start date': 'ახალი ციკლის დაწყების თარიღი',
  'Salary start date': 'ხელფასის დაწყების თარიღი',
  'Only resets the schedule if you change this date.':
    'გრაფიკი განულდება მხოლოდ მაშინ, თუ ამ თარიღს შეცვლი.',
  'New monthly salary': 'ახალი ყოველთვიური ხელფასი',
  'Monthly salary': 'ყოველთვიური ხელფასი',
  'Applies from the date above onward. Leave as-is to keep the current rate.':
    'ვრცელდება ზემოთ მითითებული თარიღიდან. დატოვე უცვლელად, რომ მიმდინარე განაკვეთი შენარჩუნდეს.',
  'Pay period (weeks)': 'გადახდის პერიოდი (კვირებში)',
  'How often salaries recur — 2 means every 2 weeks, going forward from the date above.':
    'რამდენად ხშირად მეორდება ხელფასი — 2 ნიშნავს ყოველ 2 კვირაში, ზემოთ მითითებული თარიღიდან დაწყებული.',
  'Payment timing': 'გადახდის დრო',
  'Period ends': 'პერიოდი სრულდება',
  "You'll be paid": 'გადაგეხდება',
  'Payment timing adds a delay': 'გადახდის დრო ამატებს დაყოვნებას',
  'on top of': 'ზემოდან',
  'the pay period above — it doesn\'t change how often periods happen. Pick "No delay" if you just want to be paid the day each period ends.':
    'ზემოთ მითითებულ გადახდის პერიოდს — ის არ ცვლის რამდენად ხშირად მეორდება პერიოდები. აირჩიე „დაყოვნების გარეშე", თუ გინდა რომ გადახდა მოხდეს ზუსტად პერიოდის დასრულების დღეს.',
  'One-time adjustment': 'ერთჯერადი კორექტირება',
  "Records an extra payment today, if you type an amount here. Leave at 0 to add nothing — this won't happen automatically.":
    'ჩაწერს დამატებით გადახდას დღევანდელი თარიღით, თუ აქ თანხას მიუთითებ. დატოვე 0, რომ არაფერი არ დაემატოს — ეს ავტომატურად არ მოხდება.',
  'New cycle date is required': 'ახალი ციკლის თარიღი სავალდებულოა',
  'Start date is required': 'დაწყების თარიღი სავალდებულოა',
  'Monthly salary is required': 'ყოველთვიური ხელფასი სავალდებულოა',
  'Could not update salary': 'ხელფასის განახლება ვერ მოხერხდა',
  'Select…': 'აირჩიე…',

  // Payment-timing options (shown via PickerField, translated generically by option.label)
  'No delay — paid the day the period ends':
    'დაყოვნების გარეშე — გადაიხდება პერიოდის დასრულების დღესვე',
  'Paid 2 weeks after the period ends': 'გადაიხდება პერიოდის დასრულებიდან 2 კვირაში',
  'Paid 4 weeks after the period ends': 'გადაიხდება პერიოდის დასრულებიდან 4 კვირაში',
  'Paid on the 1st of the following month': 'გადაიხდება მომდევნო თვის 1-ელ რიცხვში',

  // Manage Salary History
  'Manage Salary History': 'ხელფასის ისტორიის მართვა',
  'Correct or add any past change — amount, pay period, or payment timing. Everything owed recalculates from this full timeline.':
    'შეასწორე ან დაამატე ნებისმიერი წარსული ცვლილება — თანხა, გადახდის პერიოდი ან გადახდის დრო. ყველაფერი, რაც ეკუთვნის, ხელახლა გამოითვლება ამ მთლიანი ისტორიიდან.',
  'Add the starting salary — amount, pay period, and payment timing, from the date it began.':
    'დაამატე საწყისი ხელფასი — თანხა, გადახდის პერიოდი და გადახდის დრო, იმ თარიღიდან როცა დაიწყო.',
  'Starting point': 'საწყისი წერტილი',
  Change: 'ცვლილება',
  'Remove this entry': 'წაშალე ეს ჩანაწერი',
  Remove: 'წაშლა',
  'Starting date': 'დაწყების თარიღი',
  'Change date': 'ცვლილების თარიღი',
  'Starting salary': 'საწყისი ხელფასი',
  'Add change': 'დაამატე ცვლილება',
  'At least one entry is required': 'მინიმუმ ერთი ჩანაწერია საჭირო',
  'Every entry needs a date': 'ყველა ჩანაწერს თარიღი სჭირდება',
  'Could not update salary history': 'ხელფასის ისტორიის განახლება ვერ მოხერხდა',

  // Confirmation dialogs
  'Discard changes?': 'გავაუქმო ცვლილებები?',
  'Your unsaved changes will be lost.': 'შენახული არ გაქვს ცვლილებები, დაიკარგება.',
  'Keep editing': 'გავაგრძელო რედაქტირება',
  Discard: 'გაუქმება',
  'Delete?': 'წავშალო?',
  'Are you sure you want to delete': 'დარწმუნებული ხარ, რომ გინდა წაშალო',
  'Archive?': 'დავაარქივო?',
  'Salary will stop accruing as of today.': 'ხელფასის დარიცხვა დღეიდან შეჩერდება.',
  'Are you sure you want to archive': 'დარწმუნებული ხარ, რომ გინდა დაარქივო',
  'Unarchive?': 'დავაბრუნო?',
  'Are you sure you want to unarchive': 'დარწმუნებული ხარ, რომ გინდა დააბრუნო',
  'Salary tracking will resume from today — you can adjust the dates first if needed.':
    'ხელფასის თვალყურის დევნება განახლდება დღევანდელი დღიდან — საჭიროების შემთხვევაში ჯერ თარიღები შეგიძლია შეასწორო.',
  'Resume from today': 'განახლება დღევანდელი დღიდან',
  'Edit dates first': 'ჯერ თარიღების შესწორება',
  'Delete entry?': 'წავშალო ჩანაწერი?',
  'Are you sure you want to delete this entry?': 'დარწმუნებული ხარ, რომ გინდა წაშალო ეს ჩანაწერი?',

  // Statistics
  Statistics: 'სტატისტიკა',
  All: 'ყველა',
  Balance: 'ბალანსი',
  'Last 6 Months': 'ბოლო 6 თვე',
  'Quick Insights': 'სწრაფი შეჯამება',
  Average: 'საშუალო',
  'Most active': 'ყველაზე აქტიური',
  'Top Balances': 'ტოპ ბალანსები',
  'No open balances': 'ღია ბალანსი არ არის',
  'Filter by tag': 'ტეგის ფილტრი',

  // Backup & Data: health card
  'Data & Backup': 'მონაცემები და ბექაფი',
  'Last JSON backup': 'ბოლო JSON ბექაფი',
  Never: 'არასდროს',
  'Not backed up': 'არ არის დაბექაფილი',
  'Tracking unavailable': 'თვალყურის დევნება მიუწვდომელია',
  'No backup yet': 'ჯერ არ არის ბექაფი',
  'Refresh your backup': 'განაახლე შენი ბექაფი',
  'Backup overdue': 'ბექაფი ვადაგადაცილებულია',
  'Backup recommended': 'ბექაფი რეკომენდებულია',
  'Backup is current': 'ბექაფი აქტუალურია',
  'Export a JSON backup to protect this device data.':
    'გააკეთე JSON ბექაფი, რომ დაიცვა ამ მოწყობილობის მონაცემები.',
  'Create one new JSON backup to start precise change tracking.':
    'გააკეთე ერთი ახალი JSON ბექაფი, რომ დაიწყოს ზუსტი ცვლილებების თვალყურის დევნება.',
  'entry changes are not in the last backup.': 'ჩანაწერის ცვლილება არ შედის ბოლო ბექაფში.',
  'Profile or archive changes are not in the last backup.':
    'პროფილის ან არქივის ცვლილებები არ შედის ბოლო ბექაფში.',
  'The last backup is': 'ბოლო ბექაფი არის',
  'days old.': 'დღის წინანდელი.',
  'All current data is included in the latest JSON backup.':
    'ყველა მიმდინარე მონაცემი შედის უახლეს JSON ბექაფში.',
  'Export JSON': 'JSON ექსპორტი',
  'Choose backup': 'ბექაფის არჩევა',
  'JSON is the restorable backup format for importing data back into ACC.':
    'JSON არის აღდგენადი ბექაფის ფორმატი, რომლითაც მონაცემები უკან ACC-ში შეიტვირთება.',

  // Backup & Data: cloud backup
  'Cloud backup': 'ღრუბლოვანი ბექაფი',
  'Cross-device': 'ყველა მოწყობილობაზე',
  'Cloud Backup': 'ღრუბლოვანი ბექაფი',
  'Signed in': 'შესული ხარ',
  'Sign out': 'გასვლა',
  'Pending — last synced': 'მოლოდინში — ბოლოს დასინქრონდა',
  Synced: 'დასინქრონებული',
  'Not synced yet': 'ჯერ არ არის დასინქრონებული',
  'Save to cloud now': 'ღრუბელში შენახვა ახლავე',
  'Load from cloud': 'ღრუბლიდან ჩატვირთვა',
  Email: 'ელფოსტა',
  Password: 'პაროლი',
  'Sign in': 'შესვლა',
  'Create account': 'ანგარიშის შექმნა',
  "Don't have an account? Create one": 'არ გაქვს ანგარიში? შექმენი',
  'Have an account? Sign in': 'გაქვს ანგარიში? შედი',
  'Restore source': 'აღდგენის წყარო',
  'Loading…': 'იტვირთება…',
  'No cloud backups yet.': 'ჯერ არ არის ღრუბლოვანი ბექაფი.',

  // Backup & Data: PDF reports
  'Individual PDF export': 'ინდივიდუალური PDF ექსპორტი',
  'Readable documents': 'წასაკითხი დოკუმენტები',
  'PDF Reports': 'PDF რეპორტები',
  'Export All Data PDF': 'ყველა მონაცემის PDF ექსპორტი',
  'Single report': 'ერთი რეპორტი',
  'Person / Team PDF': 'ადამიანის / გუნდის PDF',
  'PDF report type': 'PDF რეპორტის ტიპი',
  'Choose person': 'ადამიანის არჩევა',
  'Choose team': 'გუნდის არჩევა',
  'Choose person for PDF': 'ადამიანის არჩევა PDF-სთვის',
  'Choose team for PDF': 'გუნდის არჩევა PDF-სთვის',
  'No records': 'ჩანაწერები არ არის',
  Export: 'ექსპორტი',
  'PDF opens the phone print screen—choose “Save as PDF”.':
    'PDF ხსნის ტელეფონის ბეჭდვის ეკრანს — აირჩიე „შენახვა PDF-ად".',
  'PDF report': 'PDF რეპორტი',
  'Close PDF selection': 'PDF არჩევანის დახურვა',
  'Search names': 'სახელების ძებნა',
  'Search people': 'ადამიანების ძებნა',
  'Search teams': 'გუნდების ძებნა',
  'No matching records': 'დამთხვევა ვერ მოიძებნა',

  // Backup & Data: device insights
  'Data and device insights': 'მონაცემებისა და მოწყობილობის მიმოხილვა',
  'On this device': 'ამ მოწყობილობაზე',
  'ACC data overview': 'ACC-ის მონაცემების მიმოხილვა',
  'Work teams': 'სამუშაო გუნდები',
  'Data file': 'მონაცემთა ფაილი',
  'Backup exports': 'ბექაფის ექსპორტები',
  Currencies: 'ვალუტები',
  'None yet': 'ჯერ არცერთი',
  'Entry range': 'ჩანაწერების პერიოდი',
  'Device storage quota': 'მოწყობილობის საცავის ლიმიტი',
  'Device usage includes ACC local data and offline app files. It can vary by browser.':
    'მოწყობილობის გამოყენება მოიცავს ACC-ის ლოკალურ მონაცემებს და ოფლაინ აპის ფაილებს. ბრაუზერის მიხედვით შეიძლება განსხვავდებოდეს.',
  Unavailable: 'მიუწვდომელია',

  // Backup & Data: restore flow
  'Backup safety check': 'ბექაფის უსაფრთხოების შემოწმება',
  Filename: 'ფაილის სახელი',
  Validation: 'ვალიდაცია',
  Valid: 'სწორია',
  Failed: 'ჩავარდა',
  'Export date': 'ექსპორტის თარიღი',
  'Not provided': 'მითითებული არ არის',
  'This is a snapshot from a specific moment.': 'ეს არის კონკრეტული მომენტის სურათი.',
  Merge: 'შერწყმა',
  "only adds what's missing — it won't remove anything added since then. To fully go back to this exact point in time, use":
    'მხოლოდ დაკარგულს ამატებს — არ წაშლის მას შემდეგ დამატებულს. ზუსტად ამ მომენტში სრულად დასაბრუნებლად გამოიყენე',
  Replace: 'ჩანაცვლება',
  'below.': 'ქვემოთ.',
  'Merge with current data': 'შერწყმა მიმდინარე მონაცემებთან',
  'I understand Replace will overwrite all React Personal and Work data.':
    'მესმის, რომ ჩანაცვლება გადაწერს ყველა Personal და Work მონაცემს.',
  'Replace all React data': 'ყველა მონაცემის ჩანაცვლება',
  'Restore verified successfully': 'აღდგენა წარმატებით გადამოწმდა',
  'Restore verification failed': 'აღდგენის გადამოწმება ჩავარდა',
  people: 'ადამიანი',
};

const dictionaries: Record<string, Record<string, string>> = { ka };

export const AVAILABLE_LANGUAGES: string[] = [DEFAULT_LANGUAGE, ...Object.keys(dictionaries)];

export function translate(language: string, key: string): string {
  if (language === DEFAULT_LANGUAGE) return key;
  return dictionaries[language]?.[key] ?? key;
}
