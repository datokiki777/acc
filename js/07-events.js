// ==================== 07-events.js ====================
// Event Binding and UI Listeners

function bindStatsEvents() {
  const overviewSearchInput = document.getElementById("overviewSearchInput");
  if (overviewSearchInput && overviewSearchInput.dataset.bound !== "1") {
    overviewSearchInput.dataset.bound = "1";
    overviewSearchInput.onclick = e => e.stopPropagation();
    overviewSearchInput.onfocus = e => e.stopPropagation();
    overviewSearchInput.oninput = e => { e.stopPropagation(); state.search = e.target.value; refreshPeopleListsOnly(); };
    overviewSearchInput.onkeydown = e => { if (e.key === "Backspace" && !overviewSearchInput.value) overviewSearchInput.blur(); };
  }
  document.querySelectorAll(".stats-person-item").forEach(item => {
    item.onclick = e => { e.stopPropagation(); openOverviewPersonDetail(item.dataset.personId); };
  });
}

function bindPremiumPressEffects() {
  document.querySelectorAll(".person-card").forEach(card => {
    if (card.dataset.pressBound === "1") return;
    card.dataset.pressBound = "1";

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

  if (statsSummary && statsWrap && statsSummary.dataset.pressBound !== "1") {
    statsSummary.dataset.pressBound = "1";

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

function bindDynamicEvents() {
  document.querySelectorAll("[data-toggle-person]").forEach(el => {
    el.onclick = async () => {
      if (state.longPressTriggered) return;
      const person = findPerson(el.dataset.togglePerson);
      if (!person) return;
      const card = el.closest(".person-card");
      if (!card) return;
      const willExpand = !person.expanded;
      if (willExpand && state.statsExpanded) { state.statsExpanded = false; render(); return; }
      person.expanded = willExpand;
      await saveData();
      animatePersonCard(card, willExpand);
      if (willExpand) history.pushState({ cards: true }, "");
    };
  });
  document.querySelectorAll("[data-add-stage]").forEach(el => {
    el.onclick = e => { e.stopPropagation(); openStageForm(el.dataset.addStage); };
  });
  document.querySelectorAll("[data-add-entry-person]").forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const personId = el.dataset.addEntryPerson;
      const openStage = findOpenStage(personId);
      if (openStage) openEntryForm(personId, openStage.id);
      else openStageForm(personId, null, true);
    };
  });
  document.querySelectorAll("[data-open-next-stage]").forEach(el => {
    el.onclick = e => { e.stopPropagation(); confirmCloseAndOpenNewStage(el.dataset.openNextStage); };
  });
  document.querySelectorAll("[data-edit-active-stage]").forEach(el => {
    el.onclick = e => { e.stopPropagation(); confirmEditActiveStage(el.dataset.editActiveStage); };
  });
  document.querySelectorAll(".swipe-card").forEach(card => setupActionCard(card));
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
        if (!modalIsOpen()) { const anyExpanded = state.people.some(p => p.expanded); if (!anyExpanded) fab.classList.remove("fab-hidden"); }
      };
      body.addEventListener("transitionend", onEnd);
    });
  }
}

// Static event listeners
if (searchInput) {
  searchInput.addEventListener("input", e => { state.search = e.target.value; render(); });
}
fab.onclick = openMainAddMenu;
if (menuBtn) {
  menuBtn.classList.add("transfer-btn");
  menuBtn.textContent = "⇄";
  menuBtn.setAttribute("aria-label", "Import / Export");
  menuBtn.addEventListener("click", openTransferActionsModal);
}
if (themeToggleBtn) themeToggleBtn.addEventListener("click", () => cycleThemeMode());
if (menuOverlay) menuOverlay.style.display = "none";
if (menuEditStages) menuEditStages.style.display = "none";
if (menuTransfer) menuTransfer.style.display = "none";
if (menuDelete) menuDelete.style.display = "none";

confirmOverlay.addEventListener("click", e => { if (e.target === confirmOverlay) { closeConfirm(); if (state.reopenEditAfterConfirm) openEditStagesPanel(); } });
confirmCancel.addEventListener("click", () => { closeConfirm(); if (state.reopenEditAfterConfirm) openEditStagesPanel(); });
confirmOk.addEventListener("click", () => { if (typeof state.confirmAction === "function") state.confirmAction(); closeConfirm(); if (state.reopenEditAfterConfirm) openEditStagesPanel(); });

importFile.addEventListener("change", async e => {
  const file = e.target.files?.[0];

  try {
    await handleImportedJsonFile(file);
  } finally {
    importFile.value = "";
  }
});

document.addEventListener("click", e => {
  if (!e.target.closest(".swipe-card")) closeAllSwipes();
  const overviewSearchInput = document.getElementById("overviewSearchInput");
  if (overviewSearchInput && document.activeElement === overviewSearchInput && !e.target.closest("#overviewSearchInput") && !e.target.closest(".overview-search-box")) overviewSearchInput.blur();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAllSwipes(); });

function syncModeButtons() {
  if (!btnPersonal || !btnWork) return;

  const isPersonal = state.mode === "personal";
  const isWork = state.mode === "work";

  btnPersonal.classList.toggle("active", isPersonal);
  btnWork.classList.toggle("active", isWork);

  btnPersonal.setAttribute("aria-pressed", isPersonal ? "true" : "false");
  btnWork.setAttribute("aria-pressed", isWork ? "true" : "false");
}
async function switchMode(nextMode) {
  if (nextMode !== "personal" && nextMode !== "work") return;
  if (state.mode === nextMode) return;

  state.mode = nextMode;
  await saveMode();
  state.search = "";
  state.statsExpanded = false;

  await loadDataByMode(state.mode);
  state.people = (state.people || []).map(p => ({
    ...p,
    expanded: false
  }));

  syncModeButtons();
  render();
}

if (btnPersonal) {
  btnPersonal.addEventListener("click", async () => {
    await switchMode("personal");
  });
}

if (btnWork) {
  btnWork.addEventListener("click", async () => {
    await switchMode("work");
  });
}