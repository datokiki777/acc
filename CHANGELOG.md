# Changelog

მოკლე ჩანაწერები ცვლილებებზე, თარიღების მიხედვით (უახლესი ზემოთ).

## 2026-07-23

- დამატებულია `CHANGELOG.md` — commit-ების წინ აქ ჩაიწერება მოკლე შენიშვნა.
- გადამოწმებულია data/logic/UI გამოცალკევება (`js/02-storage.js` → `js/03-utils.js` → `js/04-render.js`) — უკვე იყო სწორად სტრუქტურირებული, ცვლილება არ დასჭირვებია.
- დამატებულია გადასახდელის პროგნოზის ინდიკატორი Payroll პანელზე: როცა due=0-ია (გადახდილია), `upcoming` პილი და "next pay in Nd" ტექსტი აჩვენებს პროგნოზს — ყვითელი პერიოდის შუაში, წითელი როცა pay date 3 დღეზე ახლოს/გავლილია (`salaryAccruedBaseline`/`salaryPeriodAnchorDate` ლოგიკაზე დაშენებული, `js/03-utils.js`: `daysUntil`, `SALARY_PAY_SOON_DAYS`, `personSalarySummary` → `daysUntilNextPay`/`paySoon`; `js/04-render.js`: `renderWorkSalaryPanel`; CSS: `.salary-due-pill.upcoming.pay-soon`).
