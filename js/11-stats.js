// ==================== 11-stats.js ====================
// Statistics Modal (Scope Switch, Overview, Monthly Chart, Insights, Top Balances)

function getPeopleForStatsScope(people, scope) {
  if (scope === "archived") return people.filter(p => p.archived);
  if (scope === "all") return people;
  return people.filter(p => !p.archived);
}

function getBalanceTotalsForScope(people) {
  const totals = {};
  people.forEach(person => {
    const currency = personCurrency(person);
    totals[currency] = (totals[currency] || 0) + personOpenBalance(person);
  });
  return totals;
}

function getMonthlyBreakdown(people, monthsBack = 6) {
  const now = new Date();
  const buckets = [];
  const bucketIndex = {};

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    bucketIndex[key] = buckets.length;
    buckets.push({ key, label: d.toLocaleDateString("en-US", { month: "short" }), gave: 0, received: 0 });
  }

  people.forEach(person => {
    (person.entries || []).forEach(entry => {
      if (!entry.date) return;
      const key = String(entry.date).slice(0, 7);
      const idx = bucketIndex[key];
      if (idx === undefined) return;
      const amount = normalizeAmount(entry.amount);
      if (entry.type === "Gave") buckets[idx].gave += amount;
      else if (entry.type === "Received") buckets[idx].received += amount;
    });
  });

  return buckets;
}

function getTopBalances(people, limit = 5) {
  return people
    .map(p => ({ id: p.id, name: p.name, balance: personOpenBalance(p), currency: personCurrency(p) }))
    .filter(p => Math.abs(p.balance) > 0.000001)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, limit);
}

function getEntryInsights(people) {
  let count = 0;
  let sum = 0;
  const perPersonCount = {};

  people.forEach(person => {
    (person.entries || []).forEach(entry => {
      count++;
      sum += normalizeAmount(entry.amount);
      perPersonCount[person.id] = (perPersonCount[person.id] || 0) + 1;
    });
  });

  let mostActive = null;
  let mostActiveCount = 0;
  people.forEach(person => {
    const c = perPersonCount[person.id] || 0;
    if (c > mostActiveCount) { mostActiveCount = c; mostActive = person; }
  });

  return {
    count,
    average: count ? Math.round(sum / count) : 0,
    mostActiveName: mostActive ? mostActive.name : null,
    mostActiveCount
  };
}

function buildStatsBodyHtml(scope) {
  const allPeople = state.people || [];
  const people = getPeopleForStatsScope(allPeople, scope);
  const totals = getBalanceTotalsForScope(people);
  const totalsOrdered = getOrderedCurrencyEntries(totals);
  const monthly = getMonthlyBreakdown(people, 6);
  const maxMonthly = Math.max(1, ...monthly.map(m => Math.max(m.gave, m.received)));
  const topBalances = getTopBalances(people, 5);
  const insights = getEntryInsights(people);
  const primaryCurrency = totalsOrdered[0]?.[0] || "EUR";

  const scopeLabel = scope === "archived" ? "Archived" : scope === "all" ? "All" : (state.mode === "work" ? "Team" : "People");

  const balanceValueHtml = totalsOrdered.length
    ? totalsOrdered.map(([cur, amt]) => `<span class="${balanceClass(amt)}">${formatMoney(amt, cur)}</span>`).join(" ")
    : `<span class="gray">${formatMoney(0, "EUR")}</span>`;

  const monthlyHtml = `
    <div class="stats-section-title">Last 6 Months</div>
    <div class="stats-month-chart">
      ${monthly.map(m => `
        <div class="stats-month-col">
          <div class="stats-month-bars">
            <div class="stats-bar-give" style="height:${Math.round((m.gave / maxMonthly) * 100)}%" title="Gave ${m.gave}"></div>
            <div class="stats-bar-receive" style="height:${Math.round((m.received / maxMonthly) * 100)}%" title="Received ${m.received}"></div>
          </div>
          <div class="stats-month-label">${m.label}</div>
        </div>
      `).join("")}
    </div>
    <div class="stats-legend">
      <span><span class="stats-legend-dot stats-legend-give"></span>Gave</span>
      <span><span class="stats-legend-dot stats-legend-receive"></span>Received</span>
    </div>
  `;

  const insightsHtml = insights.count ? `
    <div class="stats-section-title">Quick Insights</div>
    <div class="stats-insights-grid">
      <div class="stats-insight-card">
        <div class="stats-insight-value">${insights.count}</div>
        <div class="stats-insight-label">Entries</div>
      </div>
      <div class="stats-insight-card">
        <div class="stats-insight-value">${formatMoneyPlain(insights.average, primaryCurrency)}</div>
        <div class="stats-insight-label">Avg Entry</div>
      </div>
      <div class="stats-insight-card">
        <div class="stats-insight-value stats-insight-value-name">${insights.mostActiveName ? escapeHtml(insights.mostActiveName) : "—"}</div>
        <div class="stats-insight-label">Most Active</div>
      </div>
    </div>
  ` : "";

  const topBalancesHtml = topBalances.length ? `
    <div class="stats-section-title">Top Balances</div>
    <div class="stats-top-list">
      ${topBalances.map((m, idx) => `
        <div class="stats-top-item ${idx === 0 ? "stats-top-item-first" : ""}">
          <span class="stats-top-name">${escapeHtml(m.name)}</span>
          <span class="stats-top-balance ${balanceClass(m.balance)}">${formatMoney(m.balance, m.currency)}</span>
        </div>
      `).join("")}
    </div>
  ` : `<div class="stats-section-title">Top Balances</div><div class="empty-state mini-empty">No open balances</div>`;

  return `
    <div class="stats-scope-switch">
      <button type="button" class="stats-scope-btn ${scope === "active" ? "active" : ""}" data-stats-scope="active">Active</button>
      <button type="button" class="stats-scope-btn ${scope === "archived" ? "active" : ""}" data-stats-scope="archived">Archived</button>
      <button type="button" class="stats-scope-btn ${scope === "all" ? "active" : ""}" data-stats-scope="all">All</button>
    </div>
    <div class="stats-modal-body" id="statsModalBody">
      <div class="stats-overview-cards">
        <div class="stats-overview-card">
          <div class="stats-overview-label">${scopeLabel}</div>
          <div class="stats-overview-value">${people.length}</div>
        </div>
        <div class="stats-overview-card">
          <div class="stats-overview-label">Balance</div>
          <div class="stats-overview-value stats-overview-value-money">${balanceValueHtml}</div>
        </div>
      </div>
      ${monthlyHtml}
      ${insightsHtml}
      ${topBalancesHtml}
    </div>
  `;
}

function bindStatsScopeButtons() {
  document.querySelectorAll("[data-stats-scope]").forEach(btn => {
    btn.onclick = () => renderStatsScope(btn.dataset.statsScope || "active");
  });
}

function renderStatsScope(scope) {
  modalContent.innerHTML = buildStatsBodyHtml(scope);
  bindStatsScopeButtons();
  const body = document.getElementById("statsModalBody");
  if (body) {
    body.style.opacity = "0";
    body.style.transform = "translateY(4px)";
    requestAnimationFrame(() => {
      body.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      body.style.opacity = "1";
      body.style.transform = "translateY(0)";
    });
  }
}

function openStatsModal() {
  openModal("📊 Statistics", buildStatsBodyHtml("active"), () => {
    bindStatsScopeButtons();
  });
}
