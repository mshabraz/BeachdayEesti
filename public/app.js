const state = {
  rows: [],
  filtered: [],
  sortKey: 'score',
  sortDir: 'desc',
  activeFilter: null,
  showUv: true,
  maxWaterTemp: null,
};

const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatus = document.getElementById('syncStatus');
const meta = document.getElementById('meta');
const bestSection = document.getElementById('bestSection');
const bestList = document.getElementById('bestList');
const uvHeader = document.getElementById('uvHeader');
const camModal = document.getElementById('camModal');
const camModalBody = document.getElementById('camModalBody');
const camModalTitle = document.getElementById('camModalTitle');
const camModalExternal = document.getElementById('camModalExternal');
const camModalClose = document.getElementById('camModalClose');

const COL_COUNT_BASE = 17;
let camRefreshTimer = null;

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

function computeMaxWaterTemp(rows) {
  const temps = rows.map((r) => r.waterTemp).filter((v) => v != null);
  return temps.length ? Math.max(...temps) : null;
}

function passesFilter(row, filter) {
  const a = row.amenities || {};
  switch (filter) {
    case 'best-today':
      return row.score >= 70;
    case 'warm-water':
      return row.waterTemp != null && row.waterTemp >= 17;
    case 'lowest-wind':
      return (row.wind ?? 99) <= 5 && (row.gusts ?? 99) <= 8;
    case 'warmest':
      return state.maxWaterTemp != null && row.waterTemp != null && row.waterTemp >= state.maxWaterTemp - 0.5;
    case 'family':
      return (a.familyFriendly || row.familyFriendly) && row.score >= 50 && (row.wind ?? 99) <= 8;
    case 'dog':
      return a.dogFriendly === true;
    case 'lifeguard':
      return a.lifeguard === true;
    case 'food':
      return a.foodNearby === true;
    case 'parking':
      return a.parking === true;
    case 'quiet':
      return row.crowd?.level === 'quiet' || row.crowd?.level === 'moderate';
    case 'sea':
      return row.type === 'coastal';
    case 'lake':
      return row.type === 'lake';
    default:
      return true;
  }
}

function renderTrendCell(row) {
  const trend = row.trend;
  if (!trend) return '—';
  const title = `Now: ${trend.now}\n+3h: ${trend.plus3h}\n+6h: ${trend.plus6h}`;
  return `<span class="trend-cell" title="${escapeHtml(title)}">${escapeHtml(trend.summary || trend.display || '—')}</span>`;
}

function renderCrowdCell(row) {
  return row.crowd?.display ? escapeHtml(row.crowd.display) : '—';
}

function renderSunCell(row) {
  const sun = row.sunlight;
  if (!sun) return '—';
  const title = `Sunrise ${sun.sunrise} · Sunset ${sun.sunset} · Golden hour ${sun.goldenHour}`;
  return `<span class="sun-cell" title="${escapeHtml(title)}">${escapeHtml(sun.summary || sun.sunset || '—')}</span>`;
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
        `<li><span class="score-pill ${scoreClass(row.score)}">${row.score}</span> <strong>${escapeHtml(row.beach)}</strong> — ${escapeHtml(row.reason || row.weather || row.recommendation)}${row.crowd?.display ? ` · ${escapeHtml(row.crowd.display)}` : ''}</li>`
    )
    .join('');
}

function renderCamCell(row) {
  if (!row.camera?.available || !row.camera.url) return '<td class="cam-cell">—</td>';
  const title = row.camera.provider ? `Camera: ${row.camera.provider}` : 'Open beach camera';
  return `<td class="cam-cell"><button type="button" class="cam-link" data-beach-id="${escapeHtml(row.id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">📷</button></td>`;
}

function snapshotSrc(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

function stopCamRefresh() {
  if (camRefreshTimer) {
    clearInterval(camRefreshTimer);
    camRefreshTimer = null;
  }
}

function openCamModal(row) {
  const cam = row.camera;
  if (!cam?.available) return;

  camModalTitle.textContent = `${row.beach} camera`;
  camModalExternal.href = cam.url;
  camModalExternal.textContent = cam.provider ? `Open on ${cam.provider}` : 'Open provider page';

  let mediaHtml = '';
  const refreshSeconds = Math.max(60, Math.min(cam.refreshSeconds || 90, 120));

  if (cam.type === 'iframe' && (cam.embedUrl || cam.url)) {
    mediaHtml = `<iframe class="cam-iframe" src="${escapeHtml(cam.embedUrl || cam.url)}" title="${escapeHtml(row.beach)} camera" loading="lazy"></iframe>`;
  } else if (cam.type === 'hls' && cam.url) {
    mediaHtml = `<video class="cam-video" controls autoplay muted playsinline src="${escapeHtml(cam.url)}"></video>`;
  } else if ((cam.type === 'mjpeg' || cam.type === 'image') && cam.url) {
    mediaHtml = `<img class="cam-image" src="${escapeHtml(cam.url)}" alt="${escapeHtml(row.beach)} live camera">`;
  } else if (cam.snapshotUrl) {
    mediaHtml = `<img class="cam-image" id="camSnapshot" src="${escapeHtml(snapshotSrc(cam.snapshotUrl))}" alt="${escapeHtml(row.beach)} camera snapshot">`;
  } else if (cam.type === 'external') {
    mediaHtml = `<p class="cam-fallback">Live embed not available. Use the link below to view the camera.</p>`;
  } else {
    mediaHtml = `<p class="cam-fallback">Camera preview unavailable.</p>`;
  }

  camModalBody.innerHTML = mediaHtml;
  camModal.hidden = false;
  camModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  stopCamRefresh();
  const snapshotEl = document.getElementById('camSnapshot');
  if (snapshotEl && cam.snapshotUrl) {
    camRefreshTimer = setInterval(() => {
      snapshotEl.src = snapshotSrc(cam.snapshotUrl);
    }, refreshSeconds * 1000);
  }
}

function closeCamModal() {
  stopCamRefresh();
  camModal.hidden = true;
  camModal.setAttribute('aria-hidden', 'true');
  camModalBody.innerHTML = '';
  document.body.classList.remove('modal-open');
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
        <td><span class="score-pill ${scoreClass(row.score)}">${row.score}</span></td>
        <td>
          <span class="rec ${recClass(row.recommendation)}">${escapeHtml(row.recommendation)}</span>
          <span class="reason">${escapeHtml(row.reason || '')}</span>
        </td>
        <td>${renderTrendCell(row)}</td>
        <td>${renderCrowdCell(row)}</td>
        <td>${renderSunCell(row)}</td>
        <td>${formatTemp(row.airTemp)}</td>
        <td title="${escapeHtml(row.waterTempSource || '')}${row.waterTempConfidence ? ' (' + row.waterTempConfidence + ')' : ''}">${formatWater(row)}</td>
        <td>${formatNumber(row.wind, ' m/s')}</td>
        <td>${formatNumber(row.gusts, ' m/s')}</td>
        <td>${escapeHtml(row.direction || '—')}</td>
        <td title="${escapeHtml(row.weatherRaw || '')}">${escapeHtml(row.weather || '—')}</td>
        <td>${formatNumber(row.rain, ' mm')}</td>
        ${uvCell(row)}
        ${renderCamCell(row)}
        <td>${formatDate(row.lastUpdated)}</td>
      </tr>`
    )
    .join('');

  tableBody.querySelectorAll('.cam-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = state.rows.find((r) => r.id === btn.dataset.beachId);
      if (row) openCamModal(row);
    });
  });
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
  if (key === 'trend') {
    return String(a.trend?.summary || '').localeCompare(String(b.trend?.summary || ''), 'et');
  }
  if (key === 'crowd') {
    const order = { quiet: 1, moderate: 2, busy: 3, packed: 4 };
    return (order[a.crowd?.level] || 99) - (order[b.crowd?.level] || 99);
  }
  if (key === 'sunlight') {
    return (a.sunlight?.daylightRemainingMin ?? 9999) - (b.sunlight?.daylightRemainingMin ?? 9999);
  }

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
        row.trend?.summary,
        row.crowd?.label,
        row.sunlight?.summary,
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
  state.maxWaterTemp = computeMaxWaterTemp(state.rows);
  updateUvVisibility();
  renderBestBeaches();
  syncStatus.textContent = `Last synced: ${formatDate(payload.syncedAt)}`;
  const camCount = state.rows.filter((r) => r.camera?.available).length;
  meta.textContent = `${payload.count} beaches · ${camCount} cameras · source: ${payload.observationSource}${
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
        if (b.dataset.filter === 'clear') return;
        b.classList.toggle('active', b.dataset.filter === state.activeFilter);
      });
    }
    applySortAndFilter();
  });
});

searchInput.addEventListener('input', applySortAndFilter);
refreshBtn.addEventListener('click', syncData);
camModalClose.addEventListener('click', closeCamModal);
camModal.querySelector('.modal-backdrop')?.addEventListener('click', closeCamModal);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !camModal.hidden) closeCamModal();
});

loadData().catch((error) => {
  syncStatus.textContent = error.message;
  tableBody.innerHTML = `<tr><td colspan="${colCount()}">No data yet. Click Sync now.</td></tr>`;
});
