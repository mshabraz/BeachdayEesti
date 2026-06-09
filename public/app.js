const state = {
  rows: [],
  filtered: [],
  sortKey: 'score',
  sortDir: 'desc',
  activeFilter: null,
  showUv: true,
};

const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatus = document.getElementById('syncStatus');
const meta = document.getElementById('meta');
const bestSection = document.getElementById('bestSection');
const bestList = document.getElementById('bestList');
const uvHeader = document.getElementById('uvHeader');

const COL_COUNT_BASE = 14;

function colCount() {
  return state.showUv ? COL_COUNT_BASE + 1 : COL_COUNT_BASE;
}

function formatTemp(value) {
  return value == null ? '—' : `${value.toFixed(1)}°C`;
}

function formatWater(row) {
  if (row.waterTempDisplay) return escapeHtml(row.waterTempDisplay);
  return formatTemp(row.waterTemp);
}

function formatNumber(value, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('et-EE');
}

function recClass(recommendation) {
  return recommendation.toLowerCase().replace(/\s+/g, '-');
}

function scoreClass(score) {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'okay';
  if (score >= 35) return 'poor';
  return 'skip';
}

function passesFilter(row, filter) {
  switch (filter) {
    case 'warm-water':
      return row.waterTemp != null && row.waterTemp >= 17;
    case 'low-wind':
      return (row.wind ?? 99) <= 5 && (row.gusts ?? 99) <= 8;
    case 'family':
      return row.score >= 55 && (row.wind ?? 99) <= 7 && (row.rain ?? 99) <= 0.5;
    case 'hottest':
      return row.airTemp != null && row.airTemp >= 18;
    case 'sea':
      return row.type === 'coastal';
    case 'lake':
      return row.type === 'lake';
    default:
      return true;
  }
}

function renderBestBeaches() {
  const top = [...state.rows].sort((a, b) => b.score - a.score).slice(0, 5);
  if (top.length === 0) {
    bestSection.hidden = true;
    return;
  }
  bestSection.hidden = false;
  bestList.innerHTML = top
    .map(
      (row) =>
        `<li><span class="score-pill ${scoreClass(row.score)}">${row.score}</span> <strong>${escapeHtml(row.beach)}</strong> — ${escapeHtml(row.weather || row.recommendation)}</li>`
    )
    .join('');
}

function renderCamCell(row) {
  if (!row.camera?.available || !row.camera.url) return '<td class="cam-cell">—</td>';
  const title = row.camera.provider ? `Camera: ${row.camera.provider}` : 'Open beach camera';
  return `<td class="cam-cell"><a class="cam-link" href="${escapeHtml(row.camera.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">📷</a></td>`;
}

function renderRows() {
  if (state.filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${colCount()}">No beaches match your search or filters.</td></tr>`;
    return;
  }

  const uvCell = (row) => (state.showUv ? `<td>${formatNumber(row.uv)}</td>` : '');

  tableBody.innerHTML = state.filtered
    .map(
      (row) => `
      <tr>
        <td><strong>${escapeHtml(row.beach)}</strong></td>
        <td>${escapeHtml(row.region)}</td>
        <td><span class="type-badge ${row.type}">${escapeHtml(row.type)}</span></td>
        <td>${formatTemp(row.airTemp)}</td>
        <td title="${escapeHtml(row.waterTempSource || '')}${row.waterTempConfidence ? ' (' + row.waterTempConfidence + ')' : ''}">${formatWater(row)}</td>
        <td>${formatNumber(row.wind, ' m/s')}</td>
        <td>${formatNumber(row.gusts, ' m/s')}</td>
        <td>${escapeHtml(row.direction || '—')}</td>
        <td title="${escapeHtml(row.weatherRaw || '')}">${escapeHtml(row.weather || '—')}</td>
        <td>${formatNumber(row.rain, ' mm')}</td>
        ${uvCell(row)}
        <td><span class="score-pill ${scoreClass(row.score)}">${row.score}</span></td>
        <td>
          <span class="rec ${recClass(row.recommendation)}">${escapeHtml(row.recommendation)}</span>
          <span class="reason">${escapeHtml(row.reason || '')}</span>
        </td>
        ${renderCamCell(row)}
        <td>${formatDate(row.lastUpdated)}</td>
      </tr>`
    )
    .join('');

}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function compareValues(a, b, key) {
  if (key === 'cam') return 0;
  const left = a[key];
  const right = b[key];

  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'et', { sensitivity: 'base' });
}

function applySortAndFilter() {
  const query = searchInput.value.trim().toLowerCase();
  state.filtered = state.rows
    .filter((row) => {
      if (state.activeFilter && !passesFilter(row, state.activeFilter)) return false;
      if (!query) return true;
      const haystack = [
        row.beach,
        row.region,
        row.type,
        row.weather,
        row.weatherRaw,
        row.recommendation,
        row.reason,
        row.nearestStation,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      const result = compareValues(a, b, state.sortKey);
      return state.sortDir === 'asc' ? result : -result;
    });

  document.querySelectorAll('th[data-key]').forEach((th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.key === state.sortKey) {
      th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });

  renderRows();
}

function updateUvVisibility() {
  state.showUv = state.rows.some((row) => row.uv != null);
  if (uvHeader) uvHeader.style.display = state.showUv ? '' : 'none';
}

async function loadData() {
  const response = await fetch('/api/beaches');
  if (!response.ok) {
    throw new Error('No cached beach data yet.');
  }
  const payload = await response.json();
  state.rows = payload.beaches || [];
  updateUvVisibility();
  renderBestBeaches();
  syncStatus.textContent = `Last synced: ${formatDate(payload.syncedAt)}`;
  meta.textContent = `${payload.count} beaches · source: ${payload.observationSource}${
    payload.warnings?.length ? ' · ' + payload.warnings.join(' · ') : ''
  }`;
  applySortAndFilter();
}

async function syncData() {
  refreshBtn.disabled = true;
  syncStatus.textContent = 'Syncing…';
  try {
    const response = await fetch('/api/sync', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Sync failed');
    }
    await loadData();
    syncStatus.textContent = `Last synced: ${formatDate(payload.syncedAt)}`;
  } catch (error) {
    syncStatus.textContent = error.message;
  } finally {
    refreshBtn.disabled = false;
  }
}

document.querySelectorAll('th[data-key]').forEach((th) => {
  if (th.classList.contains('no-sort')) return;
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = key === 'beach' || key === 'region' ? 'asc' : 'desc';
    }
    applySortAndFilter();
  });
});

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    if (filter === 'clear') {
      state.activeFilter = null;
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    } else {
      state.activeFilter = state.activeFilter === filter ? null : filter;
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.filter === state.activeFilter);
      });
    }
    applySortAndFilter();
  });
});

searchInput.addEventListener('input', applySortAndFilter);
refreshBtn.addEventListener('click', syncData);

loadData().catch((error) => {
  syncStatus.textContent = error.message;
  tableBody.innerHTML = `<tr><td colspan="${colCount()}">No data yet. Click Sync now.</td></tr>`;
});
