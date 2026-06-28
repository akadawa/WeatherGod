const FacadeLogic = (() => {
  const FACADES = {
    north: { id: 'north', label: 'Nord', color: '#8899aa' },
    east: { id: 'east', label: 'Ost', color: '#ffd166' },
    south: { id: 'south', label: 'Süd', color: '#f5a623' },
    west: { id: 'west', label: 'West', color: '#ff9500' },
  };

  const ORDER = ['north', 'east', 'south', 'west'];
  const MIN_WIDTH = 15;
  const FULL_HIT_DEFAULT = 20;

  const DEFAULT_PARTITION = {
    startAngle: -45,
    widths: { north: 90, east: 90, south: 90, west: 90 },
  };

  let startAngle = DEFAULT_PARTITION.startAngle;
  let widths = structuredClone(DEFAULT_PARTITION.widths);
  let selectedId = 'west';

  function normalizeAngle(a) {
    return ((a % 360) + 360) % 360;
  }

  function signedAngleDiff(from, to) {
    let d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function normalizeAngleDiff(a, b) {
    return Math.abs(signedAngleDiff(b, a));
  }

  function prev(id) {
    return ORDER[(ORDER.indexOf(id) + 3) % 4];
  }

  function next(id) {
    return ORDER[(ORDER.indexOf(id) + 1) % 4];
  }

  function computeSectors() {
    let angle = startAngle;
    return ORDER.map((id) => {
      const width = widths[id];
      const start = angle;
      const end = angle + width;
      const center = start + width / 2;
      angle = end;
      return {
        ...FACADES[id],
        start,
        end,
        bearing: normalizeAngle(center),
        spread: width,
        center,
      };
    });
  }

  function azimuthInRange(az, start, end) {
    let a = az;
    while (a < start) a += 360;
    while (a >= start + 360) a -= 360;
    return a >= start && a < end;
  }

  function getSectorByAzimuth(azimuthDeg) {
    for (const sector of computeSectors()) {
      if (azimuthInRange(azimuthDeg, sector.start, sector.end)) {
        return sector;
      }
    }
    return null;
  }

  function loadFromStorage(saved) {
    if (saved?.partition?.widths) {
      startAngle = saved.partition.startAngle ?? DEFAULT_PARTITION.startAngle;
      widths = { ...DEFAULT_PARTITION.widths, ...saved.partition.widths };
      validatePartition();
    }
    if (saved?.selectedFacade && FACADES[saved.selectedFacade]) {
      selectedId = saved.selectedFacade;
    }
  }

  function validatePartition() {
    const sum = ORDER.reduce((s, id) => s + widths[id], 0);
    if (Math.abs(sum - 360) > 0.01) {
      resetPartition();
      return;
    }
    for (const id of ORDER) {
      if (widths[id] < MIN_WIDTH) {
        resetPartition();
        return;
      }
    }
  }

  function persist() {
    AppStorage.saveImmediate({
      partition: {
        startAngle,
        widths: structuredClone(widths),
      },
      selectedFacade: selectedId,
    });
  }

  function getFacade(id) {
    return computeSectors().find((s) => s.id === id) || null;
  }

  function getAllFacades() {
    return computeSectors();
  }

  function getSelectedId() {
    return selectedId;
  }

  function setSelectedId(id) {
    if (!FACADES[id]) return;
    selectedId = id;
    updateSelectionUI();
    persist();
    if (window.FacadeEditor) FacadeEditor.refresh();
  }

  /** Gesamte Aufteilung drehen (Mittelpunkt-Griff). */
  function rotateToCenter(id, targetCenter, { silent = false } = {}) {
    const sector = getFacade(id);
    if (!sector) return false;
    startAngle += signedAngleDiff(sector.center, targetCenter);
    if (!silent) {
      syncEditorInputs(id);
      persist();
    }
    return true;
  }

  /** Linke Grenze verschieben – Nachbar verkleinert/vergrößert sich mit. */
  function moveLeftBoundary(id, newAngle, { silent = false } = {}) {
    const sector = getFacade(id);
    if (!sector) return false;
    const p = prev(id);
    const delta = signedAngleDiff(sector.start, newAngle);
    if (Math.abs(delta) < 0.01) return true;
    if (widths[p] + delta < MIN_WIDTH || widths[id] - delta < MIN_WIDTH) return false;
    widths[p] += delta;
    widths[id] -= delta;
    if (!silent) {
      syncEditorInputs(id);
      persist();
    }
    return true;
  }

  /** Rechte Grenze verschieben – Nachbar verkleinert/vergrößert sich mit. */
  function moveRightBoundary(id, newAngle, { silent = false } = {}) {
    const sector = getFacade(id);
    if (!sector) return false;
    const n = next(id);
    const delta = signedAngleDiff(sector.end, newAngle);
    if (Math.abs(delta) < 0.01) return true;
    if (widths[id] + delta < MIN_WIDTH || widths[n] - delta < MIN_WIDTH) return false;
    widths[id] += delta;
    widths[n] -= delta;
    if (!silent) {
      syncEditorInputs(id);
      persist();
    }
    return true;
  }

  /** Breite über Schieberegler – Nachbarn gleichmäßig anpassen. */
  function setFacadeWidth(id, newWidth, { silent = false } = {}) {
    const maxWidth = 360 - (ORDER.length - 1) * MIN_WIDTH;
    newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, newWidth));
    const delta = newWidth - widths[id];
    const p = prev(id);
    const n = next(id);
    const half = delta / 2;
    if (widths[p] - half < MIN_WIDTH || widths[n] - half < MIN_WIDTH) return false;
    widths[id] = newWidth;
    widths[p] -= half;
    widths[n] -= half;
    if (!silent) {
      syncEditorInputs(id);
      persist();
    }
    return true;
  }

  function resetPartition() {
    startAngle = DEFAULT_PARTITION.startAngle;
    widths = structuredClone(DEFAULT_PARTITION.widths);
    syncEditorInputs(selectedId);
    persist();
  }

  function syncEditorInputs(id) {
    const f = getFacade(id);
    if (!f) return;
    const bearingEl = document.getElementById('facadeBearingInput');
    const spreadEl = document.getElementById('facadeSpreadInput');
    const bearingVal = document.getElementById('facadeBearingVal');
    const spreadVal = document.getElementById('facadeSpreadVal');
    const maxWidth = 360 - (ORDER.length - 1) * MIN_WIDTH;
    if (bearingEl) bearingEl.value = Math.round(f.bearing);
    if (spreadEl) {
      spreadEl.min = MIN_WIDTH;
      spreadEl.max = maxWidth;
      spreadEl.value = Math.round(f.spread);
    }
    if (bearingVal) bearingVal.textContent = `${Math.round(f.bearing)}°`;
    if (spreadVal) spreadVal.textContent = `${Math.round(f.spread)}°`;
  }

  function updateSelectionUI() {
    document.querySelectorAll('.facade-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.facade === selectedId);
    });
    const label = document.getElementById('facadeEditorLabel');
    if (label) label.textContent = `${getFacade(selectedId).label}seite bearbeiten`;
    syncEditorInputs(selectedId);
  }

  function getIlluminatedFacade(azimuthDeg, altitudeDeg, westThreshold = 15) {
    if (altitudeDeg <= 0) return null;

    const sector = getSectorByAzimuth(azimuthDeg);
    if (!sector) return null;

    const diff = normalizeAngleDiff(azimuthDeg, sector.bearing);
    const hitThreshold = sector.id === 'west' ? westThreshold : FULL_HIT_DEFAULT;

    return {
      ...sector,
      diff,
      fullHit: diff <= hitThreshold,
      intensity: Math.max(0, 1 - diff / (sector.spread / 2)),
    };
  }

  let lastUiFacadeId = null;
  let lastSunsetFacadeId = null;

  function getSunsetFacade(lat, lon, date = new Date()) {
    const times = SunCalc.getTimes(date, lat, lon);
    if (!times.sunset || Number.isNaN(times.sunset.getTime())) return null;

    const pos = SunCalc.getPosition(times.sunset, lat, lon);
    const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
    const sector = getSectorByAzimuth(azimuthDeg);
    if (!sector) return null;

    return {
      ...sector,
      sunsetTime: times.sunset,
    };
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

  function getFacadeLeaveTime(lat, lon, facadeId, fromDate = new Date()) {
    const sector = getFacade(facadeId);
    if (!sector || !isSunInSector(lat, lon, sector, fromDate)) return null;

    const times = SunCalc.getTimes(fromDate, lat, lon);
    const horizon = times.sunset;
    if (!horizon || Number.isNaN(horizon.getTime())) return null;

    const stepMs = 60 * 1000;
    let t = fromDate.getTime();

    for (t += stepMs; t <= horizon.getTime(); t += stepMs) {
      const probe = new Date(t);
      if (!isSunInSector(lat, lon, sector, probe)) return probe;
    }

    return isSunInSector(lat, lon, sector, horizon) ? horizon : null;
  }

  function updateSunsetFacadeInfo(lat, lon, date = new Date()) {
    const info = getSunsetFacade(lat, lon, date);
    const el = document.getElementById('sunsetFacadeInfo');

    document.querySelectorAll('.facade-card').forEach((card) => {
      card.classList.toggle('sunset-target', info && card.dataset.facade === info.id);
    });

    if (window.NotifyRules?.highlightSunsetFacade) {
      NotifyRules.highlightSunsetFacade(info?.id ?? null);
    }

    if (!el) return;

    if (!info) {
      el.textContent = 'Sonnenuntergang: heute nicht berechenbar';
      lastSunsetFacadeId = null;
      return;
    }

    const time = info.sunsetTime.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    el.textContent = `Sonnenuntergang heute ca. ${time} auf der ${info.label}seite (automatisch erkannt)`;
    lastSunsetFacadeId = info.id;
  }

  function getSunsetFacadeId() {
    return lastSunsetFacadeId;
  }

  function updateFacadeUI(facade) {
    const cards = document.querySelectorAll('.facade-card');
    cards.forEach((card) => {
      card.classList.remove('active', 'active-west');
    });

    const statusEl = document.getElementById('facadeStatus');
    const alertEl = document.getElementById('facadeAlert');
    const currentId = facade?.id ?? null;

    if (!facade) {
      statusEl.textContent = 'Keine aktive Fassadenbeleuchtung (Sonne unter Horizont)';
      if (alertEl) alertEl.hidden = true;
      lastUiFacadeId = null;
      return;
    }

    const card = document.querySelector(`[data-facade="${facade.id}"]`);
    if (card) {
      card.classList.add('active');
      if (facade.id === 'west') card.classList.add('active-west');
    }

    const hitLabel = facade.fullHit ? 'Volltreffer' : 'Teilweise';
    statusEl.textContent = `${facade.label}seite: ${hitLabel} (Abweichung ${facade.diff.toFixed(1)}°)`;

    if (alertEl) {
      alertEl.hidden = false;
      alertEl.className = 'facade-alert active';
      let leaveText = '';
      if (typeof MapModule !== 'undefined') {
        const { lat, lon } = MapModule.getLocation();
        const leaveTime = formatLeaveTime(getFacadeLeaveTime(lat, lon, facade.id));
        if (leaveTime !== '–') leaveText = ` Weg ca. ${leaveTime} Uhr.`;
      }
      alertEl.textContent = `☀️ Die Sonne ist jetzt auf der ${facade.label}seite.${leaveText}`;
    }

    lastUiFacadeId = currentId;
  }

  return {
    FACADES,
    ORDER,
    MIN_WIDTH,
    getFacade,
    getAllFacades,
    getSelectedId,
    setSelectedId,
    rotateToCenter,
    moveLeftBoundary,
    moveRightBoundary,
    setFacadeWidth,
    resetPartition,
    loadFromStorage,
    persist,
    getIlluminatedFacade,
    getSunsetFacade,
    getSunsetFacadeId,
    updateSunsetFacadeInfo,
    getFacadeLeaveTime,
    formatLeaveTime,
    updateFacadeUI,
    updateSelectionUI,
    normalizeAngleDiff,
    syncEditorInputs,
    prev,
    next,
  };
})();
