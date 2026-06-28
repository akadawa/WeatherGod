const SunCalc = require('suncalc');
const config = require('../config');
const { getSettings, getEffectiveNtfyTopic, updateSettings } = require('../services/settingsStore');
const { getActiveFacade, ORDER, getEnterMessageExtras, getLeaveMessageExtras } = require('./facadeCalc');
const { sendFacadeNotification, formatMessage, DEFAULT_MESSAGE, DEFAULT_LEAVE } = require('./ntfyAlert');

let monitorTimer = null;
let monitorState = {
  active: false,
  lat: null,
  lon: null,
  intervalMinutes: 5,
  lastCheck: null,
  lastFacade: null,
  lastFacadeId: null,
  lastError: null,
};

async function handleFacadeTransitions(previousId, currentId, rules, lat, lon, partition) {
  if (!getEffectiveNtfyTopic()) return;

  const now = new Date();

  for (const id of ORDER) {
    const rule = rules?.[id];
    if (!rule?.enabled && !rule?.leaveEnabled) continue;

    if (previousId !== id && currentId === id && rule.enabled) {
      const extras = getEnterMessageExtras(lat, lon, id, partition, now);
      await sendFacadeNotification(id, rule.message, 'enter', extras);
    }

    if (previousId === id && currentId !== id && rule.leaveEnabled) {
      const extras = getLeaveMessageExtras(lat, lon, id, partition, now);
      await sendFacadeNotification(id, rule.messageLeave, 'leave', extras);
    }
  }
}

async function checkSunPosition() {
  if (!monitorState.lat || !monitorState.lon) return;

  try {
    const now = new Date();
    const settings = getSettings();
    const pos = SunCalc.getPosition(now, monitorState.lat, monitorState.lon);
    const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
    const altitudeDeg = (pos.altitude * 180) / Math.PI;

    const facade = getActiveFacade(azimuthDeg, altitudeDeg, settings.partition);
    const currentId = facade?.id ?? null;
    const previousId = monitorState.lastFacadeId;

    if (monitorState.active) {
      await handleFacadeTransitions(
        previousId,
        currentId,
        settings.facadeNotifications,
        monitorState.lat,
        monitorState.lon,
        settings.partition
      );
    }

    monitorState.lastCheck = now.toISOString();
    monitorState.lastFacade = facade;
    monitorState.lastFacadeId = currentId;
    monitorState.lastError = null;
  } catch (err) {
    monitorState.lastError = err.message;
    console.error('[SunMonitor] Fehler:', err.message);
  }
}

function clearMonitorTimer() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

function startMonitor({ lat, lon, intervalMinutes = 5, persist = true }) {
  clearMonitorTimer();

  monitorState.active = true;
  monitorState.lat = lat;
  monitorState.lon = lon;
  monitorState.intervalMinutes = Math.max(1, intervalMinutes);
  monitorState.lastFacadeId = null;

  if (persist) {
    updateSettings({
      monitorEnabled: true,
      lat,
      lon,
      intervalMinutes: monitorState.intervalMinutes,
    });
  }

  checkSunPosition();

  const ms = Math.max(30000, monitorState.intervalMinutes * 60 * 1000);
  monitorTimer = setInterval(checkSunPosition, ms);

  return getStatus();
}

function stopMonitor({ persist = true } = {}) {
  clearMonitorTimer();
  monitorState.active = false;
  monitorState.lastFacadeId = null;

  if (persist) {
    updateSettings({ monitorEnabled: false });
  }

  return getStatus();
}

function restoreMonitorFromSettings() {
  const settings = getSettings();
  if (!settings.monitorEnabled) return getStatus();

  const lat = settings.lat;
  const lon = settings.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    console.warn('[SunMonitor] Überwachung war aktiv, aber Standort fehlt – deaktiviert.');
    updateSettings({ monitorEnabled: false });
    return getStatus();
  }

  console.log('[SunMonitor] Überwachung wird wiederhergestellt…');
  return startMonitor({
    lat,
    lon,
    intervalMinutes: settings.intervalMinutes || 5,
    persist: false,
  });
}

function getStatus() {
  const settings = getSettings();
  return {
    ...monitorState,
    persisted: !!settings.monitorEnabled,
    ntfyConfigured: !!getEffectiveNtfyTopic(),
    autoAllowed: config.ntfy.autoAllowed && !!getEffectiveNtfyTopic(),
  };
}

async function testCurrentNotifications(lat, lon) {
  if (!getEffectiveNtfyTopic()) {
    throw new Error('ntfy Topic fehlt – in der UI oder .env eintragen');
  }

  const settings = getSettings();
  const now = new Date();
  const pos = SunCalc.getPosition(now, lat, lon);
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  const facade = getActiveFacade(azimuthDeg, altitudeDeg, settings.partition);

  const report = {
    currentFacade: facade,
    azimuthDeg: Math.round(azimuthDeg * 10) / 10,
    altitudeDeg: Math.round(altitudeDeg * 10) / 10,
    checkedAt: now.toISOString(),
    items: [],
    sentCount: 0,
  };

  if (!facade) {
    report.items.push({
      sent: false,
      event: 'none',
      message: 'Sonne unter Horizont – derzeit kein Fassaden-Push.',
      note: 'Warte auf Sonnensichtbarkeit an einer Fassade.',
    });
    return report;
  }

  const rule = settings.facadeNotifications?.[facade.id] || {};
  const enterExtras = getEnterMessageExtras(lat, lon, facade.id, settings.partition, now);
  const leaveExtras = getLeaveMessageExtras(lat, lon, facade.id, settings.partition, now, {
    simulateUpcoming: true,
  });
  const enterMsg = formatMessage(rule.message, facade.id, DEFAULT_MESSAGE, enterExtras);
  const leaveMsg = formatMessage(rule.messageLeave, facade.id, DEFAULT_LEAVE, leaveExtras);

  if (rule.enabled) {
    await sendFacadeNotification(facade.id, rule.message, 'enter', enterExtras);
    report.sentCount += 1;
    report.leaveTime = enterExtras.leaveTime;
    report.items.push({
      facadeId: facade.id,
      label: facade.label,
      event: 'enter',
      sent: true,
      message: enterMsg,
      note: `Entspricht „Sonne sichtbar“ – jetzt gesendet. Weg ca. ${enterExtras.leaveTime} Uhr.`,
    });
  } else {
    report.leaveTime = enterExtras.leaveTime;
    report.items.push({
      facadeId: facade.id,
      label: facade.label,
      event: 'enter',
      sent: false,
      message: enterMsg,
      note: 'Push „Sonne sichtbar“ ist für diese Fassade nicht aktiv.',
    });
  }

  if (rule.leaveEnabled) {
    report.enterTime = leaveExtras.enterTime;
    report.naechsteFassade = leaveExtras.naechsteFassade;
    report.items.push({
      facadeId: facade.id,
      label: facade.label,
      event: 'leave',
      sent: false,
      message: leaveMsg,
      note: `Wird gesendet, wenn die Sonne die Fassade verlässt. Nächste Zone: ${leaveExtras.naechsteFassade}seite ca. ${leaveExtras.enterTime} Uhr.`,
    });
  } else {
    report.items.push({
      facadeId: facade.id,
      label: facade.label,
      event: 'leave',
      sent: false,
      message: leaveMsg,
      note: 'Push „Sonne weg“ ist für diese Fassade nicht aktiv.',
    });
  }

  return report;
}

module.exports = {
  startMonitor,
  stopMonitor,
  getStatus,
  restoreMonitorFromSettings,
  testCurrentNotifications,
};
