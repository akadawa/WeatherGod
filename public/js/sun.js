const SunEngine = (() => {
  let sunRayLayer = null;
  let sunPathLayer = null;
  let sunMarkerLayer = null;
  let facadeLayers = [];

  function radToDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function getSunPosition(lat, lon, date = new Date()) {
    const pos = SunCalc.getPosition(date, lat, lon);
    const azimuthDeg = (radToDeg(pos.azimuth) + 180) % 360;
    const altitudeDeg = radToDeg(pos.altitude);
    return { azimuthDeg, altitudeDeg, pos };
  }

  function destinationPoint(lat, lon, bearingDeg, distanceM) {
    const R = 6371000;
    const brng = (bearingDeg * Math.PI) / 180;
    const lat1 = (lat * Math.PI) / 180;
    const lon1 = (lon * Math.PI) / 180;
    const d = distanceM / R;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  }

  function buildSunPath(lat, lon, date = new Date()) {
    const points = [];
    const times = SunCalc.getTimes(date, lat, lon);
    const start = times.sunrise.getTime();
    const end = times.sunset.getTime();

    if (isNaN(start) || isNaN(end)) return points;

    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = new Date(start + ((end - start) * i) / steps);
      const { pos } = getSunPosition(lat, lon, t);
      if (pos.altitude > 0) {
        const az = (radToDeg(pos.azimuth) + 180) % 360;
        points.push(destinationPoint(lat, lon, az, 80 + radToDeg(pos.altitude) * 1.5));
      }
    }
    return points;
  }

  function buildFacadeSectors(lat, lon, activeFacadeId) {
    const sectors = [];
    const distance = 60;

    for (const facade of FacadeLogic.getAllFacades()) {
      const id = facade.id;
      const arcPoints = [[lat, lon]];
      const step = Math.max(3, facade.spread / 10);

      for (let b = facade.start; b <= facade.end; b += step) {
        arcPoints.push(destinationPoint(lat, lon, b, distance));
      }
      arcPoints.push([lat, lon]);

      const isActive = activeFacadeId === id;
      sectors.push({
        id,
        points: arcPoints,
        color: facade.color,
        opacity: isActive ? 0.45 : 0.08,
        weight: isActive ? 2 : 1,
      });
    }
    return sectors;
  }

  function clearVisualization(map) {
    if (!map) return;
    try {
      if (sunRayLayer) map.removeLayer(sunRayLayer);
      if (sunPathLayer) map.removeLayer(sunPathLayer);
      if (sunMarkerLayer) map.removeLayer(sunMarkerLayer);
      facadeLayers.forEach((layer) => map.removeLayer(layer));
    } catch {
      /* Karte wurde bereits entfernt */
    }
    sunRayLayer = null;
    sunPathLayer = null;
    sunMarkerLayer = null;
    facadeLayers = [];
  }

  function updateMapVisualization(mapModule, lat, lon, facade, date = new Date()) {
    const map = mapModule.getMap();
    if (!map) return;

    const { azimuthDeg, altitudeDeg } = getSunPosition(lat, lon, date);

    if (sunRayLayer) map.removeLayer(sunRayLayer);
    if (sunPathLayer) map.removeLayer(sunPathLayer);
    if (sunMarkerLayer) map.removeLayer(sunMarkerLayer);
    facadeLayers.forEach((l) => map.removeLayer(l));
    facadeLayers = [];

    if (altitudeDeg > 0) {
      const rayEnd = destinationPoint(lat, lon, azimuthDeg, 120);
      sunRayLayer = L.polyline([[lat, lon], rayEnd], {
        color: '#ffd700',
        weight: 3,
        dashArray: '8 6',
        opacity: 0.9,
      }).addTo(map);

      sunMarkerLayer = L.circleMarker(rayEnd, {
        radius: 6,
        color: '#ffd700',
        fillColor: '#fff176',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
    }

    const pathPoints = buildSunPath(lat, lon, date);
    if (pathPoints.length > 1) {
      sunPathLayer = L.polyline(pathPoints, {
        color: '#f5a623',
        weight: 2,
        opacity: 0.5,
        smoothFactor: 1,
      }).addTo(map);
    }

    const sectors = buildFacadeSectors(lat, lon, facade?.id);
    const selectedId = FacadeLogic.getSelectedId();
    sectors.forEach((s) => {
      const isSelected = s.id === selectedId;
      const layer = L.polygon(s.points, {
        color: s.color,
        fillColor: s.color,
        fillOpacity: s.opacity,
        weight: isSelected ? 3 : s.weight,
        dashArray: isSelected ? null : '4 4',
      }).addTo(map);
      facadeLayers.push(layer);
    });

    if (window.FacadeEditor) FacadeEditor.updateHandlePositions();

    return { azimuthDeg, altitudeDeg };
  }

  function updateSunInfo(azimuthDeg, altitudeDeg, date = new Date()) {
    document.getElementById('azimuthVal').textContent = `${azimuthDeg.toFixed(1)}°`;
    document.getElementById('altitudeVal').textContent = `${altitudeDeg.toFixed(1)}°`;
    document.getElementById('timeVal').textContent = date.toLocaleTimeString('de-DE');
  }

  return {
    getSunPosition,
    updateMapVisualization,
    clearVisualization,
    updateSunInfo,
    buildSunPath,
    destinationPoint,
  };
})();
