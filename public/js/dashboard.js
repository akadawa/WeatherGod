const Dashboard = (() => {
  const WIDGETS = {
    facade: {
      title: 'Sonnen-Monitor',
      defaultCols: 2,
      defaultRows: 1,
      minCols: 2,
      maxCols: 3,
      minRows: 1,
      maxRows: 2,
      completed: true,
    },
    sunshine: {
      title: 'UV & Sonnenschein',
      defaultCols: 2,
      defaultRows: 1,
      minCols: 1,
      maxCols: 2,
      minRows: 1,
      maxRows: 1,
      completed: true,
    },
    snow: {
      title: 'Schnee',
      defaultCols: 2,
      defaultRows: 1,
      minCols: 1,
      maxCols: 2,
      minRows: 1,
      maxRows: 1,
      completed: true,
    },
    twilight: {
      title: 'Goldene Stunde & Dämmerung',
      defaultCols: 2,
      defaultRows: 3,
      minCols: 2,
      maxCols: 2,
      minRows: 3,
      maxRows: 3,
      completed: true,
    },
    advisor: {
      title: 'Alltags-Assistent',
      defaultCols: 4,
      defaultRows: 1,
      minCols: 4,
      maxCols: 4,
      minRows: 1,
      maxRows: 1,
      completed: true,
    },
    weather: {
      title: 'Aktuelles Wetter',
      defaultCols: 2,
      defaultRows: 2,
      minCols: 2,
      minRows: 1,
      maxRows: 2,
      maxColsOneRow: 6,
      maxColsTwoRow: 6,
      completed: true,
    },
    warnings: {
      title: 'Wetterwarnung',
      defaultCols: 2,
      defaultRows: 1,
      minCols: 2,
      maxCols: 2,
      minRows: 1,
      maxRows: 2,
      completed: true,
    },
    pollen: {
      title: 'Pollenflug',
      subtitle: 'Tageshöchstwerte (Pollen/m³)',
      defaultCols: 2,
      defaultRows: 2,
      minCols: 2,
      minRows: 1,
      maxCols: 2,
      maxRows: 2,
      completed: true,
    },
    forecast: {
      title: '7-Tage-Trend',
      defaultCols: 4,
      defaultRows: 2,
      minCols: 4,
      maxCols: 4,
      minRows: 1,
      maxRows: 2,
      completed: true,
    },
    calendar: {
      title: 'Wetter-Kalender',
      defaultCols: 3,
      defaultRows: 2,
      minCols: 3,
      maxCols: 3,
      minRows: 2,
      maxRows: 2,
      completed: true,
    },
    hourly: {
      title: 'Stundenprognose',
      defaultCols: 4,
      defaultRows: 1,
      minCols: 4,
      maxCols: 4,
      minRows: 1,
      maxRows: 2,
      completed: true,
    },
    history: {
      title: 'Wetter History',
      defaultCols: 3,
      defaultRows: 2,
      minCols: 3,
      maxCols: 3,
      minRows: 2,
      maxRows: 2,
      completed: true,
    },
    radar: {
      title: 'Regenradar',
      defaultCols: 3,
      defaultRows: 2,
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 2,
      completed: true,
    },
    webcam: {
      title: 'Live Webcam',
      defaultCols: 4,
      defaultRows: 2,
      minCols: 4,
      maxCols: 4,
      minRows: 2,
      maxRows: 2,
      completed: true,
    },
  };

  const COL_MAX = 12;
  const ROW_MAX = 4;

  let layout = [];
  let weatherData = null;
  let summaryData = null;
  let historySelectedYear = null;
  const HISTORY_CACHE_MAX = 12;
  let historyDayCache = new Map();
  let historyPresetYears = new Set();
  let historyLoading = false;
  let historyLoadingYear = null;
  let historyFetchSeq = 0;
  let historyFetchAbort = null;
  let webcamHls = null;
  let webcamLoadSeq = 0;
  let webcamActiveSource = '';
  let dragState = null;
  let resizeState = null;
  let saveTimer = null;
  let layoutLocked = false;
  let refreshTimer = null;
  let refreshIntervalMinutes = 5;
  let refreshInFlight = false;
  let lastDataLat = null;
  let lastDataLon = null;
  let pendingRadarMaps = null;
  let calendarViewYear = null;
  let calendarViewMonth = null;
  let calendarMonthData = null;
  let calendarMonthLoading = false;
  let calendarFetchSeq = 0;
  const calendarMonthCache = new Map();

  function widgetMeta(id) {
    return WIDGETS[id] || { minCols: 2, minRows: 1, defaultCols: 4, defaultRows: 2 };
  }

  function weatherMaxCols(rows, oneRowMax = 6, twoRowMax = 6) {
    return rows >= 2 ? twoRowMax : oneRowMax;
  }

  function clampFacadeSize(cols, rows) {
    const c = parseInt(cols, 10) || 2;
    const r = parseInt(rows, 10) || 1;
    if (c >= 3 || r >= 2) return { cols: 3, rows: 2 };
    return { cols: 2, rows: 1 };
  }

  function clampSunshineSize(cols) {
    const c = parseInt(cols, 10) || 2;
    if (c >= 2) return { cols: 2, rows: 1 };
    return { cols: 1, rows: 1 };
  }

  function clampSnowSize(cols) {
    const c = parseInt(cols, 10) || 2;
    if (c >= 2) return { cols: 2, rows: 1 };
    return { cols: 1, rows: 1 };
  }

  function clampSize(id, cols, rows) {
    const meta = widgetMeta(id);
    let r = Math.min(meta.maxRows ?? ROW_MAX, Math.max(meta.minRows, rows));
    let colMax = meta.maxCols ?? COL_MAX;

    if (id === 'weather') {
      r = Math.min(2, Math.max(1, r));
      colMax = weatherMaxCols(r, meta.maxColsOneRow ?? 6, meta.maxColsTwoRow ?? 6);
    }

    if (id === 'facade') {
      return clampFacadeSize(cols, rows);
    }

    if (id === 'sunshine') {
      return clampSunshineSize(cols);
    }

    if (id === 'snow') {
      return clampSnowSize(cols);
    }

    if (id === 'twilight') {
      return { cols: 2, rows: 3 };
    }

    if (id === 'advisor') {
      return { cols: 4, rows: 1 };
    }

    if (id === 'history') {
      return { cols: 3, rows: 2 };
    }

    if (id === 'calendar') {
      return { cols: 3, rows: 2 };
    }

    if (id === 'warnings') {
      const r = Math.min(2, Math.max(1, parseInt(rows, 10) || 1));
      return { cols: 2, rows: r };
    }

    if (id === 'radar') {
      const c = Math.min(4, Math.max(2, parseInt(cols, 10) || 3));
      return { cols: c, rows: 2 };
    }

    if (id === 'hourly') {
      const r = Math.min(2, Math.max(1, parseInt(rows, 10) || 1));
      return { cols: 4, rows: r };
    }

    if (id === 'forecast') {
      const r = Math.min(2, Math.max(1, parseInt(rows, 10) || 2));
      return { cols: 4, rows: r };
    }

    if (id === 'webcam') {
      return { cols: 4, rows: 2 };
    }

    const c = Math.min(colMax, Math.max(meta.minCols, cols));
    return { cols: c, rows: r };
  }

  function defaultLayout() {
    const items = Object.entries(WIDGETS).map(([id, meta]) => ({
      id,
      cols: meta.defaultCols,
      rows: meta.defaultRows,
    }));
    ensureLayoutPositions(items);
    return items;
  }

  function normalizeLayout(raw) {
    if (!Array.isArray(raw)) return defaultLayout();
    const seen = new Set();
    const result = [];

    for (const item of raw) {
      if (!item?.id || !WIDGETS[item.id] || seen.has(item.id)) continue;
      seen.add(item.id);
      const size = clampSize(
        item.id,
        parseInt(item.cols, 10) || WIDGETS[item.id].defaultCols,
        parseInt(item.rows, 10) || WIDGETS[item.id].defaultRows
      );
      const entry = { id: item.id, ...size };
      const col = parseInt(item.col, 10);
      const row = parseInt(item.row, 10);
      if (col >= 1) entry.col = col;
      if (row >= 1) entry.row = row;
      result.push(entry);
    }

    for (const id of Object.keys(WIDGETS)) {
      if (!seen.has(id)) {
        result.push({
          id,
          cols: WIDGETS[id].defaultCols,
          rows: WIDGETS[id].defaultRows,
        });
      }
    }

    ensureLayoutPositions(result);
    compactLayoutItems(result);
    return result;
  }

  function scheduleSave() {
    if (layoutLocked) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      AppStorage.save({ dashboardLayout: layout });
    }, 400);
  }

  function applyLayoutLockState() {
    const page = document.querySelector('.dashboard-page');
    const btn = document.getElementById('dashboardLayoutLock');
    page?.classList.toggle('dashboard-layout-locked', layoutLocked);
    if (btn) {
      btn.textContent = layoutLocked ? '🔒' : '🔓';
      btn.setAttribute('aria-pressed', layoutLocked ? 'true' : 'false');
      btn.title = layoutLocked ? 'Layout entsperren' : 'Layout sperren';
      btn.setAttribute(
        'aria-label',
        layoutLocked ? 'Dashboard-Layout entsperren' : 'Dashboard-Layout sperren',
      );
    }
    applyRefreshControlMode();
    if (layoutLocked) {
      clearDropMarkers();
      dragState = null;
      resizeState = null;
      document.querySelectorAll('.dashboard-widget.is-dragging').forEach((el) => {
        el.classList.remove('is-dragging');
      });
    }
    updateWebcamLayoutChrome();
  }

  function setLayoutLocked(locked) {
    layoutLocked = !!locked;
    AppStorage.save({ dashboardLayoutLocked: layoutLocked });
    applyLayoutLockState();
  }

  function bindLayoutLockControl() {
    const btn = document.getElementById('dashboardLayoutLock');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      setLayoutLocked(!layoutLocked);
    });
  }

  function widgetBox(item) {
    return {
      col: item.col,
      row: item.row,
      cols: item.cols,
      rows: item.rows,
    };
  }

  function boxesOverlap(a, b) {
    return !(
      a.col + a.cols - 1 < b.col
      || b.col + b.cols - 1 < a.col
      || a.row + a.rows - 1 < b.row
      || b.row + b.rows - 1 < a.row
    );
  }

  function canPlaceAt(item, col, row, items, ignoreId = null) {
    if (col < 1 || row < 1 || col + item.cols - 1 > COL_MAX) return false;
    const box = { col, row, cols: item.cols, rows: item.rows };
    for (const other of items) {
      if (other.id === ignoreId) continue;
      if (!other.col || !other.row) continue;
      if (boxesOverlap(box, widgetBox(other))) return false;
    }
    return true;
  }

  function findOpenPosition(item, items, ignoreId = null, preferCol = null, preferRow = null) {
    if (
      preferCol != null
      && preferRow != null
      && canPlaceAt(item, preferCol, preferRow, items, ignoreId)
    ) {
      return { col: preferCol, row: preferRow };
    }
    for (let row = 1; row <= 48; row++) {
      for (let col = 1; col <= COL_MAX - item.cols + 1; col++) {
        if (canPlaceAt(item, col, row, items, ignoreId)) {
          return { col, row };
        }
      }
    }
    return { col: 1, row: 1 };
  }

  function findLeftmostFitAtRow(item, row, items, ignoreId) {
    for (let col = 1; col <= COL_MAX - item.cols + 1; col++) {
      if (canPlaceAt(item, col, row, items, ignoreId)) {
        return col;
      }
    }
    return null;
  }

  function hasLayoutOverlaps(items) {
    const placed = items.filter((entry) => entry.col && entry.row);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (boxesOverlap(widgetBox(placed[i]), widgetBox(placed[j]))) {
          return true;
        }
      }
    }
    return false;
  }

  function snapshotLayout(items) {
    return items.map((entry) => ({
      id: entry.id,
      col: entry.col,
      row: entry.row,
      cols: entry.cols,
      rows: entry.rows,
    }));
  }

  function restoreLayout(snapshot) {
    for (const saved of snapshot) {
      const target = layout.find((entry) => entry.id === saved.id);
      if (target) Object.assign(target, saved);
    }
  }

  function pushWidgetAside(blocker, victim, items) {
    const rightCol = blocker.col + blocker.cols;
    const sameRow = Math.max(victim.row, blocker.row);

    if (rightCol + victim.cols - 1 <= COL_MAX && canPlaceAt(victim, rightCol, sameRow, items, victim.id)) {
      victim.col = rightCol;
      victim.row = sameRow;
      return true;
    }

    let targetRow = Math.max(victim.row, blocker.row + blocker.rows);
    for (let attempt = 0; attempt < 48; attempt++) {
      const targetCol = findLeftmostFitAtRow(victim, targetRow, items, victim.id);
      if (targetCol != null) {
        victim.row = targetRow;
        victim.col = targetCol;
        return true;
      }
      targetRow += 1;
    }

    return false;
  }

  function resolveLayoutPush(items, focusId) {
    const MAX = 150;

    for (let pass = 0; pass < MAX; pass++) {
      let moved = false;
      const ordered = [...items]
        .filter((entry) => entry.col && entry.row)
        .sort((a, b) => a.row - b.row || a.col - b.col);

      for (const blocker of ordered) {
        for (const victim of ordered) {
          if (blocker.id === victim.id) continue;
          if (!boxesOverlap(widgetBox(blocker), widgetBox(victim))) continue;

          let toPush = victim;
          let anchor = blocker;

          if (blocker.id === focusId) {
            toPush = victim;
            anchor = blocker;
          } else if (victim.id === focusId) {
            continue;
          } else if (blocker.col < victim.col || (blocker.col === victim.col && blocker.row <= victim.row)) {
            toPush = victim;
            anchor = blocker;
          } else {
            toPush = blocker;
            anchor = victim;
          }

          if (toPush.id === focusId) continue;

          const before = `${toPush.col},${toPush.row}`;
          if (!pushWidgetAside(anchor, toPush, items)) continue;
          if (`${toPush.col},${toPush.row}` !== before) moved = true;
        }
      }

      if (!moved) break;
    }
  }

  function compactLayoutItems(items, focusId) {
    const sorted = [...items]
      .filter((entry) => entry.id !== focusId && entry.col && entry.row)
      .sort((a, b) => a.row - b.row || a.col - b.col);

    for (const entry of sorted) {
      while (entry.row > 1) {
        const targetRow = entry.row - 1;
        const targetCol = findLeftmostFitAtRow(entry, targetRow, items, entry.id);
        if (targetCol == null) break;
        entry.row = targetRow;
        entry.col = targetCol;
      }
      while (entry.col > 1 && canPlaceAt(entry, entry.col - 1, entry.row, items, entry.id)) {
        entry.col -= 1;
      }
    }
  }

  function applyWidgetLayoutChange(focusId, patch, options = {}) {
    const item = layout.find((entry) => entry.id === focusId);
    if (!item) return false;

    const saved = snapshotLayout(layout);
    const prevCols = item.cols;
    const prevRows = item.rows;

    if (options.anchorCol != null) item.col = options.anchorCol;
    if (options.anchorRow != null) item.row = options.anchorRow;
    if (patch.col != null) item.col = patch.col;
    if (patch.row != null) item.row = patch.row;
    if (patch.cols != null) item.cols = patch.cols;
    if (patch.rows != null) item.rows = patch.rows;

    if (item.col < 1) item.col = 1;
    if (item.row < 1) item.row = 1;
    if (item.col + item.cols - 1 > COL_MAX) {
      item.col = Math.max(1, COL_MAX - item.cols + 1);
    }

    resolveLayoutPush(layout, focusId);

    const repositioned = patch.col != null || patch.row != null;
    const shrinking = (patch.cols != null && patch.cols < prevCols) || (patch.rows != null && patch.rows < prevRows);
    if (repositioned || shrinking) {
      compactLayoutItems(layout, focusId);
      resolveLayoutPush(layout, focusId);
    }

    if (!canPlaceAt(item, item.col, item.row, layout, item.id) || hasLayoutOverlaps(layout)) {
      restoreLayout(saved);
      return false;
    }

    return true;
  }

  function applyFullLayoutPlacement() {
    for (const entry of layout) {
      const widget = document.querySelector(`.dashboard-widget[data-id="${entry.id}"]`);
      if (widget) applyWidgetPlacement(widget, entry);
    }
  }

  function assignFlowPositions(items) {
    let col = 1;
    let row = 1;
    let bandHeight = 1;

    for (const item of items) {
      if (col !== 1 && col + item.cols - 1 > COL_MAX) {
        row += bandHeight;
        col = 1;
        bandHeight = item.rows;
      } else {
        bandHeight = Math.max(bandHeight, item.rows);
      }

      item.col = col;
      item.row = row;
      col += item.cols;
    }
  }

  function ensureLayoutPositions(items) {
    if (items.every((item) => !item.col || !item.row)) {
      assignFlowPositions(items);
      return;
    }

    for (const item of items) {
      if (!item.col || !item.row) {
        const pos = findOpenPosition(item, items, item.id);
        item.col = pos.col;
        item.row = pos.row;
      }
    }
  }

  function placeWidgetAt(item, col, row) {
    if (layoutLocked) return;
    if (!applyWidgetLayoutChange(item.id, { col, row })) return;
    applyFullLayoutPlacement();
    scheduleSave();
  }

  function gridMetrics(grid) {
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap || style.gap) || 16;
    const rowGap = parseFloat(style.rowGap || style.gap) || 16;
    const rowHeight = parseFloat(style.getPropertyValue('--widget-single-row-height')) || 130;
    const colWidth = (rect.width - gap * 11) / 12;
    return { rect, gap, rowGap, colWidth, rowHeight };
  }

  function pointerToGrid(grid, clientX, clientY, item) {
    const { rect, gap, rowGap, colWidth, rowHeight } = gridMetrics(grid);
    const x = Math.max(0, clientX - rect.left);
    const y = Math.max(0, clientY - rect.top);

    let col = 1;
    let edge = 0;
    for (let c = 1; c <= 12; c++) {
      const next = edge + colWidth;
      if (x <= next || c === 12) {
        col = c;
        break;
      }
      edge = next + gap;
    }

    col = Math.max(1, Math.min(COL_MAX - item.cols + 1, col));
    const row = Math.max(1, Math.floor(y / (rowHeight + rowGap)) + 1);
    return { col, row };
  }

  function dragGridPosition(grid, dragState, item, clientX, clientY) {
    const { gap, rowGap, colWidth, rowHeight } = gridMetrics(grid);
    const dCols = snapDelta(clientX - dragState.startX, colWidth + gap);
    const dRows = snapDelta(clientY - dragState.startY, rowHeight + rowGap);
    const col = Math.max(1, Math.min(COL_MAX - item.cols + 1, dragState.startCol + dCols));
    const row = Math.max(1, dragState.startRow + dRows);
    return { col, row };
  }

  function ensureDropPreview(grid) {
    let preview = grid.querySelector('.dashboard-grid-drop-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'dashboard-grid-drop-preview';
      preview.setAttribute('aria-hidden', 'true');
      grid.appendChild(preview);
    }
    return preview;
  }

  function showDropPreview(grid, item, col, row) {
    const preview = ensureDropPreview(grid);
    preview.style.gridColumn = `${col} / span ${item.cols}`;
    preview.style.gridRow = `${row} / span ${item.rows}`;
    preview.hidden = false;
    grid.classList.add('is-drag-active');
  }

  function hideDropPreview(grid) {
    const preview = grid?.querySelector('.dashboard-grid-drop-preview');
    if (preview) preview.hidden = true;
    grid?.classList.remove('is-drag-active');
  }

  function snapDelta(delta, unit) {
    if (Math.abs(delta) < unit * 0.25) return 0;
    return delta >= 0 ? Math.floor(delta / unit) : Math.ceil(delta / unit);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatWindDirection(deg) {
    if (deg == null || Number.isNaN(deg)) return '–';
    const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function weatherMetaLabel(...lines) {
    return lines
      .map((line) => `<span class="weather-meta-label-part">${line}</span>`)
      .join('');
  }

  const FACADE_COLORS = {
    north: '#8899aa',
    east: '#ffd166',
    south: '#f5a623',
    west: '#ff9500',
  };

  const FACADE_ABBR = { north: 'N', east: 'O', south: 'S', west: 'W' };

  function facadeCompactGridHtml(facades) {
    const items = (facades || []).map((f) => {
      const active = !!f.active;
      const classes = [
        'facade-widget-cell',
        active ? 'facade-widget-cell--active' : 'facade-widget-cell--inactive',
        active && f.id === 'west' ? 'facade-widget-cell--west' : '',
      ].filter(Boolean).join(' ');
      const accent = FACADE_COLORS[f.id] || 'var(--accent)';
      const times = f.hasWindow
        ? `${escapeHtml(f.enterTime)} – ${escapeHtml(f.leaveTime)}`
        : '–';
      return `
        <div class="${classes}" data-facade="${f.id}" style="--facade-accent:${accent}">
          <span class="facade-widget-cell-abbr">${FACADE_ABBR[f.id] || '?'}</span>
          <span class="facade-widget-cell-label">${escapeHtml(f.label)}</span>
          <span class="facade-widget-cell-times">${times}</span>
        </div>
      `;
    }).join('');

    return `<div class="facade-widget-grid">${items}</div>`;
  }

  function facadeOverlayHtml(facade, sun, sunsetFacade) {
    if (!sun.aboveHorizon || !facade) {
      return `
        <div class="facade-widget-overlay">
          <span class="facade-widget-status">Sonne unter Horizont</span>
          <span class="facade-widget-times">↑ ${sun.sunrise} · ↓ ${sun.sunset}</span>
        </div>
      `;
    }

    return `
      <div class="facade-widget-overlay">
        <strong class="facade-widget-side">${escapeHtml(facade.label)}seite</strong>
        <span class="facade-widget-sub">Weg ca. ${escapeHtml(facade.leaveTime || '–')} Uhr</span>
        <span class="facade-widget-meta-inline">Az ${sun.azimuthDeg}° · H ${sun.altitudeDeg}°</span>
        ${sunsetFacade ? `<span class="facade-widget-hint">Untergang ${sunsetFacade.time} · ${escapeHtml(sunsetFacade.label)}</span>` : ''}
      </div>
    `;
  }

  function mountFacadeMap(el) {
    if (typeof DashboardSunMap === 'undefined') return;
    const host = el.querySelector('.facade-widget-map-host');
    if (!host) return;

    const saved = AppStorage.load?.() || {};
    const lat = saved.lat;
    const lon = saved.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    requestAnimationFrame(() => DashboardSunMap.mount(host, lat, lon));
  }

  function mountRadarMap(el) {
    if (typeof DashboardRadar === 'undefined') return;
    const host = el.querySelector('.radar-map-host');
    const controls = el.querySelector('.radar-controls');
    if (!host) return;

    const saved = AppStorage.load?.() || {};
    const lat = saved.lat;
    const lon = saved.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    requestAnimationFrame(() => DashboardRadar.mount(host, lat, lon, controls));
  }

  function renderRadar(el) {
    const saved = AppStorage.load?.() || {};
    const lat = saved.lat;
    const lon = saved.lon;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      if (typeof DashboardRadar !== 'undefined') DashboardRadar.destroy();
      el.innerHTML = '<p class="widget-empty">Kein Standort – bitte im Sonnen-Monitor setzen.</p>';
      return;
    }

    el.innerHTML = `
      <div class="radar-widget">
        <div class="radar-map-wrap">
          <div class="radar-map-host" aria-label="Regenradar-Karte"></div>
          <div class="radar-map-zoom" role="group" aria-label="Karten-Zoom">
            <button type="button" class="radar-btn" data-radar-action="zoom-in" title="Hineinzoomen" aria-label="Hineinzoomen">+</button>
            <button type="button" class="radar-btn" data-radar-action="zoom-out" title="Herauszoomen" aria-label="Herauszoomen">−</button>
          </div>
        </div>
        <div class="radar-controls">
          <span class="radar-status">
            <span class="radar-time">–</span>
            <span class="radar-state">–</span>
          </span>
          <a class="radar-credit" href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>
        </div>
      </div>
    `;
    mountRadarMap(el);
  }

  function renderFacade(el) {
    if (!summaryData) {
      el.innerHTML = '<p class="widget-loading">Sonnenstand wird geladen…</p>';
      return;
    }

    const { facade, sun, sunsetFacade, facades } = summaryData;
    const widget = el.closest('.dashboard-widget');
    const expanded = widget
      && Number(widget.dataset.cols) >= 3
      && Number(widget.dataset.rows) >= 2;

    if (!expanded) {
      if (typeof DashboardSunMap !== 'undefined') DashboardSunMap.destroy();

      el.innerHTML = `
        <div class="facade-widget facade-widget--compact">
          ${facadeCompactGridHtml(facades)}
        </div>
      `;
      return;
    }

    const saved = AppStorage.load?.() || {};
    if (typeof saved.lat !== 'number' || typeof saved.lon !== 'number') {
      if (typeof DashboardSunMap !== 'undefined') DashboardSunMap.destroy();
      el.innerHTML = '<p class="widget-empty">Kein Standort gespeichert – bitte im Sonnen-Monitor setzen.</p>';
      return;
    }

    el.innerHTML = `
      <div class="facade-widget facade-widget--expanded">
        <div class="facade-widget-map-host"></div>
        ${facadeOverlayHtml(facade, sun, sunsetFacade)}
      </div>
    `;
    mountFacadeMap(el);
  }

  function widgetDisplayTitle(id, item) {
    const meta = WIDGETS[id];
    if (!meta) return id;
    if (id === 'sunshine' && item.cols === 1) return 'UV & Sonne';
    if (id === 'snow' && item.cols === 1) return 'Schnee';
    return meta.title;
  }

  function updateWidgetHeadTitle(widget, item) {
    const h3 = widget.querySelector('.widget-head h3');
    if (h3) h3.textContent = widgetDisplayTitle(item.id, item);
  }

  function parseClockTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  function daylightHoursFromDay(day) {
    const sunrise = parseClockTimeToMinutes(day?.sunrise);
    const sunset = parseClockTimeToMinutes(day?.sunset);
    if (sunrise == null || sunset == null || sunset <= sunrise) return null;
    return Math.round(((sunset - sunrise) / 60) * 10) / 10;
  }

  function sunshineFillPercent(sunshineHours, daylightHours) {
    if (sunshineHours == null || daylightHours == null || daylightHours <= 0) return 0;
    return Math.min(100, Math.round((sunshineHours / daylightHours) * 100));
  }

  function sunshineHoursTooltip(sunshineHours, daylightHours) {
    if (daylightHours == null) return 'Sonnenschein';
    const dl = daylightHours.toString().replace('.', ',');
    return `Sonnenstunden (${sunshineHours ?? '–'} h von ${dl} h Tageslicht)`;
  }

  function daylightHoursForSunshine(day) {
    const fromDay = daylightHoursFromDay(day);
    if (fromDay != null) return fromDay;
    return daylightHoursFromDay(weatherData?.forecast?.[0]);
  }

  function formatSunshineHoursDisplay(sunshineHours) {
    if (sunshineHours == null || Number.isNaN(sunshineHours)) return '–';
    return `${sunshineHours.toString().replace('.', ',')} h`;
  }

  function fillPercentOf(value, max) {
    if (value == null || Number.isNaN(value) || max <= 0) return 0;
    return Math.min(100, Math.round((value / max) * 100));
  }

  const METRIC_FILL_MAX = {
    rain: 10,
    uv: 11,
    humidity: 100,
    snowfall: 10,
    snowDepth: 40,
  };

  function renderFillStatBlock(options) {
    const {
      kind,
      value,
      display,
      title = '',
      extraClass = '',
      label = '',
      ariaLabel = '',
      levelClass = '',
      fillPercent: fillOverride,
      day = null,
    } = options;

    let fill = fillOverride;
    if (fill == null) {
      if (kind === 'sunshine') {
        fill = sunshineFillPercent(value, daylightHoursForSunshine(day));
      } else {
        fill = fillPercentOf(value, METRIC_FILL_MAX[kind]);
      }
    }

    const isSunshine = kind === 'sunshine';
    const blockClass = isSunshine
      ? ['sunshine-stat', 'sunshine-stat--hours', extraClass].filter(Boolean).join(' ')
      : ['stat-fill', `stat-fill--${kind}`, levelClass, extraClass].filter(Boolean).join(' ');
    const barClass = isSunshine ? 'sunshine-hours-fill' : 'stat-fill-bar';
    const valueClass = isSunshine ? 'sunshine-value' : 'stat-fill-value';
    const labelClass = isSunshine ? 'sunshine-label' : 'stat-fill-label';
    const fillVar = isSunshine ? '--sunshine-fill' : '--stat-fill';
    const aria = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';

    return `
      <div class="${blockClass}"${aria}${titleAttr} style="${fillVar}: ${fill}%;">
        <div class="${barClass}" aria-hidden="true"></div>
        ${label ? `<span class="${labelClass}">${escapeHtml(label)}</span>` : ''}
        <strong class="${valueClass}">${display}</strong>
      </div>
    `;
  }

  function renderSunshineHoursBlock(sunshineHours, day, options = {}) {
    const { extraClass = '', label = '', ariaLabel = '' } = options;
    const daylightHours = daylightHoursForSunshine(day);
    const title = sunshineHoursTooltip(sunshineHours, daylightHours);
    return renderFillStatBlock({
      kind: 'sunshine',
      value: sunshineHours,
      display: formatSunshineHoursDisplay(sunshineHours),
      title,
      extraClass,
      label,
      ariaLabel,
      day,
    });
  }

  function renderHumidityBlock(humidity, options = {}) {
    const display = humidity != null && !Number.isNaN(humidity) ? `${humidity} %` : '–';
    return renderFillStatBlock({
      kind: 'humidity',
      value: humidity,
      display,
      title: `Luftfeuchte ${display}`,
      ...options,
    });
  }

  function renderRainBlock(mm, options = {}) {
    const max = METRIC_FILL_MAX.rain;
    const display = mm != null && !Number.isNaN(mm)
      ? `${mm.toString().replace('.', ',')} mm`
      : '–';
    const title = mm != null && !Number.isNaN(mm)
      ? `Niederschlag ${display} (Skala bis ${max} mm)`
      : `Niederschlag (Skala bis ${max} mm)`;
    return renderFillStatBlock({
      kind: 'rain',
      value: mm,
      display,
      title,
      ...options,
    });
  }

  function renderUvBlock(uvMax, uvLevel, options = {}) {
    const levelClass = uvLevel?.className ? `is-uv-${uvLevel.className}` : 'is-uv-none';
    const display = uvMax != null && !Number.isNaN(uvMax)
      ? uvMax.toString().replace('.', ',')
      : '–';
    const levelLabel = uvLevel?.label && uvLevel.label !== '–' ? ` (${uvLevel.label})` : '';
    return renderFillStatBlock({
      kind: 'uv',
      value: uvMax,
      display,
      title: `UV-Index ${display}${levelLabel}`,
      levelClass,
      ...options,
    });
  }

  function renderUvWidgetBlock(uvMax, uvLevel, options = {}) {
    const { stacked = false } = options;
    const levelClass = uvLevel?.className || 'none';
    const fill = fillPercentOf(uvMax, METRIC_FILL_MAX.uv);
    const display = uvMax != null && !Number.isNaN(uvMax)
      ? uvMax.toString().replace('.', ',')
      : '–';
    const levelLabel = uvLevel?.label && uvLevel.label !== '–' ? ` (${uvLevel.label})` : '';
    const aria = stacked ? ' aria-label="UV-Index"' : '';
    return `
      <div class="sunshine-stat sunshine-stat--hours sunshine-stat--uv is-uv-${levelClass}"${aria} style="--sunshine-fill: ${fill}%;" title="${escapeHtml(`UV-Index ${display}${levelLabel}`)}">
        <div class="sunshine-hours-fill" aria-hidden="true"></div>
        ${stacked ? '' : '<span class="sunshine-label">UV-Index</span>'}
        <strong class="sunshine-value">${display}</strong>
      </div>
    `;
  }

  function renderHistoryStatValue(label, val, unit, format, day) {
    if (label === 'Sonne') {
      return renderSunshineHoursBlock(val, day, { extraClass: 'stat-fill--embed' });
    }
    if (label === 'Regen') {
      return renderRainBlock(val, { extraClass: 'stat-fill--embed' });
    }
    return `<strong>${format(val, unit)}</strong>`;
  }

  function historyStatGraphicClass(label) {
    if (label === 'Sonne') return ' history-stat--sunshine';
    if (label === 'Regen') return ' history-stat--rain';
    return '';
  }

  function renderSunshine(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">UV-Daten werden geladen…</p>';
      return;
    }

    const s = weatherData.sunshine;
    const today = weatherData.forecast?.[0];
    const widget = el.closest('.dashboard-widget');
    const stacked = widget && Number(widget.dataset.cols) === 1;
    el.innerHTML = `
      <div class="sunshine-widget${stacked ? ' sunshine-widget--stacked' : ''}">
        ${renderUvWidgetBlock(s.uvMax, s.uvLevel, { stacked })}
        ${renderSunshineHoursBlock(s.sunshineHours, today, {
          label: stacked ? '' : 'Sonnenstunden',
          ariaLabel: stacked ? 'Sonnenstunden' : '',
        })}
      </div>
    `;
  }

  function formatSnowCm(value) {
    if (value == null || Number.isNaN(value)) return '–';
    return `${value.toString().replace('.', ',')} cm`;
  }

  function snowFillPercent(value, max) {
    return fillPercentOf(value, max);
  }

  function renderSnowStatBlock(options) {
    const {
      modifier,
      value,
      max,
      display,
      title,
      levelClass = 'none',
      label = '',
      ariaLabel = '',
    } = options;
    const fill = snowFillPercent(value, max);
    const aria = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
    return `
      <div class="snow-stat snow-stat--${modifier} is-snow-${levelClass}"${aria} style="--snow-fill: ${fill}%;" title="${escapeHtml(title)}">
        <div class="snow-fill" aria-hidden="true"></div>
        ${label ? `<span class="snow-label">${escapeHtml(label)}</span>` : ''}
        <strong class="snow-value">${display}</strong>
      </div>
    `;
  }

  function renderSnow(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Schneedaten werden geladen…</p>';
      return;
    }

    const s = weatherData.snow;
    if (!s) {
      el.innerHTML = '<p class="widget-empty">Keine Schneedaten verfügbar</p>';
      return;
    }

    const widget = el.closest('.dashboard-widget');
    const stacked = widget && Number(widget.dataset.cols) === 1;
    const wide = widget && Number(widget.dataset.cols) >= 2;
    const snowfallDisplay = formatSnowCm(s.snowfallToday ?? 0);
    const depthValue = s.snowDepth ?? 0;
    const depthDisplay = formatSnowCm(depthValue);
    const snowfallTitle = `Schneefall heute ${snowfallDisplay} (${s.snowfallLevel?.label || 'Kein Schnee'}, Skala bis ${METRIC_FILL_MAX.snowfall} cm)`;
    const depthTitle = s.snowDepth == null
      ? 'Schneedecke – keine Messdaten'
      : `Schneedecke ${depthDisplay} (${s.depthLevel?.label || 'Keine Decke'}, Skala bis ${METRIC_FILL_MAX.snowDepth} cm)`;

    const metaParts = [];
    metaParts.push(`7 Tage: ${formatSnowCm(s.snowfallWeek ?? 0)}`);
    if (s.tempMinToday != null) metaParts.push(`Min ${s.tempMinToday.toString().replace('.', ',')}°`);
    if (s.isSnowWeather && s.conditionLabel) {
      metaParts.push(s.conditionLabel);
    } else if (s.nextSnowDay) {
      metaParts.push(`Nächster Schnee ${s.nextSnowDay.weekday} ${formatSnowCm(s.nextSnowDay.snowfall)}`);
    } else if ((s.snowfallWeek ?? 0) <= 0 && (s.snowDepth ?? 0) <= 0) {
      metaParts.push('Kein Schnee in Sicht');
    }

    el.innerHTML = `
      <div class="snow-widget${stacked ? ' snow-widget--stacked' : ''}">
        ${renderSnowStatBlock({
          modifier: 'fall',
          value: s.snowfallToday ?? 0,
          max: METRIC_FILL_MAX.snowfall,
          display: snowfallDisplay,
          title: snowfallTitle,
          levelClass: s.snowfallLevel?.className || 'none',
          label: stacked ? '' : 'Schneefall heute',
          ariaLabel: stacked ? 'Schneefall heute' : '',
        })}
        ${renderSnowStatBlock({
          modifier: 'depth',
          value: depthValue,
          max: METRIC_FILL_MAX.snowDepth,
          display: depthDisplay,
          title: depthTitle,
          levelClass: s.depthLevel?.className || 'none',
          label: stacked ? '' : 'Schneedecke',
          ariaLabel: stacked ? 'Schneedecke' : '',
        })}
      </div>
      ${wide ? `<p class="snow-widget-meta">${escapeHtml(metaParts.join(' · '))}</p>` : ''}
    `;
  }

  function renderTwilightPhaseRow(phase, activePhaseId) {
    const active = phase.id === activePhaseId ? ' is-active' : '';
    const unavailable = phase.unavailable ? ' is-unavailable' : '';
    const title = phase.unavailable && phase.note
      ? ` title="${escapeHtml(phase.note)}"`
      : '';
    const timeHtml = phase.unavailable
      ? `<span class="twilight-phase-unavailable"><strong>${escapeHtml(phase.time)}</strong>${phase.note ? `<span class="twilight-phase-note">${escapeHtml(phase.note)}</span>` : ''}</span>`
      : `<strong class="twilight-phase-time">${escapeHtml(phase.time)}</strong>`;
    return `
      <li class="twilight-phase${active}${unavailable}"${title}>
        <span class="twilight-phase-label">${escapeHtml(phase.label)}</span>
        ${timeHtml}
      </li>
    `;
  }

  function renderTwilightGoldenBlock(windowData, modifier, label, icon) {
    if (!windowData?.start || !windowData?.end) {
      return `
        <div class="twilight-golden twilight-golden--${modifier} is-empty">
          <span class="twilight-golden-icon" aria-hidden="true">${icon}</span>
          <span class="twilight-golden-label">${escapeHtml(label)}</span>
          <strong class="twilight-golden-range">–</strong>
        </div>
      `;
    }
    const active = windowData.active ? ' is-active' : '';
    return `
      <div class="twilight-golden twilight-golden--${modifier}${active}" style="--twilight-fill: ${windowData.fillPercent ?? 0}%;" title="${escapeHtml(`${label}: ${windowData.start} – ${windowData.end}`)}">
        <div class="twilight-golden-fill" aria-hidden="true"></div>
        <span class="twilight-golden-icon" aria-hidden="true">${icon}</span>
        <span class="twilight-golden-label">${escapeHtml(label)}</span>
        <strong class="twilight-golden-range">${escapeHtml(`${windowData.start} – ${windowData.end}`)}</strong>
      </div>
    `;
  }

  function renderTwilightColumnHead(title, icon) {
    return `
      <li class="twilight-column-head" aria-hidden="true">
        <span class="twilight-column-head-icon">${icon}</span>
        <span class="twilight-column-head-label">${escapeHtml(title)}</span>
      </li>
    `;
  }

  function renderTwilight(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Dämmerungsdaten werden geladen…</p>';
      return;
    }

    const t = weatherData.twilight;
    if (!t) {
      el.innerHTML = '<p class="widget-empty">Keine Dämmerungsdaten verfügbar</p>';
      return;
    }

    const activeId = t.activePhaseId;
    const solarNoon = t.solarNoon
      ? `<p class="twilight-noon${activeId === 'solarNoon' ? ' is-active' : ''}${t.solarNoon.unavailable ? ' is-unavailable' : ''}"><span class="twilight-noon-icon" aria-hidden="true">☀️</span><span class="twilight-noon-label">Sonnenhöchststand</span><strong>${escapeHtml(t.solarNoon.time)}</strong></p>`
      : '';

    el.innerHTML = `
      <div class="twilight-widget">
        <p class="twilight-status" role="status">${escapeHtml(t.activeLabel || '–')}</p>
        ${t.whiteNightNote ? `<p class="twilight-white-night-note">${escapeHtml(t.whiteNightNote)}</p>` : ''}
        <div class="twilight-golden-row">
          ${renderTwilightGoldenBlock(t.goldenHour?.morning, 'morning', 'Goldene Stunde morgens', '🌅')}
          ${renderTwilightGoldenBlock(t.goldenHour?.evening, 'evening', 'Goldene Stunde abends', '🌇')}
        </div>
        ${solarNoon}
        <div class="twilight-grid">
          <ul class="twilight-column twilight-column--morning" aria-label="Morgendämmerung">
            ${renderTwilightColumnHead('Morgen', '🌄')}
            ${(t.morning || []).map((phase) => renderTwilightPhaseRow(phase, activeId)).join('')}
          </ul>
          <ul class="twilight-column twilight-column--evening" aria-label="Abenddämmerung">
            ${renderTwilightColumnHead('Abend', '🌆')}
            ${(t.evening || []).map((phase) => renderTwilightPhaseRow(phase, activeId)).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  function renderWeather(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Wetterdaten werden geladen…</p>';
      return;
    }

    const c = weatherData.current;
    const today = weatherData.forecast?.[0];
    const uvMax = today?.uvMax ?? weatherData.sunshine?.uvMax;
    const uvLevel = weatherData.sunshine?.uvLevel;
    const sunshineHours = today?.sunshineHours ?? weatherData.sunshine?.sunshineHours;
    const rainToday = today?.precipitation ?? c.precipitation;
    const todayRange = today
      ? `${today.tempMax}° / ${today.tempMin}°`
      : '–';
    const sceneClass = c.sceneClass || 'is-scene-cloudy';
    el.innerHTML = `
      <div class="weather-now">
        <div class="weather-hero ${sceneClass}">
          <div class="weather-hero-scene" aria-hidden="true"></div>
          <div class="weather-hero-content">
            <span class="weather-now-icon" aria-hidden="true">${c.icon}</span>
            <span class="weather-now-temp">${c.temperature}°</span>
            <span class="weather-now-label">${c.label}</span>
          </div>
        </div>
        <ul class="weather-meta">
          <li class="weather-meta-item weather-meta-item--extra" title="Min-Max Temperatur"><span class="weather-meta-label">${weatherMetaLabel('Min-Max', 'Temperatur')}</span><strong>${todayRange}</strong></li>
          <li class="weather-meta-item" title="Gefühlte Temperatur"><span class="weather-meta-label">${weatherMetaLabel('Gefühlte', 'Temperatur')}</span><strong>${c.feelsLike}°</strong></li>
          <li class="weather-meta-item weather-meta-item--extra" title="Windrichtung"><span class="weather-meta-label">${weatherMetaLabel('Windrichtung')}</span><strong>${formatWindDirection(c.windDirection)}</strong></li>
          <li class="weather-meta-item" title="Wind"><span class="weather-meta-label">${weatherMetaLabel('Wind')}</span><strong>${c.windSpeed} km/h</strong></li>
          <li class="weather-meta-item weather-meta-item--humidity"><span class="weather-meta-label">${weatherMetaLabel('Luftfeuchte')}</span>${renderHumidityBlock(c.humidity, { extraClass: 'stat-fill--embed' })}</li>
          <li class="weather-meta-item weather-meta-item--extra weather-meta-item--uv"><span class="weather-meta-label">${weatherMetaLabel('UV-Index')}</span>${renderUvBlock(uvMax, uvLevel, { extraClass: 'stat-fill--embed' })}</li>
          <li class="weather-meta-item weather-meta-item--extra weather-meta-item--sunshine"><span class="weather-meta-label">${weatherMetaLabel('Sonnenstunden')}</span>${renderSunshineHoursBlock(sunshineHours, today, { extraClass: 'stat-fill--embed' })}</li>
          <li class="weather-meta-item weather-meta-item--rain"><span class="weather-meta-label">${weatherMetaLabel('Regen')}</span>${renderRainBlock(rainToday, { extraClass: 'stat-fill--embed' })}</li>
        </ul>
      </div>
    `;
  }

  function renderAdvisorCard(card) {
    return `
      <article class="advisor-card advisor-card--${card.className}" title="${escapeHtml(card.title)}: ${escapeHtml(card.headline)}">
        <div class="advisor-card-head">
          <span class="advisor-card-icon" aria-hidden="true">${card.icon}</span>
          <span class="advisor-card-title">${escapeHtml(card.title)}</span>
          <span class="advisor-card-badge advisor-card-badge--${card.className}">${escapeHtml(card.label)}</span>
        </div>
        <div class="advisor-card-body">
          <strong class="advisor-card-headline">${escapeHtml(card.headline)}</strong>
          <span class="advisor-card-detail">${escapeHtml(card.detail)}</span>
        </div>
      </article>
    `;
  }

  function renderAdvisor(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Empfehlungen werden geladen…</p>';
      return;
    }

    const advisor = weatherData.advisor;
    if (!advisor?.cards?.length) {
      el.innerHTML = '<p class="widget-empty">Keine Empfehlungen verfügbar</p>';
      return;
    }

    el.innerHTML = `
      <div class="advisor-widget">
        <p class="advisor-summary">${escapeHtml(advisor.summary || '')}</p>
        <div class="advisor-grid">
          ${advisor.cards.map((card) => renderAdvisorCard(card)).join('')}
        </div>
      </div>
    `;
  }

  function renderPollen(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Pollendaten werden geladen…</p>';
      return;
    }

    const { pollen } = weatherData;
    if (!pollen.available) {
      el.innerHTML = `<p class="widget-empty">${pollen.note}</p>`;
      return;
    }

    el.innerHTML = `
      <div class="pollen-list">
        ${pollen.items.map((item) => `
          <div class="pollen-row ${item.level.className}" title="${item.label}: ${item.value != null ? item.value : '–'} (${item.level.label})">
            <div class="pollen-row-main">
              <span class="pollen-name">${item.label}</span><span class="pollen-value">${item.value != null ? item.value : '–'}</span>
            </div>
            <span class="pollen-badge ${item.level.className}">${item.level.label}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderWarnings(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Warnungen werden geladen…</p>';
      return;
    }

    const w = weatherData.warnings;

    if (!w?.active) {
      el.innerHTML = '<p class="widget-empty">Keine Wetterwarnungen</p>';
      return;
    }

    const tall = parseInt(el.closest('.dashboard-widget')?.dataset.rows || '1', 10) >= 2;
    const pool = tall
      ? w.items
      : w.items.filter((item) => (item.dayIndex ?? 0) <= 0);
    const visible = tall ? pool : pool.slice(0, 2);
    const hiddenCount = pool.length - visible.length;

    el.innerHTML = `
      <ul class="warnings-list">
        ${visible.map((item) => `
          <li class="warnings-row is-severity-${item.severity}" title="${escapeHtml(item.title)}: ${escapeHtml(item.detail)} (${escapeHtml(item.scope)})">
            <div class="warnings-row-main">
              <span class="warnings-icon" aria-hidden="true">${item.icon}</span>
              <span class="warnings-name">${escapeHtml(item.title)}</span>
              <span class="warnings-detail">${escapeHtml(item.detail)}</span>
            </div>
            <span class="warnings-badge is-severity-${item.severity}">${escapeHtml(item.scope)}</span>
          </li>
        `).join('')}
      </ul>
      ${!tall && hiddenCount > 0 ? `<p class="warnings-more">+${hiddenCount} weitere</p>` : ''}
    `;
  }

  function formatHistoryNum(value, unit = '') {
    if (value == null || Number.isNaN(value)) return '–';
    return `${value.toString().replace('.', ',')}${unit}`;
  }

  function calcMetricDelta(todayVal, pastVal) {
    if (todayVal == null || pastVal == null || Number.isNaN(todayVal) || Number.isNaN(pastVal)) return null;
    return Math.round((todayVal - pastVal) * 10) / 10;
  }

  function renderHistoryDeltaChip(delta, unit = '') {
    if (delta == null) {
      return '<span class="history-delta-chip is-neutral" aria-hidden="true">–</span>';
    }
    if (delta === 0) {
      return '<span class="history-delta-chip is-neutral">±0</span>';
    }
    const cls = delta > 0 ? 'is-more' : 'is-less';
    const sign = delta > 0 ? '+' : '';
    const text = `${sign}${delta.toString().replace('.', ',')}${unit}`;
    return `<span class="history-delta-chip ${cls}" title="Heute vs. damals">${text}</span>`;
  }

  function renderHistoryPanelHeroInline(day) {
    if (!day) return '';
    return `
      <div class="history-panel-hero-inline">
        <span class="history-panel-icon" aria-hidden="true">${day.icon}</span>
        <span class="history-panel-weather">${escapeHtml(day.label)}</span>
      </div>
    `;
  }

  function historyPanelSceneClass(day) {
    return day?.sceneClass || 'is-scene-cloudy';
  }

  function renderHistoryPanelHead(day, badge, extraClass = '') {
    const sceneClass = historyPanelSceneClass(day);
    if (!day) {
      return `
        <div class="history-panel-head ${extraClass} ${sceneClass}">
          <div class="history-panel-scene" aria-hidden="true"></div>
          <div class="history-panel-head-content">
            <span class="history-panel-badge">${escapeHtml(badge)}</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="history-panel-head ${extraClass} ${sceneClass}">
        <div class="history-panel-scene" aria-hidden="true"></div>
        <div class="history-panel-head-content">
          <span class="history-panel-badge">${escapeHtml(badge)}</span>
          <span class="history-panel-date">${escapeHtml(day.dateLabel || day.date)} · ${escapeHtml(day.weekday || '')}</span>
          ${renderHistoryPanelHeroInline(day)}
        </div>
      </div>
    `;
  }

  function normalizeHistoryYear(value) {
    const year = parseInt(value, 10);
    return Number.isNaN(year) ? null : year;
  }

  function resetHistoryCache() {
    historyDayCache = new Map();
    historyPresetYears = new Set();
  }

  function touchHistoryCacheYear(year) {
    const key = normalizeHistoryYear(year);
    if (key == null) return null;
    const day = historyDayCache.get(key);
    if (day === undefined) return null;
    historyDayCache.delete(key);
    historyDayCache.set(key, day);
    return day;
  }

  function pruneHistoryCache() {
    while (historyDayCache.size > HISTORY_CACHE_MAX) {
      let removed = false;
      for (const y of historyDayCache.keys()) {
        if (!historyPresetYears.has(y)) {
          historyDayCache.delete(y);
          removed = true;
          break;
        }
      }
      if (!removed) {
        const oldest = historyDayCache.keys().next().value;
        if (oldest === undefined) break;
        historyDayCache.delete(oldest);
      }
    }
  }

  function setHistoryDayCache(year, day) {
    const key = normalizeHistoryYear(year);
    if (key == null) return;
    if (day == null) {
      historyDayCache.delete(key);
      return;
    }
    historyDayCache.delete(key);
    historyDayCache.set(key, day);
    pruneHistoryCache();
  }

  function seedHistoryPresetCache(presets) {
    historyPresetYears = new Set();
    for (const preset of presets || []) {
      const key = normalizeHistoryYear(preset.year);
      if (!preset.available || !preset.day || key == null) continue;
      historyPresetYears.add(key);
      historyDayCache.delete(key);
      historyDayCache.set(key, preset.day);
    }
    pruneHistoryCache();
  }

  function isHistoryPastLoading() {
    return historyLoading && historyLoadingYear === historySelectedYear;
  }

  function renderHistoryYearPanelHead(day, h, loading = false) {
    const selectedYear = normalizeHistoryYear(historySelectedYear) ?? h.defaultYear;
    const sceneClass = historyPanelSceneClass(day);
    let datePart = '';
    if (loading) {
      datePart = '<span class="history-panel-date is-loading">Lädt…</span>';
    } else if (day) {
      datePart = `<span class="history-panel-date">${escapeHtml(day.dateLabel || day.date)} · ${escapeHtml(day.weekday || '')}</span>`;
    }
    return `
      <div class="history-panel-head is-past ${loading ? 'is-loading' : ''} ${sceneClass}">
        <div class="history-panel-scene" aria-hidden="true"></div>
        <div class="history-panel-head-content">
          <div class="history-year-nav" role="group" aria-label="Vergleichsjahr">
            <button type="button" class="history-year-btn" data-dir="-1" aria-label="Früheres Jahr" ${selectedYear <= h.minYear ? 'disabled' : ''}>‹</button>
            <input type="number" class="history-year-input" value="${selectedYear}" min="${h.minYear}" max="${h.maxYear}" inputmode="numeric" aria-label="Jahr eingeben">
            <button type="button" class="history-year-btn" data-dir="1" aria-label="Späteres Jahr" ${selectedYear >= h.maxYear ? 'disabled' : ''}>›</button>
          </div>
          ${datePart}
          ${!loading ? renderHistoryPanelHeroInline(day) : ''}
        </div>
      </div>
    `;
  }

  function renderHistoryPanelHero(day, loading = false) {
    if (loading || !day) {
      return '<div class="history-panel-hero is-empty"></div>';
    }
    return `
      <div class="history-panel-hero">
        <span class="history-panel-icon" aria-hidden="true">${day.icon}</span>
        <span class="history-panel-weather">${escapeHtml(day.label)}</span>
      </div>
    `;
  }

  function renderHistoryStatRowPending(label, todayVal, unit, format = formatHistoryNum, todayDay = null) {
    const graphicClass = historyStatGraphicClass(label);
    const todayValue = graphicClass
      ? renderHistoryStatValue(label, todayVal, unit, format, todayDay)
      : `<strong>${format(todayVal, unit)}</strong>`;
    return `
      <div class="history-stat-row">
        <div class="history-stat is-today${graphicClass}">
          <span class="history-stat-label">${escapeHtml(label)}</span>
          ${todayValue}
        </div>
        <span class="history-delta-chip is-neutral">…</span>
        <div class="history-stat is-past is-pending">
          <span class="history-stat-label">${escapeHtml(label)}</span>
          <strong>…</strong>
        </div>
      </div>
    `;
  }

  function renderHistoryStatRows(today, past) {
    const avgToday = (today.tempMax + today.tempMin) / 2;
    const avgPast = (past.tempMax + past.tempMin) / 2;
    return `
      <div class="history-stat-rows">
        ${renderHistoryStatRow('Max', today.tempMax, past.tempMax, '°')}
        ${renderHistoryStatRow('Min', today.tempMin, past.tempMin, '°')}
        ${renderHistoryStatRow('Ø Tag', avgToday, avgPast, '°', (v, u) => formatHistoryNum(Math.round(v * 10) / 10, u))}
        ${renderHistoryStatRow('Regen', today.precipitation, past.precipitation, ' mm')}
        ${renderHistoryStatRow('Sonne', today.sunshineHours, past.sunshineHours, ' h', formatHistoryNum, today, past)}
      </div>
    `;
  }

  function renderHistoryStatRowsLoading(today) {
    const avgToday = (today.tempMax + today.tempMin) / 2;
    return `
      <div class="history-stat-rows is-loading">
        ${renderHistoryStatRowPending('Max', today.tempMax, '°')}
        ${renderHistoryStatRowPending('Min', today.tempMin, '°')}
        ${renderHistoryStatRowPending('Ø Tag', avgToday, '°', (v, u) => formatHistoryNum(Math.round(v * 10) / 10, u))}
        ${renderHistoryStatRowPending('Regen', today.precipitation, ' mm')}
        ${renderHistoryStatRowPending('Sonne', today.sunshineHours, ' h', formatHistoryNum, today)}
      </div>
    `;
  }

  function renderHistoryStatRow(label, todayVal, pastVal, unit, format = formatHistoryNum, todayDay = null, pastDay = null) {
    const delta = calcMetricDelta(todayVal, pastVal);
    const graphicClass = historyStatGraphicClass(label);
    const todayValue = graphicClass
      ? renderHistoryStatValue(label, todayVal, unit, format, todayDay)
      : `<strong>${format(todayVal, unit)}</strong>`;
    const pastValue = graphicClass
      ? renderHistoryStatValue(label, pastVal, unit, format, pastDay)
      : `<strong>${format(pastVal, unit)}</strong>`;
    return `
      <div class="history-stat-row">
        <div class="history-stat is-today${graphicClass}">
          <span class="history-stat-label">${escapeHtml(label)}</span>
          ${todayValue}
        </div>
        ${renderHistoryDeltaChip(delta, unit)}
        <div class="history-stat is-past${graphicClass}">
          <span class="history-stat-label">${escapeHtml(label)}</span>
          ${pastValue}
        </div>
      </div>
    `;
  }

  function renderHistoryCompare(today, past, h) {
    if (!today) {
      return '<p class="widget-empty">Keine Vergleichsdaten</p>';
    }

    const pastLoading = isHistoryPastLoading();
    const statRows = pastLoading
      ? renderHistoryStatRowsLoading(today)
      : past
        ? renderHistoryStatRows(today, past)
        : '<div class="history-compare-body history-compare--empty"><p class="widget-empty">Keine Daten für dieses Jahr</p></div>';

    return `
      <div class="history-compare ${pastLoading ? 'is-loading' : ''}">
        <div class="history-compare-top">
          ${renderHistoryPanelHead(today, 'Heute', 'is-today')}
          <div class="history-compare-bridge" aria-hidden="true">
            <span class="history-vs-mark">vs</span>
          </div>
          ${renderHistoryYearPanelHead(past, h, pastLoading)}
        </div>
        ${statRows}
      </div>
    `;
  }

  function ensureHistoryYear(h) {
    const year = normalizeHistoryYear(historySelectedYear);
    if (year == null || year < h.minYear || year > h.maxYear) {
      historySelectedYear = normalizeHistoryYear(h.defaultYear);
    } else {
      historySelectedYear = year;
    }
  }

  function getHistoryDayForYear(year) {
    return touchHistoryCacheYear(year);
  }

  function activeHistoryPresetOffset() {
    const h = weatherData?.history;
    const selected = normalizeHistoryYear(historySelectedYear);
    if (!h || selected == null) return null;
    const refYear = parseInt(h.referenceDate.slice(0, 4), 10);
    const offset = refYear - selected;
    const preset = h.presets.find((p) => p.offsetYears === offset);
    if (!preset || preset.available === false) return null;
    return preset.offsetYears;
  }

  function historyWidgetBody() {
    return document.getElementById('widget-body-history');
  }

  function bindHistoryControlsOnce() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid || grid.dataset.historyControlsBound === '1') return;
    grid.dataset.historyControlsBound = '1';

    grid.addEventListener('click', (e) => {
      const presetBtn = e.target.closest('.history-preset-btn');
      if (presetBtn) {
        if (presetBtn.disabled || !historyWidgetBody()) return;
        e.stopPropagation();
        const offset = parseInt(presetBtn.dataset.offset, 10);
        const preset = weatherData?.history?.presets?.find((p) => p.offsetYears === offset);
        if (preset?.available !== false) selectHistoryYear(preset.year);
        return;
      }

      const yearBtn = e.target.closest('.history-year-btn');
      if (!yearBtn || yearBtn.disabled) return;
      const body = historyWidgetBody();
      if (!body || !body.contains(yearBtn)) return;

      e.stopPropagation();
      const input = body.querySelector('.history-year-input');
      const current = normalizeHistoryYear(input?.value ?? historySelectedYear);
      const dir = Number(yearBtn.dataset.dir);
      if (current == null || !Number.isFinite(dir)) return;
      selectHistoryYear(current + dir);
    });

    grid.addEventListener('change', (e) => {
      const yearInput = e.target.closest('#widget-body-history .history-year-input');
      if (!yearInput) return;

      const year = normalizeHistoryYear(yearInput.value);
      const h = weatherData?.history;
      if (!h || year == null || year < h.minYear || year > h.maxYear) {
        yearInput.value = normalizeHistoryYear(historySelectedYear) ?? h?.defaultYear ?? '';
        return;
      }
      selectHistoryYear(year);
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const yearInput = e.target.closest('#widget-body-history .history-year-input');
      if (!yearInput) return;
      e.preventDefault();
      yearInput.blur();
    });
  }

  async function selectHistoryYear(rawYear, bodyEl) {
    const body = bodyEl || historyWidgetBody();
    const h = weatherData?.history;
    const year = normalizeHistoryYear(rawYear);
    if (!h || !body || year == null || year < h.minYear || year > h.maxYear) return;

    const selected = normalizeHistoryYear(historySelectedYear);
    if (year === selected && (historyLoading || getHistoryDayForYear(year))) return;

    historySelectedYear = year;

    if (getHistoryDayForYear(year)) {
      historyFetchAbort?.abort();
      historyLoading = false;
      historyLoadingYear = null;
      renderHistory(body);
      return;
    }

    historyFetchAbort?.abort();
    historyFetchAbort = new AbortController();
    const { signal } = historyFetchAbort;
    const seq = ++historyFetchSeq;
    historyLoading = true;
    historyLoadingYear = year;
    renderHistory(body);

    const saved = AppStorage.load?.() || {};
    const lat = saved.lat;
    const lon = saved.lon;

    try {
      const ref = encodeURIComponent(h.referenceDate);
      const res = await fetch(
        `/api/weather/history?lat=${lat}&lon=${lon}&year=${year}&referenceDate=${ref}`,
        { cache: 'no-store', signal }
      );
      if (!res.ok) throw new Error('Archiv nicht verfügbar');
      const payload = await res.json();
      if (payload.day) setHistoryDayCache(year, payload.day);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setHistoryDayCache(year, null);
    } finally {
      if (seq !== historyFetchSeq) return;
      historyLoading = false;
      historyLoadingYear = null;
      renderHistory(body);
    }
  }

  function renderHistory(el) {
    if (!weatherData) {
      el.innerHTML = '<p class="widget-loading">Vergleichsdaten werden geladen…</p>';
      return;
    }

    const h = weatherData.history;
    if (!h || h.available === false) {
      el.innerHTML = `<p class="widget-empty">${escapeHtml(h?.note || 'Vergleichsdaten nicht verfügbar')}</p>`;
      return;
    }

    ensureHistoryYear(h);
    const pastDay = isHistoryPastLoading() ? null : getHistoryDayForYear(historySelectedYear);
    const activePreset = activeHistoryPresetOffset();

    el.innerHTML = `
      <div class="history-widget ${historyLoading ? 'is-loading' : ''}">
        ${renderHistoryCompare(h.today, pastDay, h)}
        <div class="history-controls">
          <div class="history-presets" role="group" aria-label="Schnellauswahl">
            ${h.presets.map((p) => `
              <button type="button" class="history-preset-btn ${activePreset === p.offsetYears ? 'is-active' : ''}" data-offset="${p.offsetYears}" ${p.available === false ? 'disabled' : ''}>${p.offsetYears} ${p.offsetYears === 1 ? 'Jahr' : 'Jahre'}</button>
            `).join('')}
          </div>
        </div>
        <p class="history-note">${escapeHtml(h.referenceLabel)} · ${escapeHtml(h.source)} · ab ${h.minYear}</p>
      </div>
    `;
  }

  function destroyWebcamPlayer() {
    if (webcamHls) {
      webcamHls.destroy();
      webcamHls = null;
    }
  }

  function closeWebcamStream(el, { clearStorage = false } = {}) {
    const input = el.querySelector('.webcam-url-input');
    destroyWebcamPlayer();
    webcamLoadSeq += 1;
    webcamActiveSource = '';

    const video = el.querySelector('.webcam-video');
    if (video) {
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.load();
    }

    setWebcamWidgetState(el, { loading: false, playing: false, error: false });

    if (clearStorage) {
      AppStorage.save({ webcamSource: '' });
      if (input) input.value = '';
    } else if (input && !input.value.trim()) {
      input.value = getWebcamSourceUrl();
    }

    const titleEl = el.querySelector('.webcam-title');
    if (titleEl) titleEl.textContent = 'Kein Stream';
    setWebcamStatus(
      el,
      clearStorage
        ? 'wetter.com-Link oder direkte Stream-URL eingeben'
        : 'Stream geschlossen – URL anpassen und übernehmen',
      false,
    );
  }

  function updateWebcamLayoutChrome() {
    const body = document.getElementById('widget-body-webcam');
    const root = body ? getWebcamRoot(body) : null;
    if (!root) return;
    root.classList.toggle('webcam-widget--layout-locked', layoutLocked);
  }

  function webcamStageActionsHtml() {
    return `
      <div class="webcam-stage-actions">
        <button type="button" class="webcam-delete-btn" title="Stream löschen" aria-label="Stream löschen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/>
          </svg>
        </button>
      </div>
    `;
  }

  function configureWebcamVideo(video) {
    video.muted = true;
    video.defaultMuted = true;
    video.controls = false;
    video.removeAttribute('controls');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.disablePictureInPicture = true;
    if (video.controlsList) {
      video.controlsList.add('nodownload', 'nofullscreen', 'noremoteplayback');
    }
    if (video.dataset.muteBound !== '1') {
      video.dataset.muteBound = '1';
      video.addEventListener('volumechange', () => {
        video.muted = true;
      });
    }
  }

  function getWebcamSourceUrl() {
    return String(AppStorage.load?.()?.webcamSource || '').trim();
  }

  function getWebcamRoot(el) {
    return el.querySelector('.webcam-widget') || el;
  }

  function setWebcamWidgetState(el, { loading = false, playing = false, error = false } = {}) {
    const root = getWebcamRoot(el);
    root.classList.toggle('is-loading', loading);
    root.classList.toggle('is-playing', playing);
    root.classList.toggle('is-error', error);
  }

  function setWebcamStatus(el, message, isError = false) {
    const status = el.querySelector('.webcam-status');
    if (status) status.textContent = message || '';
    setWebcamWidgetState(el, {
      loading: !isError && message === 'Stream wird geladen…',
      playing: false,
      error: isError,
    });
  }

  function validateWebcamSourceUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('wetter.com') && parsed.pathname.includes('/hd-live-webcams/')) {
        const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
        if (lastSegment.length < 12 || !/^[a-z0-9]+$/i.test(lastSegment)) {
          return 'Die wetter.com-URL scheint unvollständig. Bitte die komplette Adresse aus dem Browser kopieren.';
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  async function mountWebcamStream(el, sourceUrl) {
    const video = el.querySelector('.webcam-video');
    const titleEl = el.querySelector('.webcam-title');
    if (!video) return;

    configureWebcamVideo(video);
    destroyWebcamPlayer();
    video.removeAttribute('src');
    video.load();

    if (!sourceUrl) {
      webcamActiveSource = '';
      if (titleEl) titleEl.textContent = 'Kein Stream';
      setWebcamStatus(el, 'wetter.com-Link oder direkte Stream-URL eingeben', false);
      return;
    }

    const urlError = validateWebcamSourceUrl(sourceUrl);
    if (urlError) {
      webcamActiveSource = '';
      if (titleEl) titleEl.textContent = 'Live Webcam';
      setWebcamStatus(el, urlError, true);
      return;
    }

    const seq = ++webcamLoadSeq;
    webcamActiveSource = sourceUrl;
    setWebcamStatus(el, 'Stream wird geladen…', false);

    let statusLabel = 'Live';

    const markPlaying = () => {
      if (seq !== webcamLoadSeq) return;
      setWebcamWidgetState(el, { loading: false, playing: true, error: false });
      const status = el.querySelector('.webcam-status');
      if (status) status.textContent = statusLabel;
    };

    const markBuffered = () => {
      if (seq !== webcamLoadSeq) return;
      if (video.readyState < 2 && video.buffered.length === 0) return;
      setWebcamWidgetState(el, { loading: false, playing: !video.paused, error: false });
    };

    const onVideoError = () => {
      if (seq !== webcamLoadSeq) return;
      setWebcamWidgetState(el, { loading: false, playing: false, error: true });
      setWebcamStatus(el, 'Wiedergabe fehlgeschlagen – bitte neu laden', true);
    };

    video.addEventListener('playing', markPlaying);
    video.addEventListener('canplay', markBuffered);
    video.addEventListener('loadeddata', markBuffered);
    video.addEventListener('error', onVideoError, { once: true });

    try {
      const res = await fetch(`/api/webcam/resolve?url=${encodeURIComponent(sourceUrl)}`, { cache: 'no-store' });
      const data = await res.json();
      if (seq !== webcamLoadSeq) return;
      if (!res.ok) throw new Error(data.error || 'Stream nicht verfügbar');

      if (titleEl) titleEl.textContent = data.title || 'Live Webcam';
      if (data.poster) video.poster = data.poster;

      const playbackUrl = data.playbackUrl || data.streamUrl;
      statusLabel = data.provider === 'wetter.com' ? 'wetter.com Live' : 'Live';

      const tryStartPlayback = () => {
        if (seq !== webcamLoadSeq) return;
        if (video.readyState < 2 && video.buffered.length === 0) return;
        markBuffered();
        if (!video.paused) return;
        video.play().then(() => {
          markPlaying();
        }).catch(() => {
          markBuffered();
        });
      };

      if (data.type === 'hls' && window.Hls?.isSupported()) {
        webcamHls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: true,
          liveDurationInfinity: true,
          startLevel: 0,
          backBufferLength: 30,
        });
        webcamHls.loadSource(playbackUrl);
        webcamHls.attachMedia(video);
        webcamHls.on(window.Hls.Events.MANIFEST_PARSED, tryStartPlayback);
        webcamHls.on(window.Hls.Events.FRAG_BUFFERED, tryStartPlayback);
        webcamHls.on(window.Hls.Events.ERROR, (_event, payload) => {
          if (seq !== webcamLoadSeq || !payload.fatal) return;
          if (payload.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            webcamHls.startLoad();
            return;
          }
          setWebcamWidgetState(el, { loading: false, playing: false, error: true });
          setWebcamStatus(el, 'Stream unterbrochen – bitte neu laden', true);
        });
      } else if (data.type === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackUrl;
        tryStartPlayback();
      } else {
        video.src = playbackUrl;
        tryStartPlayback();
      }
    } catch (err) {
      if (seq !== webcamLoadSeq) return;
      if (titleEl) titleEl.textContent = 'Live Webcam';
      setWebcamStatus(el, err.message || 'Stream nicht verfügbar', true);
    }
  }

  function bindWebcamControlsOnce() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid || grid.dataset.webcamControlsBound === '1') return;
    grid.dataset.webcamControlsBound = '1';

    grid.addEventListener('submit', (e) => {
      const form = e.target.closest('#widget-body-webcam .webcam-form');
      if (!form) return;
      e.preventDefault();

      const body = document.getElementById('widget-body-webcam');
      const input = form.querySelector('.webcam-url-input');
      const url = String(input?.value || '').trim();
      const root = body ? getWebcamRoot(body) : null;
      const playing = root?.classList.contains('is-playing');

      if (playing && url && url === webcamActiveSource && url === getWebcamSourceUrl()) {
        return;
      }

      AppStorage.save({ webcamSource: url });
      mountWebcamStream(body, url);
    });

    grid.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('#widget-body-webcam .webcam-delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        closeWebcamStream(document.getElementById('widget-body-webcam'), { clearStorage: true });
        return;
      }

      const reloadBtn = e.target.closest('#widget-body-webcam .webcam-reload-btn');
      if (!reloadBtn) return;
      e.preventDefault();
      const body = document.getElementById('widget-body-webcam');
      mountWebcamStream(body, getWebcamSourceUrl());
    });
  }

  function renderWebcam(el) {
    const sourceUrl = getWebcamSourceUrl();
    const existing = el.querySelector('.webcam-widget');

    if (existing) {
      const input = existing.querySelector('.webcam-url-input');
      if (input && document.activeElement !== input && input.value !== sourceUrl) {
        input.value = sourceUrl;
      }

      const streamActive = sourceUrl
        && sourceUrl === webcamActiveSource
        && (webcamHls
          || existing.classList.contains('is-playing')
          || existing.classList.contains('is-loading'));

      const streamIdle = !sourceUrl && !webcamActiveSource && !webcamHls;

      if (streamActive || streamIdle) {
        updateWebcamLayoutChrome();
        return;
      }
    }

    el.innerHTML = `
      <div class="webcam-widget">
        <div class="webcam-stage">
          <video class="webcam-video" playsinline muted autoplay crossorigin="anonymous" aria-label="Live Webcam"></video>
          <div class="webcam-overlay">
            <span class="webcam-title">${sourceUrl ? 'Live Webcam' : 'Kein Stream'}</span>
            <span class="webcam-status"></span>
          </div>
          ${webcamStageActionsHtml()}
        </div>
        <form class="webcam-form" autocomplete="off">
          <input
            type="text"
            class="webcam-url-input"
            value="${escapeHtml(sourceUrl)}"
            placeholder="wetter.com-Webcam oder .m3u8 / .mp4 URL"
            spellcheck="false"
            inputmode="url"
            aria-label="Webcam-URL"
          >
          <button type="submit" class="webcam-save-btn">Übernehmen</button>
          <button type="button" class="webcam-reload-btn" title="Stream neu laden" aria-label="Stream neu laden">↻</button>
        </form>
        <p class="webcam-setup-hint">
          <a href="https://www.wetter.com/hd-live-webcams/" target="_blank" rel="noopener noreferrer">Webcam auf wetter.com finden</a>
        </p>
      </div>
    `;

    updateWebcamLayoutChrome();
    if (sourceUrl) {
      mountWebcamStream(el, sourceUrl);
    } else {
      setWebcamStatus(el, 'wetter.com-Link oder direkte Stream-URL eingeben', false);
    }
  }

  function formatCalendarNum(value, unit = '') {
    if (value == null || Number.isNaN(value)) return '–';
    return `${value.toString().replace('.', ',')}${unit}`;
  }

  function calendarMonthCacheKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function resetCalendarState() {
    calendarViewYear = null;
    calendarViewMonth = null;
    calendarMonthData = null;
    calendarMonthLoading = false;
    calendarFetchSeq += 1;
    calendarMonthCache.clear();
  }

  function syncCalendarFromWeather() {
    const calendar = weatherData?.calendar;
    if (!calendar?.year || !calendar?.month) return;

    if (calendarViewYear == null || calendarViewMonth == null) {
      calendarViewYear = calendar.year;
      calendarViewMonth = calendar.month;
    }

    calendarMonthCache.set(calendarMonthCacheKey(calendar.year, calendar.month), calendar);
    if (calendarViewYear === calendar.year && calendarViewMonth === calendar.month) {
      calendarMonthData = calendar;
    }
  }

  function calendarHintText(calendar) {
    if (calendarMonthLoading) return 'Monat wird geladen…';
    if (!calendar) return '';
    const parts = [];
    if (calendar.forecastDaysInMonth > 0) {
      parts.push(`${calendar.forecastDaysInMonth} Prognose`);
    }
    if (calendar.archiveDaysInMonth > 0) {
      parts.push(`${calendar.archiveDaysInMonth} Archiv`);
    }
    if (!parts.length) return 'Keine Daten in diesem Monat';
    return parts.join(' · ');
  }

  async function loadCalendarMonth(year, month, { force = false } = {}) {
    const key = calendarMonthCacheKey(year, month);
    calendarViewYear = year;
    calendarViewMonth = month;

    if (!force && calendarMonthCache.has(key)) {
      calendarMonthData = calendarMonthCache.get(key);
      const body = document.querySelector('#widget-body-calendar');
      if (body) renderCalendar(body);
      return;
    }

    const saved = AppStorage.load?.() || {};
    const lat = saved.lat;
    const lon = saved.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    calendarMonthLoading = true;
    const body = document.querySelector('#widget-body-calendar');
    if (body) renderCalendar(body);

    const seq = ++calendarFetchSeq;
    try {
      const res = await fetch(
        `/api/weather/calendar?lat=${lat}&lon=${lon}&year=${year}&month=${month}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Kalenderdaten nicht verfügbar');
      const data = await res.json();
      if (seq !== calendarFetchSeq) return;
      calendarMonthCache.set(key, data);
      calendarMonthData = data;
    } catch (err) {
      if (seq !== calendarFetchSeq) return;
      calendarMonthData = {
        year,
        month,
        monthLabel: new Date(`${key}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        weeks: [],
        error: err.message,
      };
    } finally {
      if (seq === calendarFetchSeq) {
        calendarMonthLoading = false;
        const target = document.querySelector('#widget-body-calendar');
        if (target) renderCalendar(target);
      }
    }
  }

  function shiftCalendarMonth(delta) {
    if (calendarViewYear == null || calendarViewMonth == null) return;
    let year = calendarViewYear;
    let month = calendarViewMonth + delta;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    loadCalendarMonth(year, month);
  }

  function bindCalendarControlsOnce() {
    const widget = document.querySelector('.dashboard-widget[data-id="calendar"]');
    if (!widget || widget.dataset.calendarBound === '1') return;
    widget.dataset.calendarBound = '1';

    widget.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-calendar-action]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.calendarAction === 'prev') shiftCalendarMonth(-1);
      if (btn.dataset.calendarAction === 'next') shiftCalendarMonth(1);
    });
  }

  function renderCalendarDayCell(cell) {
    if (cell.empty) {
      return '<div class="calendar-day calendar-day--empty" aria-hidden="true"></div>';
    }

    const hasData = cell.hasData ?? cell.hasForecast;
    const classes = [
      'calendar-day',
      cell.isToday ? 'is-today' : '',
      hasData ? 'has-forecast' : 'is-nodata',
      cell.source === 'archive' ? 'is-archive' : '',
      cell.sceneClass || '',
    ].filter(Boolean).join(' ');

    if (!hasData) {
      return `
        <div class="${classes}">
          <span class="calendar-day-num">${cell.dayOfMonth}</span>
        </div>
      `;
    }

    const sourceLabel = cell.source === 'archive' ? 'Archiv' : 'Prognose';
    const title = [
      `${sourceLabel}: ${cell.label || '–'}`,
      `${formatCalendarNum(cell.tempMax)}° / ${formatCalendarNum(cell.tempMin)}°`,
      `Regen ${formatCalendarNum(cell.precipitation)} mm`,
      `Sonne ${formatCalendarNum(cell.sunshineHours)} h`,
      `UV ${formatCalendarNum(cell.uvMax)}`,
      `Luftfeuchte ${formatCalendarNum(cell.humidityMean)} %`,
    ].filter(Boolean).join(' · ');

    return `
      <div class="${classes}" title="${escapeHtml(title)}">
        <div class="calendar-day-scene" aria-hidden="true"></div>
        <div class="calendar-day-content">
          <div class="calendar-day-head">
            <span class="calendar-day-num">${cell.dayOfMonth}</span>
            <span class="calendar-day-icon" aria-hidden="true">${cell.icon || '☁️'}</span>
          </div>
          <span class="calendar-day-temp">${formatCalendarNum(cell.tempMax)}° <span class="calendar-day-temp-min">/ ${formatCalendarNum(cell.tempMin)}°</span></span>
          <ul class="calendar-day-stats">
            <li class="calendar-stat calendar-stat--rain" title="Regen"><span aria-hidden="true">☔</span>${formatCalendarNum(cell.precipitation)}</li>
            <li class="calendar-stat calendar-stat--sun" title="Sonnenstunden"><span aria-hidden="true">☀</span>${formatCalendarNum(cell.sunshineHours)}h</li>
            <li class="calendar-stat calendar-stat--uv" title="UV-Index"><span aria-hidden="true">UV</span>${formatCalendarNum(cell.uvMax)}</li>
            <li class="calendar-stat calendar-stat--humidity" title="Luftfeuchte"><span aria-hidden="true">💧</span>${formatCalendarNum(cell.humidityMean)}%</li>
          </ul>
        </div>
      </div>
    `;
  }

  function renderCalendar(el) {
    bindCalendarControlsOnce();

    if (!weatherData && !calendarMonthData) {
      el.innerHTML = '<p class="widget-loading">Kalender wird geladen…</p>';
      return;
    }

    const calendar = calendarMonthData || weatherData?.calendar;
    if (calendarMonthLoading && !calendar?.weeks?.length) {
      el.innerHTML = '<p class="widget-loading">Kalender wird geladen…</p>';
      return;
    }

    if (calendar?.error) {
      el.innerHTML = `<p class="widget-error">${escapeHtml(calendar.error)}</p>`;
      return;
    }

    if (!calendar?.weeks?.length) {
      el.innerHTML = '<p class="widget-empty">Keine Kalenderdaten verfügbar</p>';
      return;
    }

    el.innerHTML = `
      <div class="calendar-widget">
        <header class="calendar-head">
          <button type="button" class="calendar-nav calendar-nav--prev" data-calendar-action="prev" aria-label="Vorheriger Monat" title="Vorheriger Monat"${calendar.canPrev ? '' : ' disabled'}>‹</button>
          <div class="calendar-head-main">
            <h4 class="calendar-month">${escapeHtml(calendar.monthLabel)}</h4>
            <span class="calendar-hint">${escapeHtml(calendarHintText(calendar))}</span>
          </div>
          <button type="button" class="calendar-nav calendar-nav--next" data-calendar-action="next" aria-label="Nächster Monat" title="Nächster Monat"${calendar.canNext ? '' : ' disabled'}>›</button>
        </header>
        <div class="calendar-weekdays" aria-hidden="true">
          ${calendar.weekdayLabels.map((label) => `<span class="calendar-weekday">${escapeHtml(label)}</span>`).join('')}
        </div>
        <div class="calendar-weeks">
          ${calendar.weeks.map((week) => `
            <div class="calendar-week">
              ${week.map((cell) => renderCalendarDayCell(cell)).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let forecastRenderKey = '';

  function buildForecastRenderKey() {
    if (!weatherData?.forecast?.length) return '';
    return weatherData.forecast.slice(0, 7).map((day) => (
      `${day.date}|${day.code}|${day.tempMax}|${day.tempMin}|${day.sunrise}|${day.sunset}|${day.precipitation}|${day.sunshineHours}`
    )).join(';');
  }

  function renderForecast(el) {
    if (!weatherData) {
      forecastRenderKey = '';
      el.innerHTML = '<p class="widget-loading">Prognose wird geladen…</p>';
      return;
    }

    const nextKey = buildForecastRenderKey();
    if (el.querySelector('.forecast-strip') && nextKey === forecastRenderKey) {
      return;
    }
    forecastRenderKey = nextKey;

    const today = new Date().toISOString().slice(0, 10);
    const forecastWeek = weatherData.forecast.slice(0, 7);
    el.innerHTML = `
      <div class="forecast-strip">
        ${forecastWeek.map((day) => `
          <div class="forecast-day ${day.date === today ? 'is-today' : ''} ${day.sceneClass || 'is-scene-cloudy'}">
            <div class="forecast-scene" aria-hidden="true"></div>
            <div class="forecast-content">
              <span class="forecast-wd">${escapeHtml(day.weekday)}</span>
              <div class="forecast-body">
                <div class="forecast-head">
                  <span class="forecast-ico" aria-hidden="true">${day.icon}</span>
                  <span class="forecast-temp-max">${day.tempMax}°</span>
                </div>
                <div class="forecast-details">
                  <span class="forecast-temp-min">${day.tempMin}°</span>
                  <span class="forecast-sunrise" title="Sonnenaufgang">↑ ${day.sunrise ?? '–'}</span>
                  <span class="forecast-sunset" title="Sonnenuntergang">↓ ${day.sunset ?? '–'}</span>
                  <span class="forecast-rain" title="Niederschlag">${day.precipitation} mm</span>
                  <span class="forecast-sun" title="Sonnenschein">☀ ${day.sunshineHours} h</span>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const HOURLY_VISIBLE = 6;

  let hourlyIndex = 0;
  let hourlyDataKey = '';

  function buildHourlyDataKey() {
    if (!weatherData?.hourly?.length) return '';
    const first = weatherData.hourly[0];
    const last = weatherData.hourly[weatherData.hourly.length - 1];
    return `${first.time}|${last.time}|${weatherData.hourly.length}`;
  }

  function currentHourIndex(hours) {
    const now = Date.now();
    let idx = hours.findIndex((hour) => new Date(hour.time).getTime() >= now);
    if (idx < 0) idx = hours.length - 1;
    return idx;
  }

  function maxHourlyStartIndex(hours) {
    return Math.max(0, hours.length - HOURLY_VISIBLE);
  }

  function defaultHourlyStartIndex(hours) {
    return Math.min(currentHourIndex(hours), maxHourlyStartIndex(hours));
  }

  function clampHourlyIndex(hours) {
    hourlyIndex = Math.min(Math.max(0, hourlyIndex), maxHourlyStartIndex(hours));
  }

  function buildHourSlotHtml(slotIndex) {
    return `
      <div class="hourly-hour is-scene-cloudy" data-hourly-slot="${slotIndex}">
        <div class="hourly-scene" aria-hidden="true"></div>
        <div class="hourly-content">
          <span class="hourly-time">–</span>
          <div class="hourly-body">
            <span class="hourly-ico" aria-hidden="true">🌡️</span>
            <span class="hourly-label">–</span>
          </div>
          <span class="hourly-temp">–</span>
          <span class="hourly-rain">–</span>
        </div>
      </div>
    `;
  }

  function updateHourlyNav(el) {
    const hours = weatherData?.hourly || [];
    const prev = el.querySelector('[data-hourly-action="prev"]');
    const next = el.querySelector('[data-hourly-action="next"]');
    const counter = el.querySelector('.hourly-counter');
    const maxStart = maxHourlyStartIndex(hours);

    if (prev) prev.disabled = hourlyIndex <= 0;
    if (next) next.disabled = hourlyIndex >= maxStart;

    const first = hours[hourlyIndex];
    const last = hours[Math.min(hourlyIndex + HOURLY_VISIBLE - 1, hours.length - 1)];
    if (counter) {
      counter.textContent = first && last ? `${first.timeLabel} – ${last.timeLabel}` : '–';
    }
  }

  function applyHourlyView(el) {
    const hours = weatherData?.hourly || [];
    if (!hours.length) return;

    clampHourlyIndex(hours);
    const nowIdx = currentHourIndex(hours);

    for (let slot = 0; slot < HOURLY_VISIBLE; slot += 1) {
      const cell = el.querySelector(`[data-hourly-slot="${slot}"]`);
      const hour = hours[hourlyIndex + slot];
      if (!cell) continue;

      if (!hour) {
        cell.hidden = true;
        continue;
      }

      cell.hidden = false;
      cell.className = `hourly-hour ${hour.sceneClass || 'is-scene-cloudy'}${hourlyIndex + slot === nowIdx ? ' is-now' : ''}`;

      const timeEl = cell.querySelector('.hourly-time');
      const icoEl = cell.querySelector('.hourly-ico');
      const labelEl = cell.querySelector('.hourly-label');
      const tempEl = cell.querySelector('.hourly-temp');
      const rainEl = cell.querySelector('.hourly-rain');

      if (timeEl) timeEl.textContent = hour.timeLabel || '–';
      if (icoEl) icoEl.textContent = hour.icon || '🌡️';
      if (labelEl) labelEl.textContent = hour.label || '–';
      if (tempEl) tempEl.textContent = hour.temp != null ? `${hour.temp}°` : '–';
      if (rainEl) {
        rainEl.textContent = hour.precipProb != null ? `${hour.precipProb} %` : '–';
      }
    }

    updateHourlyNav(el);
  }

  function bindHourlyControls(el) {
    if (el.dataset.hourlyBound === '1') return;
    el.dataset.hourlyBound = '1';

    el.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-hourly-action]');
      if (!btn || btn.disabled) return;
      const hours = weatherData?.hourly || [];
      const maxStart = maxHourlyStartIndex(hours);

      if (btn.dataset.hourlyAction === 'prev' && hourlyIndex > 0) {
        hourlyIndex -= 1;
        applyHourlyView(el);
      } else if (btn.dataset.hourlyAction === 'next' && hourlyIndex < maxStart) {
        hourlyIndex += 1;
        applyHourlyView(el);
      }
    });
  }

  function renderHourly(el) {
    if (!weatherData?.hourly?.length) {
      hourlyDataKey = '';
      el.innerHTML = '<p class="widget-loading">Stundenprognose wird geladen…</p>';
      return;
    }

    const nextKey = buildHourlyDataKey();
    const hasWidget = !!el.querySelector('.hourly-widget');

    if (!hasWidget || nextKey !== hourlyDataKey) {
      hourlyDataKey = nextKey;
      hourlyIndex = defaultHourlyStartIndex(weatherData.hourly);
      el.innerHTML = `
        <div class="hourly-widget">
          <button type="button" class="hourly-nav" data-hourly-action="prev" title="Eine Stunde zurück" aria-label="Eine Stunde zurück">‹</button>
          <div class="hourly-strip">
            ${Array.from({ length: HOURLY_VISIBLE }, (_, slot) => buildHourSlotHtml(slot)).join('')}
          </div>
          <button type="button" class="hourly-nav" data-hourly-action="next" title="Eine Stunde vor" aria-label="Eine Stunde vor">›</button>
        </div>
        <div class="hourly-foot">
          <span class="hourly-counter">–</span>
        </div>
      `;
      bindHourlyControls(el);
    } else {
      clampHourlyIndex(weatherData.hourly);
    }

    applyHourlyView(el);
  }

  const RENDERERS = {
    facade: renderFacade,
    sunshine: renderSunshine,
    snow: renderSnow,
    twilight: renderTwilight,
    advisor: renderAdvisor,
    weather: renderWeather,
    warnings: renderWarnings,
    pollen: renderPollen,
    forecast: renderForecast,
    calendar: renderCalendar,
    hourly: renderHourly,
    history: renderHistory,
    radar: renderRadar,
    webcam: renderWebcam,
  };

  function refreshWidgetBodies() {
    for (const item of layout) {
      if (item.id === 'webcam' || item.id === 'radar') continue;
      const body = document.querySelector(`#widget-body-${item.id}`);
      if (body && RENDERERS[item.id]) RENDERERS[item.id](body);
    }
    if (typeof DashboardRadar !== 'undefined') {
      if (pendingRadarMaps) {
        DashboardRadar.ingestMaps(pendingRadarMaps);
        pendingRadarMaps = null;
      } else {
        DashboardRadar.refresh();
      }
    }
  }

  function startRefreshTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (refreshIntervalMinutes <= 0) return;
    refreshTimer = setInterval(loadData, refreshIntervalMinutes * 60 * 1000);
  }

  const REFRESH_INTERVAL_OPTIONS = [
    { value: 0, label: 'Aus' },
    { value: 1, label: '1 Min.' },
    { value: 2, label: '2 Min.' },
    { value: 5, label: '5 Min.' },
    { value: 10, label: '10 Min.' },
    { value: 15, label: '15 Min.' },
    { value: 30, label: '30 Min.' },
  ];

  function refreshIntervalLabel(minutes) {
    const match = REFRESH_INTERVAL_OPTIONS.find((opt) => opt.value === minutes);
    return match?.label || `${minutes} Min.`;
  }

  function setRefreshIntervalMinutes(minutes) {
    refreshIntervalMinutes = Math.max(0, parseInt(minutes, 10) || 0);
    AppStorage.save({ dashboardRefreshMinutes: refreshIntervalMinutes });
    updateRefreshIntervalUi();
    startRefreshTimer();
  }

  function updateRefreshIntervalUi() {
    const trigger = document.getElementById('dashboardRefreshTrigger');
    const menu = document.getElementById('dashboardRefreshMenu');
    if (trigger) trigger.textContent = refreshIntervalLabel(refreshIntervalMinutes);
    menu?.querySelectorAll('[role="option"]').forEach((item) => {
      const value = parseInt(item.dataset.value, 10) || 0;
      item.classList.toggle('is-selected', value === refreshIntervalMinutes);
      item.setAttribute('aria-selected', value === refreshIntervalMinutes ? 'true' : 'false');
    });
  }

  function closeRefreshIntervalMenu() {
    const picker = document.getElementById('dashboardRefreshPicker');
    const trigger = document.getElementById('dashboardRefreshTrigger');
    const menu = document.getElementById('dashboardRefreshMenu');
    picker?.classList.remove('is-open');
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  }

  function applyRefreshControlMode() {
    const control = document.getElementById('dashboardRefreshControl');
    const nowBtn = document.getElementById('dashboardRefreshNow');
    const label = control?.querySelector('.dashboard-refresh-label');
    const picker = document.getElementById('dashboardRefreshPicker');
    if (!control) return;

    control.classList.toggle('is-view-mode', layoutLocked);
    control.classList.toggle('is-edit-mode', !layoutLocked);
    if (nowBtn) nowBtn.hidden = !layoutLocked;
    if (label) label.hidden = layoutLocked;
    if (picker) picker.hidden = layoutLocked;
    if (layoutLocked) closeRefreshIntervalMenu();
  }

  function bindRefreshIntervalControl() {
    const picker = document.getElementById('dashboardRefreshPicker');
    const trigger = document.getElementById('dashboardRefreshTrigger');
    const menu = document.getElementById('dashboardRefreshMenu');
    const nowBtn = document.getElementById('dashboardRefreshNow');
    if (!picker || !trigger || !menu || picker.dataset.bound === '1') return;
    picker.dataset.bound = '1';

    updateRefreshIntervalUi();

    trigger.addEventListener('click', (e) => {
      if (layoutLocked) return;
      e.stopPropagation();
      const open = picker.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.hidden = !open;
    });

    menu.addEventListener('click', (e) => {
      const option = e.target.closest('[role="option"]');
      if (!option) return;
      setRefreshIntervalMinutes(option.dataset.value);
      closeRefreshIntervalMenu();
    });

    nowBtn?.addEventListener('click', (e) => {
      if (!layoutLocked) return;
      e.stopPropagation();
      triggerManualRefresh();
    });

    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target) && e.target !== nowBtn) closeRefreshIntervalMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeRefreshIntervalMenu();
    });
  }

  function setRefreshNowBusy(busy) {
    refreshInFlight = busy;
    const btn = document.getElementById('dashboardRefreshNow');
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function triggerManualRefresh() {
    if (refreshInFlight) return;
    setRefreshNowBusy(true);
    loadData().finally(() => setRefreshNowBusy(false));
  }

  function sizeLimits(id, rows = 1, cols = 2) {
    const meta = widgetMeta(id);
    let maxCols = meta.maxCols ?? COL_MAX;
    let maxRows = meta.maxRows ?? ROW_MAX;

    if (id === 'weather') {
      maxRows = 2;
      maxCols = weatherMaxCols(rows, meta.maxColsOneRow ?? 6, meta.maxColsTwoRow ?? 6);
    }

    if (id === 'facade') {
      return { minCols: 2, maxCols: 3, minRows: 1, maxRows: 2 };
    }

    if (id === 'sunshine') {
      return { minCols: 1, maxCols: 2, minRows: 1, maxRows: 1 };
    }

    if (id === 'snow') {
      return { minCols: 1, maxCols: 2, minRows: 1, maxRows: 1 };
    }

    if (id === 'twilight') {
      return { minCols: 2, maxCols: 2, minRows: 3, maxRows: 3 };
    }

    if (id === 'advisor') {
      return { minCols: 4, maxCols: 4, minRows: 1, maxRows: 1 };
    }

    if (id === 'history') {
      return { minCols: 3, maxCols: 3, minRows: 2, maxRows: 2 };
    }

    if (id === 'calendar') {
      return { minCols: 3, maxCols: 3, minRows: 2, maxRows: 2 };
    }

    if (id === 'warnings') {
      return { minCols: 2, maxCols: 2, minRows: 1, maxRows: 2 };
    }

    if (id === 'radar') {
      return { minCols: 2, maxCols: 4, minRows: 2, maxRows: 2 };
    }

    if (id === 'webcam') {
      return { minCols: 4, maxCols: 4, minRows: 2, maxRows: 2 };
    }

    if (id === 'hourly') {
      return { minCols: 4, maxCols: 4, minRows: 1, maxRows: 2 };
    }

    if (id === 'forecast') {
      return { minCols: 4, maxCols: 4, minRows: 1, maxRows: 2 };
    }

    return {
      minCols: meta.minCols,
      minRows: meta.minRows,
      maxCols,
      maxRows,
    };
  }

  const SIZE_BTN_TITLES = {
    'cols,-1': { active: 'Schmaler', limit: 'Mindestbreite erreicht' },
    'cols,1': { active: 'Breiter', limit: 'Maximalbreite erreicht' },
    'rows,-1': { active: 'Niedriger', limit: 'Mindesthöhe erreicht' },
    'rows,1': { active: 'Höher', limit: 'Maximalhöhe erreicht' },
  };

  function canAdjustWidgetSize(item, axis, dir) {
    const limits = sizeLimits(item.id, item.rows, item.cols);
    const fixed = item.id === 'history' || item.id === 'calendar' || item.id === 'advisor' || item.id === 'webcam' || item.id === 'twilight';
    if (fixed) return false;

    if (item.id === 'hourly' || item.id === 'forecast' || item.id === 'warnings') {
      if (axis === 'cols') return false;
      if (dir < 0) return item.rows > limits.minRows;
      return item.rows < limits.maxRows;
    }

    if (item.id === 'facade') {
      const expanded = item.cols >= 3 && item.rows >= 2;
      if (axis === 'rows') {
        if (dir < 0) return expanded;
        return !expanded;
      }
      if (dir > 0) return !expanded;
      return expanded;
    }

    if (item.id === 'sunshine') {
      if (axis === 'rows') return false;
      const wide = item.cols >= 2;
      if (dir > 0) return !wide;
      return wide;
    }

    if (item.id === 'snow') {
      if (axis === 'rows') return false;
      const wide = item.cols >= 2;
      if (dir > 0) return !wide;
      return wide;
    }

    if (item.id === 'pollen') {
      if (axis === 'cols') return false;
      if (dir < 0) return item.rows > limits.minRows;
      return item.rows < limits.maxRows;
    }

    if (axis === 'cols') {
      if (dir < 0) return item.cols > limits.minCols;
      return item.cols < limits.maxCols;
    }

    if (axis === 'rows') {
      if (dir < 0) return item.rows > limits.minRows;
      return item.rows < limits.maxRows;
    }

    return false;
  }

  function shouldShowSizeButton(item, axis, dir) {
    if (item.id === 'hourly' || item.id === 'forecast' || item.id === 'warnings') {
      if (axis === 'cols') return false;
      return true;
    }
    if (canAdjustWidgetSize(item, axis, dir)) return true;
    if (item.id === 'sunshine' && axis === 'cols' && dir > 0) return true;
    if (item.id === 'snow' && axis === 'cols' && dir > 0) return true;
    if (item.id === 'facade' && dir > 0) return true;
    return false;
  }

  function shouldShowResizeHandle(item) {
    if (item.id === 'history' || item.id === 'calendar' || item.id === 'advisor' || item.id === 'webcam' || item.id === 'twilight') return false;
    return true;
  }

  function updateSizeControlPresentation(widget, item) {
    let visibleCount = 0;
    widget.querySelectorAll('.widget-size-btn').forEach((btn) => {
      const axis = btn.dataset.axis;
      const dir = parseInt(btn.dataset.dir, 10);
      const show = shouldShowSizeButton(item, axis, dir);
      const enabled = canAdjustWidgetSize(item, axis, dir);
      btn.hidden = !show;
      btn.disabled = !enabled;
      btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      if (show) visibleCount += 1;
    });

    const resize = widget.querySelector('.widget-resize');
    if (resize) {
      resize.hidden = !shouldShowResizeHandle(item);
      const atMax = item.id === 'sunshine' || item.id === 'snow'
        ? item.cols >= 2
        : item.id === 'facade'
          ? item.cols >= 3 && item.rows >= 2
          : item.id === 'hourly' || item.id === 'forecast'
            ? item.rows >= sizeLimits(item.id, item.rows, item.cols).maxRows
            : false;
      resize.classList.toggle('is-at-limit', atMax);
      resize.setAttribute(
        'title',
        atMax && (item.id === 'sunshine' || item.id === 'snow' || item.id === 'facade' || item.id === 'hourly' || item.id === 'forecast')
          ? 'Maximalgröße erreicht'
          : 'Größe ziehen',
      );
    }

    const compact = visibleCount > 0 && visibleCount <= 4;
    widget.classList.toggle('widget-size-compact', compact);
    updateSizeButtonTitles(widget, item);
  }

  function updateSizeButtonTitles(widget, item) {
    widget.querySelectorAll('.widget-size-btn:not([hidden])').forEach((btn) => {
      const axis = btn.dataset.axis;
      const dir = parseInt(btn.dataset.dir, 10);
      const key = `${axis},${dir}`;
      const titles = SIZE_BTN_TITLES[key];
      const enabled = canAdjustWidgetSize(item, axis, dir);
      if (titles) btn.title = enabled ? titles.active : titles.limit;
    });
  }

  function applyWidgetPlacement(widget, item) {
    widget.style.setProperty('--widget-cols', String(item.cols));
    widget.style.setProperty('--widget-rows', String(item.rows));
    widget.style.setProperty('--widget-col-start', String(item.col || 1));
    widget.style.setProperty('--widget-row-start', String(item.row || 1));
    widget.style.gridColumn = `${item.col || 1} / span ${item.cols}`;
    widget.style.gridRow = `${item.row || 1} / span ${item.rows}`;
    widget.dataset.cols = String(item.cols);
    widget.dataset.rows = String(item.rows);
    widget.dataset.col = String(item.col || 1);
    widget.dataset.row = String(item.row || 1);
    if (item.id === 'weather') {
      widget.classList.toggle('weather-extended', item.cols >= 3 && item.rows >= 2);
    }
    if (item.id === 'facade') {
      widget.classList.toggle('facade-extended', item.cols >= 3 && item.rows >= 2);
      const body = widget.querySelector('.widget-body');
      if (body) renderFacade(body);
      if (item.cols >= 3 && item.rows >= 2 && typeof DashboardSunMap !== 'undefined') {
        window.setTimeout(() => DashboardSunMap.invalidateSize(), 320);
      } else if (typeof DashboardSunMap !== 'undefined') {
        DashboardSunMap.destroy();
      }
    }
    if (item.id === 'sunshine') {
      widget.classList.toggle('sunshine-stacked', item.cols === 1);
      updateWidgetHeadTitle(widget, item);
      const body = widget.querySelector('.widget-body');
      if (body) renderSunshine(body);
    }
    if (item.id === 'snow') {
      widget.classList.toggle('snow-stacked', item.cols === 1);
      updateWidgetHeadTitle(widget, item);
      const body = widget.querySelector('.widget-body');
      if (body) renderSnow(body);
    }
    if (item.id === 'hourly') {
      widget.classList.toggle('hourly-tall', item.rows >= 2);
    }
    if (item.id === 'forecast') {
      widget.classList.toggle('forecast-tall', item.rows >= 2);
    }
    if (item.id === 'warnings') {
      widget.classList.toggle('warnings-tall', item.rows >= 2);
      const body = widget.querySelector('.widget-body');
      if (body) renderWarnings(body);
    }
    if (item.id === 'radar') {
      const body = widget.querySelector('.widget-body');
      if (body && typeof DashboardRadar !== 'undefined') {
        window.setTimeout(() => DashboardRadar.invalidateSize(), 320);
      }
    }
    const label = widget.querySelector('.widget-size-label');
    if (label) label.textContent = `${item.cols}×${item.rows}`;
    updateSizeControlPresentation(widget, item);
  }

  function adjustWidgetSize(item, dCols, dRows) {
    if (layoutLocked) return;
    if (item.id === 'history' || item.id === 'calendar' || item.id === 'advisor' || item.id === 'webcam' || item.id === 'twilight') return;

    if (item.id === 'sunshine') {
      const wide = item.cols >= 2;
      let nextCols = item.cols;
      let nextRows = item.rows;
      if (wide && dCols < 0) {
        nextCols = 1;
        nextRows = 1;
      } else if (!wide && dCols > 0) {
        nextCols = 2;
        nextRows = 1;
      } else {
        return;
      }
      if (!applyWidgetLayoutChange(item.id, { cols: nextCols, rows: nextRows }, { anchorCol: item.col, anchorRow: item.row })) {
        return;
      }
      scheduleSave();
      applyFullLayoutPlacement();
      return;
    }

    if (item.id === 'snow') {
      const wide = item.cols >= 2;
      let nextCols = item.cols;
      let nextRows = item.rows;
      if (wide && dCols < 0) {
        nextCols = 1;
        nextRows = 1;
      } else if (!wide && dCols > 0) {
        nextCols = 2;
        nextRows = 1;
      } else {
        return;
      }
      if (!applyWidgetLayoutChange(item.id, { cols: nextCols, rows: nextRows }, { anchorCol: item.col, anchorRow: item.row })) {
        return;
      }
      scheduleSave();
      applyFullLayoutPlacement();
      return;
    }

    if (item.id === 'facade') {
      const expanded = item.cols >= 3 && item.rows >= 2;
      let nextCols = item.cols;
      let nextRows = item.rows;
      if (expanded && (dCols < 0 || dRows < 0)) {
        nextCols = 2;
        nextRows = 1;
      } else if (!expanded && (dCols > 0 || dRows > 0)) {
        nextCols = 3;
        nextRows = 2;
      } else {
        return;
      }
      if (!applyWidgetLayoutChange(item.id, { cols: nextCols, rows: nextRows }, { anchorCol: item.col, anchorRow: item.row })) {
        return;
      }
      scheduleSave();
      applyFullLayoutPlacement();
      return;
    }

    const next = clampSize(item.id, item.cols + dCols, item.rows + dRows);
    if (next.cols === item.cols && next.rows === item.rows) return;
    if (!applyWidgetLayoutChange(item.id, { cols: next.cols, rows: next.rows }, { anchorCol: item.col, anchorRow: item.row })) {
      return;
    }
    scheduleSave();
    applyFullLayoutPlacement();
  }

  function clearDropMarkers() {
    hideDropPreview(document.getElementById('dashboardGrid'));
  }

  function bindDragDrop(widget, item, grid) {
    const head = widget.querySelector('.widget-head');
    if (!head) return;

    head.addEventListener('pointerdown', (e) => {
      if (layoutLocked) return;
      if (e.button !== 0 || e.target.closest('.widget-resize, .widget-size-btn')) return;
      dragState = {
        id: item.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCol: item.col,
        startRow: item.row,
      };
      widget.classList.add('is-dragging');
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    head.addEventListener('pointermove', (e) => {
      if (layoutLocked) return;
      if (!dragState || dragState.id !== item.id || e.pointerId !== dragState.pointerId) return;
      const pos = dragGridPosition(grid, dragState, item, e.clientX, e.clientY);
      showDropPreview(grid, item, pos.col, pos.row);
    });

    head.addEventListener('pointerup', (e) => {
      if (!dragState || dragState.id !== item.id) return;
      const pos = dragGridPosition(grid, dragState, item, e.clientX, e.clientY);
      if (applyWidgetLayoutChange(item.id, { col: pos.col, row: pos.row })) {
        applyFullLayoutPlacement();
        scheduleSave();
      }
      widget.classList.remove('is-dragging');
      clearDropMarkers();
      dragState = null;
      try { head.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    });

    head.addEventListener('pointercancel', () => {
      widget.classList.remove('is-dragging');
      clearDropMarkers();
      if (dragState?.id === item.id) dragState = null;
    });
  }

  function bindResize(widget, item, grid) {
    const handle = widget.querySelector('.widget-resize');
    if (!handle) return;

    handle.addEventListener('pointerdown', (e) => {
      if (layoutLocked) return;
      e.stopPropagation();
      e.preventDefault();
      const colWidth = grid.clientWidth / 12;
      resizeState = {
        id: item.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCols: item.cols,
        startRows: item.rows,
        startCol: item.col,
        startRow: item.row,
        colWidth: Math.max(colWidth, 48),
        rowHeight: 100,
      };
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (layoutLocked) return;
      if (!resizeState || resizeState.id !== item.id) return;
      let dCols = snapDelta(e.clientX - resizeState.startX, resizeState.colWidth);
      let dRows = snapDelta(e.clientY - resizeState.startY, resizeState.rowHeight);
      const next = clampSize(item.id, resizeState.startCols + dCols, resizeState.startRows + dRows);
      if (next.cols === item.cols && next.rows === item.rows) return;
      if (!applyWidgetLayoutChange(item.id, { cols: next.cols, rows: next.rows }, {
        anchorCol: resizeState.startCol,
        anchorRow: resizeState.startRow,
      })) {
        return;
      }
      applyFullLayoutPlacement();
    });

    handle.addEventListener('pointerup', (e) => {
      if (!resizeState || resizeState.id !== item.id) return;
      scheduleSave();
      resizeState = null;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    });
  }

  function bindSizeButtons(widget, item) {
    widget.querySelectorAll('.widget-size-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (layoutLocked) return;
        e.stopPropagation();
        const axis = btn.dataset.axis;
        const dir = parseInt(btn.dataset.dir, 10);
        if (axis === 'cols') adjustWidgetSize(item, dir, 0);
        if (axis === 'rows') adjustWidgetSize(item, 0, dir);
      });
    });
  }

  function renderGrid() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;

    grid.innerHTML = '';

    for (const item of layout) {
      const meta = WIDGETS[item.id];
      const widget = document.createElement('article');
      widget.className = 'dashboard-widget';
      if (meta.completed === false) widget.classList.add('is-incomplete');
      widget.dataset.id = item.id;

      const isFixed = item.id === 'history' || item.id === 'calendar' || item.id === 'advisor' || item.id === 'webcam' || item.id === 'twilight';

      widget.innerHTML = `
        <header class="widget-head">
          <div class="widget-head-titles">
            <h3>${widgetDisplayTitle(item.id, item)}</h3>
            ${meta.subtitle ? `<span class="widget-subtitle">${meta.subtitle}</span>` : ''}
          </div>
          <span class="widget-drag-hint" aria-hidden="true">⋮⋮</span>
        </header>
        <div class="widget-body" id="widget-body-${item.id}"></div>
        <footer class="widget-foot">
          <div class="widget-size-controls" style="${isFixed ? 'visibility: hidden;' : ''}">
            <button type="button" class="widget-size-btn" data-axis="cols" data-dir="-1" title="Schmaler">⟨</button>
            <button type="button" class="widget-size-btn" data-axis="rows" data-dir="-1" title="Niedriger">−</button>
            <span class="widget-size-label">${item.cols}×${item.rows}</span>
            <button type="button" class="widget-size-btn" data-axis="rows" data-dir="1" title="Höher">+</button>
            <button type="button" class="widget-size-btn" data-axis="cols" data-dir="1" title="Breiter">⟩</button>
          </div>
          ${isFixed ? '' : '<span class="widget-resize" title="Größe ziehen" aria-label="Widget-Größe ziehen"></span>'}
        </footer>
      `;

      applyWidgetPlacement(widget, item);
      grid.appendChild(widget);
      RENDERERS[item.id]?.(widget.querySelector('.widget-body'));
      bindDragDrop(widget, item, grid);
      bindResize(widget, item, grid);
      bindSizeButtons(widget, item);
    }
  }

  function updateDashboardLocation(saved = {}) {
    const locEl = document.getElementById('dashboardLocation');
    if (!locEl) return;

    const hintHtml = '<span class="dashboard-location-hint">Standort im <a href="/">Sonnen-Monitor</a> setzen oder ändern.</span>';
    const lat = saved.lat;
    const lon = saved.lon;
    const address = String(saved.searchQuery || '').trim();

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      locEl.innerHTML = `<span class="dashboard-location-address">Kein Standort gespeichert.</span> ${hintHtml}`;
      return;
    }

    const addressLine = address
      ? escapeHtml(address)
      : `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
    locEl.innerHTML = `<span class="dashboard-location-address">${addressLine}</span> · ${hintHtml}`;
  }

  async function loadData() {
    const saved = AppStorage.load?.() || {};
    updateDashboardLocation(saved);
    const lat = saved.lat;
    const lon = saved.lon;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return;
    }

    try {
      const res = await fetch(`/api/dashboard?lat=${lat}&lon=${lon}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Dashboard-Daten nicht verfügbar');

      const payload = await res.json();
      weatherData = payload.weather;
      summaryData = payload.summary;
      pendingRadarMaps = payload.radar || null;

      const locationChanged = lat !== lastDataLat || lon !== lastDataLon;
      lastDataLat = lat;
      lastDataLon = lon;

      if (locationChanged) {
        historySelectedYear = null;
        historyFetchSeq = 0;
        historyLoading = false;
        historyLoadingYear = null;
        historyFetchAbort?.abort();
        historyFetchAbort = null;
        resetHistoryCache();
        resetCalendarState();
        const radarBody = document.querySelector('#widget-body-radar');
        if (radarBody) renderRadar(radarBody);
      }

      syncCalendarFromWeather();
      seedHistoryPresetCache(weatherData.history?.presets);
      refreshWidgetBodies();
    } catch (err) {
      for (const item of layout) {
        if (item.id === 'webcam' || item.id === 'radar') continue;
        const body = document.querySelector(`#widget-body-${item.id}`);
        if (body) body.innerHTML = `<p class="widget-error">${escapeHtml(err.message)}</p>`;
      }
    }
  }

  async function init() {
    await AppStorage.init();
    ProjectNav.init();
    ProjectNav.syncFromSettings(AppStorage.load?.());

    const saved = AppStorage.load?.() || {};
    layoutLocked = saved.dashboardLayoutLocked === true;
    refreshIntervalMinutes = Math.max(0, parseInt(saved.dashboardRefreshMinutes, 10) || 5);
    layout = normalizeLayout(saved.dashboardLayout);
    if (Array.isArray(saved.dashboardLayout)) {
      const needsSave = saved.dashboardLayout.some((item) => {
        if (!item?.id || !WIDGETS[item.id]) return false;
        const clamped = clampSize(
          item.id,
          parseInt(item.cols, 10) || WIDGETS[item.id].defaultCols,
          parseInt(item.rows, 10) || WIDGETS[item.id].defaultRows
        );
        const normalized = layout.find((entry) => entry.id === item.id);
        return item.cols !== clamped.cols
          || item.rows !== clamped.rows
          || !item.col
          || !item.row
          || normalized?.col !== item.col
          || normalized?.row !== item.row;
      });
      if (needsSave) scheduleSave();
    }
    bindHistoryControlsOnce();
    bindWebcamControlsOnce();
    bindCalendarControlsOnce();
    bindLayoutLockControl();
    bindRefreshIntervalControl();
    applyLayoutLockState();
    renderGrid();
    loadData();
    startRefreshTimer();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Dashboard.init().catch((err) => console.error('[Dashboard]', err));
});
