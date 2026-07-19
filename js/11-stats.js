// ==================== 11-stats.js ====================
// Statistics Modal (Overview, Monthly Chart, Top Balances)

function getActiveBalanceTotals(people) {
  const totals = {};
  people.filter(p => !p.archived).forEach(person => {
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
    .filter(p => !p.archived)
    .map(p => ({ id: p.id, name: p.name, balance: personOpenBalance(p), currency: personCurrency(p) }))
    .filter(p => Math.abs(p.balance) > 0.000001)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, limit);
}

function openStatsModal() {
  const people = state.people || [];
  const activeCount = people.filter(p => !p.archived).length;
  const totals = getActiveBalanceTotals(people);
  const totalsOrdered = getOrderedCurrencyEntries(totals);
  const monthly = getMonthlyBreakdown(people, 6);
  const maxMonthly = Math.max(1, ...monthly.map(m => Math.max(m.gave, m.received)));
  const topBalances = getTopBalances(people, 5);

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

  const topBalancesHtml = topBalances.length ? `
    <div class="stats-section-title">Top Balances</div>
    <div class="stats-top-list">
      ${topBalances.map(m => `
        <div class="stats-top-item">
          <span class="stats-top-name">${escapeHtml(m.name)}</span>
          <span class="stats-top-balance ${balanceClass(m.balance)}">${formatMoney(m.balance, m.currency)}</span>
        </div>
      `).join("")}
    </div>
  ` : `<div class="stats-section-title">Top Balances</div><div class="empty-state mini-empty">No open balances</div>`;

  openModal("📊 Statistics", `
    <div class="stats-modal-body">
      <div class="stats-overview-cards">
        <div class="stats-overview-card">
          <div class="stats-overview-label">${state.mode === "work" ? "Team" : "People"}</div>
          <div class="stats-overview-value">${activeCount}</div>
        </div>
        <div class="stats-overview-card">
          <div class="stats-overview-label">Balance</div>
          <div class="stats-overview-value stats-overview-value-money">${balanceValueHtml}</div>
        </div>
      </div>
      ${monthlyHtml}
      ${topBalancesHtml}
    </div>
  `, () => {});
}
