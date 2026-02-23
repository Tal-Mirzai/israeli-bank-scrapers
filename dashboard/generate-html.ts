import type { TransactionsAccount, Transaction } from '../src/transactions';
import { TransactionTypes } from '../src/transactions';
import { CATEGORIES, categorize, type Category } from './categories';

interface MonthlyData {
  label: string;
  income: number;
  expenses: number;
}

interface TopMerchant {
  name: string;
  total: number;
}

interface CategoryTotal {
  category: Category;
  total: number;
}

interface PersonSpend {
  name: string;
  total: number;
  txnCount: number;
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function processTransactions(
  accounts: TransactionsAccount[],
  person1Name?: string,
  person2Name?: string,
) {
  const allTxns: Transaction[] = accounts.flatMap(a => a.txns);
  const balance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  allTxns.sort((a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf());

  const expenses = allTxns.filter(t => t.chargedAmount < 0);
  const income = allTxns.filter(t => t.chargedAmount > 0);

  // Monthly aggregation
  const monthMap = new Map<string, { income: number; expenses: number }>();
  for (const txn of allTxns) {
    const key = getMonthKey(txn.date);
    if (!monthMap.has(key)) monthMap.set(key, { income: 0, expenses: 0 });
    const entry = monthMap.get(key)!;
    if (txn.chargedAmount > 0) entry.income += txn.chargedAmount;
    else entry.expenses += Math.abs(txn.chargedAmount);
  }
  const sortedMonths = [...monthMap.keys()].sort();
  const monthly: MonthlyData[] = sortedMonths.map(key => ({
    label: getMonthLabel(key),
    income: Math.round(monthMap.get(key)!.income * 100) / 100,
    expenses: Math.round(monthMap.get(key)!.expenses * 100) / 100,
  }));

  // Current month totals
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = monthMap.get(thisMonthKey) ?? { income: 0, expenses: 0 };

  // Top merchants
  const merchantMap = new Map<string, number>();
  for (const txn of expenses) {
    const name = txn.description || 'Unknown';
    merchantMap.set(name, (merchantMap.get(name) ?? 0) + Math.abs(txn.chargedAmount));
  }
  const topMerchants: TopMerchant[] = [...merchantMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }));

  // Category totals (expenses only)
  const categoryMap = new Map<string, { category: Category; total: number }>();
  for (const txn of expenses) {
    const cat = categorize(txn.description);
    if (!categoryMap.has(cat.id)) categoryMap.set(cat.id, { category: cat, total: 0 });
    categoryMap.get(cat.id)!.total += Math.abs(txn.chargedAmount);
  }
  const categoryTotals: CategoryTotal[] = [...categoryMap.values()]
    .sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, total: Math.round(c.total * 100) / 100 }));

  // Recurring payments (One Zero marks these via the installments type)
  const recurringTxns = expenses.filter(t => t.type === TransactionTypes.Installments);

  // Who spent more — match person names in descriptions
  let personSpend: PersonSpend[] | null = null;
  if (person1Name || person2Name) {
    const p1: PersonSpend = { name: person1Name || 'Person 1', total: 0, txnCount: 0 };
    const p2: PersonSpend = { name: person2Name || 'Person 2', total: 0, txnCount: 0 };
    const unmatched: PersonSpend = { name: 'Unattributed', total: 0, txnCount: 0 };

    for (const txn of expenses) {
      const desc = txn.description.toLowerCase();
      const amt = Math.abs(txn.chargedAmount);
      if (person1Name && desc.includes(person1Name.toLowerCase())) {
        p1.total += amt;
        p1.txnCount++;
      } else if (person2Name && desc.includes(person2Name.toLowerCase())) {
        p2.total += amt;
        p2.txnCount++;
      } else {
        unmatched.total += amt;
        unmatched.txnCount++;
      }
    }

    p1.total = Math.round(p1.total * 100) / 100;
    p2.total = Math.round(p2.total * 100) / 100;
    unmatched.total = Math.round(unmatched.total * 100) / 100;
    personSpend = [p1, p2, unmatched];
  }

  return {
    allTxns,
    balance,
    monthly,
    thisMonth,
    topMerchants,
    categoryTotals,
    recurringTxns,
    personSpend,
    totalIncome: income.reduce((s, t) => s + t.chargedAmount, 0),
    totalExpenses: expenses.reduce((s, t) => s + Math.abs(t.chargedAmount), 0),
  };
}

function fmt(n: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function generateDashboardHtml(
  accounts: TransactionsAccount[],
  person1Name?: string,
  person2Name?: string,
): string {
  const { allTxns, balance, monthly, thisMonth, topMerchants, categoryTotals, recurringTxns, personSpend } =
    processTransactions(accounts, person1Name, person2Name);

  const generatedAt = new Date().toLocaleString('en-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const txnRows = allTxns
    .map(t => {
      const amount = t.chargedAmount;
      const cls = amount < 0 ? 'expense' : 'income';
      const sign = amount < 0 ? '' : '+';
      const currency = t.chargedCurrency ?? 'ILS';
      const cat = amount < 0 ? categorize(t.description) : null;
      const isRecurring = t.type === TransactionTypes.Installments;
      return `<tr class="${cls}" data-desc="${escapeHtml(t.description)}" data-date="${t.date}" data-cat="${cat?.id ?? ''}">
        <td>${new Date(t.date).toLocaleDateString('he-IL')}</td>
        <td class="desc">${escapeHtml(t.description)}</td>
        <td class="amount ${cls}">${sign}${fmt(amount, currency)}</td>
        <td>${cat ? `<span class="cat-badge" style="background:${cat.color}22;color:${cat.color}">${cat.label}</span>` : ''}</td>
        <td>${isRecurring ? '<span class="badge recurring">Recurring</span>' : `<span class="badge ${t.type}">${t.type}</span>`}</td>
      </tr>`;
    })
    .join('\n');

  const monthlyLabels = JSON.stringify(monthly.map(m => m.label));
  const monthlyIncome = JSON.stringify(monthly.map(m => m.income));
  const monthlyExpenses = JSON.stringify(monthly.map(m => m.expenses));
  const merchantLabels = JSON.stringify(topMerchants.map(m => m.name));
  const merchantData = JSON.stringify(topMerchants.map(m => m.total));
  const categoryLabels = JSON.stringify(categoryTotals.map(c => c.category.label));
  const categoryData = JSON.stringify(categoryTotals.map(c => c.total));
  const categoryColors = JSON.stringify(categoryTotals.map(c => c.category.color));

  // Recurring payments rows
  const recurringRows = recurringTxns
    .slice(0, 30)
    .map(t => {
      const currency = t.chargedCurrency ?? 'ILS';
      return `<tr>
        <td>${escapeHtml(t.description)}</td>
        <td class="amount expense">${fmt(t.chargedAmount, currency)}</td>
        <td>${new Date(t.date).toLocaleDateString('he-IL')}</td>
      </tr>`;
    })
    .join('\n');

  // Who spent more section
  const whoSpentSection = personSpend
    ? (() => {
        const [p1, p2, unmatched] = personSpend;
        const total = p1.total + p2.total + unmatched.total;
        const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
        const personRows = personSpend
          .map(
            p => `
          <div class="person-row">
            <div class="person-name">${escapeHtml(p.name)}</div>
            <div class="person-bar-wrap">
              <div class="person-bar" style="width:${pct(p.total)}%;background:${p.name === p1.name ? '#3b82f6' : p.name === p2.name ? '#ec4899' : '#475569'}"></div>
            </div>
            <div class="person-amount">${fmt(p.total)} <span class="person-pct">${pct(p.total)}% · ${p.txnCount} txns</span></div>
          </div>`,
          )
          .join('');
        const personChartLabels = JSON.stringify(personSpend.map(p => p.name));
        const personChartData = JSON.stringify(personSpend.map(p => p.total));
        const personChartColors = JSON.stringify(['#3b82f6', '#ec4899', '#475569']);
        return `
    <!-- Who Spent More -->
    <div class="section-row">
      <div class="chart-box">
        <h2>Who Spent More</h2>
        <canvas id="personChart" height="180"></canvas>
      </div>
      <div class="chart-box person-details">
        <h2>Spending Breakdown</h2>
        ${personRows}
      </div>
    </div>
    <script>
      new Chart(document.getElementById('personChart'), {
        type: 'doughnut',
        data: {
          labels: ${personChartLabels},
          datasets: [{ data: ${personChartData}, backgroundColor: ${personChartColors}, borderColor: '#0f172a', borderWidth: 2 }],
        },
        options: {
          responsive: true, cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
            tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ₪' + ctx.raw.toLocaleString('he-IL', { maximumFractionDigits: 2 }) } },
          },
        },
      });
    </script>`;
      })()
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>One Zero — Spending Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }

    header {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    header h1 { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; }
    header h1 span { color: #3b82f6; }
    header small { color: #64748b; font-size: 0.8rem; }

    main { max-width: 1280px; margin: 0 auto; padding: 2rem; }

    /* Summary cards */
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
    }
    .card .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: .5rem; }
    .card .value { font-size: 1.6rem; font-weight: 700; }
    .card .sub { font-size: 0.75rem; color: #64748b; margin-top: .35rem; }
    .card.green .value { color: #22c55e; }
    .card.red .value { color: #ef4444; }
    .card.blue .value { color: #3b82f6; }
    .card.yellow .value { color: #f59e0b; }

    /* Chart rows */
    .charts, .section-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .section-row { grid-template-columns: 1fr 1fr; }
    @media (max-width: 900px) { .charts, .section-row { grid-template-columns: 1fr; } }

    .chart-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .chart-box h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: .05em; }
    .chart-box canvas { width: 100% !important; }

    /* Category section */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

    .cat-list { list-style: none; display: flex; flex-direction: column; gap: .5rem; margin-top: .5rem; }
    .cat-list li { display: flex; align-items: center; gap: .75rem; font-size: .875rem; }
    .cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .cat-name { flex: 1; color: #cbd5e1; }
    .cat-amount { font-variant-numeric: tabular-nums; font-weight: 600; color: #e2e8f0; }

    /* Who spent more */
    .person-details { display: flex; flex-direction: column; justify-content: center; gap: 1rem; }
    .person-row { display: flex; flex-direction: column; gap: .3rem; }
    .person-name { font-size: .8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
    .person-bar-wrap { background: #0f172a; border-radius: 9999px; height: 8px; overflow: hidden; }
    .person-bar { height: 100%; border-radius: 9999px; transition: width .5s; }
    .person-amount { font-size: 1rem; font-weight: 700; color: #f1f5f9; }
    .person-pct { font-size: .75rem; font-weight: 400; color: #64748b; }

    /* Recurring table */
    .recurring-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .recurring-box h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: .05em; }
    .recurring-empty { color: #475569; font-size: .875rem; padding: .5rem 0; }

    /* Table section */
    .table-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: .5rem;
    }
    .table-header h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }

    .filter-row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }

    input#search, select#catFilter {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #e2e8f0;
      padding: .45rem .9rem;
      font-size: 0.875rem;
      outline: none;
    }
    input#search { width: 220px; }
    input#search:focus, select#catFilter:focus { border-color: #3b82f6; }
    input#search::placeholder { color: #64748b; }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    thead th {
      text-align: left;
      color: #64748b;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: .05em;
      padding: .6rem 1rem;
      border-bottom: 1px solid #334155;
    }
    tbody tr { border-bottom: 1px solid #1e293b; transition: background .15s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: #0f172a; }
    tbody td { padding: .65rem 1rem; color: #cbd5e1; vertical-align: middle; }
    td.desc { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    td.amount { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.amount.income { color: #22c55e; }
    td.amount.expense { color: #ef4444; }

    .badge {
      display: inline-block;
      padding: .2rem .55rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .badge.normal { background: #1e3a5f; color: #60a5fa; }
    .badge.installments { background: #3b2f00; color: #fbbf24; }
    .badge.recurring { background: #2d1b69; color: #a78bfa; }

    .cat-badge {
      display: inline-block;
      padding: .2rem .55rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    #no-results { text-align: center; color: #475569; padding: 2rem; display: none; }
  </style>
</head>
<body>
  <header>
    <h1><span>One Zero</span> — Spending Dashboard</h1>
    <small>Generated ${generatedAt}</small>
  </header>

  <main>
    <!-- Summary Cards -->
    <div class="cards">
      <div class="card blue">
        <div class="label">Current Balance</div>
        <div class="value">${fmt(balance)}</div>
        <div class="sub">Across all accounts</div>
      </div>
      <div class="card red">
        <div class="label">Spent This Month</div>
        <div class="value">${fmt(thisMonth.expenses)}</div>
        <div class="sub">Total debits</div>
      </div>
      <div class="card green">
        <div class="label">Income This Month</div>
        <div class="value">${fmt(thisMonth.income)}</div>
        <div class="sub">Total credits</div>
      </div>
      <div class="card yellow">
        <div class="label">Net This Month</div>
        <div class="value">${fmt(thisMonth.income - thisMonth.expenses)}</div>
        <div class="sub">Income minus expenses</div>
      </div>
      <div class="card">
        <div class="label">Transactions</div>
        <div class="value" style="color:#e2e8f0">${allTxns.length}</div>
        <div class="sub">In the scraped period</div>
      </div>
    </div>

    <!-- Monthly Chart + Top Merchants -->
    <div class="charts">
      <div class="chart-box">
        <h2>Monthly Income vs Expenses</h2>
        <canvas id="monthlyChart" height="220"></canvas>
      </div>
      <div class="chart-box">
        <h2>Top 10 Merchants by Spend</h2>
        <canvas id="merchantChart" height="220"></canvas>
      </div>
    </div>

    <!-- Categories -->
    <div class="two-col">
      <div class="chart-box">
        <h2>Spending by Category</h2>
        <canvas id="categoryChart" height="220"></canvas>
      </div>
      <div class="chart-box">
        <h2>Category Totals</h2>
        <ul class="cat-list">
          ${categoryTotals
            .map(
              c => `<li>
            <span class="cat-dot" style="background:${c.category.color}"></span>
            <span class="cat-name">${c.category.label}</span>
            <span class="cat-amount">${fmt(c.total)}</span>
          </li>`,
            )
            .join('')}
        </ul>
      </div>
    </div>

    ${whoSpentSection}

    <!-- Recurring Payments -->
    <div class="recurring-box">
      <h2>Recurring Payments (${recurringTxns.length})</h2>
      ${
        recurringTxns.length === 0
          ? '<p class="recurring-empty">No recurring payments detected in the scraped period.</p>'
          : `<div class="table-wrap"><table>
        <thead><tr><th>Description</th><th>Amount</th><th>Last seen</th></tr></thead>
        <tbody>${recurringRows}</tbody>
      </table></div>`
      }
    </div>

    <!-- All Transactions -->
    <div class="table-box">
      <div class="table-header">
        <h2>All Transactions (${allTxns.length})</h2>
        <div class="filter-row">
          <select id="catFilter">
            <option value="">All categories</option>
            ${Object.values(CATEGORIES)
              .map(c => `<option value="${c.id}">${c.label}</option>`)
              .join('')}
          </select>
          <input id="search" type="search" placeholder="Search description…" />
        </div>
      </div>
      <div class="table-wrap">
        <table id="txnTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${txnRows}
          </tbody>
        </table>
        <p id="no-results">No transactions match your search.</p>
      </div>
    </div>
  </main>

  <script>
    // ── Monthly Chart ──────────────────────────────────────────
    new Chart(document.getElementById('monthlyChart'), {
      type: 'bar',
      data: {
        labels: ${monthlyLabels},
        datasets: [
          { label: 'Income', data: ${monthlyIncome}, backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 },
          { label: 'Expenses', data: ${monthlyExpenses}, backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#94a3b8' } }, tooltip: { mode: 'index' } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#334155' } },
        },
      },
    });

    // ── Merchant Doughnut ──────────────────────────────────────
    const palette = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#22c55e','#06b6d4','#f97316','#a855f7','#14b8a6','#ef4444'];
    new Chart(document.getElementById('merchantChart'), {
      type: 'doughnut',
      data: {
        labels: ${merchantLabels},
        datasets: [{ data: ${merchantData}, backgroundColor: palette, borderColor: '#0f172a', borderWidth: 2 }],
      },
      options: {
        responsive: true, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ₪' + ctx.raw.toLocaleString('he-IL', { maximumFractionDigits: 2 }) } },
        },
      },
    });

    // ── Category Chart ─────────────────────────────────────────
    new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: ${categoryLabels},
        datasets: [{ data: ${categoryData}, backgroundColor: ${categoryColors}, borderColor: '#0f172a', borderWidth: 2 }],
      },
      options: {
        responsive: true, cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ₪' + ctx.raw.toLocaleString('he-IL', { maximumFractionDigits: 2 }) } },
        },
      },
    });

    // ── Search + Category filter ───────────────────────────────
    const searchInput = document.getElementById('search');
    const catFilter = document.getElementById('catFilter');
    const rows = document.querySelectorAll('#txnTable tbody tr');
    const noResults = document.getElementById('no-results');

    function applyFilters() {
      const q = searchInput.value.toLowerCase().trim();
      const cat = catFilter.value;
      let visible = 0;
      rows.forEach(row => {
        const desc = row.dataset.desc.toLowerCase();
        const rowCat = row.dataset.cat;
        const matchesSearch = !q || desc.includes(q);
        const matchesCat = !cat || rowCat === cat;
        const show = matchesSearch && matchesCat;
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      noResults.style.display = visible === 0 ? 'block' : 'none';
    }

    searchInput.addEventListener('input', applyFilters);
    catFilter.addEventListener('change', applyFilters);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
