require('dotenv').config();

const path = require('path');
const fs = require('fs');

function resolveDatabasePath() {
  const configured = process.env.DATABASE_PATH || './data/weathergod.db';
  if (fs.existsSync(configured)) return configured;

  const legacy = path.join(path.dirname(configured), 'solarpilot.db');
  if (configured.includes('weathergod') && fs.existsSync(legacy)) {
    console.warn('[WeatherGod] Legacy-Datenbank gefunden, nutze:', legacy);
    return legacy;
  }

  return configured;
}

function parseOptionalFloat(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  defaultLat: parseOptionalFloat(process.env.DEFAULT_LAT),
  defaultLon: parseOptionalFloat(process.env.DEFAULT_LON),
  westAngleThreshold: parseFloat(process.env.WEST_ANGLE_THRESHOLD) || 15,

  databasePath: resolveDatabasePath(),

  radarNowcastUrl: process.env.RADAR_NOWCAST_URL !== undefined
    ? process.env.RADAR_NOWCAST_URL || null
    : (process.env.RADAR_MAPS_URL || 'https://api.librewxr.net/public/weather-maps.json'),

  ntfy: {
    autoEnabled: process.env.NTFY_AUTO_ENABLED === 'true',
    server: process.env.NTFY_SERVER || 'https://ntfy.sh',
    topic: process.env.NTFY_TOPIC || '',
    token: process.env.NTFY_TOKEN || '',
  },
};

config.ntfy.autoAllowed = !config.isDev && config.ntfy.autoEnabled;

module.exports = config;
