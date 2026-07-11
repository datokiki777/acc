// ==================== 02-storage.js ====================
// IndexedDB + Storage Operations + Theme

const DB_NAME = "acc-db";
const DB_STORE = "kv";
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = e => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = e => reject(e.target.error);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

// ✅ CORRECT saveData (uses state.mode directly)
async function saveData() {
  const key = state.mode === "work" ? WORK_STORAGE_KEY : PERSONAL_STORAGE_KEY;
  await dbSet(key, JSON.stringify(state.people));
}

// ✅ CORRECT loadDataByMode
async function loadDataByMode(mode = state.mode) {
  try {
    const key = mode === "work" ? WORK_STORAGE_KEY : PERSONAL_STORAGE_KEY;
    const raw = await dbGet(key);

    if (!raw) {
      state.people = [];
      return;
    }

    const parsed = JSON.parse(raw);
    state.people = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    state.people = [];
  }
}

async function loadMode() {
  const savedMode = await dbGet(MODE_STORAGE_KEY);
  return savedMode === "work" ? "work" : "personal";
}

async function saveMode() {
  await dbSet(MODE_STORAGE_KEY, state.mode);
}

async function loadRawData(key) {
  try {
    const raw = await dbGet(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function getAllModeData() {
  return {
    personal: await loadRawData(PERSONAL_STORAGE_KEY),
    work: await loadRawData(WORK_STORAGE_KEY)
  };
}

async function hasAnyDataInAnyMode() {
  const allData = await getAllModeData();
  return allData.personal.length > 0 || allData.work.length > 0;
}

// Theme storage
function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function getSavedThemeMode() {
  const saved = await dbGet(THEME_KEY);
  if (saved === "system" || saved === "dark" || saved === "light") return saved;
  return "system";
}

function getEffectiveTheme(mode) {
  return mode === "system" ? getSystemTheme() : mode;
}

function updateThemeButton(mode) {
  const iconEl = document.getElementById("themeIcon");
  if (!themeToggleBtn || !iconEl) return;
  if (mode === "system") {
    iconEl.textContent = "🌓";
    themeToggleBtn.setAttribute("aria-label", "Theme: Auto");
    themeToggleBtn.setAttribute("title", "Theme: Auto");
  } else if (mode === "dark") {
    iconEl.textContent = "🌙";
    themeToggleBtn.setAttribute("aria-label", "Theme: Dark");
    themeToggleBtn.setAttribute("title", "Theme: Dark");
  } else {
    iconEl.textContent = "☀️";
    themeToggleBtn.setAttribute("aria-label", "Theme: Light");
    themeToggleBtn.setAttribute("title", "Theme: Light");
  }
}

function applyTheme(mode) {
  const effectiveTheme = getEffectiveTheme(mode);
  if (effectiveTheme === "light") document.body.classList.add("light-theme");
  else document.body.classList.remove("light-theme");
  updateThemeButton(mode);
}

async function loadTheme() {
  const mode = await getSavedThemeMode();
  applyTheme(mode);
}

async function cycleThemeMode() {
  const current = await getSavedThemeMode();
  let next = "system";
  if (current === "system") next = "dark";
  else if (current === "dark") next = "light";
  else if (current === "light") next = "system";
  await dbSet(THEME_KEY, next);
  applyTheme(next);
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
  const mode = await getSavedThemeMode();
  if (mode === "system") applyTheme("system");
});
