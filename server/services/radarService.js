const config = require('../config');

const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

async function fetchRadarJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadNowcastFrames(latestPastTime) {
  const url = config.radarNowcastUrl;
  if (!url) return { frames: [], host: null };

  try {
    const data = await fetchRadarJson(url);
    const raw = data?.radar?.nowcast;
    if (!Array.isArray(raw)) return { frames: [], host: data.host || null };
    return {
      host: data.host || null,
      frames: raw.filter((frame) => frame.time > latestPastTime),
    };
  } catch (err) {
    console.warn('[RadarMaps] nowcast', err.message);
    return { frames: [], host: null };
  }
}

async function getRadarMaps() {
  const rainviewer = await fetchRadarJson(RAINVIEWER_URL);
  const past = rainviewer?.radar?.past;
  if (!Array.isArray(past) || !past.length) {
    throw new Error('Radardaten nicht verfügbar');
  }

  const latestPastTime = past[past.length - 1].time;
  const { frames: nowcast, host: nowcastHost } = await loadNowcastFrames(latestPastTime);
  const hasNowcast = nowcast.length > 0;

  return {
    version: rainviewer.version || '2.0',
    generated: rainviewer.generated,
    host: rainviewer.host,
    radar: { past, nowcast },
    meta: {
      source: hasNowcast ? 'hybrid' : 'rainviewer',
      pastHost: rainviewer.host,
      nowcastHost: hasNowcast ? nowcastHost : null,
      pastMaxZoom: 7,
      nowcastMaxZoom: 8,
      creditUrl: 'https://www.rainviewer.com/',
      creditLabel: 'RainViewer',
      creditTitle: hasNowcast ? 'Beobachtung: RainViewer · Prognose: LibreWXR' : '',
      hasNowcast,
    },
  };
}

module.exports = { getRadarMaps };
