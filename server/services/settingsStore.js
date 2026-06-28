const config = require('../config');
const { getDb } = require('../db/database');

const DEFAULT_PARTITION = {
  startAngle: -45,
  widths: { north: 90, east: 90, south: 90, west: 90 },
};

const {
  DEFAULT_DASHBOARD_LAYOUT,
  DASHBOARD_WIDGET_IDS,
  clampWidgetSize,
} = require('./dashboardWidgets');

const MSG_ENTER = '☀️ Die Sonne ist jetzt auf der {fassade}seite. Weg ca. {leaveTime} Uhr.';
const MSG_LEAVE = '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite. Auf der {naechsteFassade}seite wieder ca. {enterTime} Uhr.';

const LEGACY_ENTER_MESSAGES = new Set([
  '☀️ Die Sonne ist jetzt auf der {fassade}seite.',
  '☀️ Die Sonne ist jetzt auf der {fassade}seite',
]);

const LEGACY_LEAVE_MESSAGES = new Set([
  '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite.',
  '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite',
  '🌤️ Die Sonne verlässt die {fassade}seite.',
]);

function upgradeEnterMessage(message) {
  const trimmed = (message || '').trim();
  if (!trimmed || LEGACY_ENTER_MESSAGES.has(trimmed)) return MSG_ENTER;
  if (!/\{leaveTime\}/i.test(trimmed) && /Die Sonne ist jetzt auf der \{fassade\}seite/i.test(trimmed)) {
    return MSG_ENTER;
  }
  return trimmed;
}

function upgradeLeaveMessage(message) {
  const trimmed = (message || '').trim();
  if (!trimmed || LEGACY_LEAVE_MESSAGES.has(trimmed)) return MSG_LEAVE;
  if (!/\{enterTime\}/i.test(trimmed) && /Die Sonne ist nicht mehr auf der \{fassade\}seite/i.test(trimmed)) {
    return MSG_LEAVE;
  }
  return trimmed;
}

function defaultFacadeRule(enabled = false, leaveEnabled = false) {
  return {
    enabled,
    message: MSG_ENTER,
    leaveEnabled,
    messageLeave: MSG_LEAVE,
  };
}

function defaultFacadeNotifications() {
  return {
    north: defaultFacadeRule(false),
    east: defaultFacadeRule(false),
    south: defaultFacadeRule(false),
    west: defaultFacadeRule(false),
  };
}

function normalizeFacadeRule(rule = {}) {
  return {
    enabled: !!(rule.enabled ?? rule.enter),
    message: upgradeEnterMessage(rule.message || rule.messageEnter),
    leaveEnabled: !!(rule.leaveEnabled ?? rule.leave),
    messageLeave: upgradeLeaveMessage(rule.messageLeave),
  };
}

function normalizeFacadeNotifications(rules = {}) {
  const defaults = defaultFacadeNotifications();
  const result = { ...defaults };

  for (const id of Object.keys(defaults)) {
    result[id] = normalizeFacadeRule(rules[id] || defaults[id]);
  }

  return result;
}

function getDefaults() {
  return {
    lat: config.defaultLat,
    lon: config.defaultLon,
    centerLat: config.defaultLat,
    centerLon: config.defaultLon,
    zoom: 14,
    mapView: 'map',
    searchQuery: '',
    locationLocked: false,
    intervalMinutes: 5,
    westThreshold: config.westAngleThreshold,
    monitorEnabled: false,
    selectedFacade: 'west',
    ntfyTopic: config.ntfy.topic || '',
    facadeNotifications: defaultFacadeNotifications(),
    partition: structuredClone(DEFAULT_PARTITION),
    navCollapsed: true,
    dashboardLayout: structuredClone(DEFAULT_DASHBOARD_LAYOUT),
    webcamSource: '',
    lastNotification: null,
  };
}

function normalizeLastNotification(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const title = String(entry.title || '').trim();
  const message = String(entry.message || '').trim();
  if (!title && !message) return null;
  return {
    title: title || 'WeatherGod',
    message: message || '',
    event: entry.event === 'leave' ? 'leave' : entry.event === 'test' ? 'test' : 'enter',
    facadeId: entry.facadeId || null,
    sentAt: entry.sentAt || new Date().toISOString(),
  };
}

function recordLastNotification(entry) {
  const normalized = normalizeLastNotification(entry);
  if (!normalized) return null;

  return updateSettings({ lastNotification: normalized });
}

function normalizeDashboardLayout(layout) {
  if (!Array.isArray(layout)) return structuredClone(DEFAULT_DASHBOARD_LAYOUT);

  const seen = new Set();
  const result = [];

  for (const item of layout) {
    if (!item?.id || !DASHBOARD_WIDGET_IDS.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const size = clampWidgetSize(item.id, item.cols, item.rows);
    const entry = { id: item.id, ...size };
    const col = parseInt(item.col, 10);
    const row = parseInt(item.row, 10);
    if (col >= 1) entry.col = col;
    if (row >= 1) entry.row = row;
    result.push(entry);
  }

  for (const fallback of DEFAULT_DASHBOARD_LAYOUT) {
    if (!seen.has(fallback.id)) result.push({ ...fallback });
  }

  return result;
}

function deepMerge(target, partial) {
  const result = { ...target, ...partial };

  if (partial.partition) {
    result.partition = {
      ...target.partition,
      ...partial.partition,
      widths: {
        ...target.partition?.widths,
        ...partial.partition?.widths,
      },
    };
  }

  if (partial.facadeNotifications) {
    result.facadeNotifications = { ...target.facadeNotifications };
    for (const id of Object.keys(partial.facadeNotifications)) {
      result.facadeNotifications[id] = {
        ...target.facadeNotifications?.[id],
        ...partial.facadeNotifications[id],
      };
    }
  }

  return result;
}

function getStoredRow() {
  return getDb().prepare('SELECT data, updated_at FROM user_settings WHERE id = 1').get();
}

function getSettings() {
  const row = getStoredRow();
  const defaults = getDefaults();

  if (!row) return defaults;

  try {
    const stored = JSON.parse(row.data);
    const merged = deepMerge(defaults, stored);
    merged.facadeNotifications = normalizeFacadeNotifications(merged.facadeNotifications);
    merged.dashboardLayout = normalizeDashboardLayout(merged.dashboardLayout);
    merged.lastNotification = normalizeLastNotification(merged.lastNotification);
    merged.monitorEnabled = !!merged.monitorEnabled;
    return merged;
  } catch {
    return defaults;
  }
}

function getSettingsPayload() {
  const row = getStoredRow();
  return {
    ...getSettings(),
    _persisted: !!row,
    _updatedAt: row?.updated_at ?? null,
  };
}

function getEffectiveNtfyTopic() {
  const settings = getSettings();
  return (settings.ntfyTopic || config.ntfy.topic || '').trim();
}

function updateSettings(partial) {
  if (!partial || typeof partial !== 'object') {
    throw new Error('Ungültige Einstellungen');
  }

  const clean = Object.fromEntries(
    Object.entries(partial).filter(([key]) => !key.startsWith('_'))
  );

  if (typeof clean.ntfyTopic === 'string') {
    clean.ntfyTopic = clean.ntfyTopic.trim();
  }

  const merged = deepMerge(getSettings(), clean);
  merged.facadeNotifications = normalizeFacadeNotifications(merged.facadeNotifications);
  merged.dashboardLayout = normalizeDashboardLayout(merged.dashboardLayout);
  merged.lastNotification = normalizeLastNotification(merged.lastNotification);
  const now = new Date().toISOString();

  getDb()
    .prepare(`
      INSERT INTO user_settings (id, data, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `)
    .run(JSON.stringify(merged), now);

  return {
    ...merged,
    _persisted: true,
    _updatedAt: now,
  };
}

module.exports = {
  getSettings,
  getSettingsPayload,
  updateSettings,
  getDefaults,
  getEffectiveNtfyTopic,
  recordLastNotification,
};
