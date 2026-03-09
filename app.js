const STORAGE_KEY = "accounts-app-v2";
const THEME_KEY = "accounts-theme";

const state = {
  people: loadData(),
  search: "",
  confirmAction: null,
  reopenEditAfterConfirm: false,
  overviewClosedExpanded: {},
  statsExpanded: false
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

/* =========================
   Helpers
========================= */

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
  if (c === "CAD") return "CAD";
  return "€";
}

function formatMoney(value, currency = "EUR") {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}${currencyLabel(currency)}`;
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

function stageBalance(stage) {
  return (stage.entries || []).reduce((sum, entry) => {
    return sum + entryEffect(entry.type, entry.amount);
  }, 0);
}

function personOpenBalance(person) {
  return (person.stages || [])
    .filter(stage => !stage.closed)
    .reduce((sum, stage) => sum + stageBalance(stage), 0);
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

function stageCurrency(stage) {
  return stage?.currency || "EUR";
}

/* =========================
   Storage
========================= */

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.people));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
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

/* =========================
   Finders
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
    const target = Number(el.dataset.value || 0);
    const currency = el.dataset.currency || "EUR";
    const previous = Number(el.dataset.prevValue || 0);

    animateValue(el, previous, target, 420, currency);

    el.dataset.prevValue = String(target);
  });
}

/* =========================
   Render
========================= */

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

function renderStats() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;

  const peopleCount = state.people.length;

  let totalBalance = 0;
  state.people.forEach(person => {
    totalBalance += personOpenBalance(person);
  });

  const sortedPeople = [...state.people].sort(
    (a, b) => personLastActivityTs(b) - personLastActivityTs(a)
  );

  statsBar.innerHTML = `
    <div class="stats-wrap">
      <div class="stats-summary" id="statsSummaryToggle">
        <div class="stats-summary-left">
          <div class="stats-box">
            <div class="stats-title">People</div>
            <div class="stats-value">${peopleCount}</div>
          </div>

          <div class="stats-box">
            <div class="stats-title">Balance</div>
            <div
  class="stats-value ${balanceClass(totalBalance)}"
  data-animated-balance
  data-value="${totalBalance}"
  data-prev-value="0"
  data-currency="EUR"
>
  ${formatMoney(totalBalance)}
</div>
          </div>
        </div>

        <div class="stats-arrow ${state.statsExpanded ? "open" : ""}">></div>
      </div>

      ${
        state.statsExpanded
          ? `
            <div class="stats-overview-list">
              ${
                sortedPeople.length
                  ? sortedPeople.map(person => {
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
                    }).join("")
                  : `<div class="empty-state mini-empty">No people yet</div>`
              }
            </div>
          `
          : ""
      }
    </div>
  `;

  const toggle = document.getElementById("statsSummaryToggle");
if (toggle) {
  toggle.onclick = () => {
    state.statsExpanded = !state.statsExpanded;
    animateStatsOverview(state.statsExpanded);
  };
}

  bindStatsEvents();
}

function animateStatsOverview(expand) {
  const wrap = document.querySelector(".stats-wrap");
  const list = document.querySelector(".stats-overview-list");
  if (!wrap) return;

  if (expand) {
    renderStats();

    const newWrap = document.querySelector(".stats-wrap");
    const newList = document.querySelector(".stats-overview-list");
    if (!newWrap || !newList) return;

    newList.style.overflow = "hidden";
    newList.style.height = "0px";
    newList.style.opacity = "0";
    newList.style.transition = "none";

    requestAnimationFrame(() => {
      const fullHeight = newList.scrollHeight;
      newList.style.transition = "height 0.28s ease, opacity 0.22s ease";
      newList.style.height = fullHeight + "px";
      newList.style.opacity = "1";

      const onEnd = () => {
        newList.style.height = "auto";
        newList.removeEventListener("transitionend", onEnd);
      };

      newList.addEventListener("transitionend", onEnd);
    });

    bindPremiumPressEffects();
    bindStatsEvents();
  } else {
    if (!list) {
      renderStats();
      bindPremiumPressEffects();
      bindStatsEvents();
      return;
    }

    list.style.overflow = "hidden";
    list.style.height = list.scrollHeight + "px";
    list.style.opacity = "1";

    requestAnimationFrame(() => {
      list.style.transition = "height 0.26s ease, opacity 0.18s ease";
      list.style.height = "0px";
      list.style.opacity = "0";

      const onEnd = () => {
        renderStats();
        bindPremiumPressEffects();
        bindStatsEvents();
        list.removeEventListener("transitionend", onEnd);
      };

      list.addEventListener("transitionend", onEnd);
    });
  }
}

function bindStatsEvents() {
  document.querySelectorAll(".stats-person-item").forEach(item => {
    item.onclick = () => {
      openOverviewPersonDetail(item.dataset.personId);
    };
  });
}

function render() {
  const query = state.search.trim().toLowerCase();

  const filteredPeople = state.people
    .filter(person => (person.name || "").toLowerCase().includes(query))
    .sort((a, b) => personLastActivityTs(b) - personLastActivityTs(a));

  if (!filteredPeople.length) {
    if (emptyStateEl) emptyStateEl.style.display = "block";
    peopleListEl.innerHTML = "";
    if (emptyStateEl) peopleListEl.appendChild(emptyStateEl);
    renderStats();
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = "none";
  peopleListEl.innerHTML = filteredPeople.map(renderPerson).join("");
  bindDynamicEvents();
  bindPremiumPressEffects();
  renderStats();
  bindStatsEvents();
  runBalanceAnimations();
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
          data-prev-value="0"
          data-currency="${currentCurrency}"
        >
      ${formatMoney(openBalance, currentCurrency)}
      </div>
        <div class="stats-arrow ${person.expanded ? "open" : ""}">></div>
      </div>

      <div class="person-body">
        ${person.note ? `<div class="inline-note">${escapeHtml(person.note)}</div>` : ""}

        <div class="entry-list">
          ${
            entries.length
              ? entries.map(entry => renderEntry(openStage, entry)).join("")
              : `<div class="empty-state mini-empty">No entries yet</div>`
          }
        </div>

        ${
          openStage
            ? `
              <div class="totals-line">
                <span>Out ${totals.gave.toFixed(2)}${currencyLabel(currentCurrency)}</span>
                <span>In ${totals.received.toFixed(2)}${currencyLabel(currentCurrency)}</span>
                <span class="${balanceClass(totals.balance)}">Net ${formatMoney(totals.balance, currentCurrency)}</span>
              </div>
            `
            : ""
        }

        <div class="person-actions">
          ${
            openStage
              ? `<button class="primary-btn" data-add-entry-person="${person.id}">+ Add Entry</button>`
              : `<button class="primary-btn" data-add-stage="${person.id}">+ Add Stage</button>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderEntry(stage, entry) {
  const effect = entryEffect(entry.type, entry.amount);
  const currentCurrency = stageCurrency(stage);

  return `
    <div class="entry-card">
      <div class="entry-top">
        <div>
          <div class="entry-type ${typeLabelClass(entry.type)}">${escapeHtml(entry.type)}</div>
          <div class="entry-meta">${formatDate(entry.date)}</div>
        </div>
        <div class="entry-amount ${balanceClass(effect)}">${Number(entry.amount).toFixed(2)}${currencyLabel(currentCurrency)}</div>
      </div>

      ${entry.comment ? `<div class="entry-comment">${escapeHtml(entry.comment)}</div>` : ""}
    </div>
  `;
}

/* =========================
   Dynamic events
========================= */

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

  body.style.transition = "none";

  if (expand) {
    body.style.height = "0px";
    body.style.opacity = "0";

    requestAnimationFrame(() => {
      card.classList.add("expanded");

      const fullHeight = body.scrollHeight;
      body.style.transition = "height 0.28s ease, opacity 0.22s ease";
      body.style.height = fullHeight + "px";
      body.style.opacity = "1";

      const onEnd = () => {
        body.style.height = "auto";
        body.removeEventListener("transitionend", onEnd);
      };

      body.addEventListener("transitionend", onEnd);
    });
  } else {
    body.style.height = body.scrollHeight + "px";
    body.style.opacity = "1";

    requestAnimationFrame(() => {
      body.style.transition = "height 0.26s ease, opacity 0.18s ease";
      body.style.height = "0px";
      body.style.opacity = "0";

      const onEnd = () => {
        card.classList.remove("expanded");
        body.removeEventListener("transitionend", onEnd);
      };

      body.addEventListener("transitionend", onEnd);
    });
  }
}

function bindDynamicEvents() {
  document.querySelectorAll("[data-toggle-person]").forEach(el => {
  el.onclick = () => {
    const person = findPerson(el.dataset.togglePerson);
    if (!person) return;

    const card = el.closest(".person-card");
    if (!card) return;

    person.expanded = !person.expanded;
    saveData();

    animatePersonCard(card, person.expanded);
  };
});

  document.querySelectorAll("[data-add-stage]").forEach(el => {
    el.onclick = () => {
      openStageForm(el.dataset.addStage);
    };
  });

  document.querySelectorAll("[data-add-entry-person]").forEach(el => {
    el.onclick = () => {
      const personId = el.dataset.addEntryPerson;
      const openStage = findOpenStage(personId);

      if (openStage) {
        openEntryForm(personId, openStage.id);
      } else {
        openStageForm(personId, null, true);
      }
    };
  });
}

/* =========================
   Modal helpers
========================= */

function openModal(title, html, afterOpen) {
  modalTitle.textContent = title;
  modalContent.innerHTML = html;
  modalOverlay.classList.add("show");
  fab.style.display = "none";
  if (typeof afterOpen === "function") afterOpen();
}

function closeModal() {
  modalOverlay.classList.remove("show");
  modalContent.innerHTML = "";
  fab.style.display = "";
}

/* =========================
   Forms
========================= */

function openPersonForm(personId = null, reopenEditPanel = false) {
  const person = personId ? findPerson(personId) : null;

  openModal(
    person ? "Edit Person" : "Add Person",
    `
      <form class="form" id="personForm">
        <div class="field">
          <label for="personName">Name</label>
          <input id="personName" name="name" type="text" maxlength="80" required placeholder="Example: John" value="${person ? escapeHtml(person.name) : ""}">
        </div>

        <div class="field">
          <label for="personNote">Note</label>
          <textarea id="personNote" name="note" placeholder="Optional">${person ? escapeHtml(person.note || "") : ""}</textarea>
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
        const note = String(fd.get("note") || "").trim();

        if (!name) return;

        if (person) {
          person.name = name;
          person.note = note;
        } else {
          state.people.unshift({
            id: uid(),
            name,
            note,
            expanded: true,
            stages: []
          });
        }

        saveData();
        render();

        if (reopenEditPanel) {
          openEditStagesPanel();
        } else {
          closeModal();
        }
      };
    }
  );
}

function openStageForm(personId, stageId = null, openEntryAfterSave = false, reopenEditPanel = false) {
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
          <label for="stageNote">Note</label>
          <textarea id="stageNote" name="note" placeholder="Optional">${stage ? escapeHtml(stage.note || "") : ""}</textarea>
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
        const note = String(fd.get("note") || "").trim();
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
                openEntryForm(personId, savedStageId);
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
        render();

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

function openEntryForm(personId, stageId, entryId = null) {
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
          <label for="entryType">Type</label>
          <select id="entryType" name="type" required>
            <option value="Gave" ${entry?.type === "Gave" ? "selected" : ""}>Gave</option>
            <option value="Received" ${entry?.type === "Received" ? "selected" : ""}>Received</option>
          </select>
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

      cancelBtn.onclick = closeModal;

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
        closeModal();
        render();
      };
    }
  );
}

/* =========================
   Confirm
========================= */

function confirmDelete(text, onOk, reopenEdit = false, okLabel = "Delete") {
  state.confirmAction = onOk;
  state.reopenEditAfterConfirm = reopenEdit;
  confirmText.textContent = text;
  confirmOk.textContent = okLabel;
  confirmOverlay.classList.add("show");
  fab.style.display = "none";
}

function closeConfirm() {
  state.confirmAction = null;
  state.confirmOverlay = null;
  confirmOverlay.classList.remove("show");
  fab.style.display = "";
}

/* =========================
   Main add menu
========================= */

function openMainAddMenu() {
  openModal(
    "What do you want to add?",
    `
      <div class="sheet-list">
        <div class="sheet-item" id="quickAddPerson">
          <span class="sheet-item-title">Add Person</span>
          <span class="sheet-item-sub">Create a new person</span>
        </div>

        <div class="sheet-item" id="quickAddEntry">
          <span class="sheet-item-title">Add Entry</span>
          <span class="sheet-item-sub">Choose a person</span>
        </div>
      </div>

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backFromMainAddBtn">←</button>
      </div>
    `,
    () => {
      const backBtn = document.getElementById("backFromMainAddBtn");
      if (backBtn) {
        backBtn.onclick = closeModal;
      }

      const addPersonBtn = document.getElementById("quickAddPerson");
      if (addPersonBtn) {
        addPersonBtn.onclick = () => {
          openPersonForm();
        };
      }

      const addEntryBtn = document.getElementById("quickAddEntry");
      if (addEntryBtn) {
        addEntryBtn.onclick = () => {
          if (!state.people.length) {
            alert("Add a person first.");
            return;
          }

          openChoosePersonForEntry();
        };
      }
    }
  );
}

/* =========================
   Edit list
========================= */

function openEditStagesPanel() {
  openModal(
    "Edit",
    `
      <div class="sheet-list">
        ${
          state.people.length
            ? state.people.map(person => {
                const stageCount = (person.stages || []).length;
                const openStage = findOpenStage(person.id);

                return `
                  <div class="sheet-item edit-person-open-item" data-person-id="${person.id}">
                    <span class="sheet-item-title">${escapeHtml(person.name)}</span>
                    <span class="sheet-item-sub">
                      ${openStage ? escapeHtml(openStage.name) : "No open stage"} • ${stageCount} stages
                    </span>
                  </div>
                `;
              }).join("")
            : `<div class="empty-state mini-empty">No people yet</div>`
        }
      </div>

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backFromEditBtn">←</button>
      </div>
    `,
    () => {
      const backBtn = document.getElementById("backFromEditBtn");
      if (backBtn) {
        backBtn.onclick = closeModal;
      }

      document.querySelectorAll(".edit-person-open-item").forEach(item => {
        item.onclick = () => {
          openEditPersonDetail(item.dataset.personId);
        };
      });
    }
  );
}

function openEditPersonDetail(personId) {
  const person = findPerson(personId);
  if (!person) return;

  openModal(
    `${escapeHtml(person.name)} — Edit`,
    `
      <div class="inline-note edit-person-block">
        <div class="edit-person-row">
          <strong>${escapeHtml(person.name)}</strong>
        </div>

        <div class="form-actions" style="margin-top:10px;">
          <button type="button" class="secondary-btn" id="editThisPersonBtn">Edit Person</button>
          <button type="button" class="danger-btn" id="deleteThisPersonBtn">Delete</button>
        </div>
      </div>

      <div class="sheet-list">
        ${
          (person.stages || []).length
            ? person.stages.map(stage => `
                <div class="sheet-item ${stage.closed ? "stage-closed" : "stage-open"}">
                  <span class="sheet-item-title">${escapeHtml(stage.name)} — ${stage.closed ? "Closed" : "Open"}</span>
                  <span class="sheet-item-sub">Balance: ${formatMoney(stageBalance(stage), stageCurrency(stage))}</span>

                  <div class="form-actions" style="margin-top:10px;">
                    <button type="button" class="secondary-btn edit-stage-btn" data-stage-id="${stage.id}">Edit</button>
                    <button type="button" class="secondary-btn toggle-stage-btn" data-stage-id="${stage.id}">
                      ${stage.closed ? "Reopen" : "Close"}
                    </button>
                    <button type="button" class="danger-btn delete-stage-btn" data-stage-id="${stage.id}">Delete</button>
                  </div>
                </div>
              `).join("")
            : `<div class="empty-state mini-empty">No stages yet</div>`
        }
      </div>

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backFromPersonEditBtn">←</button>
      </div>
    `,
    () => {
      const backBtn = document.getElementById("backFromPersonEditBtn");
      if (backBtn) {
        backBtn.onclick = () => {
          openEditStagesPanel();
        };
      }

      const editPersonBtn = document.getElementById("editThisPersonBtn");
      if (editPersonBtn) {
        editPersonBtn.onclick = () => {
          openPersonForm(personId, true);
        };
      }

      const deletePersonBtn = document.getElementById("deleteThisPersonBtn");
      if (deletePersonBtn) {
        deletePersonBtn.onclick = () => {
          confirmDelete(
            "Are you sure you want to delete this person? All stages and entries will be deleted.",
            () => {
              state.people = state.people.filter(p => p.id !== personId);
              saveData();
              render();
            },
            true
          );
        };
      }

      document.querySelectorAll(".edit-stage-btn").forEach(btn => {
        btn.onclick = () => {
          openStageForm(personId, btn.dataset.stageId, false, true);
        };
      });

      document.querySelectorAll(".toggle-stage-btn").forEach(btn => {
        btn.onclick = () => {
          const stageId = btn.dataset.stageId;
          const stage = findStage(personId, stageId);
          if (!stage) return;

          if (stage.closed) {
            const existingOpenStage = findOpenStage(personId);
            if (existingOpenStage && existingOpenStage.id !== stageId) {
              alert("This person already has another open stage.");
              return;
            }
            stage.closed = false;
          } else {
            stage.closed = true;
          }

          saveData();
          render();
          openEditPersonDetail(personId);
        };
      });

      document.querySelectorAll(".delete-stage-btn").forEach(btn => {
        btn.onclick = () => {
          const stageId = btn.dataset.stageId;

          confirmDelete(
            "Are you sure you want to delete this stage?",
            () => {
              const currentPerson = findPerson(personId);
              if (!currentPerson) return;

              currentPerson.stages = currentPerson.stages.filter(stage => stage.id !== stageId);
              saveData();
              render();
            },
            true
          );
        };
      });
    }
  );
}

/* =========================
   Overview detail
========================= */

function openOverviewPersonDetail(personId) {
  const person = findPerson(personId);
  if (!person) return;

  const openStage = findOpenStage(person.id);
  const closedStages = (person.stages || []).filter(stage => stage.closed);
  const currentCurrency = openStage ? stageCurrency(openStage) : "EUR";

  openModal(
    `${escapeHtml(person.name)} — Details`,
    `
      <div class="inline-note">
        <div><strong>Total Balance:</strong> <span class="${balanceClass(personOpenBalance(person))}">${formatMoney(personOpenBalance(person), currentCurrency)}</span></div>
        <div style="margin-top:6px;"><strong>Open Stage:</strong> ${openStage ? escapeHtml(openStage.name) : "None"}</div>
        <div style="margin-top:6px;"><strong>Closed Stages:</strong> ${closedStages.length}</div>
      </div>

      ${
        openStage
          ? `
            <div class="section-label">Open Stage Entries</div>
            <div class="entry-list">
              ${
                (openStage.entries || []).length
                  ? openStage.entries.map(entry => renderEntry(openStage, entry)).join("")
                  : `<div class="empty-state mini-empty">No entries</div>`
              }
            </div>
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
                  <div class="sheet-item">
                    <div class="closed-stage-head" data-toggle-closed-stage="${stage.id}">
                      <div>
                        <span class="sheet-item-title">${escapeHtml(stage.name)} — ${formatMoney(stageBalance(stage), stageCurrency(stage))}</span>
                        <span class="sheet-item-sub">Entries: ${(stage.entries || []).length}</span>
                      </div>
                      <div class="closed-stage-chev">${isExpanded ? "⌃" : "⌄"}</div>
                    </div>

                    ${
                      isExpanded
                        ? `
                          <div class="closed-stage-body">
                            ${
                              (stage.entries || []).length
                                ? stage.entries.map(entry => renderEntry(stage, entry)).join("")
                                : `<div class="empty-state mini-empty">No entries</div>`
                            }
                          </div>
                        `
                        : ""
                    }
                  </div>
                `;
              }).join("")}
            </div>
          `
          : ""
      }

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backToOverviewBtn">←</button>
      </div>
    `,
    () => {
      document.getElementById("backToOverviewBtn").onclick = closeModal;

      document.querySelectorAll("[data-toggle-closed-stage]").forEach(btn => {
        btn.onclick = () => {
          const stageId = btn.dataset.toggleClosedStage;
          state.overviewClosedExpanded[stageId] = !state.overviewClosedExpanded[stageId];
          openOverviewPersonDetail(personId);
        };
      });
    }
  );
}

/* =========================
   Pick person for entry
========================= */

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

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backFromChoosePersonBtn">←</button>
      </div>
    `,
    () => {
      const backBtn = document.getElementById("backFromChoosePersonBtn");
      if (backBtn) {
        backBtn.onclick = closeModal;
      }

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
   Static events
========================= */

searchInput.addEventListener("input", e => {
  state.search = e.target.value;
  render();
});

fab.addEventListener("click", openMainAddMenu);

  menuBtn.addEventListener("click", () => {
  menuOverlay.classList.add("show");
});

themeToggleBtn.addEventListener("click", () => {
  toggleTheme();
});

menuOverlay.addEventListener("click", e => {
  if (e.target === menuOverlay) {
    menuOverlay.classList.remove("show");
  }
});

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

menuEditStages.addEventListener("click", () => {
  menuOverlay.classList.remove("show");
  openEditStagesPanel();
});

menuTransfer.addEventListener("click", () => {
  menuOverlay.classList.remove("show");

  openModal(
    "Import / Export",
    `
      <div class="sheet-item" id="doExport">
        <span class="sheet-item-title">Export</span>
        <span class="sheet-item-sub">Download a JSON backup file</span>
      </div>

      <div class="sheet-item" id="doImport">
        <span class="sheet-item-title">Import</span>
        <span class="sheet-item-sub">Upload a saved file</span>
      </div>

      <div class="detail-topbar">
        <button type="button" class="round-back-btn" id="backFromTransferBtn">←</button>
      </div>
    `,
    () => {
      document.getElementById("backFromTransferBtn").onclick = closeModal;

      document.getElementById("doExport").onclick = () => {
        const blob = new Blob([JSON.stringify(state.people, null, 2)], {
          type: "application/json"
        });

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `accounts-backup-${todayStr()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        closeModal();
      };

      document.getElementById("doImport").onclick = () => {
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
  );
});

menuDelete.addEventListener("click", () => {
  menuOverlay.classList.remove("show");

  confirmDelete(
    "Are you sure you want to delete all data?",
    () => {
      state.people = [];
      saveData();
      render();
    },
    false
  );
});

importFile.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("Invalid file");
    }

    state.people = data;
    saveData();
    render();
    closeModal();
  } catch (error) {
    alert("Could not read the file.");
  } finally {
    importFile.value = "";
  }
});

loadTheme();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => console.log("Service Worker registered"))
      .catch(error => console.log("Service Worker error:", error));
  });
}