// ==================== 06-actions.js ====================
// Card Actions, Swipe, Long Press, Delete, Action Flows

function closeAllSwipes(exceptCard = null) {
  document.querySelectorAll(".swipe-card").forEach(card => {
    if (exceptCard && card === exceptCard) return;
    const content = card.querySelector(".swipe-content");
    if (content) content.style.transform = "";
    card.classList.remove("swipe-open", "swipe-open-left", "swipe-open-right");
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

function setupSwipeActions(card, { onDelete, onArchiveToggle } = {}) {
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

  const hasArchive = typeof onArchiveToggle === "function";
  let archiveAction = null;
  if (hasArchive) {
    archiveAction = card.querySelector(".swipe-archive-action");
    if (!archiveAction) {
      archiveAction = document.createElement("button");
      archiveAction.type = "button";
      archiveAction.className = "swipe-archive-action";
      card.appendChild(archiveAction);
    }
    archiveAction.innerHTML = `<span>${onArchiveToggle._label || "Archive"}</span>`;
  }

  const revealWidth = 96;
  let startX = 0, currentX = 0, dragging = false, startYSwipe = 0;

  const setTranslate = x => {
    const min = -revealWidth;
    const max = hasArchive ? revealWidth : 0;
    const safeX = Math.max(min, Math.min(max, x));
    content.style.transform = `translateX(${safeX}px)`;
  };
  const openSwipeLeft = () => {
    closeAllSwipes(card);
    card.classList.remove("swipe-open-left", "swipe-open-right");
    card.classList.add("swipe-open", "swipe-open-left");
    content.style.transform = `translateX(-${revealWidth}px)`;
  };
  const openSwipeRight = () => {
    closeAllSwipes(card);
    card.classList.remove("swipe-open-left", "swipe-open-right");
    card.classList.add("swipe-open", "swipe-open-right");
    content.style.transform = `translateX(${revealWidth}px)`;
  };
  const closeSwipe = () => { card.classList.remove("swipe-open", "swipe-open-left", "swipe-open-right"); content.style.transform = ""; };

  deleteAction.onclick = e => { e.stopPropagation(); closeSwipe(); if (typeof onDelete === "function") onDelete(); };
  if (archiveAction) archiveAction.onclick = e => { e.stopPropagation(); closeSwipe(); onArchiveToggle(); };

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
    const movingLeft = dx < -8;
    const movingRight = hasArchive && dx > 8;
    if ((movingLeft || movingRight) && Math.abs(dx) > dy * 1.5) { e.preventDefault(); setTranslate(dx); }
  }, { passive: false });
  const endTouch = () => {
    if (!dragging) return;
    dragging = false;
    const dx = currentX - startX;
    if (dx < -48) openSwipeLeft();
    else if (hasArchive && dx > 48) openSwipeRight();
    else closeSwipe();
  };
  card.addEventListener("touchend", endTouch);
  card.addEventListener("touchcancel", endTouch);
  card.addEventListener("click", e => {
    if (card.classList.contains("swipe-open") && !e.target.closest(".swipe-delete-action") && !e.target.closest(".swipe-archive-action")) closeSwipe();
  });
}

function getActionPayloadFromCard(card) {
  return { type: card.dataset.actionType || "", personId: card.dataset.personId || "", entryId: card.dataset.entryId || "", source: card.dataset.source || "main" };
}

function openEditByPayload(payload) {
  if (payload.type === "person") openPersonForm(payload.personId);
  else if (payload.type === "entry") openEntryForm(payload.personId, payload.entryId);
}

function deleteByPayload(payload) {
  if (payload.type === "person") {
    confirmDelete("Delete this person? All entries will be deleted.", async () => {
      const index = state.people.findIndex(p => p.id === payload.personId);
      if (index === -1) return;
      const [removed] = state.people.splice(index, 1);
      await saveData();
      render();
      showUndoToast(`Deleted ${removed.name || "person"}`, async () => {
        state.people.splice(Math.min(index, state.people.length), 0, removed);
        await saveData();
        render();
      });
    });
    return;
  }
  if (payload.type === "entry") {
    confirmDelete("Delete this entry?", async () => {
      const person = findPerson(payload.personId);
      if (!person) return;
      const entries = person.entries || [];
      const index = entries.findIndex(e => e.id === payload.entryId);
      if (index === -1) return;
      const [removed] = entries.splice(index, 1);
      await saveData();
      render();
      showUndoToast("Entry deleted", async () => {
        const p = findPerson(payload.personId);
        if (!p) return;
        p.entries = p.entries || [];
        p.entries.splice(Math.min(index, p.entries.length), 0, removed);
        await saveData();
        render();
      });
    });
  }
}

async function togglePersonArchived(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const willArchive = !person.archived;

  const isUnarchiving = !willArchive;
  const hasSalary = state.mode === "work" && !!person.salaryAmount && !!person.salaryStartDate;

  if (isUnarchiving && hasSalary) {
    const summary = personSalarySummary(person);
    confirmDelete(
      `Welcome ${person.name} back! Their pay cycle keeps counting while archived, so this resets it to start fresh from today — the time they were away won't count as pay owed. (Already paid: ${formatMoneyPlain(summary.paid, summary.currency)})`,
      async () => {
        // Bank the baseline at exactly what's already been paid, so due
        // comes out to 0 right now — the anchor moves to today, so archived
        // time never gets counted as accrued in the first place.
        person.salaryAccruedBaseline = summary.paid;
        person.salaryPeriodAnchorDate = todayStr();
        person.archived = false;
        person.expanded = false;
        await saveData();
        render();
      },
      false,
      "Unarchive & Reset"
    );
    return;
  }

  person.archived = willArchive;
  person.expanded = false;
  await saveData();
  render();
}

function buildArchiveToggle(personId) {
  const person = findPerson(personId);
  if (!person) return null;
  const isArchived = !!person.archived;
  const fn = () => togglePersonArchived(personId);
  fn._label = isArchived ? "📤 Unarchive" : "🗄️ Archive";
  return fn;
}

// Combine two person records into one (e.g. someone left and came back under
// a second record with the same name). `keepId` survives with its own name,
// tag, and salary settings; `mergeAwayId`'s entries are appended and it is
// deleted. Missing fields on the survivor are backfilled from the other side.
async function mergeTwoPersons(keepId, mergeAwayId) {
  const keep = findPerson(keepId);
  const mergeAway = findPerson(mergeAwayId);
  if (!keep || !mergeAway || keep.id === mergeAway.id) return;

  keep.entries = [...(keep.entries || []), ...(mergeAway.entries || [])]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (!keep.tagLabel && mergeAway.tagLabel) keep.tagLabel = mergeAway.tagLabel;
  if (!keep.tagColor && mergeAway.tagColor) keep.tagColor = mergeAway.tagColor;
  if (!keep.salaryAmount && mergeAway.salaryAmount) {
    keep.salaryAmount = mergeAway.salaryAmount;
    keep.salaryStartDate = mergeAway.salaryStartDate;
    keep.salaryEndDate = mergeAway.salaryEndDate;
    keep.salaryPayPeriodWeeks = mergeAway.salaryPayPeriodWeeks;
    keep.salaryCurrency = mergeAway.salaryCurrency;
    if (mergeAway.salaryPeriodAnchorDate) keep.salaryPeriodAnchorDate = mergeAway.salaryPeriodAnchorDate;
    if (mergeAway.salaryAccruedBaseline) keep.salaryAccruedBaseline = normalizeAmount(mergeAway.salaryAccruedBaseline);
  }

  state.people = state.people.filter(p => p.id !== mergeAway.id);
  await saveData();
  render();
}

function openMergeDuplicatePicker(personId) {
  const current = findPerson(personId);
  if (!current) return;
  const normalizedName = (current.name || "").trim().toLowerCase();

  const candidates = state.people
    .filter(p => p.id !== personId)
    .sort((a, b) => {
      const aMatch = (a.name || "").trim().toLowerCase() === normalizedName ? 0 : 1;
      const bMatch = (b.name || "").trim().toLowerCase() === normalizedName ? 0 : 1;
      return aMatch - bMatch;
    });

  if (!candidates.length) {
    confirmDelete("There's no one else to merge with.", () => {}, false, "OK");
    return;
  }

  openModal("Merge Duplicate", `
    <div class="inline-note" style="margin-bottom:12px;">
      Choose who to merge into <strong>${escapeHtml(current.name)}</strong>. Their entries will be combined and the other record deleted.
    </div>
    <div class="sheet-list">
      ${candidates.map(p => `
        <div class="sheet-item choose-merge-target" data-person-id="${p.id}">
          <span class="sheet-item-title">${escapeHtml(p.name)}${p.archived ? " (Archived)" : ""}</span>
          <span class="sheet-item-sub">${(p.entries || []).length} entries · ${formatMoney(personOpenBalance(p), personCurrency(p))}</span>
        </div>
      `).join("")}
    </div>
  `, () => {
    document.querySelectorAll(".choose-merge-target").forEach(btn => {
      btn.onclick = () => {
        const otherId = btn.dataset.personId;
        const other = findPerson(otherId);
        if (!other) return;
        closeModal();
        confirmDelete(
          `Merge "${other.name}" into "${current.name}"? "${other.name}"'s entries will be added here and that record will be deleted. This can't be undone.`,
          () => mergeTwoPersons(personId, otherId),
          false,
          "Merge"
        );
      };
    });
  });
}

function setupActionCard(card) {
  if (card.dataset.actionsBound === "1") return;
  card.dataset.actionsBound = "1";

  const payload = getActionPayloadFromCard(card);
  if (!payload.type) return;

  const swipeArea = card.querySelector(".swipe-content") || card;

  setupLongPress(swipeArea, () => {
    let onExportPerson = null;
    let onArchiveToggle = null;
    let onMergeDuplicate = null;

    if (payload.type === "person") {
      onExportPerson = () => exportPersonPdf(payload.personId);
      onArchiveToggle = buildArchiveToggle(payload.personId);
      onMergeDuplicate = () => openMergeDuplicatePicker(payload.personId);
    }

    openQuickActions({
      title: payload.type === "person" ? "Person" : "Entry",
      onEdit: () => openEditByPayload(payload),
      onExportPerson,
      onArchiveToggle,
      onMergeDuplicate,
      onCancel: () => {}
    });
  });

  setupSwipeActions(card, {
    onDelete: () => deleteByPayload(payload),
    onArchiveToggle: payload.type === "person" ? buildArchiveToggle(payload.personId) : null
  });
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

function openQuickActions({ title = "", onEdit, onExportPerson, onArchiveToggle, onMergeDuplicate, onCancel }) {
  const hasEdit = typeof onEdit === "function";
  const hasExport = typeof onExportPerson === "function";
  const hasArchiveToggle = typeof onArchiveToggle === "function";
  const hasMerge = typeof onMergeDuplicate === "function";
  const actionsHtml = `
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
    ${hasMerge ? `
      <div style="margin-bottom:10px;">
        <button type="button" class="secondary-btn full-btn" id="quickMergeBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;">🔗 Merge Duplicate</button>
      </div>
    ` : ""}
    <div class="quick-actions-row ${hasEdit ? "quick-actions-row-2" : ""}" style="${hasEdit ? "" : "display:grid;grid-template-columns:1fr;"}">
      <button type="button" class="secondary-btn ${hasEdit ? "" : "full-btn"}" id="quickCancelBtn">Cancel</button>
      ${hasEdit ? `<button type="button" class="primary-btn" id="quickEditBtn">Edit</button>` : ""}
    </div>
  `;
  openModal(title || "Actions", actionsHtml, () => {
    const cancelBtn = document.getElementById("quickCancelBtn");
    const editBtn = document.getElementById("quickEditBtn");
    const exportBtn = document.getElementById("quickExportPersonBtn");
    const archiveBtn = document.getElementById("quickArchiveToggleBtn");
    const mergeBtn = document.getElementById("quickMergeBtn");

    if (cancelBtn) cancelBtn.onclick = () => { closeModal(); if (typeof onCancel === "function") onCancel(); };
    if (editBtn && hasEdit) editBtn.onclick = () => { closeModal(); onEdit(); };
    if (exportBtn && hasExport) exportBtn.onclick = () => { closeModal(); onExportPerson(); };
    if (archiveBtn && hasArchiveToggle) {
      archiveBtn.textContent = onArchiveToggle._label || "Archive";
      archiveBtn.onclick = () => { closeModal(); onArchiveToggle(); };
    }
    if (mergeBtn && hasMerge) mergeBtn.onclick = () => { closeModal(); onMergeDuplicate(); };
  });
}

// Main Add Menu (FAB)
function openMainAddMenu() {
  const isWork = state.mode === "work";
  const isArchivedTab = state.personFilter === "archived";
  openModal(
  "Add New",
  `
    <div class="sheet-list">
      ${isArchivedTab ? "" : `
      <div class="sheet-item" id="quickAddPerson">
        <span class="sheet-item-title-row">
          <span class="sheet-item-icon">👥</span>
          <span class="sheet-item-title">${isWork ? "Add Team" : "Add Person"}</span>
        </span>
        <span class="sheet-item-sub">${isWork ? "Create a new team" : "Create a new person"}</span>
      </div>
      `}

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
    if (addEntryBtn) addEntryBtn.onclick = () => {
      const activePeople = state.people.filter(p => !p.archived);
      if (!activePeople.length) alert(isWork ? "Add a team first." : "Add a person first.");
      else openChoosePersonForEntry();
    };
  });
}

// Helper for adding entry from main menu
function openChoosePersonForEntry() {
  const activePeople = state.people.filter(p => !p.archived);
  openModal("Choose a Person", activePeople.map(person => `<div class="sheet-item choose-person-entry" data-person-id="${person.id}"><span class="sheet-item-title">${escapeHtml(person.name)}</span><span class="sheet-item-sub">Balance: ${formatMoney(personOpenBalance(person), personCurrency(person))}</span></div>`).join(""), () => {
    document.querySelectorAll(".choose-person-entry").forEach(btn => { btn.onclick = () => { const personId = btn.dataset.personId; openEntryForm(personId); }; });
  });
}

function openEditStagesPanel() {
  openModal("Edit", `<div class="empty-state mini-empty">Long press any card to edit. Swipe left to delete.</div>`, () => {});
}
