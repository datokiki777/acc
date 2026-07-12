// ==================== 03-utils.js ====================
// Helper Functions, Finders, Currency Helpers, Gesture Helpers

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "No date";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function currencyLabel(currency) {
  const c = currency || "EUR";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  if (c === "GEL") return "₾";
  if (c === "CAD") return "C$";
  return "€";
}

function normalizeAmount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

function formatMoney(value, currency = "EUR") {
  const num = normalizeAmount(value);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num}${currencyLabel(currency)}`;
}

function formatMoneyPlain(value, currency = "EUR") {
  const num = normalizeAmount(value);
  const sign = num < 0 ? "-" : "";
  return `${sign}${Math.abs(num)}${currencyLabel(currency)}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("-").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function daysInclusive(startDateStr, endDate = new Date()) {
  const start = parseLocalDate(startDateStr);
  if (!start) return 0;
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diff = Math.floor((end - start) / 86400000);
  return Math.max(0, diff + 1);
}

function balanceClass(value) {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "gray";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightMatch(text, query) {
  const safeText = escapeHtml(text || "");
  const q = String(query || "").trim();
  if (!q) return safeText;
  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escapedQuery})`, "ig");
  return safeText.replace(re, '<mark class="search-mark">$1</mark>');
}

function entryEffect(type, amount) {
  const n = normalizeAmount(amount);
  if (type === "Gave") return n;
  if (type === "Received") return -n;
  return 0;
}

function typeLabelClass(type) {
  return type === "Gave" ? "green" : "red";
}

function isWorkMode() {
  return state.mode === "work";
}

function entryTypeVisual(type) {
  if (!isWorkMode()) return escapeHtml(type);
  return type === "Gave"
    ? '<span class="entry-type-money-icon money-green">€</span>'
    : '<span class="entry-type-money-icon money-red">€</span>';
}

function entryTypeToggleContent(type, active) {
  if (!isWorkMode()) {
    if (type === "Gave") {
      return `<span class="type-toggle-icon">↗</span><span>Gave</span>`;
    }
    return `<span class="type-toggle-icon">↘</span><span>Received</span>`;
  }
  if (type === "Gave") {
    return `<span class="type-toggle-money money-green ${active ? "active" : ""}">€</span>`;
  }
  return `<span class="type-toggle-money money-red ${active ? "active" : ""}">€</span>`;
}

function stageCurrency(stage) {
  return stage?.currency || "EUR";
}

function stageBalance(stage) {
  return (stage.entries || []).reduce((sum, entry) => {
    return sum + entryEffect(entry.type, entry.amount);
  }, 0);
}

function stageTotals(stage) {
  let gave = 0, received = 0;
  (stage.entries || []).forEach(entry => {
    const amount = normalizeAmount(entry.amount);
    if (entry.type === "Gave") gave += amount;
    if (entry.type === "Received") received += amount;
  });
  return { gave, received, balance: stageBalance(stage) };
}

function personOpenBalance(person) {
  return (person.stages || [])
    .filter(stage => !stage.closed)
    .reduce((sum, stage) => sum + stageBalance(stage), 0);
}

function getPersonSalaryConfig(person) {
  const monthly = normalizeAmount(person?.salaryAmount || 0);
  const startDate = person?.salaryStartDate || "";
  if (!monthly || !startDate) return null;
  return {
    monthly,
    startDate,
    payDay: Math.min(31, Math.max(1, Number(person?.salaryPayDay || 1))),
    currency: person?.salaryCurrency || findOpenStage(person?.id)?.currency || "EUR"
  };
}

function isSalaryEntry(entry) {
  return entry?.category === "salary" || /^\[Salary\]/i.test(String(entry?.comment || ""));
}

function personSalaryPaid(person) {
  return (person?.stages || []).reduce((sum, stage) => {
    return sum + (stage.entries || []).reduce((entrySum, entry) => {
      if (!isSalaryEntry(entry)) return entrySum;
      if (entry.type !== "Gave") return entrySum;
      return entrySum + normalizeAmount(entry.amount);
    }, 0);
  }, 0);
}

function personSalarySummary(person, date = new Date()) {
  const config = getPersonSalaryConfig(person);
  if (!config) {
    return { enabled: false, accrued: 0, paid: 0, due: 0, currency: "EUR", days: 0, monthly: 0, payDay: 1 };
  }
  const days = daysInclusive(config.startDate, date);
  const accrued = normalizeAmount((config.monthly * 12 / 365) * days);
  const paid = personSalaryPaid(person);
  return {
    enabled: true,
    accrued,
    paid,
    due: Math.max(0, accrued - paid),
    currency: config.currency,
    days,
    monthly: config.monthly,
    payDay: config.payDay,
    startDate: config.startDate
  };
}

function getOrderedCurrencyEntries(totalsMap) {
  const preferredOrder = ["GEL", "CAD", "USD", "EUR"];
  const entries = Object.entries(totalsMap || {});
  return entries.sort((a, b) => {
    const ai = preferredOrder.indexOf(a[0]);
    const bi = preferredOrder.indexOf(b[0]);
    const aRank = ai === -1 ? 999 : ai;
    const bRank = bi === -1 ? 999 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a[0].localeCompare(b[0]);
  });
}

function getOpenCurrencyTotals(people = state.people) {
  const totals = {};
  (people || []).forEach(person => {
    (person.stages || [])
      .filter(stage => !stage.closed)
      .forEach(stage => {
        const currency = stageCurrency(stage);
        const balance = stageBalance(stage);
        totals[currency] = (totals[currency] || 0) + balance;
      });
  });
  return totals;
}

function getClosedCurrencyTotals(people = state.people) {
  const totals = {};
  (people || []).forEach(person => {
    (person.stages || [])
      .filter(stage => stage.closed)
      .forEach(stage => {
        const currency = stageCurrency(stage);
        const balance = stageBalance(stage);
        totals[currency] = (totals[currency] || 0) + balance;
      });
  });
  return totals;
}

function getOverviewBalanceSummary(people = state.people) {
  const totalsMap = getOpenCurrencyTotals(people);
  const orderedEntries = getOrderedCurrencyEntries(totalsMap);
  const nonZeroEntries = orderedEntries.filter(([, amount]) => Math.abs(Number(amount || 0)) > 0.000001);
  const entries = nonZeroEntries.length ? nonZeroEntries : orderedEntries;
  if (!entries.length) {
    return { mixed: false, amount: 0, currency: "EUR", label: formatMoney(0, "EUR"), breakdown: [] };
  }
  if (entries.length === 1) {
    const [currency, amount] = entries[0];
    return { mixed: false, amount, currency, label: formatMoney(amount, currency), breakdown: entries };
  }
  const eurEntry = entries.find(([currency]) => currency === "EUR");
  const primaryEntry = eurEntry || entries[0];
  const [currency, amount] = primaryEntry;
  return {
    mixed: true,
    amount,
    currency,
    label: `${formatMoney(amount, currency)} · Mix`,
    breakdown: entries
  };
}

function renderCurrencyBreakdown(entries, options = {}) {
  if (!entries || !entries.length) return "";
  const icon = options.icon ? `<span class="currency-breakdown-icon">${options.icon}</span>` : "";
  return `
    <div class="currency-breakdown">
      ${icon}
      <div class="currency-breakdown-chips">
        ${entries.map(([currency, amount]) => `
          <span class="currency-chip ${balanceClass(amount)}">
            ${formatMoneyPlain(amount, currency)}
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function closedStagesSummary(person) {
  const closedStages = (person.stages || []).filter(stage => stage.closed);
  if (!closedStages.length) return { count: 0, balance: 0, currency: "EUR" };
  const currency = stageCurrency(closedStages[0]);
  const balance = closedStages.reduce((sum, stage) => sum + stageBalance(stage), 0);
  return { count: closedStages.length, balance, currency };
}

function shouldIgnoreGestureTarget(target) {
  return !!target.closest("button, input, textarea, select, a, .swipe-delete-action");
}

function getNearestSwipeCard(target) {
  return target.closest(".swipe-card");
}

function personLastActivityTs(person) {
  const stages = person.stages || [];
  let latest = 0;
  stages.forEach(stage => {
    if (stage.createdAt) {
      const ts = new Date(stage.createdAt).getTime();
      if (!isNaN(ts) && ts > latest) latest = ts;
    }
    (stage.entries || []).forEach(entry => {
      if (entry.date) {
        const ts = new Date(entry.date).getTime();
        if (!isNaN(ts) && ts > latest) latest = ts;
      }
    });
  });
  return latest;
}

function getFilteredPeople() {
  const query = state.search.trim().toLowerCase();
  return state.people
    .filter(person => (person.name || "").toLowerCase().includes(query))
    .sort((a, b) => personLastActivityTs(b) - personLastActivityTs(a));
}

// Finders (used across many modules)
function findPerson(personId) { return state.people.find(p => p.id === personId) || null; }
function findStage(personId, stageId) { const p = findPerson(personId); return p ? (p.stages || []).find(s => s.id === stageId) || null : null; }
function findEntry(personId, stageId, entryId) { const s = findStage(personId, stageId); return s ? (s.entries || []).find(e => e.id === entryId) || null : null; }
function findOpenStage(personId) { const p = findPerson(personId); return p ? (p.stages || []).find(s => !s.closed) || null : null; }
