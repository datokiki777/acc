// ==================== 05-forms.js ====================
// Form Modals (Add/Edit Person, Entry)

function openPersonForm(personId = null, reopenEditPanel = false) {
  const person = personId ? findPerson(personId) : null;
  const isNew = !person;

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

        <div class="field">
          <label for="personTagLabel">Tag <span class="field-optional">(optional)</span></label>
          <input
            id="personTagLabel"
            name="tagLabel"
            type="text"
            maxlength="20"
            placeholder="Example: Family, Work..."
            value="${person?.tagLabel ? escapeHtml(person.tagLabel) : ""}"
          >
          <input type="hidden" id="personTagColor" name="tagColor" value="${person?.tagColor ? escapeHtml(person.tagColor) : ""}" />
          <div class="tag-color-picker">
            <button type="button" class="tag-color-swatch tag-color-none ${!person?.tagColor ? "active" : ""}" data-tag-color-choice="" aria-label="No color">✕</button>
            ${TAG_COLOR_PALETTE.map(color => `<button type="button" class="tag-color-swatch ${person?.tagColor === color ? "active" : ""}" data-tag-color-choice="${color}" style="background:${color}" aria-label="${color}"></button>`).join("")}
          </div>
        </div>

        ${isNew ? `
        <div class="field">
          <label for="personCurrency">Currency</label>
          <input type="hidden" id="personCurrency" name="currency" value="EUR" />
          <div class="currency-inline-picker">
            <button type="button" class="currency-choice-btn active" data-person-currency-choice="EUR">€</button>
            <button type="button" class="currency-choice-btn" data-person-currency-choice="USD">$</button>
            <button type="button" class="currency-choice-btn" data-person-currency-choice="GEL">₾</button>
            <button type="button" class="currency-choice-btn" data-person-currency-choice="CAD">CAD</button>
          </div>
          <div class="field-hint">Fixed once saved.</div>
        </div>
        ` : ""}

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
            <label for="salaryPayPeriodWeeks">Pay Period</label>
            <input
              id="salaryPayPeriodWeeks"
              name="salaryPayPeriodWeeks"
              type="number"
              step="1"
              min="1"
              max="52"
              placeholder="Weeks, example: 2"
              value="${person?.salaryPayPeriodWeeks || person?.salaryPayDay ? escapeHtml(person.salaryPayPeriodWeeks || person.salaryPayDay) : "2"}"
            >
            <div class="field-hint">Weeks between salary payments.</div>
          </div>

          <div class="field">
            <label for="salaryEndDate">Salary End Date</label>
            <div class="salary-end-row">
              <input
                id="salaryEndDate"
                name="salaryEndDate"
                type="date"
                value="${person?.salaryEndDate ? escapeHtml(person.salaryEndDate) : ""}"
              >
              <button type="button" class="secondary-btn salary-end-today-btn" id="salaryEndTodayBtn">End Today</button>
            </div>
            <div class="field-hint">Optional. Payroll stops calculating after this date.</div>
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
      const salaryEndTodayBtn = document.getElementById("salaryEndTodayBtn");
      const salaryEndDateInput = document.getElementById("salaryEndDate");
      const currencyInput = document.getElementById("personCurrency");
      const currencyChoiceButtons = document.querySelectorAll("[data-person-currency-choice]");
      const tagColorInput = document.getElementById("personTagColor");
      const tagColorButtons = document.querySelectorAll("[data-tag-color-choice]");

      tagColorButtons.forEach(btn => {
        btn.onclick = () => {
          const nextColor = btn.dataset.tagColorChoice || "";
          if (tagColorInput) tagColorInput.value = nextColor;
          tagColorButtons.forEach(b => {
            b.classList.toggle("active", (b.dataset.tagColorChoice || "") === nextColor);
          });
        };
      });

      currencyChoiceButtons.forEach(btn => {
        btn.onclick = () => {
          const nextCurrency = btn.dataset.personCurrencyChoice || "EUR";
          if (currencyInput) currencyInput.value = nextCurrency;
          currencyChoiceButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.personCurrencyChoice === nextCurrency);
          });
        };
      });

      if (salaryEndTodayBtn && salaryEndDateInput) {
        salaryEndTodayBtn.onclick = () => {
          salaryEndDateInput.value = todayStr();
        };
      }

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
        const tagLabel = String(fd.get("tagLabel") || "").trim();
        const tagColor = String(fd.get("tagColor") || "").trim();
        const salaryAmount = normalizeAmount(fd.get("salaryAmount"));
        const salaryStartDate = String(fd.get("salaryStartDate") || "").trim();
        const salaryEndDate = String(fd.get("salaryEndDate") || "").trim();
        const salaryPayPeriodWeeks = Math.min(52, Math.max(1, Number(fd.get("salaryPayPeriodWeeks") || 1)));

        if (!name) return;

        const applyPersonEdit = async () => {
          person.name = name;
          person.tagLabel = tagLabel;
          person.tagColor = tagColor;
          if (state.mode === "work") {
            const previousPeriodWeeks = Math.min(52, Math.max(1, Number(person.salaryPayPeriodWeeks || person.salaryPayDay || 1)));
            const wasConfigured = !!person.salaryAmount && !!person.salaryStartDate;
            if (wasConfigured && previousPeriodWeeks !== salaryPayPeriodWeeks) {
              // Bank whatever had already accrued under the old cadence, then
              // start the new cadence counting forward from today — so an
              // early one-off payment (e.g. a trial week) isn't lost or
              // retroactively recalculated when switching someone onto the
              // standard period everyone else is on.
              person.salaryAccruedBaseline = personSalarySummary(person).accrued;
              person.salaryPeriodAnchorDate = todayStr();
            }
            person.salaryAmount = salaryAmount;
            person.salaryStartDate = salaryStartDate;
            person.salaryEndDate = salaryEndDate;
            person.salaryPayPeriodWeeks = salaryPayPeriodWeeks;
            delete person.salaryPayDay;
            person.salaryCurrency = person.salaryCurrency || personCurrency(person);
          }
          await saveData();
          render();

          if (reopenEditPanel) {
            openEditStagesPanel();
          } else {
            closeModal();
          }
        };

        if (person) {
          const previousPeriodWeeks = Math.min(52, Math.max(1, Number(person.salaryPayPeriodWeeks || person.salaryPayDay || 1)));
          const wasConfigured = state.mode === "work" && !!person.salaryAmount && !!person.salaryStartDate;
          const isChangingPeriod = wasConfigured && previousPeriodWeeks !== salaryPayPeriodWeeks;

          if (isChangingPeriod) {
            const bankedSoFar = personSalarySummary(person).accrued;
            const bankedCurrency = person.salaryCurrency || personCurrency(person);
            confirmDelete(
              `Switch ${person.name}'s pay period from ${previousPeriodWeeks}w to ${salaryPayPeriodWeeks}w? ${formatMoneyPlain(bankedSoFar, bankedCurrency)} accrued so far will be locked in, and the new cycle starts counting from today — nothing is lost.`,
              applyPersonEdit,
              false,
              "Switch"
            );
          } else {
            await applyPersonEdit();
          }
        } else {
          const doCreate = async () => {
            const newId = uid();
            const newCurrency = String(fd.get("currency") || "EUR");

            state.people.unshift({
              id: newId,
              name,
              currency: newCurrency,
              tagLabel,
              tagColor,
              ...(state.mode === "work" ? {
                salaryAmount,
                salaryStartDate,
                salaryEndDate,
                salaryPayPeriodWeeks,
                salaryCurrency: newCurrency
              } : {}),
              expanded: false,
              archived: false,
              createdAt: new Date().toISOString(),
              entries: []
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

                openEntryForm(newId, null);
              });
            });
          };

          const normalizedName = name.trim().toLowerCase();
          const archivedMatch = state.people.find(p => p.archived && (p.name || "").trim().toLowerCase() === normalizedName);

          if (archivedMatch) {
            confirmDelete(
              `"${name}" is already archived. It's usually better to unarchive them instead, so their history stays in one place. Create a new person anyway?`,
              doCreate,
              false,
              "Create Anyway"
            );
          } else {
            await doCreate();
          }
        }
      };
    }
  );
}

function openEntryForm(personId, entryId = null) {
  const person = findPerson(personId);
  const entry = entryId ? findEntry(personId, entryId) : null;
  if (!person) return;
  const isWork = state.mode === "work";
  const entryCategory = isWork ? (entry?.category === "salary" ? "salary" : "gift") : "";
  const entryType = entryCategory === "salary" ? "Gave" : (entry?.type || "Gave");

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

        <div class="field ${entryCategory === "salary" ? "salary-type-hidden" : ""}" id="entryTypeField">
          <label>Type</label>
          <div class="type-toggle-row">
            <button type="button" class="type-toggle-btn ${entryType === "Gave" ? "active gave" : ""}" data-entry-type="Gave">
              ${entryTypeToggleContent("Gave", entryType === "Gave")}
            </button>
            <button type="button" class="type-toggle-btn ${entryType === "Received" ? "active received" : ""}" data-entry-type="Received">
              ${entryTypeToggleContent("Received", entryType === "Received")}
            </button>
          </div>
          <input type="hidden" id="entryType" name="type" value="${entryType}">
        </div>

        ${isWork ? `
        <div class="field">
          <label>Kind</label>
          <div class="entry-kind-row">
            <button type="button" class="entry-kind-btn ${entryCategory === "salary" ? "active" : ""}" data-entry-category="salary">Salary</button>
            <button type="button" class="entry-kind-btn ${entryCategory === "gift" ? "active" : ""}" data-entry-category="gift">Other</button>
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
      const typeField = document.getElementById("entryTypeField");
      const typeInput = document.getElementById("entryType");
      const typeButtons = document.querySelectorAll("[data-entry-type]");
      const categoryInput = document.getElementById("entryCategory");
      const categoryButtons = document.querySelectorAll("[data-entry-category]");
      cancelBtn.onclick = () => closeModal();
      const setEntryType = nextType => {
        typeInput.value = nextType;
        typeButtons.forEach(b => {
          const type = b.dataset.entryType || "Gave";
          const isActive = type === nextType;
          b.classList.remove("active", "gave", "received");
          if (isActive) { b.classList.add("active"); b.classList.add(type === "Gave" ? "gave" : "received"); }
          b.innerHTML = entryTypeToggleContent(type, isActive);
        });
      };
      const syncEntryKind = () => {
        const category = categoryInput ? categoryInput.value : "regular";
        if (category === "salary") {
          setEntryType("Gave");
          typeField?.classList.add("salary-type-hidden");
          return;
        }
        typeField?.classList.remove("salary-type-hidden");
      };
      typeButtons.forEach(btn => {
        btn.onclick = () => {
          const nextType = btn.dataset.entryType || "Gave";
          setEntryType(nextType);
        };
      });
      categoryButtons.forEach(btn => {
        btn.onclick = () => {
          const nextCategory = btn.dataset.entryCategory || "regular";
          if (categoryInput) categoryInput.value = nextCategory;
          categoryButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.entryCategory === nextCategory);
          });
          syncEntryKind();
        };
      });
      syncEntryKind();
      form.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = normalizeAmount(fd.get("amount"));
        if (amount < 1) return;
        const category = isWork ? String(fd.get("category") || "gift") : "";
        const type = category === "salary" ? "Gave" : String(fd.get("type") || "");
        const date = String(fd.get("date") || todayStr());
        const comment = String(fd.get("comment") || "").trim();
        if (!amount || amount <= 0 || !type) return;
        if (entry) {
          entry.amount = amount; entry.type = type; entry.date = date; entry.comment = comment;
          if (isWork) entry.category = category;
          else delete entry.category;
        } else {
          person.entries = person.entries || [];
          person.entries.unshift({ id: uid(), amount, type, date, comment, ...(isWork ? { category } : {}) });
        }
        await saveData();
        closeModal();
      };
    }
  );
}
