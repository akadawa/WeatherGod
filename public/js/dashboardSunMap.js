const DashboardSunMap = (() => {
  let map = null;
  let tileLayer = null;
  let locationMarker = null;
  let tickTimer = null;
  let currentLat = null;
  let currentLon = null;

  const mapAdapter = { getMap: () => map };

  function resolveActiveFacade() {
    if (typeof FacadeLogic === 'undefined' || typeof SunEngine === 'undefined') return null;
    const saved = AppStorage.load?.() || {};
    const westThreshold = saved.westThreshold ?? 15;
    const { azimuthDeg, altitudeDeg } = SunEngine.getSunPosition(currentLat, currentLon);
    if (altitudeDeg <= 0) return null;
    return FacadeLogic.getIlluminatedFacade(azimuthDeg, altitudeDeg, westThreshold);
  }

  function refreshVisualization() {
    if (!map || currentLat == null || currentLon == null) return;
    SunEngine.updateMapVisualization(mapAdapter, currentLat, currentLon, resolveActiveFacade());
  }

  function destroy() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (map) {
      SunEngine.clearVisualization(map);
      map.remove();
      map = null;
    }
    tileLayer = null;
    locationMarker = null;
    currentLat = null;
    currentLon = null;
  }

  function mount(host, lat, lon) {
    destroy();
    if (!host || typeof L === 'undefined') return;

    currentLat = lat;
    currentLon = lon;

    const saved = AppStorage.load?.() || {};
    if (typeof FacadeLogic !== 'undefined') {
      FacadeLogic.loadFromStorage(saved);
    }

    const view = saved.mapView === 'satellite' ? 'satellite' : 'map';
    const zoom = Math.max(Number(saved.zoom) || 16, 15);

    map = L.map(host, {
      center: [lat, lon],
      zoom,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    });
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 },
    );

    tileLayer = view === 'satellite' ? satelliteLayer : osmLayer;
    tileLayer.addTo(map);

    locationMarker = L.circleMarker([lat, lon], {
      radius: 5,
      color: '#ffffff',
      fillColor: '#3388ff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    refreshVisualization();

    tickTimer = setInterval(refreshVisualization, 30000);

    window.setTimeout(() => {
      if (!map) return;
      map.invalidateSize();
      refreshVisualization();
    }, 60);
    window.setTimeout(() => {
      if (map) map.invalidateSize();
    }, 300);
  }

  function invalidateSize() {
    if (!map) return;
    map.invalidateSize();
    refreshVisualization();
  }

  return {
    mount,
    destroy,
    invalidateSize,
    refresh: refreshVisualization,
  };
})();
