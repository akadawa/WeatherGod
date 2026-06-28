const SunCalc = require('suncalc');
const {
  getActiveFacade,
  getEnterMessageExtras,
  getSunsetFacade,
  getAllFacadesSchedule,
} = require('./facadeCalc');

function formatTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '–';
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function getDashboardSummary(lat, lon, settings) {
  const now = new Date();
  const pos = SunCalc.getPosition(now, lat, lon);
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  const partition = settings.partition;
  const facade = getActiveFacade(azimuthDeg, altitudeDeg, partition);
  const sunsetFacade = getSunsetFacade(lat, lon, partition, now);
  const times = SunCalc.getTimes(now, lat, lon);

  let leaveTime = null;
  if (facade) {
    const extras = getEnterMessageExtras(lat, lon, facade.id, partition, now);
    leaveTime = extras.leaveTime;
  }

  return {
    checkedAt: now.toISOString(),
    sun: {
      azimuthDeg: Math.round(azimuthDeg * 10) / 10,
      altitudeDeg: Math.round(altitudeDeg * 10) / 10,
      sunrise: formatTime(times.sunrise),
      sunset: formatTime(times.sunset),
      aboveHorizon: altitudeDeg > 0,
    },
    facade: facade
      ? {
          id: facade.id,
          label: facade.label,
          leaveTime,
        }
      : null,
    sunsetFacade: sunsetFacade
      ? {
          id: sunsetFacade.id,
          label: sunsetFacade.label,
          time: formatTime(new Date(sunsetFacade.sunsetTime)),
        }
      : null,
    facades: getAllFacadesSchedule(lat, lon, partition, now),
    lastNotification: settings.lastNotification || null,
  };
}

module.exports = { getDashboardSummary };
