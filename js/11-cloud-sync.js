// ==================== 11-cloud-sync.js ====================
// ACC Cloud Sync - Phase 1
// Local-first app, Firestore as manual cloud layer for now

const ACC_CLOUD_LATEST_COLLECTION = "acc_backups";
const ACC_CLOUD_LATEST_DOC = "main";
const ACC_CLOUD_HISTORY_COLLECTION = "acc_backups_history";
const ACC_CLOUD_META_PENDING_HISTORY_DAY = "__acc_cloud_pending_history_day";
const ACC_CLOUD_META_LAST_HISTORY_SAVED_DAY = "__acc_cloud_last_history_saved_day";

let accAutoSyncTimer = null;
let accLastSyncAt = 0;
const ACC_AUTOSYNC_DELAY = 5000; // 5 წამი
let accCloudStatus = "idle";
let accCloudLastAt = "";
let accCloudLastError = "";

function accToDayKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function accToDisplayDay(dayKey) {
  const [y, m, d] = String(dayKey || "").split("-");
  if (!y || !m || !d) return dayKey || "";
  return `${d}-${m}-${y}`;
}

async function accMarkPendingHistoryDay(dayKey = accToDayKey()) {
  try {
    const existing = await dbGet(ACC_CLOUD_META_PENDING_HISTORY_DAY);

    if (existing) return;

    await dbSet(ACC_CLOUD_META_PENDING_HISTORY_DAY, dayKey);
  } catch (error) {
    console.error("ACC failed to mark pending history day:", error);
  }
}

async function accGetPendingHistoryDay() {
  try {
    return (await dbGet(ACC_CLOUD_META_PENDING_HISTORY_DAY)) || "";
  } catch {
    return "";
  }
}

async function accSetLastHistorySavedDay(dayKey) {
  try {
    await dbSet(ACC_CLOUD_META_LAST_HISTORY_SAVED_DAY, dayKey || "");
  } catch (error) {
    console.error("ACC failed to set last history saved day:", error);
  }
}

async function accGetLastHistorySavedDay() {
  try {
    return (await dbGet(ACC_CLOUD_META_LAST_HISTORY_SAVED_DAY)) || "";
  } catch {
    return "";
  }
}

function setAccCloudStatus(status, at = "") {
  accCloudStatus = status || "idle";
  accCloudLastAt = at || "";

  const el = document.getElementById("accCloudSyncStatus");
  if (!el) return;

  el.classList.remove(
    "backup-status-safe",
    "backup-status-warn",
    "backup-status-risk",
    "backup-status-pending"
  );

  if (status === "synced") {
    el.textContent = at
      ? `Synced • ${new Date(at).toLocaleTimeString()}`
      : "Synced";
    el.classList.add("backup-status-safe");
    return;
  }

  if (status === "syncing") {
    el.textContent = "Syncing...";
    el.classList.add("backup-status-pending");
    return;
  }

  if (status === "local") {
    el.textContent = "Saved locally";
    el.classList.add("backup-status-warn");
    return;
  }

  if (status === "error") {
    el.textContent = "Cloud error";
    el.classList.add("backup-status-risk");
    return;
  }

  el.textContent = "—";
  el.classList.add("backup-status-risk");
}

function getAccCloudPayload() {
  return {
    mode: state.mode,
    personal: cloneJson(window.__accAllData?.personal || []),
    work: cloneJson(window.__accAllData?.work || []),
    updatedAt: new Date().toISOString()
  };
}

async function buildAccCloudPayload() {
  const allData = await getAllModeData();

  window.__accAllData = {
    personal: allData.personal || [],
    work: allData.work || []
  };

  return {
    mode: state.mode,
    personal: cloneJson(allData.personal || []),
    work: cloneJson(allData.work || []),
    updatedAt: new Date().toISOString()
  };
}

async function finalizeAccPendingHistoryDayIfNeeded() {
  try {
    const db = window.__accDb;
    if (!db) return false;

    const todayKey = accToDayKey();
    const pendingDay = await accGetPendingHistoryDay();

    if (!pendingDay) return false;
    if (pendingDay === todayKey) return false;

    const lastSavedDay = await accGetLastHistorySavedDay();
    let finalized = false;

    if (lastSavedDay === pendingDay) {
      finalized = true;
    } else {
      const historyDoc = await db
        .collection(ACC_CLOUD_HISTORY_COLLECTION)
        .doc(pendingDay)
        .get();

      if (historyDoc.exists) {
        await accSetLastHistorySavedDay(pendingDay);
        finalized = true;
      } else {
        const mainDoc = await db
          .collection(ACC_CLOUD_LATEST_COLLECTION)
          .doc(ACC_CLOUD_LATEST_DOC)
          .get();

        if (!mainDoc.exists) return false;

        const mainPayload = mainDoc.data() || {};
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 30);

        await db.collection(ACC_CLOUD_HISTORY_COLLECTION).doc(pendingDay).set({
          type: "daily-history",
          historyDay: pendingDay,
          historyDayDisplay: accToDisplayDay(pendingDay),
          sourceUpdatedAt: mainPayload.updatedAt || "",
          savedAt: new Date().toISOString(),
          expireAt: firebase.firestore.Timestamp.fromDate(expireAt),
          mode: mainPayload.mode || "personal",
          personal: cloneJson(mainPayload.personal || []),
          work: cloneJson(mainPayload.work || []),
        });

        await accSetLastHistorySavedDay(pendingDay);
        finalized = true;
      }
    }

    if (finalized) {
      await dbDelete(ACC_CLOUD_META_PENDING_HISTORY_DAY);
      return true;
    }

    return false;
  } catch (error) {
    console.error("ACC finalize history failed:", error);
    return false;
  }
}

async function accWriteLatestSnapshot() {
  const db = window.__accDb;
  if (!db) throw new Error("Firebase not initialized");

  const payload = await buildAccCloudPayload();

  await db
    .collection(ACC_CLOUD_LATEST_COLLECTION)
    .doc(ACC_CLOUD_LATEST_DOC)
    .set(payload);

  return payload.updatedAt;
}

async function accRefreshCloudStatusFromServer() {
  try {
    const db = window.__accDb;
    if (!db) {
      setAccCloudStatus("error");
      return;
    }

    const doc = await db
      .collection(ACC_CLOUD_LATEST_COLLECTION)
      .doc(ACC_CLOUD_LATEST_DOC)
      .get();

    if (!doc.exists) {
      setAccCloudStatus("idle");
      return;
    }

    const data = doc.data() || {};
    setAccCloudStatus("synced", data.updatedAt || "");
  } catch (error) {
    console.error("ACC cloud status refresh failed:", error);
    setAccCloudStatus("error");
  }
}

function scheduleAccAutoSync() {
	accMarkPendingHistoryDay(accToDayKey());
  if (accAutoSyncTimer) {
    clearTimeout(accAutoSyncTimer);
  }

  setAccCloudStatus("local");

  accAutoSyncTimer = setTimeout(async () => {
    try {
      setAccCloudStatus("syncing");

      const syncedAt = await accWriteLatestSnapshot();
      accLastSyncAt = Date.now();

      setAccCloudStatus("synced", syncedAt);
    } catch (err) {
      console.error("ACC autosync failed:", err);
      setAccCloudStatus("error");
    }
  }, ACC_AUTOSYNC_DELAY);
}

async function triggerAccImmediateSync() {
  try {
  	accMarkPendingHistoryDay(accToDayKey());
    if (accAutoSyncTimer) {
      clearTimeout(accAutoSyncTimer);
      accAutoSyncTimer = null;
    }

    setAccCloudStatus("syncing");

    const syncedAt = await accWriteLatestSnapshot();
    accLastSyncAt = Date.now();

    setAccCloudStatus("synced", syncedAt);
  } catch (err) {
    console.error("ACC immediate sync failed:", err);
    setAccCloudStatus("error");
  }
}

async function handleAccCloudSave() {
  try {
    setAccCloudStatus("syncing");

    const syncedAt = await accWriteLatestSnapshot();
    accCloudLastError = "";

    setAccCloudStatus("synced", syncedAt);

    confirmDelete("Cloud Save successful.", () => {}, false, "OK");
  } catch (error) {
    console.error("ACC Cloud Save failed:", error);
    accCloudLastError = String(error?.message || error || "Cloud Save failed");
    setAccCloudStatus("error");
    confirmDelete("Cloud Save failed.", () => {}, false, "OK");
  }
}

async function getAccCloudHistorySnapshots() {
  try {
    const db = window.__accDb;
    if (!db) return [];

    const snap = await db.collection(ACC_CLOUD_HISTORY_COLLECTION).get();
    const items = [];

    snap.forEach((doc) => {
      const data = doc.data() || {};
      items.push({
        id: doc.id,
        type: "history",
        historyDay: data.historyDay || doc.id,
        historyDayDisplay: data.historyDayDisplay || accToDisplayDay(doc.id),
        savedAt: data.savedAt || "",
        sourceUpdatedAt: data.sourceUpdatedAt || "",
        mode: data.mode || "personal",
        personal: Array.isArray(data.personal) ? data.personal : [],
        work: Array.isArray(data.work) ? data.work : []
      });
    });

    items.sort((a, b) => String(b.historyDay).localeCompare(String(a.historyDay)));
    return items;
  } catch (error) {
    console.error("ACC get history snapshots failed:", error);
    return [];
  }
}

async function chooseAccCloudRestoreSource() {
  const db = window.__accDb;
  if (!db) throw new Error("Firebase not initialized");

  const mainDoc = await db.collection(ACC_CLOUD_LATEST_COLLECTION).doc(ACC_CLOUD_LATEST_DOC).get();
  const historyItems = await getAccCloudHistorySnapshots();

  const options = [];

  if (mainDoc.exists) {
    const mainData = mainDoc.data() || {};
    options.push({
      id: "latest",
      label: `Latest Cloud${mainData.updatedAt ? " • " + new Date(mainData.updatedAt).toLocaleString() : ""}`,
      payload: mainData
    });
  }

  historyItems.forEach((item) => {
    options.push({
      id: `history:${item.id}`,
      label: `History • ${item.historyDayDisplay}`,
      payload: item
    });
  });

  if (!options.length) {
    return { status: "empty", value: null };
  }

  if (options.length === 1) {
    return { status: "picked", value: options[0] };
  }

  const picked = await askRestoreSource(options);

  if (!picked) {
    return { status: "cancel", value: null };
  }

  return { status: "picked", value: picked };
}

async function handleAccCloudLoad() {
  try {
    const result = await chooseAccCloudRestoreSource();

if (result.status === "cancel") {
  return;
}

if (result.status === "empty") {
  confirmDelete("No cloud data found.", () => {}, false, "OK");
  return;
}

const selected = result.value;
const payload = selected.payload || {};

    confirmDelete(
      `Load this snapshot?\n\n${selected.label}\n\nThis will replace current local data in both Personal and Work modes.`,
      async () => {
        const personal = Array.isArray(payload.personal) ? cloneJson(payload.personal) : [];
        const work = Array.isArray(payload.work) ? cloneJson(payload.work) : [];

        await dbSet(PERSONAL_STORAGE_KEY, JSON.stringify(personal));
        await dbSet(WORK_STORAGE_KEY, JSON.stringify(work));

        state.mode = payload.mode === "work" ? "work" : "personal";
        await saveMode();
        await loadDataByMode(state.mode);

        state.people = (state.people || []).map(p => ({
          ...p,
          expanded: false
        }));
        state.statsExpanded = false;

        syncModeButtons();
        render();

        setAccCloudStatus(
  "synced",
  payload.updatedAt || payload.savedAt || new Date().toISOString()
);
      },
      false,
      "Load"
    );
  } catch (error) {
    console.error("ACC Cloud Load failed:", error);
    accCloudLastError = String(error?.message || error || "Cloud Load failed");
    setAccCloudStatus("error");
    confirmDelete("Cloud Load failed.", () => {}, false, "OK");
  }
}

window.finalizeAccPendingHistoryDayIfNeeded = finalizeAccPendingHistoryDayIfNeeded;
window.handleAccCloudSave = handleAccCloudSave;
window.handleAccCloudLoad = handleAccCloudLoad;
window.accRefreshCloudStatusFromServer = accRefreshCloudStatusFromServer;
window.setAccCloudStatus = setAccCloudStatus;
window.scheduleAccAutoSync = scheduleAccAutoSync;
window.triggerAccImmediateSync = triggerAccImmediateSync;