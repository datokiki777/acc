// ==================== 04-render.js ====================
// Rendering Logic

function animateValue(el, start, end, duration = 450, currency = "EUR") {
  const startTime = performance.now();
  const diff = end - start;
  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + diff * eased;
    el.textContent = formatMoney(current, currency);
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = formatMoney(end, currency);
  }
  requestAnimationFrame(frame);
}

function runBalanceAnimations() {
  document.querySelectorAll("[data-animated-balance]").forEach(el => {
    if (el.classList.contains("stats-mixed-balance")) return;
    const target = Number(el.dataset.value || 0);
    const currency = el.dataset.currency || "EUR";
    const previous = Number(el.dataset.prevValue || 0);
    const personId = el.closest(".person-card")?.dataset.personId || null;
    const isStatsTotal = el.classList.contains("stats-value");
    if (previous === target) el.textContent = formatMoney(target, currency);
    else animateValue(el, previous, target, 420, currency);
    if (personId) state.personBalancePrev[personId] = target;
    if (isStatsTotal) state.totalBalancePrev = target;
    el.dataset.prevValue = String(target);
  });
}

function renderEntry(personId, entry, currency, source = "main") {
  const effect = entryEffect(entry.type, entry.amount);
  const categoryLabel = state.mode === "work" && (entry.category === "salary" || entry.category === "gift")
    ? `<span class="entry-category-chip entry-category-${escapeHtml(entry.category)}">${entry.category === "gift" ? "Other" : escapeHtml(entry.category)}</span>`
    : "";
  return `
    <div class="entry-card swipe-card" data-action-type="entry" data-person-id="${personId}" data-entry-id="${entry.id}" data-source="${source}">
      <div class="swipe-content">
        <div class="entry-top">
          <div class="entry-type ${typeLabelClass(entry.type)}">${entryTypeVisual(entry.type)}${categoryLabel}</div>
          <div class="entry-amount ${balanceClass(effect)}">${Number(entry.amount).toFixed(2)}${currencyLabel(currency)}</div>
        </div>
        ${entry.comment ? `<div class="entry-comment">${escapeHtml(entry.comment)}</div>` : ""}
        <div class="entry-meta">${formatDate(entry.date)}</div>
      </div>
    </div>
  `;
}

function renderWorkSalaryPanel(person) {
  if (state.mode !== "work") return "";
  const salary = personSalarySummary(person);
  if (!salary.enabled) {
    return "";
  }
  const statusPills = [
    salary.due > 0
      ? `<div class="salary-due-pill due">${formatMoneyPlain(salary.due, salary.currency)}</div>`
      : "",
    salary.upcoming > 0
      ? `<div class="salary-due-pill upcoming">${formatMoneyPlain(salary.upcoming, salary.currency)}</div>`
      : ""
  ].join("");
  return `
    <div class="salary-panel">
      <div class="salary-panel-head">
        <div>
          <div class="salary-panel-title">Payroll</div>
          <div class="salary-panel-sub">${formatMoneyPlain(salary.monthly, salary.currency)} / month · ${formatMoneyPlain(salary.periodAmount, salary.currency)} every ${salary.periodWeeks} week${salary.periodWeeks === 1 ? "" : "s"}${salary.endDate ? ` · ends ${formatDate(salary.endDate)}` : ""}</div>
        </div>
        <div class="salary-pill-stack">${statusPills || `<div class="salary-due-pill clear">Clear</div>`}</div>
      </div>
      <div class="salary-grid">
        <div><span>Paid</span><strong>${formatMoneyPlain(salary.paid, salary.currency)}</strong></div>
        <div><span>${salary.ended ? "Ended" : "Next Pay"}</span><strong>${formatDate(salary.ended ? salary.endDate : salary.nextPayDate)}</strong></div>
      </div>
    </div>
  `;
}

function renderWorkGiftPanel(person) {
  if (state.mode !== "work") return "";
  const gift = personGiftSummary(person);
  if (!gift.gave && !gift.received) return "";
  return `
    <div class="gift-panel">
      <div>
        <div class="gift-panel-title">Other</div>
        <div class="gift-panel-sub">Other balance</div>
      </div>
      <strong class="${balanceClass(gift.net)}">${formatMoney(gift.net, gift.currency)}</strong>
    </div>
  `;
}

function renderPerson(person) {
  const currency = personCurrency(person);
  const balance = personOpenBalance(person);
  const entries = person.entries || [];
  const totals = personTotals(person);
  const tagColor = person.tagColor || "";
  const tagChip = (person.tagLabel || tagColor)
    ? `<span class="person-tag-chip" style="${tagColor ? `background:${tagColor}22;color:${tagColor};border-color:${tagColor}55;` : ""}">${tagColor ? `<span class="person-tag-dot" style="background:${tagColor}"></span>` : ""}${escapeHtml(person.tagLabel || "")}</span>`
    : "";
  return `
    <article class="person-card ${person.expanded ? "expanded" : ""} ${person.archived ? "person-archived" : ""}" data-person-id="${person.id}">
      <div class="person-head-swipe swipe-card" data-action-type="person" data-person-id="${person.id}">
        <div class="swipe-content">
          <div class="person-head" data-toggle-person="${person.id}">
            <div class="person-main">
              <div class="person-name-row">
                <div class="person-name">${highlightMatch(person.name, state.search)}</div>
                ${tagChip}
              </div>
              <div class="subtext">
                ${currencyLabel(currency)} • ${entries.length} ${entries.length === 1 ? "entry" : "entries"}
              </div>
            </div>
            <div class="balance ${balanceClass(balance)}" data-animated-balance data-value="${balance}" data-prev-value="${state.personBalancePrev[person.id] ?? 0}" data-currency="${currency}">
              ${formatMoney(balance, currency)}
            </div>
            <div class="stats-arrow ${person.expanded ? "open" : ""}">›</div>
          </div>
        </div>
      </div>
      <div class="person-body">
        ${renderWorkSalaryPanel(person)}
        ${renderWorkGiftPanel(person)}
        ${entries.length ? `<div class="person-body-top-totals"><div class="totals-line"><span>↑ ${totals.gave.toFixed(2)}${currencyLabel(currency)}</span><span>↓ ${totals.received.toFixed(2)}${currencyLabel(currency)}</span><span class="${balanceClass(totals.balance)}">Net ${formatMoney(totals.balance, currency)}</span></div></div>` : ""}
        <div class="person-body-scroll">
          <div class="entry-list">
            ${entries.length ? entries.map(entry => renderEntry(person.id, entry, currency)).join("") : `<div class="empty-state mini-empty">No entries yet</div>`}
          </div>
        </div>
        <div class="person-body-footer">
          <div class="person-actions">
            <button class="primary-btn" data-add-entry-person="${person.id}">+ Add Entry</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderStats() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;
  const activeCount = state.people.filter(person => !person.archived).length;
  const archivedCount = state.people.filter(person => !!person.archived).length;
  const isArchived = state.personFilter === "archived";
  statsBar.innerHTML = `
    <div class="person-filter-switch">
      <button type="button" class="person-filter-btn ${!isArchived ? "active" : ""}" id="personFilterActiveBtn">
        Active${activeCount ? `<span class="person-filter-count">${activeCount}</span>` : ""}
      </button>
      <button type="button" class="person-filter-btn ${isArchived ? "active" : ""}" id="personFilterArchivedBtn">
        Archived${archivedCount ? `<span class="person-filter-count">${archivedCount}</span>` : ""}
      </button>
    </div>
  `;
  const activeBtn = document.getElementById("personFilterActiveBtn");
  const archivedBtn = document.getElementById("personFilterArchivedBtn");
  if (activeBtn) activeBtn.onclick = () => { if (state.personFilter !== "active") { state.personFilter = "active"; render(); } };
  if (archivedBtn) archivedBtn.onclick = () => { if (state.personFilter !== "archived") { state.personFilter = "archived"; render(); } };
}

function adjustMainPadding() {
  const topbar = document.querySelector(".topbar");
  const mainEl = document.querySelector("main");
  if (!topbar || !mainEl) return;
  const h = topbar.getBoundingClientRect().height;
  mainEl.style.paddingTop = (h + 16) + "px";
}

function syncFab() {
  if (fab.classList.contains("fab-back")) return;
  const anyExpanded = state.people.some(p => p.expanded);
  if (anyExpanded) fab.classList.add("fab-hidden");
  else fab.classList.remove("fab-hidden");
}

function updateEmptyStateText() {
  const titleEl = document.getElementById("emptyStateTitle");
  const textEl = document.getElementById("emptyStateText");
  const iconEl = document.getElementById("emptyStateIcon");
  if (!titleEl || !textEl || !iconEl) return;
  if (state.personFilter === "archived") {
    iconEl.textContent = "🗄️";
    titleEl.textContent = "No archived people";
    textEl.textContent = "People you archive will show up here.";
  } else {
    iconEl.textContent = "📒";
    titleEl.textContent = "No records yet";
    textEl.textContent = "Tap the plus button below to add your first person.";
  }
}

function refreshPeopleListsOnly() {
  const filteredPeople = getFilteredPeople();
  if (!filteredPeople.length) {
    updateEmptyStateText();
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
}

function render() {
  const filteredPeople = getFilteredPeople();
  if (!filteredPeople.length) {
    updateEmptyStateText();
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
  runBalanceAnimations();
  requestAnimationFrame(adjustMainPadding);
  syncFab();
}
