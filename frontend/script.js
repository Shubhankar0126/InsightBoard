/**
 * InsightBoard – script.js
 * Frontend application logic: navigation, API calls, chart rendering, upload.
 */

/* ── Config ──────────────────────────────────────────────────── */
const API_BASE = "https://insightboard-1-49dp.onrender.com";

/* ── App State ───────────────────────────────────────────────── */
const state = {
  sessionId: null,
  columns: [],
  dtypes: {},
  rowCount: 0,
  filename: '',
  charts: {},          // keyed by canvas id
  theme: localStorage.getItem('ib-theme') || 'dark',
};

/* ── DOM Ready ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  setupNav();
  setupThemeToggle();
  setupUploadZone();
  renderDashboard();
  showPage('dashboard');
});

/* ── Navigation ──────────────────────────────────────────────── */
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      showPage(page);
    });
  });
}

function showPage(pageId) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Show/hide pages
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${pageId}`);
  });

  // Update topbar title
  const titles = {
    dashboard:    '📊 Dashboard',
    upload:       '📁 Data Upload',
    visualization:'📈 Visualization',
    insights:     '🧠 AI Insights',
    settings:     '⚙️ Settings',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[pageId] || 'InsightBoard';

  // Lazy-render page-specific content
  if (pageId === 'insights') renderInsights();
  if (pageId === 'visualization') renderVisualizationPage();
}

/* ── Theme ───────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  localStorage.setItem('ib-theme', theme);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.classList.toggle('on', theme === 'light');
  const themeLabel = document.getElementById('theme-label');
  if (themeLabel) themeLabel.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';

  // Re-render charts with updated colors
  setTimeout(() => Object.values(state.charts).forEach(c => { try { c.update(); } catch(_) {} }), 100);
}

function setupThemeToggle() {
  document.querySelectorAll('.theme-toggle').forEach(el => {
    el.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });
  });
}

/* ── Upload Zone ──────────────────────────────────────────────── */
function setupUploadZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
}

async function handleFile(file) {
  if (!file.name.endsWith('.csv')) {
    showToast('Only CSV files are supported.', 'error');
    return;
  }

  showToast(`Uploading ${file.name}…`, 'info');
  showUploadProgress(true);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    // Save to state
    state.sessionId = data.session_id;
    state.columns = data.columns;
    state.dtypes = data.dtypes;
    state.rowCount = data.rows;
    state.filename = data.filename;

    renderPreviewTable(data.preview, data.columns);
    renderFileInfo(data);
    showToast(`✓ Uploaded ${data.filename} (${data.rows.toLocaleString()} rows)`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    showUploadProgress(false);
  }
}

function showUploadProgress(show) {
  const el = document.getElementById('upload-progress');
  if (el) el.classList.toggle('hidden', !show);
  const zone = document.getElementById('upload-zone');
  if (zone) zone.style.pointerEvents = show ? 'none' : '';
}

function renderFileInfo(data) {
  const el = document.getElementById('file-info');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="flex gap-4" style="flex-wrap:wrap">
      <div class="kpi-card animate-in" style="flex:1;min-width:120px">
        <span class="kpi-icon">📄</span>
        <div class="kpi-value text-sm">${data.filename}</div>
        <div class="kpi-label">File name</div>
      </div>
      <div class="kpi-card animate-in" style="flex:1;min-width:120px;animation-delay:.05s">
        <span class="kpi-icon">📏</span>
        <div class="kpi-value">${data.rows.toLocaleString()}</div>
        <div class="kpi-label">Total rows</div>
      </div>
      <div class="kpi-card animate-in" style="flex:1;min-width:120px;animation-delay:.1s">
        <span class="kpi-icon">🗂️</span>
        <div class="kpi-value">${data.columns.length}</div>
        <div class="kpi-label">Columns</div>
      </div>
    </div>
  `;
}

function renderPreviewTable(rows, columns) {
  const wrapper = document.getElementById('preview-table-wrapper');
  if (!wrapper || !rows.length) return;
  wrapper.classList.remove('hidden');

  const thead = columns.map(c => `<th>${c}</th>`).join('');
  const tbody = rows.map(row =>
    `<tr>${columns.map(c => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`
  ).join('');

  wrapper.innerHTML = `
    <h3 class="card-title mt-5">Preview (first ${rows.length} rows)</h3>
    <div class="table-wrapper mt-4">
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
    </div>
  `;
}

/* ── Dashboard ────────────────────────────────────────────────── */
function renderDashboard() {
  renderDemoKPIs();
  renderDemoCharts();
}

function renderDemoKPIs() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;

  const kpis = [
    { icon: '💰', value: '$2.4M',   label: 'Total Revenue',   change: '+18.2%', dir: 'up' },
    { icon: '👥', value: '12,841',  label: 'Active Users',    change: '+7.5%',  dir: 'up' },
    { icon: '📦', value: '3,240',   label: 'Orders Processed',change: '+12.1%', dir: 'up' },
    { icon: '⚡', value: '94.3%',   label: 'Uptime',          change: '0.0%',   dir: 'flat'},
    { icon: '🎯', value: '68.2%',   label: 'Conv. Rate',      change: '-2.4%',  dir: 'down'},
    { icon: '🌐', value: '47K',     label: 'Page Views',      change: '+31.0%', dir: 'up' },
  ];

  grid.innerHTML = kpis.map((k, i) => `
    <div class="kpi-card animate-in" style="animation-delay:${i * 0.06}s">
      <span class="kpi-icon">${k.icon}</span>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-badge ${k.dir}">${k.dir === 'up' ? '↑' : k.dir === 'down' ? '↓' : '→'} ${k.change}</div>
    </div>
  `).join('');
}

function renderDemoCharts() {
  // Revenue line chart
  renderChart('chart-revenue', {
    type: 'line',
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    datasets: [{
      label: 'Revenue ($K)',
      data: [120,145,132,178,195,210,188,225,248,235,260,298],
      borderColor: '#6C63FF',
      backgroundColor: 'rgba(108,99,255,0.1)',
      fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7,
      borderWidth: 2,
    }],
  });

  // Category bar chart
  renderChart('chart-category', {
    type: 'bar',
    labels: ['Electronics','Clothing','Food','Books','Sports','Toys'],
    datasets: [{
      label: 'Sales ($K)',
      data: [450, 320, 280, 175, 220, 150],
      backgroundColor: [
        'rgba(108,99,255,0.8)','rgba(34,211,238,0.8)','rgba(245,158,11,0.8)',
        'rgba(16,185,129,0.8)','rgba(244,63,94,0.8)','rgba(139,92,246,0.8)',
      ],
      borderRadius: 6,
      borderWidth: 0,
    }],
  });

  // Traffic pie chart
  renderChart('chart-traffic', {
    type: 'doughnut',
    labels: ['Organic','Paid','Social','Email','Direct'],
    datasets: [{
      data: [35, 25, 20, 12, 8],
      backgroundColor: ['#6C63FF','#22d3ee','#f59e0b','#10b981','#f43f5e'],
      borderWidth: 2,
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card'),
    }],
  });

  // Weekly active users
  renderChart('chart-users', {
    type: 'bar',
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets: [{
      label: 'Active Users',
      data: [1840, 2100, 1980, 2350, 2280, 1500, 1200],
      backgroundColor: 'rgba(34,211,238,0.7)',
      borderRadius: 6,
      borderWidth: 0,
    }],
  });
}

/* ── Chart renderer (Chart.js wrapper) ───────────────────────── */
function renderChart(canvasId, config, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy old instance if exists
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const isDark = state.theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9091a8' : '#5c5c7a';

  const defaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: config.type === 'doughnut' || config.type === 'pie',
        position: 'bottom',
        labels: {
          color: textColor,
          font: { family: "'DM Sans', sans-serif", size: 12 },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#191b25' : '#fff',
        titleColor: isDark ? '#f0f0ff' : '#0f0f1a',
        bodyColor: textColor,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { family: "'Syne', sans-serif", weight: '700' },
        bodyFont: { family: "'DM Sans', sans-serif" },
      },
    },
    scales: config.type === 'doughnut' || config.type === 'pie' ? {} : {
      x: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 } },
        border: { color: 'transparent' },
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 } },
        border: { color: 'transparent' },
      },
    },
    animation: { duration: 600, easing: 'easeOutQuart' },
  };

  const mergedOptions = deepMerge(defaults, options);

  state.charts[canvasId] = new Chart(canvas, {
    type: config.type,
    data: { labels: config.labels, datasets: config.datasets },
    options: mergedOptions,
  });
}

/* ── Visualization Page ───────────────────────────────────────── */
function renderVisualizationPage() {
  if (!state.sessionId) {
    const container = document.getElementById('viz-controls');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📁</span>
          <h3>No data loaded</h3>
          <p>Upload a CSV file first to start visualizing.</p>
          <button class="btn btn-primary mt-5" onclick="showPage('upload')">Upload Data</button>
        </div>
      `;
    }
    return;
  }

  populateColumnSelects();
}

function populateColumnSelects() {
  const cols = state.columns;
  const options = cols.map(c => `<option value="${c}">${c}</option>`).join('');

  ['viz-x-col', 'viz-y-col'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">-- Select column --</option>${options}`;
  });
}

async function generateVizChart() {
  const xCol = document.getElementById('viz-x-col')?.value;
  const yCol = document.getElementById('viz-y-col')?.value;
  const chartType = document.getElementById('viz-chart-type')?.value || 'bar';

  if (!state.sessionId || !xCol) {
    showToast('Please upload data and select an X column.', 'error');
    return;
  }

  const loading = document.getElementById('viz-loading');
  if (loading) loading.classList.remove('hidden');

  try {
    const params = new URLSearchParams({
      session_id: state.sessionId,
      x: xCol,
      chart_type: chartType,
    });
    if (yCol) params.append('y', yCol);

    const res = await fetch(`${API_BASE}/charts?${params}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error);

    renderChart('viz-chart', payload, {});
    document.getElementById('viz-chart-wrapper')?.classList.remove('hidden');
  } catch (err) {
    showToast(`Chart error: ${err.message}`, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/* ── Insights Page ────────────────────────────────────────────── */
async function renderInsights() {
  const container = document.getElementById('insights-grid');
  if (!container) return;

  if (!state.sessionId) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state-icon">🧠</span>
        <h3>No data to analyze</h3>
        <p>Upload a CSV file to generate AI-powered insights.</p>
        <button class="btn btn-primary mt-5" onclick="showPage('upload')">Upload Data</button>
      </div>
    `;
    return;
  }

  // Show skeleton loaders
  container.innerHTML = Array(4).fill(0).map(() => `
    <div class="card">
      <div class="skeleton" style="height:18px;width:60%;margin-bottom:12px"></div>
      <div class="skeleton" style="height:14px;width:90%;margin-bottom:6px"></div>
      <div class="skeleton" style="height:14px;width:75%"></div>
    </div>
  `).join('');

  try {
    const res = await fetch(`${API_BASE}/insights?session_id=${encodeURIComponent(state.sessionId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    renderInsightCards(data.insights);
    renderStatsPanel(data.stats);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state-icon">❌</span>
        <h3>Failed to load insights</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

function renderInsightCards(insights) {
  const container = document.getElementById('insights-grid');
  if (!container) return;

  if (!insights || !insights.length) {
    container.innerHTML = '<p class="text-muted">No insights available.</p>';
    return;
  }

  container.innerHTML = insights.map((ins, i) => `
    <div class="insight-card animate-in" style="animation-delay:${i * 0.07}s">
      <div>
        <span class="insight-type ${ins.type}">${ins.type}</span>
      </div>
      <div class="insight-title">${ins.icon} ${ins.title}</div>
      <div class="insight-detail">${ins.detail}</div>
    </div>
  `).join('');
}

function renderStatsPanel(stats) {
  const el = document.getElementById('stats-panel');
  if (!el || !stats) return;

  const ov = stats.overview;
  el.innerHTML = `
    <div class="kpi-grid stagger" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
      <div class="kpi-card animate-in"><span class="kpi-icon">📏</span><div class="kpi-value">${ov.total_rows?.toLocaleString()}</div><div class="kpi-label">Total Rows</div></div>
      <div class="kpi-card animate-in"><span class="kpi-icon">🗂️</span><div class="kpi-value">${ov.total_columns}</div><div class="kpi-label">Columns</div></div>
      <div class="kpi-card animate-in"><span class="kpi-icon">🔢</span><div class="kpi-value">${ov.numeric_columns}</div><div class="kpi-label">Numeric Cols</div></div>
      <div class="kpi-card animate-in"><span class="kpi-icon">⚠️</span><div class="kpi-value">${ov.missing_values}</div><div class="kpi-label">Missing Values</div></div>
    </div>
    ${Object.keys(stats.columns).length ? `
    <h3 class="card-title mt-5">Column Statistics</h3>
    <div class="table-wrapper mt-4">
      <table>
        <thead><tr>
          <th>Column</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th><th>Std Dev</th><th>Count</th>
        </tr></thead>
        <tbody>
          ${Object.entries(stats.columns).map(([col, s]) => `
            <tr>
              <td><strong style="color:var(--accent-light)">${col}</strong></td>
              <td>${fmt(s.mean)}</td><td>${fmt(s.median)}</td>
              <td>${fmt(s.min)}</td><td>${fmt(s.max)}</td>
              <td>${fmt(s.std)}</td><td>${s.count?.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}
  `;
}

/* ── Utility Functions ────────────────────────────────────────── */
function fmt(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => toast.style.opacity = '0', 3500);
  setTimeout(() => toast.remove(), 3900);
}

function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] });
        else output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}
function isObject(item) { return item && typeof item === 'object' && !Array.isArray(item); }

/* ── Login form (demo) ────────────────────────────────────────── */
function handleLogin(e) {
  e.preventDefault();
  showToast('Welcome back! Redirecting…', 'success');
  setTimeout(() => {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    showPage('dashboard');
  }, 1200);
}
