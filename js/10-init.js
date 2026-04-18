// ==================== 10-init.js ====================
// Initialization, Service Worker, Debug, Install Prompts

let deferredInstallPrompt = null;
let installPromptTimer = null;

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
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function scheduleAndroidInstallPrompt() {
  if (!deferredInstallPrompt || isRunningStandalone()) return;
  clearTimeout(installPromptTimer);
  installPromptTimer = setTimeout(() => {
    if (deferredInstallPrompt && !isRunningStandalone()) {
      showInstallPromptUI();
    }
  }, 3000);
}

function scheduleIosInstallPrompt() {
  if (!isIosDevice() || isRunningStandalone()) return;
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

// Debug toolkit
const DEBUG = {
  enabled:
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.search.includes("debug=1")
};

async function initDebugFlag() {
  const val = await dbGet(DEBUG_KEY);
  if (val === "1") DEBUG.enabled = true;
}

async function getStorageSizeBytes() {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).getAll();

      req.onsuccess = () => {
        const items = req.result || [];
        const total = items.reduce((sum, val) => {
          return sum + (typeof val === "string" ? val.length * 2 : 100);
        }, 0);
        resolve(total);
      };

      req.onerror = () => resolve(0);
    });
  } catch (error) {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function collectDebugSnapshot() {
  const people = state.people || [];
  let stagesTotal = 0;
  let openStages = 0;
  let closedStages = 0;
  let entriesTotal = 0;

  people.forEach(person => {
    (person.stages || []).forEach(stage => {
      stagesTotal++;
      if (stage.closed) closedStages++;
      else openStages++;
      entriesTotal += (stage.entries || []).length;
    });
  });

  const sizeBytes = await getStorageSizeBytes();

  return {
    time: new Date().toISOString(),
    mode: state.mode,
    people: people.length,
    stagesTotal,
    openStages,
    closedStages,
    entriesTotal,
    search: state.search,
    openTotals: getOpenCurrencyTotals(people),
    closedTotals: getClosedCurrencyTotals(people),
    storageUsed: formatBytes(sizeBytes),
    storageEngine: "IndexedDB",
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    standalone: window.matchMedia("(display-mode: standalone)").matches
  };
}

async function logDebugSnapshot(label = "ACC DEBUG") {
  if (!DEBUG.enabled) return;

  const snapshot = await collectDebugSnapshot();

  console.group(`%c${label}`, "color:#4c8dff;font-weight:bold;");
  console.table({
    mode: snapshot.mode,
    people: snapshot.people,
    stagesTotal: snapshot.stagesTotal,
    openStages: snapshot.openStages,
    closedStages: snapshot.closedStages,
    entriesTotal: snapshot.entriesTotal,
    search: snapshot.search,
    storageUsed: snapshot.storageUsed,
    online: snapshot.online,
    standalone: snapshot.standalone
  });
  console.log("Open totals:", snapshot.openTotals);
  console.log("Closed totals:", snapshot.closedTotals);
  console.log("Full snapshot:", snapshot);
  console.groupEnd();
}

function validateDataShape() {
  const errors = [];

  (state.people || []).forEach((person, pIndex) => {
    if (!person.id) errors.push(`Person[${pIndex}] missing id`);
    if (!Array.isArray(person.stages)) errors.push(`Person[${pIndex}] stages is not array`);

    (person.stages || []).forEach((stage, sIndex) => {
      if (!stage.id) errors.push(`Person[${pIndex}] Stage[${sIndex}] missing id`);
      if (!stage.currency) errors.push(`Person[${pIndex}] Stage[${sIndex}] missing currency`);
      if (!Array.isArray(stage.entries)) errors.push(`Person[${pIndex}] Stage[${sIndex}] entries is not array`);

      (stage.entries || []).forEach((entry, eIndex) => {
        if (!entry.id) errors.push(`Person[${pIndex}] Stage[${sIndex}] Entry[${eIndex}] missing id`);
        if (entry.type !== "Gave" && entry.type !== "Received") {
          errors.push(`Person[${pIndex}] Stage[${sIndex}] Entry[${eIndex}] invalid type`);
        }
        if (Number.isNaN(Number(entry.amount))) {
          errors.push(`Person[${pIndex}] Stage[${sIndex}] Entry[${eIndex}] invalid amount`);
        }
      });
    });
  });

  if (DEBUG.enabled) {
    if (errors.length) console.warn("ACC validation errors:", errors);
    else console.info("ACC validation: OK");
  }

  return errors;
}

window.ACC_DEBUG = {
  async on() {
    await dbSet(DEBUG_KEY, "1");
    DEBUG.enabled = true;
    console.info("ACC debug enabled");
  },
  async off() {
    await dbDelete(DEBUG_KEY);
    DEBUG.enabled = false;
    console.info("ACC debug disabled");
  },
  async snapshot() {
    const data = await collectDebugSnapshot();
    console.log(data);
    return data;
  },
  async log() {
    await logDebugSnapshot();
  },
  validate() {
    return validateDataShape();
  },
  async exportState() {
    const snap = await collectDebugSnapshot();
    const blob = new Blob([JSON.stringify({ state, snapshot: snap }, null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `acc-debug-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  sw() {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service worker not supported");
      return;
    }

    navigator.serviceWorker.getRegistration().then(reg => {
      console.log("SW registration:", reg || "none");
      if (reg) {
        console.log("SW scope:", reg.scope);
        console.log("SW active:", reg.active?.state || "none");
        console.log("SW waiting:", reg.waiting?.state || "none");
        console.log("SW installing:", reg.installing?.state || "none");
      }
    });
  },
  rerender() {
    render();
    console.info("ACC rerender done");
  }
};

async function initApp() {
  await initDebugFlag();
  await loadTheme();
  state.mode = await loadMode();
  await loadDataByMode(state.mode);

  state.people = (state.people || []).map(p => ({
    ...p,
    expanded: false
  }));

  state.statsExpanded = false;
  syncModeButtons();
  render();
  if (typeof accRefreshCloudStatusFromServer === "function") {
    accRefreshCloudStatusFromServer();
  }
  if (typeof finalizeAccPendingHistoryDayIfNeeded === "function") {
    await finalizeAccPendingHistoryDayIfNeeded();
  }
  maybeShowIosInstallPrompt();

  if (DEBUG.enabled) {
    await logDebugSnapshot("ACC INIT");
    validateDataShape();
  }

  const topbarEl = document.querySelector(".topbar");
  if (topbarEl && window.ResizeObserver) {
    new ResizeObserver(() => adjustMainPadding()).observe(topbarEl);
  }
}

initApp();

let pendingServiceWorker = null;
let controllerChangeHandled = false;
let userAcceptedUpdate = false;
let swRegistrationRef = null;

function wireUpdateFound(registration) {
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
}

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-workers.js");
swRegistrationRef = registration;

console.log("SW registered:", registration.scope);

if (registration.waiting) {
  pendingServiceWorker = registration.waiting;
  showUpdatePromptUI();
}

wireUpdateFound(registration);

setTimeout(() => {
  registration.update().catch(err => {
    console.warn("SW update failed:", err);
  });
}, 1500);
   } catch (err) {
  console.warn("Service Worker registration failed:", err);
  alert("Service Worker error: " + (err?.message || err));
}

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controllerChangeHandled) return;
      if (!userAcceptedUpdate) return;

      controllerChangeHandled = true;
      window.location.reload();
    });
  });
}

if (updateApplyBtn) {
  updateApplyBtn.addEventListener("click", () => {
    userAcceptedUpdate = true;

    if (pendingServiceWorker) {
      pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    }

    hideUpdatePromptUI();
  });
}

if (updateCancelBtn) {
  updateCancelBtn.addEventListener("click", () => {
    hideUpdatePromptUI();
  });
}

if (updateExportBtn) {
  updateExportBtn.addEventListener("click", exportJsonBackup);
}