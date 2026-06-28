const DASHBOARD_WIDGETS = {
  facade: { minCols: 2, maxCols: 3, minRows: 1, maxRows: 2, defaultCols: 2, defaultRows: 1 },
  sunshine: { minCols: 1, maxCols: 2, minRows: 1, maxRows: 1, defaultCols: 2, defaultRows: 1 },
  snow: { minCols: 1, maxCols: 2, minRows: 1, maxRows: 1, defaultCols: 2, defaultRows: 1 },
  twilight: { minCols: 2, maxCols: 2, minRows: 3, maxRows: 3, defaultCols: 2, defaultRows: 3 },
  advisor: { minCols: 4, maxCols: 4, minRows: 1, maxRows: 1, defaultCols: 4, defaultRows: 1 },
  weather: { minCols: 2, minRows: 1, maxRows: 2, maxColsOneRow: 6, maxColsTwoRow: 6, defaultCols: 2, defaultRows: 2 },
  warnings: { minCols: 2, maxCols: 2, minRows: 1, maxRows: 2, defaultCols: 2, defaultRows: 1 },
  pollen: { minCols: 2, minRows: 1, maxCols: 2, maxRows: 2, defaultCols: 2, defaultRows: 2 },
  forecast: { minCols: 4, maxCols: 4, minRows: 1, maxRows: 2, defaultCols: 4, defaultRows: 2 },
  calendar: { minCols: 3, maxCols: 3, minRows: 2, maxRows: 2, defaultCols: 3, defaultRows: 2 },
  hourly: { minCols: 4, maxCols: 4, minRows: 1, maxRows: 2, defaultCols: 4, defaultRows: 1 },
  history: { minCols: 3, maxCols: 3, minRows: 2, maxRows: 2, defaultCols: 3, defaultRows: 2 },
  radar: { minCols: 2, maxCols: 4, minRows: 2, maxRows: 2, defaultCols: 3, defaultRows: 2 },
  webcam: { minCols: 4, maxCols: 4, minRows: 2, maxRows: 2, defaultCols: 4, defaultRows: 2 },
};

const DEFAULT_DASHBOARD_LAYOUT = Object.entries(DASHBOARD_WIDGETS).map(([id, meta]) => ({
  id,
  cols: meta.defaultCols,
  rows: meta.defaultRows,
}));

const DASHBOARD_WIDGET_IDS = new Set(Object.keys(DASHBOARD_WIDGETS));

function weatherMaxCols(rows, oneRowMax = 6, twoRowMax = 6) {
  return rows >= 2 ? twoRowMax : oneRowMax;
}

function clampWidgetSize(id, cols, rows) {
  const meta = DASHBOARD_WIDGETS[id] || { minCols: 2, minRows: 1, defaultCols: 4, defaultRows: 2 };
  let r = Math.min(meta.maxRows ?? 4, Math.max(meta.minRows, parseInt(rows, 10) || meta.defaultRows));
  let colMax = meta.maxCols ?? 12;

  if (id === 'weather') {
    r = Math.min(2, Math.max(1, r));
    colMax = weatherMaxCols(r, meta.maxColsOneRow ?? 6, meta.maxColsTwoRow ?? 6);
  }

  if (id === 'facade') {
    const c = parseInt(cols, 10) || 2;
    const r = parseInt(rows, 10) || 1;
    if (c >= 3 || r >= 2) return { cols: 3, rows: 2 };
    return { cols: 2, rows: 1 };
  }

  if (id === 'sunshine') {
    const c = parseInt(cols, 10) || 2;
    if (c >= 2) return { cols: 2, rows: 1 };
    return { cols: 1, rows: 1 };
  }

  if (id === 'snow') {
    const c = parseInt(cols, 10) || 2;
    if (c >= 2) return { cols: 2, rows: 1 };
    return { cols: 1, rows: 1 };
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

  return {
    cols: Math.min(colMax, Math.max(meta.minCols, parseInt(cols, 10) || meta.defaultCols)),
    rows: r,
  };
}

module.exports = {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_LAYOUT,
  DASHBOARD_WIDGET_IDS,
  clampWidgetSize,
  weatherMaxCols,
};
