import type { TransactionsAccount, Transaction } from '../src/transactions';

interface MonthlyData {
  label: string;
  income: number;
  expenses: number;
}

interface TopMerchant {
  name: string;
  total: number;
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

function processTransactions(accounts: TransactionsAccount[]) {
  const allTxns: Transaction[] = accounts.flatMap(a => a.txns);
  const balance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  // Sort by date desc
  allTxns.sort((a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf());

  const expenses = allTxns.filter(t => t.chargedAmount < 0);
  const income = allTxns.filter(t => t.chargedAmount > 0);

  // Monthly aggregation (last 12 months, sorted asc)
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

  // Top merchants by spending
  const merchantMap = new Map<string, number>();
  for (const txn of expenses) {
    const name = txn.description || 'Unknown';
    merchantMap.set(name, (merchantMap.get(name) ?? 0) + Math.abs(txn.chargedAmount));
  }
  const topMerchants: TopMerchant[] = [...merchantMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }));

  return {
    allTxns,
    balance,
    monthly,
    thisMonth,
    topMerchants,
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

export function generateDashboardHtml(accounts: TransactionsAccount[]): string {
  const { allTxns, balance, monthly, thisMonth, topMerchants } = processTransactions(accounts);

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
      return `<tr class="${cls}" data-desc="${escapeHtml(t.description)}" data-date="${t.date}">
        <td>${new Date(t.date).toLocaleDateString('he-IL')}</td>
        <td class="desc">${escapeHtml(t.description)}</td>
        <td class="amount ${cls}">${sign}${fmt(amount, currency)}</td>
        <td><span class="badge ${t.type}">${t.type}</span></td>
      </tr>`;
    })
    .join('\n');

  const monthlyLabels = JSON.stringify(monthly.map(m => m.label));
  const monthlyIncome = JSON.stringify(monthly.map(m => m.income));
  const monthlyExpenses = JSON.stringify(monthly.map(m => m.expenses));
  const merchantLabels = JSON.stringify(topMerchants.map(m => m.name));
  const merchantData = JSON.stringify(topMerchants.map(m => m.total));

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

    /* Charts row */
    .charts {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    @media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }

    .chart-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .chart-box h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: .05em; }
    .chart-box canvas { width: 100% !important; }

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

    input#search {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #e2e8f0;
      padding: .45rem .9rem;
      font-size: 0.875rem;
      outline: none;
      width: 220px;
    }
    input#search:focus { border-color: #3b82f6; }
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
    tbody tr {
      border-bottom: 1px solid #1e293b;
      transition: background .15s;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: #0f172a; }
    tbody td {
      padding: .65rem 1rem;
      color: #cbd5e1;
      vertical-align: middle;
    }
    td.desc { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

    <!-- Charts -->
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

    <!-- Transactions Table -->
    <div class="table-box">
      <div class="table-header">
        <h2>All Transactions (${allTxns.length})</h2>
        <input id="search" type="search" placeholder="Search description…" />
      </div>
      <div class="table-wrap">
        <table id="txnTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
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
          {
            label: 'Income',
            data: ${monthlyIncome},
            backgroundColor: 'rgba(34,197,94,0.7)',
            borderColor: '#22c55e',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Expenses',
            data: ${monthlyExpenses},
            backgroundColor: 'rgba(239,68,68,0.7)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: { mode: 'index' },
        },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#334155' } },
        },
      },
    });

    // ── Merchant Doughnut Chart ────────────────────────────────
    const palette = [
      '#3b82f6','#8b5cf6','#ec4899','#f59e0b','#22c55e',
      '#06b6d4','#f97316','#a855f7','#14b8a6','#ef4444',
    ];
    new Chart(document.getElementById('merchantChart'), {
      type: 'doughnut',
      data: {
        labels: ${merchantLabels},
        datasets: [{
          data: ${merchantData},
          backgroundColor: palette,
          borderColor: '#0f172a',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.label + ': ₪' + ctx.raw.toLocaleString('he-IL', { maximumFractionDigits: 2 }),
            },
          },
        },
      },
    });

    // ── Search filter ──────────────────────────────────────────
    const searchInput = document.getElementById('search');
    const rows = document.querySelectorAll('#txnTable tbody tr');
    const noResults = document.getElementById('no-results');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      let visible = 0;
      rows.forEach(row => {
        const desc = row.dataset.desc.toLowerCase();
        const matches = !q || desc.includes(q);
        row.style.display = matches ? '' : 'none';
        if (matches) visible++;
      });
      noResults.style.display = visible === 0 ? 'block' : 'none';
    });
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
