// ==================== 08-modals.js ====================
// Modal and Confirm Dialogs Engine

let _suppressPopstate = false;
let _modalHistoryActive = false;

function resetModalUi() {
  modalOverlay.classList.remove("show");
  modalContent.innerHTML = "";
  fab.classList.remove("fab-back");
  fab.style.pointerEvents = "";
  fab.style.opacity = "";
  fab.textContent = "+";
  fab.onclick = openMainAddMenu;

  const anyExpanded = state.people.some(p => p.expanded);
  if (anyExpanded) fab.classList.add("fab-hidden");
  else fab.classList.remove("fab-hidden");
}

function openModal(title, html, afterOpen) {
  const wasOpen = modalOverlay.classList.contains("show");

  modalTitle.textContent = title;
  modalContent.innerHTML = html;
  modalOverlay.classList.add("show");
  fab.classList.remove("fab-hidden");
  fab.classList.add("fab-back");
  fab.style.pointerEvents = "";
  fab.style.opacity = "";
  fab.textContent = "←";
  fab.onclick = closeModal;

  if (!wasOpen) {
    history.pushState({ modal: true }, "");
    _modalHistoryActive = true;
  } else if (_modalHistoryActive) {
    history.replaceState({ modal: true }, "");
  }

  if (typeof afterOpen === "function") afterOpen();
}

function closeModal() {
  const shouldPopHistory = modalOverlay.classList.contains("show") && _modalHistoryActive;

  resetModalUi();

  if (shouldPopHistory) {
    _modalHistoryActive = false;
    _suppressPopstate = true;
    history.back();
  }

  requestAnimationFrame(() => render());
}

window.addEventListener("popstate", async () => {
  if (_suppressPopstate) {
    _suppressPopstate = false;
    return;
  }

  if (modalOverlay.classList.contains("show")) {
    _modalHistoryActive = false;
    resetModalUi();
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
    state.people.forEach(p => {
      p.expanded = false;
    });
    await saveData();
    render();
  }
});

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

// ==================== RESTORE SOURCE PICKER ====================

function askRestoreSource(options) {
  return new Promise((resolve) => {
    let selectedIndex = -1;

    const listHtml = options.map((opt, i) => `
      <div class="restore-item" data-index="${i}">
        ${i + 1}. ${opt.label}
      </div>
    `).join("");

    // 🔹 HIDE the floating back button (←) during restore
    const wasFabHidden = fab.classList.contains("fab-hidden");
    fab.classList.add("fab-hidden");

    openModal("Restore source", `
      <div class="restore-list">
        ${listHtml}
      </div>

      <div class="confirm-actions" style="margin-top:14px;">
        <button class="secondary-btn" id="restoreCancelBtn">Cancel</button>
        <button class="primary-btn" id="restoreOkBtn" disabled>Restore</button>
      </div>
    `, () => {
      const items = modalContent.querySelectorAll(".restore-item");
      const okBtn = document.getElementById("restoreOkBtn");
      const cancelBtn = document.getElementById("restoreCancelBtn");

      items.forEach(el => {
        el.onclick = () => {
          items.forEach(i => i.classList.remove("active"));
          el.classList.add("active");
          selectedIndex = Number(el.dataset.index);
          okBtn.disabled = false;
        };
      });

      cancelBtn.onclick = () => {
        closeModal();
        // 🔹 Restore FAB visibility
        if (!wasFabHidden) fab.classList.remove("fab-hidden");
        resolve(null);
      };

      okBtn.onclick = () => {
        if (selectedIndex < 0) return;
        const picked = options[selectedIndex];
        closeModal();
        // 🔹 Restore FAB visibility
        if (!wasFabHidden) fab.classList.remove("fab-hidden");
        resolve(picked);
      };
    });
  });
}
