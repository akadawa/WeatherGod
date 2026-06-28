const SunCalc = require('suncalc');

const FACADE_LABELS = {
  north: 'Nord',
  east: 'Ost',
  south: 'Süd',
  west: 'West',
};

const ORDER = ['north', 'east', 'south', 'west'];

function azimuthInRange(az, start, end) {
  let a = az;
  while (a < start) a += 360;
  while (a >= start + 360) a -= 360;
  return a >= start && a < end;
}

function getSectorByAzimuth(azimuthDeg, partition) {
  if (!partition?.widths) return null;

  let angle = partition.startAngle ?? -45;

  for (const id of ORDER) {
    const width = partition.widths[id];
    const start = angle;
    const end = angle + width;

    if (azimuthInRange(azimuthDeg, start, end)) {
      return {
        id,
        label: FACADE_LABELS[id],
        start,
        end,
        spread: width,
      };
    }
    angle = end;
  }

  return null;
}

function getFacadeSector(facadeId, partition) {
  if (!partition?.widths) return null;

  let angle = partition.startAngle ?? -45;

  for (const id of ORDER) {
    const width = partition.widths[id];
    const start = angle;
    const end = angle + width;

    if (id === facadeId) {
      return {
        id,
        label: FACADE_LABELS[id],
        start,
        end,
        spread: width,
      };
    }

    angle = end;
  }

  return null;
}

function isSunInSector(lat, lon, sector, date) {
  const pos = SunCalc.getPosition(date, lat, lon);
  if (pos.altitude <= 0) return false;

  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  return azimuthInRange(azimuthDeg, sector.start, sector.end);
}

function formatLeaveTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '–';
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function getFacadeLeaveTime(lat, lon, facadeId, partition, fromDate = new Date()) {
  const sector = getFacadeSector(facadeId, partition);
  if (!sector) return null;

  if (!isSunInSector(lat, lon, sector, fromDate)) return null;

  const times = SunCalc.getTimes(fromDate, lat, lon);
  const horizon = times.sunset;
  if (!horizon || Number.isNaN(horizon.getTime())) return null;

  const stepMs = 60 * 1000;
  let t = fromDate.getTime();

  for (t += stepMs; t <= horizon.getTime(); t += stepMs) {
    const probe = new Date(t);
    if (!isSunInSector(lat, lon, sector, probe)) {
      return probe;
    }
  }

  if (isSunInSector(lat, lon, sector, horizon)) {
    return horizon;
  }

  return null;
}

function getFacadeEnterTime(lat, lon, facadeId, partition, fromDate = new Date()) {
  const sector = getFacadeSector(facadeId, partition);
  if (!sector) return null;

  const times = SunCalc.getTimes(fromDate, lat, lon);
  const horizon = times.sunset;
  if (!horizon || Number.isNaN(horizon.getTime())) return null;

  if (isSunInSector(lat, lon, sector, fromDate)) {
    return fromDate;
  }

  const stepMs = 60 * 1000;
  for (let t = fromDate.getTime() + stepMs; t <= horizon.getTime(); t += stepMs) {
    const probe = new Date(t);
    if (isSunInSector(lat, lon, sector, probe)) {
      return probe;
    }
  }

  return null;
}

function getNextFacadeInOrder(facadeId) {
  const idx = ORDER.indexOf(facadeId);
  if (idx < 0) return null;
  return ORDER[(idx + 1) % ORDER.length];
}

function getAzimuthDeg(lat, lon, date) {
  const pos = SunCalc.getPosition(date, lat, lon);
  return ((pos.azimuth * 180) / Math.PI + 180) % 360;
}

function isAzimuthInSector(azimuthDeg, sector) {
  return azimuthInRange(azimuthDeg, sector.start, sector.end);
}

function getSectorEnterTimeByAzimuth(lat, lon, facadeId, partition, fromDate = new Date()) {
  const sector = getFacadeSector(facadeId, partition);
  if (!sector) return null;

  const times = SunCalc.getTimes(fromDate, lat, lon);
  const endLimit = times.sunset?.getTime();
  if (!endLimit || Number.isNaN(endLimit)) return null;

  if (isAzimuthInSector(getAzimuthDeg(lat, lon, fromDate), sector)) {
    return fromDate;
  }

  const stepMs = 60 * 1000;
  const maxTime = endLimit + 3 * 60 * 60 * 1000;
  for (let t = fromDate.getTime() + stepMs; t <= maxTime; t += stepMs) {
    const probe = new Date(t);
    if (isAzimuthInSector(getAzimuthDeg(lat, lon, probe), sector)) {
      return probe;
    }
  }

  return null;
}

function getPredictedFacadeLeaveTime(lat, lon, facadeId, partition, fromDate = new Date()) {
  const sector = getFacadeSector(facadeId, partition);
  if (!sector) return null;

  if (isSunInSector(lat, lon, sector, fromDate)) {
    return getFacadeLeaveTime(lat, lon, facadeId, partition, fromDate);
  }

  const enterDate = getFacadeEnterTime(lat, lon, facadeId, partition, fromDate);
  if (!enterDate) return null;
  return getFacadeLeaveTime(lat, lon, facadeId, partition, enterDate);
}

function getLeaveAnchorTime(lat, lon, facadeId, partition, fromDate = new Date(), simulateUpcoming = false) {
  if (simulateUpcoming) {
    return getPredictedFacadeLeaveTime(lat, lon, facadeId, partition, fromDate);
  }

  return fromDate;
}

function getNextFacadeEnterTime(lat, lon, facadeId, partition, fromDate = new Date(), options = {}) {
  const { simulateUpcoming = false } = options;
  const nextId = getNextFacadeInOrder(facadeId);
  if (!nextId) return null;

  const anchor = getLeaveAnchorTime(lat, lon, facadeId, partition, fromDate, simulateUpcoming);
  if (!anchor) return null;

  const visibleEnter = getFacadeEnterTime(lat, lon, nextId, partition, anchor);
  if (visibleEnter) {
    return {
      date: visibleEnter,
      nextFacadeId: nextId,
      nextFassade: FACADE_LABELS[nextId],
    };
  }

  const azimuthEnter = getSectorEnterTimeByAzimuth(lat, lon, nextId, partition, anchor);
  if (azimuthEnter) {
    return {
      date: azimuthEnter,
      nextFacadeId: nextId,
      nextFassade: FACADE_LABELS[nextId],
    };
  }

  return {
    date: null,
    nextFacadeId: nextId,
    nextFassade: FACADE_LABELS[nextId],
  };
}

function getEnterMessageExtras(lat, lon, facadeId, partition, fromDate = new Date()) {
  const leaveDate = getPredictedFacadeLeaveTime(lat, lon, facadeId, partition, fromDate);
  return { leaveTime: formatLeaveTime(leaveDate) };
}

function getLeaveMessageExtras(lat, lon, facadeId, partition, fromDate = new Date(), options = {}) {
  const next = getNextFacadeEnterTime(lat, lon, facadeId, partition, fromDate, options);
  if (!next) {
    return { enterTime: '–', naechsteFassade: '–' };
  }

  return {
    enterTime: formatLeaveTime(next.date),
    naechsteFassade: next.nextFassade ?? '–',
  };
}

function getSunsetFacade(lat, lon, partition, date = new Date()) {
  const times = SunCalc.getTimes(date, lat, lon);
  if (!times.sunset || Number.isNaN(times.sunset.getTime())) return null;

  const pos = SunCalc.getPosition(times.sunset, lat, lon);
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const sector = getSectorByAzimuth(azimuthDeg, partition);
  if (!sector) return null;

  return {
    ...sector,
    sunsetTime: times.sunset.toISOString(),
  };
}

function getActiveFacade(azimuthDeg, altitudeDeg, partition) {
  if (altitudeDeg <= 0) return null;
  return getSectorByAzimuth(azimuthDeg, partition);
}

function getFacadeDailyWindow(lat, lon, facadeId, partition, date = new Date()) {
  const sector = getFacadeSector(facadeId, partition);
  if (!sector) {
    return { enterTime: '–', leaveTime: '–', hasWindow: false };
  }

  const times = SunCalc.getTimes(date, lat, lon);
  const start = times.sunrise;
  const end = times.sunset;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { enterTime: '–', leaveTime: '–', hasWindow: false };
  }

  const stepMs = 60 * 1000;
  let enter = null;
  let leave = null;
  let inSector = false;

  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const probe = new Date(t);
    const inside = isSunInSector(lat, lon, sector, probe);
    if (inside && enter === null) {
      enter = probe;
      inSector = true;
    } else if (!inside && inSector) {
      leave = probe;
      inSector = false;
    }
  }

  if (inSector && enter) {
    leave = end;
  }

  return {
    enterTime: enter ? formatLeaveTime(enter) : '–',
    leaveTime: leave ? formatLeaveTime(leave) : '–',
    hasWindow: !!enter,
  };
}

function getAllFacadesSchedule(lat, lon, partition, date = new Date()) {
  const pos = SunCalc.getPosition(date, lat, lon);
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  const activeFacade = getActiveFacade(azimuthDeg, altitudeDeg, partition);

  return ORDER.map((id) => {
    const window = getFacadeDailyWindow(lat, lon, id, partition, date);
    return {
      id,
      label: FACADE_LABELS[id],
      enterTime: window.enterTime,
      leaveTime: window.leaveTime,
      hasWindow: window.hasWindow,
      active: activeFacade?.id === id,
    };
  });
}

module.exports = {
  FACADE_LABELS,
  ORDER,
  getActiveFacade,
  getSunsetFacade,
  getSectorByAzimuth,
  getFacadeSector,
  getFacadeEnterTime,
  getFacadeLeaveTime,
  getPredictedFacadeLeaveTime,
  getNextFacadeInOrder,
  getNextFacadeEnterTime,
  getEnterMessageExtras,
  getLeaveMessageExtras,
  getFacadeDailyWindow,
  getAllFacadesSchedule,
  formatLeaveTime,
};
