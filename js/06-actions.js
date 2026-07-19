// ==================== 06-actions.js ====================
// Card Actions, Swipe, Long Press, Delete, Action Flows, Overview Details

function closeAllSwipes(exceptCard = null) {
  document.querySelectorAll(".swipe-card").forEach(card => {
    if (exceptCard && card === exceptCard) return;
    const content = card.querySelector(".swipe-content");
    if (content) content.style.transform = "";
    card.classList.remove("swipe-open");
  });
}

function setupLongPress(element, callback) {
  let timer = null, startX = 0, startY = 0;
  const hostSwipe = element.closest(".swipe-card");
  const start = e => {
    if (shouldIgnoreGestureTarget(e.target)) return;
    const nearestSwipe = getNearestSwipeCard(e.target);
    if (hostSwipe && nearestSwipe && nearestSwipe !== hostSwipe) return;
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX; startY = point.clientY;
    timer = setTimeout(() => { state.longPressTriggered = true; callback(); }, 600);
    state.longPressTimer = timer;
  };
  const move = e => {
    if (!timer) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = Math.abs(point.clientX - startX);
    const dy = Math.abs(point.clientY - startY);
    if (dx > 10 || dy > 10) { clearTimeout(timer); timer = null; }
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    setTimeout(() => { state.longPressTriggered = false; }, 60);
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
  let startX = 0, currentX = 0, dragging = false, startYSwipe = 0;
  const setTranslate = x => { const safeX = Math.max(-revealWidth, Math.min(0, x)); content.style.transform = `translateX(${safeX}px)`; };
  const openSwipe = () => { closeAllSwipes(card); card.classList.add("swipe-open"); content.style.transform = `translateX(-${revealWidth}px)`; };
  const closeSwipe = () => { card.classList.remove("swipe-open"); content.style.transform = ""; };
  deleteAction.onclick = e => { e.stopPropagation(); closeSwipe(); if (typeof onDelete === "function") onDelete(); };
  card.addEventListener("touchstart", e => {
    if (shouldIgnoreGestureTarget(e.target)) return;
    const nearestSwipe = getNearestSwipeCard(e.target);
    if (nearestSwipe && nearestSwipe !== card) return;
    closeAllSwipes(card);
    const point = e.touches[0];
    startX = point.clientX; currentX = startX; startYSwipe = point.clientY;
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
    if (dx < -8 && Math.abs(dx) > dy * 1.5) { e.preventDefault(); setTranslate(dx); }
  }, { passive: false });
  const endTouch = () => {
    if (!dragging) return;
    dragging = false;
    const dx = currentX - startX;
    if (dx < -48) openSwipe(); else closeSwipe();
  };
  card.addEventListener("touchend", endTouch);
  card.addEventListener("touchcancel", endTouch);
  card.addEventListener("click", e => { if (card.classList.contains("swipe-open") && !e.target.closest(".swipe-delete-action")) closeSwipe(); });
}

function getActionPayloadFromCard(card) {
  return { type: card.dataset.actionType || "", personId: card.dataset.personId || "", stageId: card.dataset.stageId || "", entryId: card.dataset.entryId || "", source: card.dataset.source || "main" };
}

function openEditByPayload(payload) {
  if (payload.type === "person") openPersonForm(payload.personId);
  else if (payload.type === "stage") openStageForm(payload.personId, payload.stageId, false, false, payload.source === "overview" ? payload.personId : null);
  else if (payload.type === "entry") openEntryForm(payload.personId, payload.stageId, payload.entryId, payload.source === "overview" ? payload.personId : null);
}

function deleteByPayload(payload) {
  if (payload.type === "person") {
    confirmDelete("Delete this person? All stages and entries will be deleted.", async () => {
      state.people = state.people.filter(p => p.id !== payload.personId);
      await saveData();
     render();
    });
    return;
  }
  if (payload.type === "stage") {
    confirmDelete("Delete this stage?", async () => {
      const person = findPerson(payload.personId);
      if (!person) return;
      person.stages = (person.stages || []).filter(s => s.id !== payload.stageId);
      await saveData();
      render();
      if (payload.source === "overview") openOverviewPersonDetail(payload.personId);
    });
    return;
  }
  if (payload.type === "entry") {
    confirmDelete("Delete this entry?", async () => {
      const stage = findStage(payload.personId, payload.stageId);
      if (!stage) return;
      stage.entries = (stage.entries || []).filter(e => e.id !== payload.entryId);
      await saveData();
      render();
    });
  }
}

async function togglePersonArchived(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const willArchive = !person.archived;
  person.archived = willArchive;
  person.expanded = false;
  await saveData();
  render();
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
    let onRenameStage = null;

    if (payload.type === "stage") {
      const stage = findStage(payload.personId, payload.stageId);

      if (stage) {
        const isClosed = !!stage.closed;

        const toggleFn = async () => {
          if (!isClosed) {
            confirmDelete(
              "Close this stage? You can reopen it later.",
              async () => {
                stage.closed = true;
                await saveData();
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
                () => openOverviewPersonDetail(payload.personId),
                false,
                "OK"
              );
              return;
            }

            stage.closed = false;
            await saveData();
            render();

            if (payload.source === "overview") {
              openOverviewPersonDetail(payload.personId);
            }
          }
        };

        toggleFn._label = isClosed ? "🔓 Reopen Stage" : "🔒 Close Stage";
        onToggleStage = toggleFn;

        onRenameStage = () => {
          openStageForm(
            payload.personId,
            payload.stageId,
            false,
            false,
            payload.source === "overview" ? payload.personId : null
          );
        };
      }
    }

    let onArchiveToggle = null;

    if (payload.type === "person") {
      onExportPerson = () => exportPersonPdf(payload.personId);

      const person = findPerson(payload.personId);
      if (person) {
        const isArchived = !!person.archived;
        const archiveFn = () => togglePersonArchived(payload.personId);
        archiveFn._label = isArchived ? "📤 Unarchive" : "🗄️ Archive";
        onArchiveToggle = archiveFn;
      }
    }

    const allowEdit = !(payload.type === "stage" && payload.source === "overview");

    openQuickActions({
      title: payload.type === "person" ? "Person" : payload.type === "stage" ? "Stage" : "Entry",
      onEdit: allowEdit ? () => openEditByPayload(payload) : null,
      onRenameStage,
      onToggleStage,
      onExportPerson,
      onArchiveToggle,
      onCancel: () => {
        if (payload.source === "overview") openOverviewPersonDetail(payload.personId);
      }
    });
  });

  setupSwipeDelete(card, () => deleteByPayload(payload));
}

function openMainMenu() {
  openModal(
    "Menu",
    `
      <div class="menu-sheet-list">
        <button type="button" class="sheet-item menu-sheet-item" id="menuExportPersonBtn">
          <span class="sheet-item-title-row">
            <span class="sheet-item-icon">📄</span>
            <span class="sheet-item-title">Export Person PDF</span>
          </span>
        </button>

        <button type="button" class="sheet-item menu-sheet-item" id="menuExportAllBtn">
          <span class="sheet-item-title-row">
            <span class="sheet-item-icon">🧾</span>
            <span class="sheet-item-title">Export All PDF</span>
          </span>
        </button>

        <button type="button" class="sheet-item menu-sheet-item menu-sheet-item-lg" id="menuDataBackupBtn">
          <span class="sheet-item-title-row">
            <span class="sheet-item-icon">💾</span>
            <span class="sheet-item-title">Data & Backup</span>
          </span>
        </button>
      </div>
    `,
    () => {
      const exportPersonBtn = document.getElementById("menuExportPersonBtn");
      const exportAllBtn = document.getElementById("menuExportAllBtn");
      const dataBackupBtn = document.getElementById("menuDataBackupBtn");

      if (exportPersonBtn) {
        exportPersonBtn.onclick = () => {
          closeModal();
          openChoosePersonForPdf();
        };
      }

      if (exportAllBtn) {
        exportAllBtn.onclick = () => {
          closeModal();
          exportAllPdf();
        };
      }

      if (dataBackupBtn) {
        dataBackupBtn.onclick = () => {
          closeModal();
          openDataBackupModal();
        };
      }
    }
  );
}

function openQuickActions({ title = "", onEdit, onRenameStage, onToggleStage, onExportPerson, onArchiveToggle, onCancel }) {
  const hasEdit = typeof onEdit === "function";
const hasRenameStage = typeof onRenameStage === "function";
const hasStageToggle = typeof onToggleStage === "function";
const hasExport = typeof onExportPerson === "function";
const hasArchiveToggle = typeof onArchiveToggle === "function";
let actionsHtml = "";
  if (!hasEdit && hasStageToggle) {
  actionsHtml = `
    ${hasRenameStage ? `
      <div style="margin-bottom:10px;">
        <button type="button" class="secondary-btn full-btn" id="quickRenameStageBtn" style="min-height:40px;border-radius:12px;font-weight:800;font-size:14px;">
          Rename Stage
        </button>
      </div>
    ` : ""}
    <div class="quick-actions-row quick-actions-row-2">
      <button type="button" class="secondary-btn" id="quickCancelBtn">Cancel</button>
      <button type="button" class="primary-btn" id="quickToggleStageBtn"></button>
    </div>
  `;
} else {
  actionsHtml = `
    ${hasRenameStage ? `
      <div style="margin-bottom:10px;">
        <button type="button" class="secondary-btn full-btn" id="quickRenameStageBtn" style="min-height:40px;border-radius:12px;font-weight:800;font-size:14px;">
          Rename Stage
        </button>
      </div>
    ` : ""}
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
    ${hasArchiveToggle ? `
      <div style="margin-bottom:10px;">
        <button type="button" class="secondary-btn full-btn" id="quickArchiveToggleBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;"></button>
      </div>
    ` : ""}
    <div class="quick-actions-row ${hasEdit ? "quick-actions-row-2" : ""}" style="${hasEdit ? "" : "display:grid;grid-template-columns:1fr;"}">
      <button type="button" class="secondary-btn ${hasEdit ? "" : "full-btn"}" id="quickCancelBtn">Cancel</button>
      ${hasEdit ? `<button type="button" class="primary-btn" id="quickEditBtn">Edit</button>` : ""}
    </div>
  `;
}
  openModal(title || "Actions", actionsHtml, () => {
    const cancelBtn = document.getElementById("quickCancelBtn");
const editBtn = document.getElementById("quickEditBtn");
const renameBtn = document.getElementById("quickRenameStageBtn");
const toggleBtn = document.getElementById("quickToggleStageBtn");
const exportBtn = document.getElementById("quickExportPersonBtn");
const archiveBtn = document.getElementById("quickArchiveToggleBtn");

if (cancelBtn) cancelBtn.onclick = () => { closeModal(); if (typeof onCancel === "function") onCancel(); };
if (editBtn && hasEdit) editBtn.onclick = () => { closeModal(); onEdit(); };
if (renameBtn && hasRenameStage) renameBtn.onclick = () => { closeModal(); onRenameStage(); };
if (toggleBtn && hasStageToggle) {
  toggleBtn.textContent = onToggleStage._label || "Toggle Stage";
  toggleBtn.onclick = () => { closeModal(); onToggleStage(); };
}
if (exportBtn && hasExport) exportBtn.onclick = () => { closeModal(); onExportPerson(); };
if (archiveBtn && hasArchiveToggle) {
  archiveBtn.textContent = onArchiveToggle._label || "Archive";
  archiveBtn.onclick = () => { closeModal(); onArchiveToggle(); };
}
  });
}

async function closeActiveStage(personId, afterClose = null) {
  const openStage = findOpenStage(personId);
  if (!openStage) return;
  openStage.closed = true;
  await saveData();
  render();
  if (typeof afterClose === "function") afterClose(openStage);
}

function confirmCloseAndOpenNewStage(personId) {
  const openStage = findOpenStage(personId);
  if (!openStage) { openStageForm(personId); return; }
  confirmDelete("Active stage will be closed and a new stage will open. Continue?", () => {
    closeActiveStage(personId, () => openStageForm(personId));
  }, false, "Close & Open");
}

function confirmEditActiveStage(personId) {
  const openStage = findOpenStage(personId);
  if (!openStage) return;
  confirmDelete("Edit active stage?", () => openStageForm(personId, openStage.id), false, "Edit");
}

// Main Add Menu (FAB)
function openMainAddMenu() {
  const isWork = state.mode === "work";
  openModal(
  "Add New",
  `
    <div class="sheet-list">
      <div class="sheet-item" id="quickAddPerson">
        <span class="sheet-item-title-row">
          <span class="sheet-item-icon">👥</span>
          <span class="sheet-item-title">${isWork ? "Add Team" : "Add Person"}</span>
        </span>
        <span class="sheet-item-sub">${isWork ? "Create a new team" : "Create a new person"}</span>
      </div>

      <div class="sheet-item" id="quickAddEntry">
        <span class="sheet-item-title-row">
          <span class="sheet-item-icon">🧾</span>
          <span class="sheet-item-title">Add Entry</span>
        </span>
        <span class="sheet-item-sub">${isWork ? "Choose a team" : "Choose a person"}</span>
      </div>
    </div>
  `,
  () => {
    const addPersonBtn = document.getElementById("quickAddPerson");
    const addEntryBtn = document.getElementById("quickAddEntry");
    if (addPersonBtn) addPersonBtn.onclick = () => openPersonForm();
    if (addEntryBtn) addEntryBtn.onclick = () => { if (!state.people.length) alert(isWork ? "Add a team first." : "Add a person first."); else openChoosePersonForEntry(); };
  });
}

// Helper for adding entry from main menu
function openChoosePersonForEntry() {
  openModal("Choose a Person", state.people.map(person => `<div class="sheet-item choose-person-entry" data-person-id="${person.id}"><span class="sheet-item-title">${escapeHtml(person.name)}</span><span class="sheet-item-sub">Balance: ${formatMoney(personOpenBalance(person))}</span></div>`).join(""), () => {
    document.querySelectorAll(".choose-person-entry").forEach(btn => { btn.onclick = () => { const personId = btn.dataset.personId; const openStage = findOpenStage(personId); if (openStage) openEntryForm(personId, openStage.id); else openStageForm(personId, null, true); }; });
  });
}

// Overview Person Detail (modal with stages and entries)
function personTotalBalanceByCurrency(person) {
  const totals = {};
  (person.stages || []).forEach(stage => { const currency = stageCurrency(stage); const balance = stageBalance(stage); totals[currency] = (totals[currency] || 0) + balance; });
  return totals;
}

function openOverviewPersonDetail(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const openStage = findOpenStage(person.id);
  const closedStages = (person.stages || []).filter(stage => stage.closed);
  const closedSummary = closedStagesSummary(person);
  const openEntriesExpanded = !!state.overviewOpenExpanded[person.id];
  openModal(`${escapeHtml(person.name)} — Details`, `
    <div class="inline-note overview-summary-grid">
      <div class="overview-summary-row"><span class="overview-summary-label">Total Balance</span><span class="overview-summary-value">${(() => { const totals = personTotalBalanceByCurrency(person); const ordered = getOrderedCurrencyEntries(totals); if (!ordered.length) return `<span class="gray">${formatMoney(0, "EUR")}</span>`; if (ordered.length === 1) { const [currency, amount] = ordered[0]; return `<span class="${balanceClass(amount)}">${formatMoney(amount, currency)}</span>`; } return `<span class="overview-summary-value-stack">${ordered.map(([currency, amount]) => `<span class="${balanceClass(amount)}">${formatMoney(amount, currency)}</span>`).join("")}</span>`; })()}</span></div>
      <div class="overview-summary-row"><span class="overview-summary-label">Open Stage</span><span class="overview-summary-value">${openStage ? escapeHtml(openStage.name) : "None"}</span></div>
      <div class="overview-summary-row"><span class="overview-summary-label overview-summary-label-with-badge"><span>Closed Stages</span><span class="mini-count-badge">${closedSummary.count}</span></span><span class="overview-summary-value"><span class="${balanceClass(closedSummary.balance)}">${formatMoney(closedSummary.balance, closedSummary.currency)}</span></span></div>
    </div>
    ${openStage ? `<div class="open-stage-mini-card swipe-card" data-action-type="stage" data-person-id="${person.id}" data-stage-id="${openStage.id}" data-source="overview"><div class="swipe-content"><div class="open-stage-mini-inner" data-toggle-open-entries="${person.id}"><div class="open-stage-mini-left"><div class="stage-title-row"><span class="open-stage-mini-title">${escapeHtml(openStage.name)}</span></div></div><div class="open-stage-mini-right"><div class="open-stage-mini-balance ${balanceClass(stageBalance(openStage))}">${formatMoney(stageBalance(openStage), stageCurrency(openStage))}</div><span class="closed-stage-chev ${openEntriesExpanded ? "open" : ""}">›</span></div></div></div></div>${openEntriesExpanded ? `<div class="entry-list" style="margin-top:8px;">${(openStage.entries || []).length ? openStage.entries.map(entry => renderEntry(person.id, openStage.id, openStage, entry, "overview")).join("") : `<div class="empty-state mini-empty">No entries</div>`}</div>` : ""}` : ""}
    ${closedStages.length ? `<div class="section-label overview-closed-label">Closed Stages</div><div class="sheet-list">${closedStages.map((stage, index) => { const isExpanded = !!state.overviewClosedExpanded[stage.id]; const entries = stage.entries || []; const dates = entries.map(e => e.date).filter(Boolean).slice().sort(); const fromDate = dates.length ? formatDate(dates[0]) : ""; const toDate = dates.length ? formatDate(dates[dates.length - 1]) : ""; const dateRange = fromDate && toDate ? `${fromDate} → ${toDate}` : ""; 
    const accentClasses = ["accent-blue", "accent-red", "accent-orange", "accent-cyan", "accent-pink"];
    const accent = accentClasses[index % accentClasses.length];
    return `<div class="sheet-item closed-stage-item ${accent} swipe-card" data-action-type="stage" data-person-id="${person.id}" data-stage-id="${stage.id}" data-source="overview"><div class="swipe-content"><div class="closed-stage-head" data-toggle-closed-stage="${stage.id}"><div class="closed-stage-col closed-stage-left"><div class="stage-title-row"><span class="sheet-item-title">${escapeHtml(stage.name)}</span></div></div><div class="closed-stage-col closed-stage-right"><span class="closed-stage-date-range">${escapeHtml(dateRange)}</span><span class="closed-stage-chev ${isExpanded ? "open" : ""}">›</span></div></div>${isExpanded ? `<div class="closed-stage-body"><div class="closed-stage-summary-card"><span class="closed-stage-summary-label">Entry ${entries.length}</span><span class="closed-stage-summary-total ${balanceClass(stageBalance(stage))}">${formatMoney(stageBalance(stage), stageCurrency(stage))}</span></div>${entries.length ? entries.map(entry => renderEntry(person.id, stage.id, stage, entry, "overview")).join("") : `<div class="empty-state mini-empty">No entries</div>`}</div>` : ""}</div></div>`; }).join("")}</div>` : ""}`, () => {
    document.querySelectorAll("[data-toggle-open-entries]").forEach(btn => { btn.onclick = e => { if (state.longPressTriggered || e.target.closest(".swipe-delete-action")) return; state.overviewOpenExpanded[person.id] = !state.overviewOpenExpanded[person.id]; openOverviewPersonDetail(personId); }; });
    document.querySelectorAll("[data-toggle-closed-stage]").forEach(btn => { btn.onclick = () => { if (state.longPressTriggered) return; const stageId = btn.dataset.toggleClosedStage; state.overviewClosedExpanded[stageId] = !state.overviewClosedExpanded[stageId]; openOverviewPersonDetail(personId); }; });
    document.querySelectorAll(".swipe-card").forEach(card => setupActionCard(card));
    closeAllSwipes();
  });
}

function openEditStagesPanel() {
  openModal("Edit", `<div class="empty-state mini-empty">Long press any card to edit. Swipe left to delete.</div>`, () => {});
}

