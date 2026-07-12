// ==================== 05-forms.js ====================
// Form Modals (Add/Edit Person, Stage, Entry)

function openPersonForm(personId = null, reopenEditPanel = false) {
  const person = personId ? findPerson(personId) : null;

  openModal(
    person
      ? (state.mode === "work" ? "Edit Team" : "Edit Person")
      : (state.mode === "work" ? "Add Team" : "Add Person"),
    `
      <form class="form" id="personForm">
        <div class="field">
          <label for="personName">Name</label>
          <input
            id="personName"
            name="name"
            type="text"
            maxlength="80"
            required
            placeholder="Example: John"
            value="${person ? escapeHtml(person.name) : ""}"
          >
        </div>

        ${state.mode === "work" ? `
        <div class="salary-form-block">
          <div class="field">
            <label for="salaryAmount">Monthly Salary</label>
            <input
              id="salaryAmount"
              name="salaryAmount"
              type="number"
              step="1"
              min="0"
              placeholder="Example: 2500"
              value="${person?.salaryAmount ? escapeHtml(person.salaryAmount) : ""}"
            >
          </div>

          <div class="field">
            <label for="salaryStartDate">Salary Start Date</label>
            <input
              id="salaryStartDate"
              name="salaryStartDate"
              type="date"
              value="${person?.salaryStartDate ? escapeHtml(person.salaryStartDate) : ""}"
            >
          </div>

          <div class="field">
            <label for="salaryPayDay">Pay Day</label>
            <input
              id="salaryPayDay"
              name="salaryPayDay"
              type="number"
              step="1"
              min="1"
              max="31"
              placeholder="Example: 1"
              value="${person?.salaryPayDay ? escapeHtml(person.salaryPayDay) : "1"}"
            >
          </div>
        </div>
        ` : ""}

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

      form.onsubmit = async e => {
        e.preventDefault();

        const fd = new FormData(form);
        const name = String(fd.get("name") || "").trim();
        const salaryAmount = normalizeAmount(fd.get("salaryAmount"));
        const salaryStartDate = String(fd.get("salaryStartDate") || "").trim();
        const salaryPayDay = Math.min(31, Math.max(1, Number(fd.get("salaryPayDay") || 1)));

        if (!name) return;

        if (person) {
          person.name = name;
          if (state.mode === "work") {
            person.salaryAmount = salaryAmount;
            person.salaryStartDate = salaryStartDate;
            person.salaryPayDay = salaryPayDay;
            person.salaryCurrency = person.salaryCurrency || findOpenStage(person.id)?.currency || "EUR";
          }
          await saveData();
          render();

          if (reopenEditPanel) {
            openEditStagesPanel();
          } else {
            closeModal();
          }
        } else {
          const newId = uid();

          state.people.unshift({
            id: newId,
            name,
            ...(state.mode === "work" ? {
              salaryAmount,
              salaryStartDate,
              salaryPayDay,
              salaryCurrency: "EUR"
            } : {}),
            expanded: false,
            stages: []
          });

          await saveData();
          closeModal();

          requestAnimationFrame(() => {
            render();

            requestAnimationFrame(() => {
              const card = document.querySelector(`[data-person-id="${newId}"]`);
              if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "start" });
              }

              openStageForm(newId, null, true);
            });
          });
        }
      };
    }
  );
}

function openStageForm(personId, stageId = null, openEntryAfterSave = false, reopenEditPanel = false, reopenOverviewPersonId = null) {
  const person = findPerson(personId);
  const stage = stageId ? findStage(personId, stageId) : null;

  if (!person) return;

  if (!stage && findOpenStage(personId)) {
    alert("This person already has an open stage.");
    return;
  }

  openModal(
    stage ? "Edit Stage" : "Add Stage",
    `
      <form class="form" id="stageForm">
        <div class="field">
          <label for="stageName">Stage Name</label>
          <input
        id="stageName"
        name="name"
        type="text"
        maxlength="100"
        placeholder="Example: Main Job"
        value="${stage ? escapeHtml(stage.name) : ""}"
         >
        </div>

        <div class="field">
          <label for="stageCurrency">Currency</label>
          <input
               type="hidden"
               id="stageCurrency"
               name="currency"
               value="${stage?.currency || "EUR"}"
         />

       <div class="currency-inline-picker">
          <button type="button" class="currency-choice-btn ${((stage?.currency || "EUR") === "EUR") ? "active" : ""}" data-stage-currency-choice="EUR">€</button>
          <button type="button" class="currency-choice-btn ${((stage?.currency || "EUR") === "USD") ? "active" : ""}" data-stage-currency-choice="USD">$</button>
          <button type="button" class="currency-choice-btn ${((stage?.currency || "EUR") === "GEL") ? "active" : ""}" data-stage-currency-choice="GEL">₾</button>
          <button type="button" class="currency-choice-btn ${((stage?.currency || "EUR") === "CAD") ? "active" : ""}" data-stage-currency-choice="CAD">CAD</button>
            </div>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary-btn" id="cancelModalBtn">Cancel</button>
          <button type="submit" class="primary-btn">Save</button>
        </div>
      </form>
    `,
    () => {
      const form = document.getElementById("stageForm");
      const currencyInput = document.getElementById("stageCurrency");
      const currencyChoiceButtons = document.querySelectorAll("[data-stage-currency-choice]");

     currencyChoiceButtons.forEach(btn => {
       btn.onclick = () => {
     const nextCurrency = btn.dataset.stageCurrencyChoice || "EUR";
     currencyInput.value = nextCurrency;

    currencyChoiceButtons.forEach(b => {
      b.classList.toggle("active", b.dataset.stageCurrencyChoice === nextCurrency);
    });
  };
});
      const cancelBtn = document.getElementById("cancelModalBtn");

      cancelBtn.onclick = () => {
        if (reopenOverviewPersonId) {
          openOverviewPersonDetail(reopenOverviewPersonId);
        } else if (reopenEditPanel) {
          openEditStagesPanel();
        } else {
          closeModal();
        }
      };

      form.onsubmit = async e => {
        e.preventDefault();

        const fd = new FormData(form);
        const name = String(fd.get("name") || "").trim();
        const note = "";
        const currency = String(fd.get("currency") || "EUR");
        const oldCurrency = stage ? stageCurrency(stage) : "EUR";
        const hasEntries = !!(stage && (stage.entries || []).length);

        let savedStageId = stageId;

        if (stage && hasEntries && currency !== oldCurrency) {
          confirmDelete(
            "This stage already has entries. Do you really want to change the currency?",
            async () => {
              stage.name = name;
              stage.note = note;
              stage.currency = currency;

              await saveData();
              render();

              if (openEntryAfterSave && savedStageId) {
                openEntryForm(personId, savedStageId, null, reopenOverviewPersonId);
              } else if (reopenOverviewPersonId) {
                openOverviewPersonDetail(reopenOverviewPersonId);
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
          person.expanded = false;

          const newStage = {
            id: uid(),
            name,
            note,
            currency,
            createdAt: todayStr(),
            closed: false,
            expanded: false,
            entries: []
          };

          person.stages.unshift(newStage);
          savedStageId = newStage.id;
        }

        await saveData();

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

function openEntryForm(personId, stageId, entryId = null, reopenOverviewPersonId = null) {
  const stage = findStage(personId, stageId);
  const entry = entryId ? findEntry(personId, stageId, entryId) : null;
  if (!stage) return;
  const isWork = state.mode === "work";
  const entryCategory = entry?.category || "regular";

  openModal(
    entry ? "Edit Entry" : "Add Entry",
    `
      <form class="form" id="entryForm">
        <div class="field">
          <label for="entryAmount">Amount</label>
          <input
            id="entryAmount"
            name="amount"
            type="number"
            step="1"
            min="1"
            required
            placeholder="Example: 50"
            value="${entry ? escapeHtml(normalizeAmount(entry.amount)) : ""}"
          >
        </div>

        <div class="field">
          <label>Type</label>
          <div class="type-toggle-row">
            <button type="button" class="type-toggle-btn ${(entry?.type || "Gave") === "Gave" ? "active gave" : ""}" data-entry-type="Gave">
              ${entryTypeToggleContent("Gave", (entry?.type || "Gave") === "Gave")}
            </button>
            <button type="button" class="type-toggle-btn ${(entry?.type || "Gave") === "Received" ? "active received" : ""}" data-entry-type="Received">
              ${entryTypeToggleContent("Received", (entry?.type || "Gave") === "Received")}
            </button>
          </div>
          <input type="hidden" id="entryType" name="type" value="${entry?.type || "Gave"}">
        </div>

        ${isWork ? `
        <div class="field">
          <label>Kind</label>
          <div class="entry-kind-row">
            <button type="button" class="entry-kind-btn ${entryCategory === "regular" ? "active" : ""}" data-entry-category="regular">Regular</button>
            <button type="button" class="entry-kind-btn ${entryCategory === "salary" ? "active" : ""}" data-entry-category="salary">Salary</button>
            <button type="button" class="entry-kind-btn ${entryCategory === "gift" ? "active" : ""}" data-entry-category="gift">Gift</button>
            <button type="button" class="entry-kind-btn ${entryCategory === "advance" ? "active" : ""}" data-entry-category="advance">Advance</button>
          </div>
          <input type="hidden" id="entryCategory" name="category" value="${entryCategory}">
        </div>
        ` : ""}

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
      const typeInput = document.getElementById("entryType");
      const typeButtons = document.querySelectorAll("[data-entry-type]");
      const categoryInput = document.getElementById("entryCategory");
      const categoryButtons = document.querySelectorAll("[data-entry-category]");
      cancelBtn.onclick = () => { if (reopenOverviewPersonId) openOverviewPersonDetail(reopenOverviewPersonId); else closeModal(); };
      typeButtons.forEach(btn => {
        btn.onclick = () => {
          const nextType = btn.dataset.entryType || "Gave";
          typeInput.value = nextType;
          typeButtons.forEach(b => {
            const type = b.dataset.entryType || "Gave";
            const isActive = type === nextType;
            b.classList.remove("active", "gave", "received");
            if (isActive) { b.classList.add("active"); b.classList.add(type === "Gave" ? "gave" : "received"); }
            b.innerHTML = entryTypeToggleContent(type, isActive);
          });
        };
      });
      categoryButtons.forEach(btn => {
        btn.onclick = () => {
          const nextCategory = btn.dataset.entryCategory || "regular";
          if (categoryInput) categoryInput.value = nextCategory;
          categoryButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.entryCategory === nextCategory);
          });
        };
      });
      form.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = normalizeAmount(fd.get("amount"));
        if (amount < 1) return;
        const type = String(fd.get("type") || "");
        const category = isWork ? String(fd.get("category") || "regular") : "";
        const date = String(fd.get("date") || todayStr());
        const comment = String(fd.get("comment") || "").trim();
        if (!amount || amount <= 0 || !type) return;
        if (entry) {
          entry.amount = amount; entry.type = type; entry.date = date; entry.comment = comment;
          if (isWork) entry.category = category;
          else delete entry.category;
        } else {
          stage.entries.unshift({ id: uid(), amount, type, date, comment, ...(isWork ? { category } : {}) });
        }
        await saveData();
        if (reopenOverviewPersonId) openOverviewPersonDetail(reopenOverviewPersonId);
        else closeModal();
      };
    }
  );
}
