// ==================== 09-export.js ====================
// PDF, JSON Export/Import, Transfer Menu

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
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:24px;background:${bg};color:${text};font-family:system-ui,-apple-system,sans-serif;font-size:14px;}h1{font-size:22px;font-weight:900;margin:0 0 6px;}.sub{color:${muted};font-size:13px;margin-bottom:24px;}.person{background:${card};border-radius:16px;border:1px solid ${line};padding:16px;margin-bottom:20px;page-break-inside:avoid;}.person-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid ${line};}.person-name{font-size:18px;font-weight:900;}.balance-pill{font-size:16px;font-weight:900;padding:6px 14px;border-radius:999px;background:rgba(0,0,0,0.06);}.section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:${muted};margin:14px 0 8px;}.stage{border:1px solid ${line};border-radius:12px;margin-bottom:10px;overflow:hidden;}.stage-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,0.03);}.stage-name{font-weight:800;font-size:15px;}.stage-tag{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.08);color:${muted};margin-left:8px;}.entry{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-top:1px solid ${line};}.entry-type{font-weight:700;font-size:13px;}.entry-right{text-align:right;}.entry-amount{font-weight:900;font-size:14px;}.entry-meta{font-size:12px;color:${muted};margin-top:2px;}.no-entries{padding:10px 14px;font-size:13px;color:${muted};}.totals{display:flex;gap:16px;flex-wrap:wrap;padding:10px 14px;background:rgba(0,0,0,0.03);font-size:13px;color:${muted};border-top:1px solid ${line};}.totals span{font-weight:700;}.grand-total{display:flex;justify-content:space-between;padding:12px 14px;border-top:2px solid ${line};margin-top:4px;}.grand-label{font-weight:800;font-size:15px;}.grand-value{font-weight:900;font-size:16px;}@media print{body{background:#fff;}}</style></head><body><h1>${escapeHtml(title)}</h1><div class="sub">Generated ${new Date().toLocaleDateString("ka-GE")} • ${people.length} person(s)</div>`;
  people.forEach(person => {
    const openStages = (person.stages || []).filter(s => !s.closed);
    const closedStages = (person.stages || []).filter(s => s.closed);
    const openBal = personOpenBalance(person);
    html += `<div class="person"><div class="person-header"><div class="person-name">${escapeHtml(person.name)}</div><div class="balance-pill" style="color:${colorFor(openBal)}">${formatMoney(openBal)}</div></div>`;
    if (person.note) html += `<div style="color:${muted};font-size:13px;margin-bottom:10px;">${escapeHtml(person.note)}</div>`;
    const renderStageGroup = (stages, label) => {
      if (!stages.length) return "";
      let out = `<div class="section-title">${label}</div>`;
      stages.forEach(stage => {
        const bal = stageBalance(stage);
        const cur = stageCurrency(stage);
        const totals = stageTotals(stage);
        out += `<div class="stage"><div class="stage-head"><div><span class="stage-name">${escapeHtml(stage.name)}</span><span class="stage-tag">${stage.closed ? "Closed" : "Open"}</span></div><div style="font-weight:900;color:${colorFor(bal)}">${formatMoney(bal, cur)}</div></div>`;
        if ((stage.entries || []).length) {
          stage.entries.forEach(entry => {
            const ef = entry.type === "Gave" ? entry.amount : -entry.amount;
            out += `<div class="entry"><div><div class="entry-type" style="color:${entry.type === "Gave" ? green : red}">${entry.type}</div>${entry.comment ? `<div style="font-size:12px;color:${muted};margin-top:2px;">${escapeHtml(entry.comment)}</div>` : ""}</div><div class="entry-right"><div class="entry-amount" style="color:${colorFor(ef)}">${normalizeAmount(entry.amount)}${currencyLabel(cur)}</div>Out <span>${normalizeAmount(totals.gave)}${currencyLabel(cur)}</span> &nbsp; In <span>${normalizeAmount(totals.received)}${currencyLabel(cur)}</span> &nbsp;<div class="entry-meta">${formatDate(entry.date)}</div></div></div>`;
          });
          out += `<div class="totals">Out <span>${totals.gave.toFixed(2)}${currencyLabel(cur)}</span> &nbsp; In <span>${totals.received.toFixed(2)}${currencyLabel(cur)}</span> &nbsp; Net <span style="color:${colorFor(bal)}">${formatMoney(bal, cur)}</span></div>`;
        } else out += `<div class="no-entries">No entries</div>`;
        out += `</div>`;
      });
      return out;
    };
    html += renderStageGroup(openStages, "Open Stage");
    html += renderStageGroup(closedStages, "Closed Stages");
    html += `<div class="grand-total"><div class="grand-label">Total Balance</div><div class="grand-value" style="color:${colorFor(openBal)}">${formatMoney(openBal)}</div></div></div>`;
  });
  html += `</body></html>`;
  return html;
}

function triggerPdfPrint(html) {
  const win = window.open("", "_blank");
  if (!win) { confirmDelete("Pop-up blocked. Please allow pop-ups and try again.", () => {}, false, "OK"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

async function exportAllPdf() {
  const allData = await getAllModeData();
  const personalPeople = allData.personal || [];
  const workPeople = allData.work || [];
  if (!personalPeople.length && !workPeople.length) { confirmDelete("No data to export.", () => {}, false, "OK"); return; }
  const combinedPeople = [
    ...personalPeople.map(p => ({ ...p, name: `[Personal] ${p.name || "Unnamed"}` })),
    ...workPeople.map(p => ({ ...p, name: `[Work] ${p.name || "Unnamed"}` }))
  ];
  triggerPdfPrint(buildPdfHtml(combinedPeople, "ACC Full Export"));
}

function exportPersonPdf(personId) {
  const person = findPerson(personId);
  if (!person) return;
  triggerPdfPrint(buildPdfHtml([person]));
}

async function exportJsonBackup() {
  const allData = await getAllModeData();
  const backup = { personal: allData.personal, work: allData.work, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `acc-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function isNonEmptyValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeImportedPeopleArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(person => ({
    ...person,
    expanded: false,
    stages: Array.isArray(person.stages)
      ? person.stages.map(stage => ({
          ...stage,
          entries: Array.isArray(stage.entries) ? stage.entries : []
        }))
      : []
  }));
}

function entryFingerprint(entry) {
  return [
    entry?.type || "",
    Number(entry?.amount || 0),
    entry?.date || "",
    entry?.comment || ""
  ].join("|");
}

function stageFingerprint(stage) {
  return [
    stage?.name || "",
    stage?.closed ? "1" : "0",
    stage?.currency || stageCurrency(stage) || ""
  ].join("|");
}

function personFingerprint(person) {
  return [
    (person?.name || "").trim().toLowerCase(),
    (person?.note || "").trim().toLowerCase()
  ].join("|");
}

function mergeEntryObjects(currentEntry, incomingEntry) {
  const base = { ...currentEntry };

  Object.keys(incomingEntry || {}).forEach(key => {
    const incomingValue = incomingEntry[key];
    const currentValue = base[key];

    if (Array.isArray(incomingValue)) {
      base[key] = cloneJson(incomingValue);
      return;
    }

    if (typeof incomingValue === "object" && incomingValue !== null) {
      base[key] = cloneJson(incomingValue);
      return;
    }

    if (!isNonEmptyValue(currentValue) && isNonEmptyValue(incomingValue)) {
      base[key] = incomingValue;
      return;
    }

    if (key === "id" && !isNonEmptyValue(currentValue) && isNonEmptyValue(incomingValue)) {
      base[key] = incomingValue;
    }
  });

  return base;
}

function mergeEntriesArray(currentEntries = [], incomingEntries = []) {
  const result = currentEntries.map(entry => ({ ...entry }));
  const usedIndexes = new Set();

  incomingEntries.forEach(incomingEntry => {
    let matchIndex = -1;

    if (incomingEntry?.id) {
      matchIndex = result.findIndex(entry => entry?.id === incomingEntry.id);
    }

    if (matchIndex === -1) {
      const incomingFp = entryFingerprint(incomingEntry);
      matchIndex = result.findIndex((entry, idx) => {
        if (usedIndexes.has(idx)) return false;
        return entryFingerprint(entry) === incomingFp;
      });
    }

    if (matchIndex === -1) {
      result.push({ ...incomingEntry });
    } else {
      result[matchIndex] = mergeEntryObjects(result[matchIndex], incomingEntry);
      usedIndexes.add(matchIndex);
    }
  });

  return result;
}

function mergeStageObjects(currentStage, incomingStage) {
  const merged = { ...currentStage };

  Object.keys(incomingStage || {}).forEach(key => {
    if (key === "entries") return;

    const incomingValue = incomingStage[key];
    const currentValue = merged[key];

    if (Array.isArray(incomingValue)) return;

    if (typeof incomingValue === "object" && incomingValue !== null) {
      merged[key] = cloneJson(incomingValue);
      return;
    }

    if (!isNonEmptyValue(currentValue) && isNonEmptyValue(incomingValue)) {
      merged[key] = incomingValue;
      return;
    }

    if (key === "closed" && incomingValue === true) {
      merged[key] = true;
    }
  });

  merged.entries = mergeEntriesArray(currentStage?.entries || [], incomingStage?.entries || []);
  return merged;
}

function mergeStagesArray(currentStages = [], incomingStages = []) {
  const result = currentStages.map(stage => ({
    ...stage,
    entries: Array.isArray(stage.entries) ? stage.entries.map(entry => ({ ...entry })) : []
  }));
  const usedIndexes = new Set();

  incomingStages.forEach(incomingStage => {
    let matchIndex = -1;

    if (incomingStage?.id) {
      matchIndex = result.findIndex(stage => stage?.id === incomingStage.id);
    }

    if (matchIndex === -1) {
      const incomingFp = stageFingerprint(incomingStage);
      matchIndex = result.findIndex((stage, idx) => {
        if (usedIndexes.has(idx)) return false;
        return stageFingerprint(stage) === incomingFp;
      });
    }

    if (matchIndex === -1) {
      result.push({
        ...incomingStage,
        entries: Array.isArray(incomingStage.entries)
          ? incomingStage.entries.map(entry => ({ ...entry }))
          : []
      });
    } else {
      result[matchIndex] = mergeStageObjects(result[matchIndex], incomingStage);
      usedIndexes.add(matchIndex);
    }
  });

  return result;
}

function mergePersonObjects(currentPerson, incomingPerson) {
  const merged = { ...currentPerson };

  Object.keys(incomingPerson || {}).forEach(key => {
    if (key === "stages" || key === "expanded") return;

    const incomingValue = incomingPerson[key];
    const currentValue = merged[key];

    if (Array.isArray(incomingValue)) return;

    if (typeof incomingValue === "object" && incomingValue !== null) {
      merged[key] = cloneJson(incomingValue);
      return;
    }

    if (!isNonEmptyValue(currentValue) && isNonEmptyValue(incomingValue)) {
      merged[key] = incomingValue;
      return;
    }
  });

  merged.expanded = false;
  merged.stages = mergeStagesArray(currentPerson?.stages || [], incomingPerson?.stages || []);

  return merged;
}

function mergePeopleArrays(currentPeople = [], incomingPeople = []) {
  const result = currentPeople.map(person => ({
    ...person,
    expanded: false,
    stages: Array.isArray(person.stages)
      ? person.stages.map(stage => ({
          ...stage,
          entries: Array.isArray(stage.entries) ? stage.entries.map(entry => ({ ...entry })) : []
        }))
      : []
  }));
  const usedIndexes = new Set();

  incomingPeople.forEach(incomingPerson => {
    let matchIndex = -1;

    if (incomingPerson?.id) {
      matchIndex = result.findIndex(person => person?.id === incomingPerson.id);
    }

    if (matchIndex === -1) {
      const incomingFp = personFingerprint(incomingPerson);
      matchIndex = result.findIndex((person, idx) => {
        if (usedIndexes.has(idx)) return false;
        return personFingerprint(person) === incomingFp;
      });
    }

    if (matchIndex === -1) {
      result.push({
        ...incomingPerson,
        expanded: false,
        stages: Array.isArray(incomingPerson.stages)
          ? incomingPerson.stages.map(stage => ({
              ...stage,
              entries: Array.isArray(stage.entries) ? stage.entries.map(entry => ({ ...entry })) : []
            }))
          : []
      });
    } else {
      result[matchIndex] = mergePersonObjects(result[matchIndex], incomingPerson);
      usedIndexes.add(matchIndex);
    }
  });

  return result;
}

function validateFullBackupData(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray(data.personal) &&
    Array.isArray(data.work)
  );
}

async function applyImportedBackupReplace(data) {
  const personal = normalizeImportedPeopleArray(data.personal);
  const work = normalizeImportedPeopleArray(data.work);

  await dbSet(PERSONAL_STORAGE_KEY, JSON.stringify(personal));
  await dbSet(WORK_STORAGE_KEY, JSON.stringify(work));

  await loadDataByMode(state.mode);
  state.people = (state.people || []).map(person => ({
    ...person,
    expanded: false
  }));

  render();
  closeModal();
}

async function applyImportedBackupMerge(data) {
  const currentData = await getAllModeData();

  const mergedPersonal = mergePeopleArrays(
    normalizeImportedPeopleArray(currentData.personal),
    normalizeImportedPeopleArray(data.personal)
  );

  const mergedWork = mergePeopleArrays(
    normalizeImportedPeopleArray(currentData.work),
    normalizeImportedPeopleArray(data.work)
  );

  await dbSet(PERSONAL_STORAGE_KEY, JSON.stringify(mergedPersonal));
  await dbSet(WORK_STORAGE_KEY, JSON.stringify(mergedWork));

  await loadDataByMode(state.mode);
  state.people = (state.people || []).map(person => ({
    ...person,
    expanded: false
  }));

  render();
  closeModal();
}

function openImportModeModal(data) {
  openModal("Import JSON", `
    <div class="inline-note" style="margin-bottom:12px;">
      Choose how to import this backup.
    </div>

    <div class="quick-actions-row quick-actions-row-2" style="margin-bottom:10px;">
      <button type="button" class="secondary-btn" id="importMergeBtn">Merge</button>
      <button type="button" class="danger-btn" id="importReplaceBtn">Replace</button>
    </div>

    <div class="quick-actions-row" style="display:grid;grid-template-columns:1fr;">
      <button type="button" class="primary-btn" id="importCancelBtn" style="min-height:48px;border-radius:14px;font-weight:800;font-size:15px;">
        Cancel
      </button>
    </div>
  `, () => {
    const mergeBtn = document.getElementById("importMergeBtn");
    const replaceBtn = document.getElementById("importReplaceBtn");
    const cancelBtn = document.getElementById("importCancelBtn");

    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (mergeBtn) {
      mergeBtn.onclick = async () => {
        try {
          await applyImportedBackupMerge(data);
        } catch (error) {
          alert("Could not merge the backup file.");
        }
      };
    }

    if (replaceBtn) {
      replaceBtn.onclick = () => {
        confirmDelete(
          "Replace will overwrite your current Personal and Work data. Continue?",
          async () => {
            try {
              await applyImportedBackupReplace(data);
            } catch (error) {
              alert("Could not replace the backup file.");
            }
          },
          false,
          "Replace"
        );
      };
    }
  });
}

async function handleImportedJsonFile(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!validateFullBackupData(data)) {
      throw new Error("Invalid backup file");
    }

    openImportModeModal(data);
  } catch (error) {
    alert("Could not read the backup file.");
  }
}

function openTransferActionsModal() {
  openModal("Data Transfer", `
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
    </div>`, () => {
    const importBtn = document.getElementById("transferImportBtn");
    const cancelBtn = document.getElementById("transferCancelBtn");
    const exportBtn = document.getElementById("transferExportBtn");
    const exportAllPdfBtn = document.getElementById("transferExportAllPdfBtn");
    const exportPersonPdfBtn = document.getElementById("transferExportPersonPdfBtn");
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (exportBtn) exportBtn.onclick = () => { exportJsonBackup(); closeModal(); };
    if (exportAllPdfBtn) exportAllPdfBtn.onclick = () => { closeModal(); exportAllPdf(); };
    if (exportPersonPdfBtn) exportPersonPdfBtn.onclick = () => { closeModal(); openChoosePersonForPdf(); };
    if (importBtn) importBtn.onclick = () => { closeModal(); importFile.click(); };
  });
}

function openChoosePersonForPdf() {
  openModal("Choose a Person", state.people.map(person => `<div class="sheet-item choose-person-pdf" data-person-id="${person.id}"><span class="sheet-item-title">${escapeHtml(person.name)}</span><span class="sheet-item-sub">${formatMoney(personOpenBalance(person))}</span></div>`).join(""), () => {
    document.querySelectorAll(".choose-person-pdf").forEach(btn => { btn.onclick = () => { const personId = btn.dataset.personId; closeModal(); exportPersonPdf(personId); }; });
  });
}