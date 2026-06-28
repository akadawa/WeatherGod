const express = require('express');
const config = require('../config');
const { sendTestNotification, sendFacadeNotification } = require('../services/ntfyAlert');
const { FACADE_LABELS, getEnterMessageExtras, getLeaveMessageExtras } = require('../services/facadeCalc');
const { startMonitor, stopMonitor, getStatus, testCurrentNotifications } = require('../services/sunMonitor');
const { getSettingsPayload, updateSettings, getEffectiveNtfyTopic, getSettings } = require('../services/settingsStore');
const { getWeatherData, getHistoryDayByYear, getCalendarMonth, getWmoWeatherCatalog } = require('../services/weatherService');
const { getDashboardSummary } = require('../services/dashboardService');
const { resolveWebcamSource, proxyWebcamResource } = require('../services/webcamService');
const { getRadarMaps } = require('../services/radarService');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

router.get('/config', (_req, res) => {
  const topic = getEffectiveNtfyTopic();
  res.json({
    defaultLat: config.defaultLat,
    defaultLon: config.defaultLon,
    westAngleThreshold: config.westAngleThreshold,
    ntfyConfigured: !!topic,
    ntfyAutoAllowed: config.ntfy.autoAllowed && !!topic,
    ntfyServer: config.ntfy.server,
    ntfyEnvTopic: config.ntfy.topic || '',
    isDev: config.isDev,
  });
});

router.get('/settings', (_req, res) => {
  try {
    res.json(getSettingsPayload());
  } catch (err) {
    console.error('[Settings GET]', err.message);
    res.status(500).json({ error: 'Einstellungen konnten nicht geladen werden' });
  }
});

router.put('/settings', (req, res) => {
  try {
    const updated = updateSettings(req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('[Settings PUT]', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/ntfy/test', async (_req, res) => {
  try {
    const result = await sendTestNotification();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ntfy Test]', err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

router.post('/ntfy/test-facade', async (req, res) => {
  const { facadeId, message, event, lat, lon } = req.body || {};
  const kind = event || 'enter';

  if (!FACADE_LABELS[facadeId]) {
    return res.status(400).json({ error: 'Ungültige Fassade' });
  }
  if (kind !== 'enter' && kind !== 'leave') {
    return res.status(400).json({ error: 'event muss enter oder leave sein' });
  }

  try {
    const settings = getSettings();
    const useLat = typeof lat === 'number' ? lat : settings.lat;
    const useLon = typeof lon === 'number' ? lon : settings.lon;
    let extras = {};

    if (typeof useLat === 'number' && typeof useLon === 'number') {
      if (kind === 'enter') {
        extras = getEnterMessageExtras(useLat, useLon, facadeId, settings.partition);
      } else {
        extras = getLeaveMessageExtras(useLat, useLon, facadeId, settings.partition, new Date(), {
          simulateUpcoming: true,
        });
      }
    }

    const result = await sendFacadeNotification(facadeId, message || '', kind, extras);
    res.json({
      success: true,
      leaveTime: extras.leaveTime ?? null,
      enterTime: extras.enterTime ?? null,
      naechsteFassade: extras.naechsteFassade ?? null,
      ...result,
    });
  } catch (err) {
    console.error('[ntfy Facade Test]', err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

router.post('/ntfy/test-current', async (req, res) => {
  const { lat, lon } = req.body || {};

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }

  try {
    const report = await testCurrentNotifications(lat, lon);
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('[ntfy Test Current]', err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

router.post('/monitor/start', (req, res) => {
  const { lat, lon, intervalMinutes } = req.body || {};

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }

  const status = startMonitor({
    lat,
    lon,
    intervalMinutes: intervalMinutes || 5,
  });
  res.json(status);
});

router.post('/monitor/stop', (_req, res) => {
  res.json(stopMonitor());
});

router.get('/monitor/status', (_req, res) => {
  res.json(getStatus());
});

router.get('/weather/wmo-codes', (_req, res) => {
  res.json(getWmoWeatherCatalog());
});

router.get('/weather', async (req, res) => {
  const settings = getSettings();
  const lat = parseFloat(req.query.lat ?? settings.lat);
  const lon = parseFloat(req.query.lon ?? settings.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }

  try {
    const data = await getWeatherData(lat, lon);
    res.json(data);
  } catch (err) {
    console.error('[Weather]', err.message);
    res.status(502).json({ error: err.message || 'Wetterdaten nicht verfügbar' });
  }
});

router.get('/weather/history', async (req, res) => {
  const settings = getSettings();
  const lat = parseFloat(req.query.lat ?? settings.lat);
  const lon = parseFloat(req.query.lon ?? settings.lon);
  const year = parseInt(req.query.year, 10);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }
  if (Number.isNaN(year)) {
    return res.status(400).json({ error: 'year erforderlich' });
  }

  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : null;

  try {
    const data = await getHistoryDayByYear(lat, lon, year, referenceDate);
    res.json(data);
  } catch (err) {
    console.error('[History]', err.message);
    res.status(err.message.includes('liegen') ? 400 : 502).json({ error: err.message || 'Archivdaten nicht verfügbar' });
  }
});

router.get('/weather/calendar', async (req, res) => {
  const settings = getSettings();
  const lat = parseFloat(req.query.lat ?? settings.lat);
  const lon = parseFloat(req.query.lon ?? settings.lon);
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year und month erforderlich' });
  }

  try {
    const data = await getCalendarMonth(lat, lon, year, month);
    res.json(data);
  } catch (err) {
    console.error('[Calendar]', err.message);
    res.status(502).json({ error: err.message || 'Kalenderdaten nicht verfügbar' });
  }
});

router.get('/webcam/proxy', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';

  if (!url) {
    return res.status(400).json({ error: 'url erforderlich' });
  }

  try {
    const payload = await proxyWebcamResource(url);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-store');
    res.type(payload.contentType);
    res.send(payload.body);
  } catch (err) {
    console.error('[Webcam proxy]', err.message);
    res.status(502).json({ error: err.message || 'Stream-Proxy fehlgeschlagen' });
  }
});

router.get('/webcam/resolve', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';

  if (!url) {
    return res.status(400).json({ error: 'url erforderlich' });
  }

  try {
    const data = await resolveWebcamSource(url);
    res.json(data);
  } catch (err) {
    console.error('[Webcam]', err.message);
    res.status(err.message.includes('Ungültig') || err.message.includes('unterstützt') ? 400 : 502)
      .json({ error: err.message || 'Webcam konnte nicht geladen werden' });
  }
});

router.get('/dashboard/summary', (req, res) => {
  const settings = getSettings();
  const lat = parseFloat(req.query.lat ?? settings.lat);
  const lon = parseFloat(req.query.lon ?? settings.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }

  try {
    res.json(getDashboardSummary(lat, lon, settings));
  } catch (err) {
    console.error('[Dashboard]', err.message);
    res.status(500).json({ error: err.message || 'Dashboard-Daten nicht verfügbar' });
  }
});

router.get('/dashboard', async (req, res) => {
  const settings = getSettings();
  const lat = parseFloat(req.query.lat ?? settings.lat);
  const lon = parseFloat(req.query.lon ?? settings.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat und lon erforderlich' });
  }

  try {
    const summary = getDashboardSummary(lat, lon, settings);
    const [weather, radar] = await Promise.all([
      getWeatherData(lat, lon),
      getRadarMaps().catch((err) => {
        console.warn('[Dashboard] Radar:', err.message);
        return null;
      }),
    ]);

    res.json({ weather, summary, radar });
  } catch (err) {
    console.error('[Dashboard]', err.message);
    res.status(err.message?.includes('Wetter') ? 502 : 500).json({
      error: err.message || 'Dashboard-Daten nicht verfügbar',
    });
  }
});

router.get('/radar/maps', async (_req, res) => {
  try {
    res.json(await getRadarMaps());
  } catch (err) {
    console.error('[RadarMaps]', err.message);
    res.status(502).json({ error: err.message || 'Radardaten nicht verfügbar' });
  }
});

module.exports = router;
