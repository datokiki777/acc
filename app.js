/* =========================================================
   ACC App — Clean Ordered JS
   Sections:
   1) Constants + State + Elements
   2) Helpers
   3) Storage + Theme
   4) Finders
   5) Animations
   6) Swipe + Long Press
   7) PDF Export + Quick Actions
   8) Card Action Routing
   9) Render
  10) Dynamic Events
  11) Modal Helpers
  12) Forms
  13) Confirm
  14) Menus + Overview
  15) Static Events
  16) Mode Switch
  17) PWA Install + Update Prompt
  18) Init
  19) Service Worker Registration & Update Detection
========================================================= */


/* =========================
   1) Constants + State + Elements
========================= */

const PERSONAL_STORAGE_KEY = "accounts-personal-v1";
const WORK_STORAGE_KEY = "accounts-work-v1";
const MODE_STORAGE_KEY = "accounts-mode-v1";
const THEME_KEY = "accounts-theme";

const state = {
  mode: loadMode(),
  people: [],
  search: "",
  confirmAction: null,
  reopenEditAfterConfirm: false,
  overviewClosedExpanded: {},
  overviewOpenExpanded: {},
  statsExpanded: false,
  personBalancePrev: {},
  totalBalancePrev: 0,
  longPressTimer: null,
  longPressTriggered: false
};

const peopleListEl = document.getElementById("peopleList");
const emptyStateEl = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");

const fab = document.getElementById("fab");
const menuBtn = document.getElementById("menuBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const menuOverlay = document.getElementById("menuOverlay");
const menuEditStages = document.getElementById("menuEditStages");
const menuTransfer = document.getElementById("menuTransfer");
const menuDelete = document.getElementById("menuDelete");
const importFile = document.getElementById("importFile");

const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalContent = document.getElementById("modalContent");

const confirmOverlay = document.getElementById("confirmOverlay");
const confirmText = document.getElementById("confirmText");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");

const btnPersonal = document.getElementById("modePersonal");
const btnWork = document.getElementById("modeWork");


/* =========================
   2) Helpers
========================= */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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
  if (c === "CAD") return "CAD";
  return "€";
}

function formatMoney(value, currency = "EUR") {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}${currencyLabel(currency)}`;
}

function formatMoneyPlain(value, currency = "EUR") {
  const num = Number(value || 0);
  const sign = num < 0 ? "-" : "";
  return `${sign}${Math.abs(num).toFixed(2)}${currencyLabel(currency)}`;
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
  const n = Number(amount || 0);
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
  if (!isWorkMode()) {
    return escapeHtml(type);
  }

  return type === "Gave"
    ? '<span class="entry-type-money-icon money-green">€</span>'
    : '<span class="entry-type-money-icon money-red">€</span>';
}

function entryTypeToggleContent(type, active) {
  if (!isWorkMode()) {
    if (type === "Gave") {
      return `
        <span class="type-toggle-icon">↗</span>
        <span>Gave</span>
      `;
    }

    return `
      <span class="type-toggle-icon">↘</span>
      <span>Received</span>
    `;
  }

  if (type === "Gave") {
    return `
      <span class="type-toggle-money money-green ${active ? "active" : ""}">€</span>
    `;
  }

  return `
    <span class="type-toggle-money money-red ${active ? "active" : ""}">€</span>
  `;
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
  let gave = 0;
  let received = 0;

  (stage.entries || []).forEach(entry => {
    const amount = Number(entry.amount || 0);
    if (entry.type === "Gave") gave += amount;
    if (entry.type === "Received") received += amount;
  });

  return {
    gave,
    received,
    balance: stageBalance(stage)
  };
}

function personOpenBalance(person) {
  return (person.stages || [])
    .filter(stage => !stage.closed)
    .reduce((sum, stage) => sum + stageBalance(stage), 0);
}

function getOrderedCurrencyEntries(totalsMap) {
  const preferredOrder = ["EUR", "USD", "CAD", "GEL"];
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

function getOverviewBalanceSummary(people = state.people) {
  const totalsMap = getOpenCurrencyTotals(people);
  const orderedEntries = getOrderedCurrencyEntries(totalsMap);
  const nonZeroEntries = orderedEntries.filter(([, amount]) => Math.abs(Number(amount || 0)) > 0.000001);
  const entries = nonZeroEntries.length ? nonZeroEntries : orderedEntries;

  if (!entries.length) {
    return {
      mixed: false,
      amount: 0,
      currency: "EUR",
      label: formatMoney(0, "EUR"),
      breakdown: []
    };
  }

  if (entries.length === 1) {
    const [currency, amount] = entries[0];
    return {
      mixed: false,
      amount,
      currency,
      label: formatMoney(amount, currency),
      breakdown: entries
    };
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

function renderCurrencyBreakdown(entries) {
  if (!entries || !entries.length) return "";

  return `
    <div class="currency-breakdown">
      ${entries.map(([currency, amount]) => `
        <span class="currency-chip ${balanceClass(amount)}">
          ${formatMoneyPlain(amount, currency)}
        </span>
      `).join("")}
    </div>
  `;
}

function closedStagesSummary(person) {
  const closedStages = (person.stages || []).filter(stage => stage.closed);

  if (!closedStages.length) {
    return { count: 0, balance: 0, currency: "EUR" };
  }

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


/* =========================
   3) Storage + Theme
========================= */

function currentStorageKey() {
  return state.mode === "work" ? WORK_STORAGE_KEY : PERSONAL_STORAGE_KEY;
}

function saveData() {
  localStorage.setItem(currentStorageKey(), JSON.stringify(state.people));
}

function loadDataByMode(mode) {
  try {
    const key = mode === "work" ? WORK_STORAGE_KEY : PERSONAL_STORAGE_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function loadMode() {
  const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
  return savedMode === "work" ? "work" : "personal";
}

function saveMode() {
  localStorage.setItem(MODE_STORAGE_KEY, state.mode);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light-theme");
  } else {
    document.body.classList.remove("light-theme");
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-theme");
  const nextTheme = isLight ? "dark" : "light";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}

function loadRawData(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getAllModeData() {
  return {
    personal: loadRawData(PERSONAL_STORAGE_KEY),
    work: loadRawData(WORK_STORAGE_KEY)
  };
}

function hasAnyDataInAnyMode() {
  const allData = getAllModeData();
  return allData.personal.length > 0 || allData.work.length > 0;
}


/* =========================
   4) Finders
========================= */

function findPerson(personId) {
  return state.people.find(person => person.id === personId) || null;
}

function findStage(personId, stageId) {
  const person = findPerson(personId);
  if (!person) return null;
  return (person.stages || []).find(stage => stage.id === stageId) || null;
}

function findEntry(personId, stageId, entryId) {
  const stage = findStage(personId, stageId);
  if (!stage) return null;
  return (stage.entries || []).find(entry => entry.id === entryId) || null;
}

function findOpenStage(personId) {
  const person = findPerson(personId);
  if (!person) return null;
  return (person.stages || []).find(stage => !stage.closed) || null;
}

function closeActiveStage(personId, afterClose = null) {
  const openStage = findOpenStage(personId);
  if (!openStage) return;

  openStage.closed = true;
  saveData();
  render();

  if (typeof afterClose === "function") {
    afterClose(openStage);
  }
}

function confirmCloseAndOpenNewStage(personId) {
  const openStage = findOpenStage(personId);
  if (!openStage) {
    openStageForm(personId);
    return;
  }

  confirmDelete(
    "Active stage will be closed and a new stage will open. Continue?",
    () => {
      closeActiveStage(personId, () => {
        openStageForm(personId);
      });
    },
    false,
    "Close & Open"
  );
}

function confirmEditActiveStage(personId) {
  const openStage = findOpenStage(personId);
  if (!openStage) return;

  confirmDelete(
    "Edit active stage?",
    () => {
      openStageForm(personId, openStage.id);
    },
    false,
    "Edit"
  );
}


/* =========================
   5) Animations
========================= */

function animateValue(el, start, end, duration = 450, currency = "EUR") {
  const startTime = performance.now();
  const diff = end - start;

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + diff * eased;

    el.textContent = formatMoney(current, currency);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = formatMoney(end, currency);
    }
  }

  requestAnimationFrame(frame);
}

function runBalanceAnimations() {
  document.querySelectorAll("[data-animated-balance]").forEach(el => {
    if (el.classList.contains("stats-mixed-balance")) {
      return;
    }

    const target = Number(el.dataset.value || 0);
    const currency = el.dataset.currency || "EUR";
    const previous = Number(el.dataset.prevValue || 0);
    const personId = el.closest(".person-card")?.dataset.personId || null;
    const isStatsTotal = el.classList.contains("stats-value");

    if (previous === target) {
      el.textContent = formatMoney(target, currency);
    } else {
      animateValue(el, previous, target, 420, currency);
    }

    if (personId) state.personBalancePrev[personId] = target;
    if (isStatsTotal) state.totalBalancePrev = target;

    el.dataset.prevValue = String(target);
  });
}


/* =========================
   6) Swipe + Long Press
========================= */

function closeAllSwipes(exceptCard = null) {
  document.querySelectorAll(".swipe-card").forEach(card => {
    if (exceptCard && card === exceptCard) return;

    const content = card.querySelector(".swipe-content");
    if (content) content.style.transform = "";
    card.classList.remove("swipe-open");
  });
}

function setupLongPress(element, callback) {
  let timer = null;
  let startX = 0;
  let startY = 0;

  const hostSwipe = element.closest(".swipe-card");

  const start = e => {
    if (shouldIgnoreGestureTarget(e.target)) return;

    const nearestSwipe = getNearestSwipeCard(e.target);
    if (hostSwipe && nearestSwipe && nearestSwipe !== hostSwipe) return;

    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX;
    startY = point.clientY;

    timer = setTimeout(() => {
      state.longPressTriggered = true;
      callback();
    }, 600);

    state.longPressTimer = timer;
  };

  const move = e => {
    if (!timer) return;

    const point = e.touches ? e.touches[0] : e;
    const dx = Math.abs(point.clientX - startX);
    const dy = Math.abs(point.clientY - startY);

    if (dx > 10 || dy > 10) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    setTimeout(() => {
      state.longPressTriggered = false;
    }, 60);
  };

  element.addEventListener("contextmenu", e => e.preventDefault());
  element.addEventListener("touchstart", start, { passive: true });
  element.addEventListener("touchmove", move, { passive: true });
  element.addEventListener("touchend", cancel);
  element.addEventListener("touchcancel", cancel);

  element.addEventListener("mousedown", start);
  element.addEventListener("mousemove", move);
  element.addEventListener("mouseup", cancel);
  element.addEventListener("mouseleave", cancel);
}

function setupSwipeDelete(card, onDelete) {
  const content = card.querySelector(".swipe-content");
  if (!content) return;

  let deleteAction = card.querySelector(".swipe-delete-action");
  if (!deleteAction) {
    deleteAction = document.createElement("button");
    deleteAction.type = "button";
    deleteAction.className = "swipe-delete-action";
    deleteAction.innerHTML = "<span>Delete</span>";
    card.appendChild(deleteAction);
  }

  const revealWidth = 96;
  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let startYSwipe = 0;

  const setTranslate = x => {
    const safeX = Math.max(-revealWidth, Math.min(0, x));
    content.style.transform = `translateX(${safeX}px)`;
  };

  const openSwipe = () => {
    closeAllSwipes(card);
    card.classList.add("swipe-open");
    content.style.transform = `translateX(-${revealWidth}px)`;
  };

  const closeSwipe = () => {
    card.classList.remove("swipe-open");
    content.style.transform = "";
  };

  deleteAction.onclick = e => {
    e.stopPropagation();
    closeSwipe();
    if (typeof onDelete === "function") onDelete();
  };

  card.addEventListener("touchstart", e => {
    if (shouldIgnoreGestureTarget(e.target)) return;

    const nearestSwipe = getNearestSwipeCard(e.target);
    if (nearestSwipe && nearestSwipe !== card) return;

    closeAllSwipes(card);

    const point = e.touches[0];
    startX = point.clientX;
    currentX = startX;
    startYSwipe = point.clientY;
    dragging = true;
  }, { passive: true });

  card.addEventListener("touchmove", e => {
    if (!dragging) return;

    const nearestSwipe = getNearestSwipeCard(e.target);
    if (nearestSwipe && nearestSwipe !== card) return;

    const point = e.touches[0];
    currentX = point.clientX;

    const dx = currentX - startX;
    const dy = Math.abs(point.clientY - startYSwipe);

    if (dx < -8 && Math.abs(dx) > dy * 1.5) {
      e.preventDefault();
      setTranslate(dx);
    }
  }, { passive: false });

  const endTouch = () => {
    if (!dragging) return;

    dragging = false;
    const dx = currentX - startX;

    if (dx < -48) {
      openSwipe();
    } else {
      closeSwipe();
    }
  };

  card.addEventListener("touchend", endTouch);
  card.addEventListener("touchcancel", endTouch);

  card.addEventListener("click", e => {
    if (card.classList.contains("swipe-open") && !e.target.closest(".swipe-delete-action")) {
      closeSwipe();
    }
  });
}


/* =========================
   7) PDF Export + Quick Actions
========================= */

function buildPdfHtml(people, title = "ACC Export") {
  const isLight = document.body.classList.contains("light-theme");
  const bg = isLight ? "#f4f7fb" : "#13294d";
  const card = isLight ? "#ffffff" : "#1b3158";
  const text = isLight ? "#1d2a3a" : "#eef4ff";
  const muted = isLight ? "#6e7c8f" : "#a7b6cf";
  const line = isLight ? "#e4eaf2" : "#466087";
  const green = isLight ? "#1f9d55" : "#35c26b";
  const red = isLight ? "#d64545" : "#ff6b6b";
  const gray = isLight ? "#7b8794" : "#9aaac4";

  const colorFor = val => Number(val) > 0 ? green : Number(val) < 0 ? red : gray;

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { margin:0; padding:24px; background:${bg}; color:${text};
      font-family:system-ui,-apple-system,sans-serif; font-size:14px; }
    h1 { font-size:22px; font-weight:900; margin:0 0 6px; }
    .sub { color:${muted}; font-size:13px; margin-bottom:24px; }
    .person { background:${card}; border-radius:16px; border:1px solid ${line};
      padding:16px; margin-bottom:20px; page-break-inside:avoid; }
    .person-header { display:flex; justify-content:space-between; align-items:center;
      margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid ${line}; }
    .person-name { font-size:18px; font-weight:900; }
    .balance-pill { font-size:16px; font-weight:900; padding:6px 14px;
      border-radius:999px; background:rgba(0,0,0,0.06); }
    .section-title { font-size:11px; font-weight:800; text-transform:uppercase;
      letter-spacing:.04em; color:${muted}; margin:14px 0 8px; }
    .stage { border:1px solid ${line}; border-radius:12px; margin-bottom:10px; overflow:hidden; }
    .stage-head { display:flex; justify-content:space-between; align-items:center;
      padding:10px 14px; background:rgba(0,0,0,0.03); }
    .stage-name { font-weight:800; font-size:15px; }
    .stage-tag { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px;
      background:rgba(0,0,0,0.08); color:${muted}; margin-left:8px; }
    .entry { display:flex; justify-content:space-between; align-items:center;
      padding:8px 14px; border-top:1px solid ${line}; }
    .entry-type { font-weight:700; font-size:13px; }
    .entry-right { text-align:right; }
    .entry-amount { font-weight:900; font-size:14px; }
    .entry-meta { font-size:12px; color:${muted}; margin-top:2px; }
    .no-entries { padding:10px 14px; font-size:13px; color:${muted}; }
    .totals { display:flex; gap:16px; flex-wrap:wrap; padding:10px 14px;
      background:rgba(0,0,0,0.03); font-size:13px; color:${muted}; border-top:1px solid ${line}; }
    .totals span { font-weight:700; }
    .grand-total { display:flex; justify-content:space-between;
      padding:12px 14px; border-top:2px solid ${line}; margin-top:4px; }
    .grand-label { font-weight:800; font-size:15px; }
    .grand-value { font-weight:900; font-size:16px; }
    @media print { body { background:#fff; } }
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString("ka-GE")} • ${people.length} person(s)</div>`;

  people.forEach(person => {
    const openStages = (person.stages || []).filter(s => !s.closed);
    const closedStages = (person.stages || []).filter(s => s.closed);
    const openBal = personOpenBalance(person);

    html += `<div class="person">
      <div class="person-header">
        <div class="person-name">${escapeHtml(person.name)}</div>
        <div class="balance-pill" style="color:${colorFor(openBal)}">${formatMoney(openBal)}</div>
      </div>`;

    if (person.note) {
      html += `<div style="color:${muted};font-size:13px;margin-bottom:10px;">${escapeHtml(person.note)}</div>`;
    }

    const renderStageGroup = (stages, label) => {
      if (!stages.length) return "";

      let out = `<div class="section-title">${label}</div>`;

      stages.forEach(stage => {
        const bal = stageBalance(stage);
        const cur = stageCurrency(stage);
        const totals = stageTotals(stage);

        out += `<div class="stage">
          <div class="stage-head">
            <div>
              <span class="stage-name">${escapeHtml(stage.name)}</span>
              <span class="stage-tag">${stage.closed ? "Closed" : "Open"}</span>
            </div>
            <div style="font-weight:900;color:${colorFor(bal)}">${formatMoney(bal, cur)}</div>
          </div>`;

        if ((stage.entries || []).length) {
          stage.entries.forEach(entry => {
            const ef = entry.type === "Gave" ? entry.amount : -entry.amount;

            out += `<div class="entry">
              <div>
                <div class="entry-type" style="color:${entry.type === "Gave" ? green : red}">${entry.type}</div>
                ${entry.comment ? `<div style="font-size:12px;color:${muted};margin-top:2px;">${escapeHtml(entry.comment)}</div>` : ""}
              </div>
              <div class="entry-right">
                <div class="entry-amount" style="color:${colorFor(ef)}">${Number(entry.amount).toFixed(2)}${currencyLabel(cur)}</div>
                <div class="entry-meta">${formatDate(entry.date)}</div>
              </div>
            </div>`;
          });

          out += `<div class="totals">
            Out <span>${totals.gave.toFixed(2)}${currencyLabel(cur)}</span> &nbsp;
            In <span>${totals.received.toFixed(2)}${currencyLabel(cur)}</span> &nbsp;
            Net <span style="color:${colorFor(bal)}">${formatMoney(bal, cur)}</span>
          </div>`;
        } else {
          out += `<div class="no-entries">No entries</div>`;
        }

        out += `</div>`;
      });

      return out;
    };

    html += renderStageGroup(openStages, "Open Stage");
    html += renderStageGroup(closedStages, "Closed Stages");

    html += `<div class="grand-total">
      <div class="grand-label">Total Balance</div>
      <div class="grand-value" style="color:${colorFor(openBal)}">${formatMoney(openBal)}</div>
    </div>`;

    html += `</div>`;
  });

  html += `</body></html>`;
  return html;
}

function triggerPdfPrint(html) {
  const win = window.open("", "_blank");

  if (!win) {
    confirmDelete("Pop-up blocked. Please allow pop-ups and try again.", () => {}, false, "OK");
    return;
  }

  win.document.write(html);
  win.document.close();
  win.focus();

  setTimeout(() => {
    win.print();
  }, 400);
}

function exportAllPdf() {
  const allData = getAllModeData();
  const personalPeople = allData.personal || [];
  const workPeople = allData.work || [];

  if (!personalPeople.length && !workPeople.length) {
    confirmDelete("No data to export.", () => {}, false, "OK");
    return;
  }

  const combinedPeople = [
    ...personalPeople.map(person => ({
      ...person,
      name: `[Personal] ${person.name || "Unnamed"}`
    })),
    ...workPeople.map(person => ({
      ...person,
      name: `[Work] ${person.name || "Unnamed"}`
    }))
  ];

  triggerPdfPrint(buildPdfHtml(combinedPeople, "ACC Full Export"));
}

function exportPersonPdf(personId) {
  const person = findPerson(personId);
  if (!person) return;
  triggerPdfPrint(buildPdfHtml([person]));
}

function openQuickActions({ title = "", onEdit, onToggleStage, onExportPerson, onCancel }) {
  const hasEdit = typeof onEdit === "function";
  const hasStageToggle = typeof onToggleStage === "function";
  const hasExport = typeof onExportPerson === "function";

  let actionsHtml = "";

  if (!hasEdit && hasStageToggle) {
    actionsHtml = `
      <div class="quick-actions-row quick-actions-row-2">
        <button type="button" class="secondary-btn" id="quickCancelBtn">Cancel</button>
        <button type="button" class="primary-btn" id="quickToggleStageBtn"></button>
      </div>
    `;
  } else {
    actionsHtml = `
      ${hasStageToggle ? `
        <div style="margin-bottom:10px;">
          <button type="button" class="secondary-btn full-btn" id="quickToggleStageBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;"></button>
        </div>
      ` : ""}

      ${hasExport ? `
        <div style="margin-bottom:10px;">
          <button type="button" class="secondary-btn full-btn" id="quickExportPersonBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;">📄 Export PDF</button>
        </div>
      ` : ""}

      <div class="quick-actions-row ${hasEdit ? "quick-actions-row-2" : ""}" style="${hasEdit ? "" : "display:grid;grid-template-columns:1fr;"}">
        <button type="button" class="secondary-btn ${hasEdit ? "" : "full-btn"}" id="quickCancelBtn">Cancel</button>
        ${hasEdit ? `<button type="button" class="primary-btn" id="quickEditBtn">Edit</button>` : ""}
      </div>
    `;
  }

  openModal(
    title || "Actions",
    actionsHtml,
    () => {
      const cancelBtn = document.getElementById("quickCancelBtn");
      const editBtn = document.getElementById("quickEditBtn");
      const toggleBtn = document.getElementById("quickToggleStageBtn");
      const exportBtn = document.getElementById("quickExportPersonBtn");

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          closeModal();
          if (typeof onCancel === "function") onCancel();
        };
      }

      if (editBtn && hasEdit) {
        editBtn.onclick = () => {
          closeModal();
          onEdit();
        };
      }

      if (toggleBtn && hasStageToggle) {
        toggleBtn.textContent = onToggleStage._label || "Toggle Stage";
        toggleBtn.onclick = () => {
          closeModal();
          onToggleStage();
        };
      }

      if (exportBtn && hasExport) {
        exportBtn.onclick = () => {
          closeModal();
          onExportPerson();
        };
      }
    }
  );
}


/* =========================
   8) Card Action Routing
========================= */

function getActionPayloadFromCard(card) {
  return {
    type: card.dataset.actionType || "",
    personId: card.dataset.personId || "",
    stageId: card.dataset.stageId || "",
    entryId: card.dataset.entryId || "",
    source: card.dataset.source || "main"
  };
}

function openEditByPayload(payload) {
  if (payload.type === "person") {
    openPersonForm(payload.personId);
    return;
  }

  if (payload.type === "stage") {
    openStageForm(
      payload.personId,
      payload.stageId,
      false,
      false,
      payload.source === "overview" ? payload.personId : null
    );
    return;
  }

  if (payload.type === "entry") {
    openEntryForm(
      payload.personId,
      payload.stageId,
      payload.entryId,
      payload.source === "overview" ? payload.personId : null
    );
  }
}

function deleteByPayload(payload) {
  if (payload.type === "person") {
    confirmDelete(
      "Delete this person? All stages and entries will be deleted.",
      () => {
        state.people = state.people.filter(person => person.id !== payload.personId);
        saveData();
        render();
      }
    );
    return;
  }

  if (payload.type === "stage") {
    confirmDelete(
      "Delete this stage?",
      () => {
        const person = findPerson(payload.personId);
        if (!person) return;

        person.stages = (person.stages || []).filter(stage => stage.id !== payload.stageId);
        saveData();
        render();

        if (payload.source === "overview") {
          openOverviewPersonDetail(payload.personId);
        }
      }
    );
    return;
  }

  if (payload.type === "entry") {
    confirmDelete(
      "Delete this entry?",
      () => {
        const stage = findStage(payload.personId, payload.stageId);
        if (!stage) return;

        stage.entries = (stage.entries || []).filter(entry => entry.id !== payload.entryId);
        saveData();
        render();
      }
    );
  }
}

function setupActionCard(card) {
  if (card.dataset.actionsBound === "1") return;
  card.dataset.actionsBound = "1";

  const payload = getActionPayloadFromCard(card);
  if (!payload.type) return;

  const swipeArea = card.querySelector(".swipe-content") || card;

  setupLongPress(swipeArea, () => {
    let onToggleStage = null;
    let onExportPerson = null;

    if (payload.type === "stage") {
      const stage = findStage(payload.personId, payload.stageId);

      if (stage) {
        const isClosed = !!stage.closed;

        const toggleFn = () => {
          if (!isClosed) {
            confirmDelete(
              "Close this stage? You can reopen it later.",
              () => {
                stage.closed = true;
                saveData();
                render();

                if (payload.source === "overview") {
                  openOverviewPersonDetail(payload.personId);
                }
              },
              false,
              "Close"
            );
          } else {
            const existingOpen = findOpenStage(payload.personId);

            if (existingOpen) {
              confirmDelete(
                "This person already has an open stage. Close it first.",
                () => {
                  openOverviewPersonDetail(payload.personId);
                },
                false,
                "OK"
              );
              return;
            }

            stage.closed = false;
            saveData();
            render();

            if (payload.source === "overview") {
              openOverviewPersonDetail(payload.personId);
            }
          }
        };

        toggleFn._label = isClosed ? "🔓 Reopen Stage" : "🔒 Close Stage";
        onToggleStage = toggleFn;
      }
    }

    if (payload.type === "person") {
      onExportPerson = () => exportPersonPdf(payload.personId);
    }

    const allowEdit =
      !(payload.type === "stage" && payload.source === "overview");

    openQuickActions({
      title: payload.type === "person" ? "Person" : payload.type === "stage" ? "Stage" : "Entry",
      onEdit: allowEdit ? () => openEditByPayload(payload) : null,
      onToggleStage,
      onExportPerson,
      onCancel: () => {
        if (payload.source === "overview") {
          openOverviewPersonDetail(payload.personId);
        }
      }
    });
  });

  setupSwipeDelete(card, () => deleteByPayload(payload));
}


/* =========================
   9) Render
========================= */

function renderStatsPeopleList(filteredPeople) {
  if (!filteredPeople.length) {
    return `<div class="empty-state mini-empty">No people yet</div>`;
  }

  return filteredPeople.map(person => {
    const openStage = findOpenStage(person.id);
    const closedCount = (person.stages || []).filter(stage => stage.closed).length;
    const currentCurrency = openStage ? stageCurrency(openStage) : "EUR";

    return `
      <div class="sheet-item stats-person-item" data-person-id="${person.id}">
        <div class="stats-person-head">
          <span class="sheet-item-title">${escapeHtml(person.name)}</span>
          <span class="stats-person-balance ${balanceClass(personOpenBalance(person))}">
            ${formatMoney(personOpenBalance(person), currentCurrency)}
          </span>
        </div>
        <span class="sheet-item-sub">
          ${openStage ? escapeHtml(openStage.name) : "No open stage"} • ${closedCount} closed
        </span>
      </div>
    `;
  }).join("");
}

function refreshPeopleListsOnly() {
  const filteredPeople = getFilteredPeople();

  if (!filteredPeople.length) {
    if (emptyStateEl) emptyStateEl.style.display = "block";
    peopleListEl.innerHTML = "";
    if (emptyStateEl) peopleListEl.appendChild(emptyStateEl);
  } else {
    if (emptyStateEl) emptyStateEl.style.display = "none";
    peopleListEl.innerHTML = filteredPeople.map(renderPerson).join("");
    bindDynamicEvents();
    bindPremiumPressEffects();
    runBalanceAnimations();
  }

  const statsPeopleListEl = document.getElementById("statsPeopleList");
  if (statsPeopleListEl) {
    statsPeopleListEl.innerHTML = renderStatsPeopleList(filteredPeople);
    bindStatsEvents();
  }
}

function renderStats() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;

  const peopleCount = state.people.length;
  const balanceSummary = getOverviewBalanceSummary(state.people);

  const sortedPeople = [...state.people]
    .filter(person => (person.name || "").toLowerCase().includes(state.search.trim().toLowerCase()))
    .sort((a, b) => personLastActivityTs(b) - personLastActivityTs(a));

  statsBar.innerHTML = `
    <div class="stats-wrap">
      <div class="stats-summary" id="statsSummaryToggle">
        <div class="stats-summary-left">
          <div class="stats-box">
            <div class="stats-title">${state.mode === "work" ? "Team" : "People"}</div>
            <div class="stats-value">${peopleCount}</div>
          </div>

          <div class="stats-box">
            <div class="stats-title">Balance</div>
            ${
              balanceSummary.mixed
                ? `
                  <div class="stats-value ${balanceClass(balanceSummary.amount)} stats-mixed-balance">
                    ${balanceSummary.label}
                  </div>
                `
                : `
                  <div
                    class="stats-value ${balanceClass(balanceSummary.amount)}"
                    data-animated-balance
                    data-value="${balanceSummary.amount}"
                    data-prev-value="${state.totalBalancePrev ?? 0}"
                    data-currency="${balanceSummary.currency}"
                  >
                    ${formatMoney(balanceSummary.amount, balanceSummary.currency)}
                  </div>
                `
            }
          </div>
        </div>

        <div class="stats-arrow ${state.statsExpanded ? "open" : ""}">›</div>
      </div>
    </div>
  `;

  // expanded სია — ცალკე fixed overlay
  let overviewPanel = document.getElementById("statsOverviewPanel");
  if (state.statsExpanded) {
    if (!overviewPanel) {
      overviewPanel = document.createElement("div");
      overviewPanel.id = "statsOverviewPanel";
      overviewPanel.className = "stats-overview-panel";
      document.body.appendChild(overviewPanel);
    }
    overviewPanel.innerHTML = `
      <div class="stats-overview-panel-fixed">
        ${
          state.mode === "personal" && balanceSummary.breakdown.length > 1
            ? `<div class="stats-breakdown-wrap">${renderCurrencyBreakdown(balanceSummary.breakdown)}</div>`
            : ""
        }
        <div class="stats-search-wrap">
          <div class="search-box overview-search-box">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="overviewSearchInput"
              placeholder="Search by name..."
              autocomplete="off"
              value="${escapeHtml(state.search)}"
            />
          </div>
        </div>
      </div>
      <div class="stats-overview-panel-scroll">
        <div id="statsPeopleList">
          ${renderStatsPeopleList(sortedPeople)}
        </div>
      </div>
    `;
    overviewPanel.style.display = "";
    overviewPanel.classList.add("active");
    requestAnimationFrame(adjustMainPadding);
  } else {
    if (overviewPanel) {
      overviewPanel.classList.remove("active");
      overviewPanel.innerHTML = "";
    }
  }

  const toggle = document.getElementById("statsSummaryToggle");
  if (toggle) {
    toggle.onclick = e => {
      if (e.target.closest("input")) return;
      if (e.target.closest(".stats-person-item")) return;
      if (e.target.closest(".overview-search-box")) return;

      state.statsExpanded = !state.statsExpanded;
      if (state.statsExpanded) {
        history.pushState({ cards: true }, "");
      }
      render();
    };
  }

  bindStatsEvents();
}

function renderPerson(person) {
  const openStage = findOpenStage(person.id);
  const closedStages = (person.stages || []).filter(stage => stage.closed);
  const openBalance = personOpenBalance(person);
  const entries = openStage ? (openStage.entries || []) : [];
  const totals = openStage ? stageTotals(openStage) : { gave: 0, received: 0, balance: 0 };
  const currentCurrency = openStage ? stageCurrency(openStage) : "EUR";

  return `
    <article class="person-card ${person.expanded ? "expanded" : ""}" data-person-id="${person.id}">
      <div
        class="person-head-swipe swipe-card"
        data-action-type="person"
        data-person-id="${person.id}"
      >
        <div class="swipe-content">
          <div class="person-head" data-toggle-person="${person.id}">
            <div class="person-main">
              <div class="person-name">${highlightMatch(person.name, state.search)}</div>
              <div class="subtext">
                ${openStage ? escapeHtml(openStage.name) : "No open stage"} • ${currencyLabel(currentCurrency)} • ${closedStages.length} closed
              </div>
            </div>

            <div
              class="balance ${balanceClass(openBalance)}"
              data-animated-balance
              data-value="${openBalance}"
              data-prev-value="${state.personBalancePrev[person.id] ?? 0}"
              data-currency="${currentCurrency}"
            >
              ${formatMoney(openBalance, currentCurrency)}
            </div>

            <div class="stats-arrow ${person.expanded ? "open" : ""}">›</div>
          </div>
        </div>
      </div>

      <div class="person-body">
        ${
          openStage
            ? `
              <div class="person-body-top-totals">
                <div class="totals-line">
                  <span>↑ ${totals.gave.toFixed(2)}${currencyLabel(currentCurrency)}</span>
                  <span>↓ ${totals.received.toFixed(2)}${currencyLabel(currentCurrency)}</span>
                  <span class="${balanceClass(totals.balance)}">Net ${formatMoney(totals.balance, currentCurrency)}</span>
                </div>
              </div>
            `
            : ""
        }

        <div class="person-body-scroll">
          <div class="entry-list">
            ${
              entries.length
                ? entries.map(entry => renderEntry(person.id, openStage.id, openStage, entry)).join("")
                : `<div class="empty-state mini-empty">No entries yet</div>`
            }
          </div>
        </div>

        <div class="person-body-footer">
  <div class="person-actions">
    ${
      openStage
        ? `<button class="primary-btn" data-add-entry-person="${person.id}">+ Add Entry</button>`
        : `<button class="primary-btn" data-add-stage="${person.id}">+ Add Stage</button>`
    }
  </div>

  ${
    openStage
      ? `
        <div class="quick-actions-row quick-actions-row-2">
  <button class="secondary-btn" data-open-next-stage="${person.id}">🔒 Open Stage</button>
  <button class="secondary-btn" data-edit-active-stage="${person.id}">✏️ Edit</button>
</div>
      `
      : ""
  }
</div>
      </div>
    </article>
  `;
}

function renderEntry(personId, stageId, stage, entry, source = "main") {
  const effect = entryEffect(entry.type, entry.amount);
  const currentCurrency = stageCurrency(stage);

  return `
    <div
      class="entry-card swipe-card"
      data-action-type="entry"
      data-person-id="${personId}"
      data-stage-id="${stageId}"
      data-entry-id="${entry.id}"
      data-source="${source}"
    >
      <div class="swipe-content">
        <div class="entry-top">
          <div class="entry-type ${typeLabelClass(entry.type)}">${entryTypeVisual(entry.type)}</div>
          <div class="entry-amount ${balanceClass(effect)}">${Number(entry.amount).toFixed(2)}${currencyLabel(currentCurrency)}</div>
        </div>

        ${entry.comment ? `<div class="entry-comment">${escapeHtml(entry.comment)}</div>` : ""}

        <div class="entry-meta">${formatDate(entry.date)}</div>
      </div>
    </div>
  `;
}

function adjustMainPadding() {
  const topbar = document.querySelector(".topbar");
  const mainEl = document.querySelector("main");
  if (!topbar || !mainEl) return;
  const h = topbar.getBoundingClientRect().height;
  mainEl.style.paddingTop = (h + 16) + "px";

  const panel = document.getElementById("statsOverviewPanel");
  if (panel && panel.classList.contains("active")) {
    panel.style.top = h + "px";
    panel.style.bottom = "0";
    panel.style.height = "";
  }
}

function syncFab() {
  if (fab.classList.contains("fab-back")) return; // modal ღიაა — არ შევეხოთ
  
  const anyExpanded = state.people.some(p => p.expanded);
  const isPromptOpen = document.querySelector('.overlay.show') !== null;
  
  if (anyExpanded || isPromptOpen) {
    fab.classList.add("fab-hidden");
  } else {
    fab.classList.remove("fab-hidden");
  }
}

function render() {
  const filteredPeople = getFilteredPeople();

  if (!filteredPeople.length) {
    if (emptyStateEl) emptyStateEl.style.display = "block";
    peopleListEl.innerHTML = "";
    if (emptyStateEl) peopleListEl.appendChild(emptyStateEl);
    renderStats();
    requestAnimationFrame(adjustMainPadding);
    syncFab();
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = "none";
  peopleListEl.innerHTML = filteredPeople.map(renderPerson).join("");
  bindDynamicEvents();
  bindPremiumPressEffects();
  renderStats();
  bindStatsEvents();
  runBalanceAnimations();
  requestAnimationFrame(adjustMainPadding);
  syncFab();
}


/* =========================
   10) Dynamic Events
========================= */

function bindStatsEvents() {
  const overviewSearchInput = document.getElementById("overviewSearchInput");

  if (overviewSearchInput && overviewSearchInput.dataset.bound !== "1") {
    overviewSearchInput.dataset.bound = "1";

    overviewSearchInput.onclick = e => {
      e.stopPropagation();
    };

    overviewSearchInput.onfocus = e => {
      e.stopPropagation();
    };

    overviewSearchInput.oninput = e => {
      e.stopPropagation();
      state.search = e.target.value;
      refreshPeopleListsOnly();
    };

    overviewSearchInput.onkeydown = e => {
      if (e.key === "Backspace" && !overviewSearchInput.value) {
        overviewSearchInput.blur();
      }
    };
  }

  document.querySelectorAll(".stats-person-item").forEach(item => {
    item.onclick = e => {
      e.stopPropagation();
      openOverviewPersonDetail(item.dataset.personId);
    };
  });
}

function bindPremiumPressEffects() {
  document.querySelectorAll(".person-card").forEach(card => {
    const head = card.querySelector(".person-head");
    if (!head) return;

    const pressStart = () => {
      card.style.transform = "translateY(1px) scale(0.992)";
    };

    const pressEnd = () => {
      card.style.transform = "";
    };

    head.addEventListener("touchstart", pressStart, { passive: true });
    head.addEventListener("touchend", pressEnd, { passive: true });
    head.addEventListener("touchcancel", pressEnd, { passive: true });

    head.addEventListener("mousedown", pressStart);
    head.addEventListener("mouseup", pressEnd);
    head.addEventListener("mouseleave", pressEnd);
  });

  const statsSummary = document.getElementById("statsSummaryToggle");
  const statsWrap = document.querySelector(".stats-wrap");

  if (statsSummary && statsWrap) {
    const pressStart = () => {
      statsWrap.style.transform = "translateY(1px) scale(0.992)";
    };

    const pressEnd = () => {
      statsWrap.style.transform = "";
    };

    statsSummary.addEventListener("touchstart", pressStart, { passive: true });
    statsSummary.addEventListener("touchend", pressEnd, { passive: true });
    statsSummary.addEventListener("touchcancel", pressEnd, { passive: true });

    statsSummary.addEventListener("mousedown", pressStart);
    statsSummary.addEventListener("mouseup", pressEnd);
    statsSummary.addEventListener("mouseleave", pressEnd);
  }
}

function animatePersonCard(card, expand) {
  const body = card.querySelector(".person-body");
  if (!body) return;

  const modalIsOpen = () => fab.classList.contains("fab-back");

  body.style.overflow = "hidden";
  body.style.willChange = "height, opacity";
  body.style.transition = "none";

  if (expand) {
    body.style.height = "0px";
    body.style.opacity = "0";

    if (!modalIsOpen()) fab.classList.add("fab-hidden");

    requestAnimationFrame(() => {
      card.classList.add("expanded");

      const targetHeight = body.scrollHeight;
      void body.offsetHeight;

      body.style.transition = "height 0.28s ease, opacity 0.22s ease";
      body.style.height = `${targetHeight}px`;
      body.style.opacity = "1";

      const onEnd = event => {
        if (event.target !== body || event.propertyName !== "height") return;

        body.style.height = "auto";
        body.style.transition = "";
        body.style.willChange = "";
        body.style.overflow = "";
        body.removeEventListener("transitionend", onEnd);
      };

      body.addEventListener("transitionend", onEnd);
    });
  } else {
    const currentHeight = body.getBoundingClientRect().height;
    body.style.height = `${currentHeight}px`;
    body.style.opacity = "1";
    void body.offsetHeight;

    requestAnimationFrame(() => {
      body.style.transition = "height 0.24s ease, opacity 0.18s ease";
      body.style.height = "0px";
      body.style.opacity = "0";

      const onEnd = event => {
        if (event.target !== body || event.propertyName !== "height") return;

        card.classList.remove("expanded");

        body.style.height = "";
        body.style.opacity = "";
        body.style.transition = "";
        body.style.willChange = "";
        body.style.overflow = "";
        body.removeEventListener("transitionend", onEnd);

        if (!modalIsOpen()) {
          const anyExpanded = state.people.some(p => p.expanded);
          if (!anyExpanded) fab.classList.remove("fab-hidden");
        }
      };

      body.addEventListener("transitionend", onEnd);
    });
  }
}

function bindDynamicEvents() {
  document.querySelectorAll("[data-toggle-person]").forEach(el => {
    el.onclick = () => {
      if (state.longPressTriggered) return;

      const person = findPerson(el.dataset.togglePerson);
      if (!person) return;

      const card = el.closest(".person-card");
      if (!card) return;

      const willExpand = !person.expanded;

      if (willExpand && state.statsExpanded) {
        state.statsExpanded = false;
        render();
        return;
      }

      person.expanded = willExpand;
      saveData();
      animatePersonCard(card, willExpand);

      if (willExpand) {
        history.pushState({ cards: true }, "");
      }
    };
  });

  document.querySelectorAll("[data-add-stage]").forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      openStageForm(el.dataset.addStage);
    };
  });

  document.querySelectorAll("[data-add-entry-person]").forEach(el => {
    el.onclick = e => {
      e.stopPropagation();

      const personId = el.dataset.addEntryPerson;
      const openStage = findOpenStage(personId);

      if (openStage) {
        openEntryForm(personId, openStage.id);
      } else {
        openStageForm(personId, null, true);
      }
    };
  });
  document.querySelectorAll("[data-open-next-stage]").forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      confirmCloseAndOpenNewStage(el.dataset.openNextStage);
    };
  });

  document.querySelectorAll("[data-edit-active-stage]").forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      confirmEditActiveStage(el.dataset.editActiveStage);
    };
  });

  document.querySelectorAll(".swipe-card").forEach(card => {
    setupActionCard(card);
  });
}


/* =========================
   11) Modal Helpers
========================= */

let _suppressPopstate = false;

function openModal(title, html, afterOpen) {
  modalTitle.textContent = title;
  modalContent.innerHTML = html;
  modalOverlay.classList.add("show");

  fab.classList.remove("fab-hidden");
  fab.classList.add("fab-back");
  fab.style.pointerEvents = "";
  fab.style.opacity = "";
  fab.textContent = "←";
  fab.onclick = closeModal;

  history.pushState({ modal: true }, "");

  if (typeof afterOpen === "function") afterOpen();
}

function closeModal() {
  modalOverlay.classList.remove("show");
  modalContent.innerHTML = "";

  fab.classList.remove("fab-back");
  fab.style.pointerEvents = "";
  fab.style.opacity = "";
  fab.textContent = "+";
  fab.onclick = openMainAddMenu;

  const anyExpanded = state.people.some(p => p.expanded);
  if (anyExpanded) {
    fab.classList.add("fab-hidden");
  } else {
    fab.classList.remove("fab-hidden");
  }

  requestAnimationFrame(() => render());
}

window.addEventListener("popstate", () => {
  if (_suppressPopstate) {
    _suppressPopstate = false;
    return;
  }

  if (modalOverlay.classList.contains("show")) {
    // modal დახურვა history.back() გარეშე — pushState უკვე გაკეთდა გახსნისას
    modalOverlay.classList.remove("show");
    modalContent.innerHTML = "";
    fab.classList.remove("fab-back");
    fab.style.pointerEvents = "";
    fab.style.opacity = "";
    fab.textContent = "+";
    fab.onclick = openMainAddMenu;
    const anyExpanded = state.people.some(p => p.expanded);
    if (anyExpanded) {
      fab.classList.add("fab-hidden");
    } else {
      fab.classList.remove("fab-hidden");
    }
    requestAnimationFrame(() => render());
    return;
  }

  if (confirmOverlay.classList.contains("show")) {
    closeConfirm();
    return;
  }

  if (state.statsExpanded) {
    state.statsExpanded = false;
    render();
    return;
  }

  const anyExpanded = state.people.some(p => p.expanded);
  if (anyExpanded) {
    state.people.forEach(p => { p.expanded = false; });
    saveData();
    render();
    return;
  }
});


/* =========================
   12) Forms
========================= */

function openPersonForm(personId = null, reopenEditPanel = false) {
  const person = personId ? findPerson(personId) : null;

  openModal(
    person ? (state.mode === "work" ? "Edit Team" : "Edit Person") : (state.mode === "work" ? "Add Team" : "Add Person"),
    `
      <form class="form" id="personForm">
        <div class="field">
          <label for="personName">Name</label>
          <input id="personName" name="name" type="text" maxlength="80" required placeholder="Example: John" value="${person ? escapeHtml(person.name) : ""}">
        </div>

        <div class="form-actions">
          <button type="button" class="secondary-btn" id="cancelModalBtn">Cancel</button>
          <button type="submit" class="primary-btn">Save</button>
        </div>
      </form>
    `,
    () => {
      const form = document.getElementById("personForm");
      const cancelBtn = document.getElementById("cancelModalBtn");

      cancelBtn.onclick = () => {
        if (reopenEditPanel) {
          openEditStagesPanel();
        } else {
          closeModal();
        }
      };

      form.onsubmit = e => {
        e.preventDefault();

        const fd = new FormData(form);
        const name = String(fd.get("name") || "").trim();

        if (!name) return;

        if (person) {
          person.name = name;
          saveData();
          render();
          if (reopenEditPanel) {
            openEditStagesPanel();
          } else {
            closeModal();
          }
        } else {
          const newId = uid();
          state.people.unshift({
            id: newId,
            name,
            expanded: true,
            stages: []
          });
          saveData();
          closeModal();
          requestAnimationFrame(() => {
            render();
            requestAnimationFrame(() => {
              const card = document.querySelector(`[data-person-id="${newId}"]`);
              if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
              openStageForm(newId, null, true);
            });
          });
        }
      };
    }
  );
}

function openStageForm(
  personId,
  stageId = null,
  openEntryAfterSave = false,
  reopenEditPanel = false,
  reopenOverviewPersonId = null
) {
  const person = findPerson(personId);
  const stage = stageId ? findStage(personId, stageId) : null;

  if (!person) return;

  if (!stage) {
    const existingOpenStage = findOpenStage(personId);
    if (existingOpenStage) {
      alert("This person already has an open stage.");
      return;
    }
  }

  openModal(
    stage ? "Edit Stage" : "Add Stage",
    `
      <form class="form" id="stageForm">
        <div class="field">
          <label for="stageName">Stage Name</label>
          <input id="stageName" name="name" type="text" maxlength="100" required placeholder="Example: Main Job" value="${stage ? escapeHtml(stage.name) : ""}">
        </div>

        <div class="field">
          <label for="stageCurrency">Currency</label>
          <select id="stageCurrency" name="currency">
            <option value="EUR" ${(stage?.currency || "EUR") === "EUR" ? "selected" : ""}>€</option>
            <option value="USD" ${(stage?.currency || "EUR") === "USD" ? "selected" : ""}>$</option>
            <option value="GEL" ${(stage?.currency || "EUR") === "GEL" ? "selected" : ""}>₾</option>
            <option value="CAD" ${(stage?.currency || "EUR") === "CAD" ? "selected" : ""}>CAD</option>
          </select>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary-btn" id="cancelModalBtn">Cancel</button>
          <button type="submit" class="primary-btn">Save</button>
        </div>
      </form>
    `,
    () => {
      const form = document.getElementById("stageForm");
      const cancelBtn = document.getElementById("cancelModalBtn");

      cancelBtn.onclick = () => {
        if (reopenOverviewPersonId) {
          openOverviewPersonDetail(reopenOverviewPersonId);
        } else if (reopenEditPanel) {
          openEditStagesPanel();
        } else {
          closeModal();
        }
      };

      form.onsubmit = e => {
        e.preventDefault();

        const fd = new FormData(form);
        const name = String(fd.get("name") || "").trim();
        const note = "";
        const currency = String(fd.get("currency") || "EUR");
        const oldCurrency = stage ? stageCurrency(stage) : "EUR";
        const hasEntries = !!(stage && (stage.entries || []).length);

        if (!name) return;

        let savedStageId = stageId;

        if (stage && hasEntries && currency !== oldCurrency) {
          confirmDelete(
            "This stage already has entries. Do you really want to change the currency?",
            () => {
              stage.name = name;
              stage.note = note;
              stage.currency = currency;

              saveData();
              render();

              if (openEntryAfterSave && savedStageId) {
                openEntryForm(personId, savedStageId, null, reopenOverviewPersonId);
              } else if (reopenOverviewPersonId) {
                openOverviewPersonDetail(reopenOverviewPersonId);
              } else if (reopenEditPanel) {
                openEditStagesPanel();
              } else {
                closeModal();
              }
            },
            false,
            "Change"
          );
          return;
        }

        if (stage) {
          stage.name = name;
          stage.note = note;
          stage.currency = currency;
        } else {
          person.expanded = true;

          const newStage = {
            id: uid(),
            name,
            note,
            currency,
            createdAt: todayStr(),
            closed: false,
            expanded: true,
            entries: []
          };

          person.stages.unshift(newStage);
          savedStageId = newStage.id;
        }

        saveData();

        if (openEntryAfterSave && savedStageId) {
          openEntryForm(personId, savedStageId);
        } else if (reopenEditPanel) {
          openEditStagesPanel();
        } else {
          closeModal();
        }
      };
    }
  );
}

function openEntryForm(personId, stageId, entryId = null, reopenOverviewPersonId = null) {
  const stage = findStage(personId, stageId);
  const entry = entryId ? findEntry(personId, stageId, entryId) : null;

  if (!stage) return;

  openModal(
    entry ? "Edit Entry" : "Add Entry",
    `
      <form class="form" id="entryForm">
        <div class="field">
          <label for="entryAmount">Amount</label>
          <input id="entryAmount" name="amount" type="number" step="0.01" min="0.01" required placeholder="Example: 50" value="${entry ? escapeHtml(entry.amount) : ""}">
        </div>

        <div class="field">
          <label>Type</label>

          <div class="type-toggle" id="entryTypeToggle">
            <button
              type="button"
              class="type-toggle-btn ${(entry?.type || "Gave") === "Gave" ? "active gave" : ""}"
              data-entry-type="Gave"
            >
              ${entryTypeToggleContent("Gave", (entry?.type || "Gave") === "Gave")}
            </button>

            <button
              type="button"
              class="type-toggle-btn ${(entry?.type || "Gave") === "Received" ? "active received" : ""}"
              data-entry-type="Received"
            >
              ${entryTypeToggleContent("Received", (entry?.type || "Gave") === "Received")}
            </button>
          </div>

          <input
            type="hidden"
            id="entryType"
            name="type"
            value="${entry?.type || "Gave"}"
          >
        </div>

        <div class="field">
          <label for="entryDate">Date</label>
          <input id="entryDate" name="date" type="date" value="${entry ? escapeHtml(entry.date) : todayStr()}">
        </div>

        <div class="field">
          <label for="entryComment">Comment</label>
          <textarea id="entryComment" name="comment" placeholder="Optional">${entry ? escapeHtml(entry.comment || "") : ""}</textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary-btn" id="cancelModalBtn">Cancel</button>
          <button type="submit" class="primary-btn">Save</button>
        </div>
      </form>
    `,
    () => {
      const form = document.getElementById("entryForm");
      const cancelBtn = document.getElementById("cancelModalBtn");
      const typeInput = document.getElementById("entryType");
      const typeButtons = document.querySelectorAll("[data-entry-type]");

      cancelBtn.onclick = () => {
        if (reopenOverviewPersonId) {
          openOverviewPersonDetail(reopenOverviewPersonId);
        } else {
          closeModal();
        }
      };

      typeButtons.forEach(btn => {
        btn.onclick = () => {
          const nextType = btn.dataset.entryType || "Gave";
          typeInput.value = nextType;

          typeButtons.forEach(b => {
            const type = b.dataset.entryType || "Gave";
            const isActive = type === nextType;

            b.classList.remove("active", "gave", "received");

            if (isActive) {
              b.classList.add("active");
              b.classList.add(type === "Gave" ? "gave" : "received");
            }

            b.innerHTML = entryTypeToggleContent(type, isActive);
          });
        };
      });

      form.onsubmit = e => {
        e.preventDefault();

        const fd = new FormData(form);
        const amount = Number(fd.get("amount") || 0);
        const type = String(fd.get("type") || "");
        const date = String(fd.get("date") || todayStr());
        const comment = String(fd.get("comment") || "").trim();

        if (!amount || amount <= 0 || !type) return;

        if (entry) {
          entry.amount = amount;
          entry.type = type;
          entry.date = date;
          entry.comment = comment;
        } else {
          stage.entries.unshift({
            id: uid(),
            amount,
            type,
            date,
            comment
          });
        }

        saveData();

        if (reopenOverviewPersonId) {
          openOverviewPersonDetail(reopenOverviewPersonId);
        } else {
          closeModal();
        }
      };
    }
  );
}


/* =========================
   13) Confirm
========================= */

function confirmDelete(text, onOk, reopenEdit = false, okLabel = "Delete") {
  state.confirmAction = onOk;
  state.reopenEditAfterConfirm = reopenEdit;
  confirmText.textContent = text;
  confirmOk.textContent = okLabel;
  confirmOverlay.classList.add("show");
  fab.classList.add("fab-hidden");
}

function closeConfirm() {
  state.confirmAction = null;
  confirmOverlay.classList.remove("show");
  fab.classList.remove("fab-hidden");
}


/* =========================
   14) Menus + Overview
========================= */

function openTransferActionsModal() {
  openModal(
    "Data Transfer",
    `
      <div class="quick-actions-row quick-actions-row-2" style="margin-bottom:10px;">
        <button type="button" class="secondary-btn" id="transferImportBtn">⬇️ Import JSON</button>
        <button type="button" class="primary-btn" id="transferExportBtn">⬆️ Export JSON</button>
      </div>

      <div class="quick-actions-row quick-actions-row-2" style="margin-bottom:10px;">
        <button type="button" class="secondary-btn" id="transferExportAllPdfBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:14px;">📄 Export All PDF</button>
        <button type="button" class="primary-btn" id="transferExportPersonPdfBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:14px;">👤 Export Person PDF</button>
      </div>

      <div class="quick-actions-row" style="display:grid;grid-template-columns:1fr;">
        <button type="button" class="danger-btn" id="transferCancelBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;">Cancel</button>
      </div>
    `,
    () => {
      const importBtn = document.getElementById("transferImportBtn");
      const cancelBtn = document.getElementById("transferCancelBtn");
      const exportBtn = document.getElementById("transferExportBtn");
      const exportAllPdfBtn = document.getElementById("transferExportAllPdfBtn");
      const exportPersonPdfBtn = document.getElementById("transferExportPersonPdfBtn");

      if (cancelBtn) {
        cancelBtn.onclick = closeModal;
      }

      if (exportBtn) {
        exportBtn.onclick = () => {
          exportJsonBackup();
          closeModal();
        };
      }

      if (exportAllPdfBtn) {
        exportAllPdfBtn.onclick = () => {
          closeModal();
          exportAllPdf();
        };
      }

      if (exportPersonPdfBtn) {
        exportPersonPdfBtn.onclick = () => {
          closeModal();
          openChoosePersonForPdf();
        };
      }

      if (importBtn) {
        importBtn.onclick = () => {
          closeModal();
          confirmDelete(
            "Importing a file will replace your current data. Continue?",
            () => {
              importFile.click();
            },
            false,
            "Import"
          );
        };
      }
    }
  );
}

function openChoosePersonForPdf() {
  openModal(
    "Choose a Person",
    `
      ${state.people.map(person => `
        <div class="sheet-item choose-person-pdf" data-person-id="${person.id}">
          <span class="sheet-item-title">${escapeHtml(person.name)}</span>
          <span class="sheet-item-sub">${formatMoney(personOpenBalance(person))}</span>
        </div>
      `).join("")}
    `,
    () => {
      document.querySelectorAll(".choose-person-pdf").forEach(btn => {
        btn.onclick = () => {
          const personId = btn.dataset.personId;
          closeModal();
          exportPersonPdf(personId);
        };
      });
    }
  );
}

function openMainAddMenu() {
  const isWork = state.mode === "work";
  openModal(
    "Add New",
    `
      <div class="sheet-list">
        <div class="sheet-item" id="quickAddPerson">
          <span class="sheet-item-title">${isWork ? "Add Team" : "Add Person"}</span>
          <span class="sheet-item-sub">${isWork ? "Create a new team" : "Create a new person"}</span>
        </div>

        <div class="sheet-item" id="quickAddEntry">
          <span class="sheet-item-title">Add Entry</span>
          <span class="sheet-item-sub">${isWork ? "Choose a team" : "Choose a person"}</span>
        </div>
      </div>
    `,
    () => {
      const addPersonBtn = document.getElementById("quickAddPerson");
      const addEntryBtn = document.getElementById("quickAddEntry");

      if (addPersonBtn) {
        addPersonBtn.onclick = () => {
          openPersonForm();
        };
      }

      if (addEntryBtn) {
        addEntryBtn.onclick = () => {
          if (!state.people.length) {
            alert(isWork ? "Add a team first." : "Add a person first.");
            return;
          }

          openChoosePersonForEntry();
        };
      }
    }
  );
}

function openEditStagesPanel() {
  openModal(
    "Edit",
    `
      <div class="empty-state mini-empty">Long press any card to edit. Swipe left to delete.</div>
    `,
    () => {}
  );
}

function personTotalBalanceByCurrency(person) {
  const totals = {};
  (person.stages || []).forEach(stage => {
    const currency = stageCurrency(stage);
    const balance = stageBalance(stage);
    totals[currency] = (totals[currency] || 0) + balance;
  });
  return totals;
}

function openOverviewPersonDetail(personId) {
  const person = findPerson(personId);
  if (!person) return;

  const openStage = findOpenStage(person.id);
  const closedStages = (person.stages || []).filter(stage => stage.closed);
  const currentCurrency = openStage ? stageCurrency(openStage) : "EUR";
  const closedSummary = closedStagesSummary(person);
  const openEntriesExpanded = !!state.overviewOpenExpanded[person.id];

  openModal(
    `${escapeHtml(person.name)} — Details`,
    `
      <div class="inline-note overview-summary-grid">
        <div class="overview-summary-row">
          <span class="overview-summary-label">Total Balance</span>
          <span class="overview-summary-value">
            ${(() => {
              const totals = personTotalBalanceByCurrency(person);
              const ordered = getOrderedCurrencyEntries(totals);
              if (!ordered.length) {
                return `<span class="gray">${formatMoney(0, "EUR")}</span>`;
              }
              if (ordered.length === 1) {
                const [currency, amount] = ordered[0];
                return `<span class="${balanceClass(amount)}">${formatMoney(amount, currency)}</span>`;
              }
              return `<span class="overview-summary-value-stack">
                ${ordered.map(([currency, amount]) =>
                  `<span class="${balanceClass(amount)}">${formatMoney(amount, currency)}</span>`
                ).join("")}
              </span>`;
            })()}
          </span>
        </div>

        <div class="overview-summary-row">
          <span class="overview-summary-label">Open Stage</span>
          <span class="overview-summary-value">
            ${openStage ? escapeHtml(openStage.name) : "None"}
          </span>
        </div>

        <div class="overview-summary-row">
          <span class="overview-summary-label overview-summary-label-with-badge">
            <span>Closed Stages</span>
            <span class="mini-count-badge">${closedSummary.count}</span>
          </span>
          <span class="overview-summary-value">
            <span class="${balanceClass(closedSummary.balance)}">
              ${formatMoney(closedSummary.balance, closedSummary.currency)}
            </span>
          </span>
        </div>
      </div>

      ${
        openStage
          ? `
            <div
              class="open-stage-mini-card swipe-card"
              data-action-type="stage"
              data-person-id="${person.id}"
              data-stage-id="${openStage.id}"
              data-source="overview"
            >
              <div class="swipe-content">
                <div class="open-stage-mini-inner" data-toggle-open-entries="${person.id}">
                  <div class="open-stage-mini-left">
                    <div class="stage-title-row">
                      <span class="open-stage-mini-title">${escapeHtml(openStage.name)}</span>
                      <span class="mini-count-badge">${(openStage.entries || []).length}</span>
                    </div>
                    ${""}
                  </div>
                  <div class="open-stage-mini-right">
                    <div class="open-stage-mini-balance ${balanceClass(stageBalance(openStage))}">
                      ${formatMoney(stageBalance(openStage), stageCurrency(openStage))}
                    </div>
                    <span class="closed-stage-chev ${openEntriesExpanded ? "open" : ""}">›</span>
                  </div>
                </div>
              </div>
            </div>

            ${
              openEntriesExpanded
                ? `
                  <div class="entry-list" style="margin-top:8px;">
                    ${
                      (openStage.entries || []).length
                        ? openStage.entries.map(entry => renderEntry(person.id, openStage.id, openStage, entry, "overview")).join("")
                        : `<div class="empty-state mini-empty">No entries</div>`
                    }
                  </div>
                `
                : ""
            }
          `
          : ""
      }

      ${
        closedStages.length
          ? `
            <div class="section-label">Closed Stages</div>
            <div class="sheet-list">
              ${closedStages.map(stage => {
                const isExpanded = !!state.overviewClosedExpanded[stage.id];

                return `
                  <div
                    class="sheet-item closed-stage-item swipe-card"
                    data-action-type="stage"
                    data-person-id="${person.id}"
                    data-stage-id="${stage.id}"
                    data-source="overview"
                  >
                    <div class="swipe-content">
                      <div class="closed-stage-head" data-toggle-closed-stage="${stage.id}">
                        <div class="closed-stage-col closed-stage-left">
                          <div class="stage-title-row">
                            <span class="sheet-item-title">${escapeHtml(stage.name)}</span>
                            <span class="mini-count-badge">${(stage.entries || []).length}</span>
                          </div>
                        </div>

                        <div class="closed-stage-col closed-stage-right">
                          <span class="closed-stage-balance ${balanceClass(stageBalance(stage))}">
                            ${formatMoney(stageBalance(stage), stageCurrency(stage))}
                          </span>
                          <span class="closed-stage-chev ${isExpanded ? "open" : ""}">›</span>
                        </div>
                      </div>

                      ${
                        isExpanded
                          ? `
                            <div class="closed-stage-body">
                              ${
                                (stage.entries || []).length
                                  ? stage.entries.map(entry => renderEntry(person.id, stage.id, stage, entry, "overview")).join("")
                                  : `<div class="empty-state mini-empty">No entries</div>`
                              }
                            </div>
                          `
                          : ""
                      }
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : ""
      }
    `,
    () => {
      document.querySelectorAll("[data-toggle-open-entries]").forEach(btn => {
        btn.onclick = e => {
          if (state.longPressTriggered) return;
          if (e.target.closest(".swipe-delete-action")) return;

          const current = !!state.overviewOpenExpanded[person.id];
          state.overviewOpenExpanded[person.id] = !current;
          openOverviewPersonDetail(personId);
        };
      });

      document.querySelectorAll("[data-toggle-closed-stage]").forEach(btn => {
        btn.onclick = () => {
          if (state.longPressTriggered) return;

          const stageId = btn.dataset.toggleClosedStage;
          state.overviewClosedExpanded[stageId] = !state.overviewClosedExpanded[stageId];
          openOverviewPersonDetail(personId);
        };
      });

      document.querySelectorAll(".swipe-card").forEach(card => {
        setupActionCard(card);
      });

      closeAllSwipes();
    }
  );
}

function openChoosePersonForEntry() {
  openModal(
    "Choose a Person",
    `
      ${state.people.map(person => `
        <div class="sheet-item choose-person-entry" data-person-id="${person.id}">
          <span class="sheet-item-title">${escapeHtml(person.name)}</span>
          <span class="sheet-item-sub">Balance: ${formatMoney(personOpenBalance(person))}</span>
        </div>
      `).join("")}
    `,
    () => {
      document.querySelectorAll(".choose-person-entry").forEach(btn => {
        btn.onclick = () => {
          const personId = btn.dataset.personId;
          const openStage = findOpenStage(personId);

          if (openStage) {
            openEntryForm(personId, openStage.id);
          } else {
            openStageForm(personId, null, true);
          }
        };
      });
    }
  );
}


/* =========================
   15) Static Events
========================= */

if (searchInput) {
  const debouncedRender = debounce(() => render(), 300);
  searchInput.addEventListener("input", e => {
    state.search = e.target.value;
    debouncedRender();
  });
}

fab.onclick = openMainAddMenu;

if (menuBtn) {
  menuBtn.classList.add("transfer-btn");
  menuBtn.textContent = "⇄";
  menuBtn.setAttribute("aria-label", "Import / Export");
  menuBtn.addEventListener("click", openTransferActionsModal);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    toggleTheme();
  });
}

if (menuOverlay) menuOverlay.style.display = "none";
if (menuEditStages) menuEditStages.style.display = "none";
if (menuTransfer) menuTransfer.style.display = "none";
if (menuDelete) menuDelete.style.display = "none";

confirmOverlay.addEventListener("click", e => {
  if (e.target === confirmOverlay) {
    closeConfirm();

    if (state.reopenEditAfterConfirm) {
      openEditStagesPanel();
    }
  }
});

confirmCancel.addEventListener("click", () => {
  closeConfirm();

  if (state.reopenEditAfterConfirm) {
    openEditStagesPanel();
  }
});

confirmOk.addEventListener("click", () => {
  if (typeof state.confirmAction === "function") {
    state.confirmAction();
  }

  closeConfirm();

  if (state.reopenEditAfterConfirm) {
    openEditStagesPanel();
  }
});

importFile.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const isFullBackup =
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Array.isArray(data.personal) &&
      Array.isArray(data.work);

    if (!isFullBackup) {
      throw new Error("Invalid backup file");
    }

    localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(data.personal));
    localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(data.work));

    state.people = loadDataByMode(state.mode).map(person => ({
      ...person,
      expanded: false
    }));

    render();
    closeModal();
  } catch (error) {
    alert("Could not read the backup file.");
  } finally {
    importFile.value = "";
  }
});

document.addEventListener("click", e => {
  if (!e.target.closest(".swipe-card")) {
    closeAllSwipes();
  }

  const overviewSearchInput = document.getElementById("overviewSearchInput");
  if (
    overviewSearchInput &&
    document.activeElement === overviewSearchInput &&
    !e.target.closest("#overviewSearchInput") &&
    !e.target.closest(".overview-search-box")
  ) {
    overviewSearchInput.blur();
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeAllSwipes();
  }
});


/* =========================
   16) Mode Switch
========================= */

function syncModeButtons() {
  if (!btnPersonal || !btnWork) return;

  btnPersonal.classList.toggle("active", state.mode === "personal");
  btnWork.classList.toggle("active", state.mode === "work");
}

function switchMode(nextMode) {
  if (nextMode !== "personal" && nextMode !== "work") return;
  if (state.mode === nextMode) return;

  state.mode = nextMode;
  saveMode();
  state.search = "";
  state.statsExpanded = false;
  state.people = loadDataByMode(state.mode).map(person => ({
    ...person,
    expanded: false
  }));

  syncModeButtons();
  render();
}

if (btnPersonal) {
  btnPersonal.addEventListener("click", () => {
    switchMode("personal");
  });
}

if (btnWork) {
  btnWork.addEventListener("click", () => {
    switchMode("work");
  });
}


/* =========================
   17) PWA Install + Update Prompt
   Android + iPhone + Update
========================= */

let deferredInstallPrompt = null;
let installPromptTimer = null;
let pendingServiceWorker = null;
let controllerChangeHandled = false;

const installPromptOverlay = document.getElementById("installPromptOverlay");
const installPromptLaterBtn = document.getElementById("installPromptLaterBtn");
const installPromptInstallBtn = document.getElementById("installPromptInstallBtn");

const iosInstallPromptOverlay = document.getElementById("iosInstallPromptOverlay");
const iosInstallPromptCloseBtn = document.getElementById("iosInstallPromptCloseBtn");

const updatePromptOverlay = document.getElementById("updatePromptOverlay");
const updateCancelBtn = document.getElementById("updateCancelBtn");
const updateApplyBtn = document.getElementById("updateApplyBtn");
const updateExportBtn = document.getElementById("updateExportBtn");

function hideFabForPrompt() {
  if (!fab) return;
  document.body.classList.add("install-open");
  fab.classList.add("fab-hidden");
  fab.style.display = "none";
}

function showFabAfterPrompt() {
  if (!fab) return;
  document.body.classList.remove("install-open");
  fab.classList.remove("fab-hidden");
  fab.style.display = "";
}

function showInstallPromptUI() {
  if (!installPromptOverlay) return;
  installPromptOverlay.classList.add("show");
  installPromptOverlay.setAttribute("aria-hidden", "false");
  hideFabForPrompt();
}

function hideInstallPromptUI() {
  if (!installPromptOverlay) return;
  clearTimeout(installPromptTimer);
  installPromptOverlay.classList.remove("show");
  installPromptOverlay.setAttribute("aria-hidden", "true");
  showFabAfterPrompt();
}

function showIosInstallPromptUI() {
  if (!iosInstallPromptOverlay) return;
  iosInstallPromptOverlay.classList.add("show");
  iosInstallPromptOverlay.setAttribute("aria-hidden", "false");
  hideFabForPrompt();
}

function hideIosInstallPromptUI() {
  if (!iosInstallPromptOverlay) return;
  clearTimeout(installPromptTimer);
  iosInstallPromptOverlay.classList.remove("show");
  iosInstallPromptOverlay.setAttribute("aria-hidden", "true");
  showFabAfterPrompt();
}

function showUpdatePromptUI() {
  if (!updatePromptOverlay) return;
  updatePromptOverlay.classList.add("show");
  updatePromptOverlay.setAttribute("aria-hidden", "false");
  hideFabForPrompt();
}

function hideUpdatePromptUI() {
  if (!updatePromptOverlay) return;
  updatePromptOverlay.classList.remove("show");
  updatePromptOverlay.setAttribute("aria-hidden", "true");
  showFabAfterPrompt();
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function scheduleAndroidInstallPrompt() {
  if (!deferredInstallPrompt) return;
  if (isRunningStandalone()) return;

  clearTimeout(installPromptTimer);

  installPromptTimer = setTimeout(() => {
    if (deferredInstallPrompt && !isRunningStandalone()) {
      showInstallPromptUI();
    }
  }, 3000);
}

function scheduleIosInstallPrompt() {
  if (!isIosDevice()) return;
  if (isRunningStandalone()) return;

  clearTimeout(installPromptTimer);

  installPromptTimer = setTimeout(() => {
    if (isIosDevice() && !isRunningStandalone()) {
      showIosInstallPromptUI();
    }
  }, 3000);
}

 window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  scheduleAndroidInstallPrompt();
});

 window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallPromptUI();
});

function maybeShowIosInstallPrompt() {
  scheduleIosInstallPrompt();
}

function exportJsonBackup() {
  const backup = {
    personal: loadRawData(PERSONAL_STORAGE_KEY),
    work: loadRawData(WORK_STORAGE_KEY),
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `acc-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}


if (installPromptLaterBtn) {
  installPromptLaterBtn.addEventListener("click", () => {
    hideInstallPromptUI();
    clearTimeout(installPromptTimer);
  });
}

if (installPromptInstallBtn) {
  installPromptInstallBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallPromptUI();
    clearTimeout(installPromptTimer);
  });
}

if (iosInstallPromptCloseBtn) {
  iosInstallPromptCloseBtn.addEventListener("click", () => {
    hideIosInstallPromptUI();
    clearTimeout(installPromptTimer);
  });
}

/* =========================
   18) Init
========================= */

loadTheme();

state.people = loadDataByMode(state.mode).map(person => ({
  ...person,
  expanded: false
}));

state.statsExpanded = false;
syncModeButtons();

// Offline ინდიკატორის კონტროლი
const offlineIndicator = document.getElementById('offlineIndicator');

function updateOfflineIndicator() {
  if (!navigator.onLine) {
    offlineIndicator.classList.add('show');
  } else {
    offlineIndicator.classList.remove('show');
  }
}

window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);

updateOfflineIndicator();
render();
maybeShowIosInstallPrompt();

const topbarEl = document.querySelector(".topbar");
if (topbarEl && window.ResizeObserver) {
  new ResizeObserver(() => adjustMainPadding()).observe(topbarEl);
}

/* =========================
   19) Service Worker Registration & Update Detection
========================= */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-workers.js")
      .then(registration => {
        if (registration.waiting) {
          pendingServiceWorker = registration.waiting;
          showUpdatePromptUI();
        }
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              pendingServiceWorker = newWorker;
              showUpdatePromptUI();
            }
          });
        });
      })
      .catch(err => console.warn("Service Worker registration failed:", err));

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controllerChangeHandled) return;
      controllerChangeHandled = true;
      window.location.reload();
    });
  });
}

if (updateApplyBtn) {
  updateApplyBtn.addEventListener("click", () => {
    if (pendingServiceWorker) pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    hideUpdatePromptUI();
  });
}
if (updateCancelBtn) updateCancelBtn.addEventListener("click", hideUpdatePromptUI);
if (updateExportBtn) updateExportBtn.addEventListener("click", exportJsonBackup);
