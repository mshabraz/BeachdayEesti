const state = {
  rows: [],
  filtered: [],
  sortKey: 'score',
  sortDir: 'desc',
};

const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatus = document.getElementById('syncStatus');
const meta = document.getElementById('meta');

function formatTemp(value) {
  return value == null ? '—' : `${value.toFixed(1)}°C`;
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
  return recommendation.toLowerCase().replace(' ', '-');
}

function renderRows() {
  if (state.filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="14">No beaches match your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = state.filtered
    .map(
      (row) => `
      <tr>
        <td><strong>${escapeHtml(row.beach)}</strong></td>
        <td>${escapeHtml(row.region)}</td>
        <td><span class="type-badge ${row.type}">${escapeHtml(row.type)}</span></td>
        <td>${formatTemp(row.airTemp)}</td>
        <td>${formatTemp(row.waterTemp)}</td>
        <td>${formatNumber(row.wind, ' m/s')}</td>
        <td>${formatNumber(row.gusts, ' m/s')}</td>
        <td>${escapeHtml(row.direction || '—')}</td>
        <td>${escapeHtml(row.weather || '—')}</td>
        <td>${formatNumber(row.rain, ' mm')}</td>
        <td>${formatNumber(row.uv)}</td>
        <td><span class="score-pill">${row.score}</span></td>
        <td>
          <span class="rec ${recClass(row.recommendation)}">${escapeHtml(row.recommendation)}</span>
          <span class="reason">${escapeHtml(row.reason || '')}</span>
        </td>
        <td>${formatDate(row.lastUpdated)}</td>
      </tr>`
    )
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function compareValues(a, b, key) {
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
      if (!query) return true;
      const haystack = [
        row.beach,
        row.region,
        row.type,
        row.weather,
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

async function loadData() {
  const response = await fetch('/api/beaches');
  if (!response.ok) {
    throw new Error('No cached beach data yet.');
  }
  const payload = await response.json();
  state.rows = payload.beaches || [];
  syncStatus.textContent = `Last sync: ${formatDate(payload.syncedAt)}`;
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
    syncStatus.textContent = `Synced ${formatDate(payload.syncedAt)}`;
  } catch (error) {
    syncStatus.textContent = error.message;
  } finally {
    refreshBtn.disabled = false;
  }
}

document.querySelectorAll('th[data-key]').forEach((th) => {
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

searchInput.addEventListener('input', applySortAndFilter);
refreshBtn.addEventListener('click', syncData);

loadData().catch((error) => {
  syncStatus.textContent = error.message;
  tableBody.innerHTML = '<tr><td colspan="14">No data yet. Click Sync now.</td></tr>';
});
