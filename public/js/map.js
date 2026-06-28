const MapModule = (() => {
  let map = null;
  let marker = null;
  let osmLayer = null;
  let satelliteLayer = null;
  let activeLayer = null;
  let currentView = 'map';
  let currentLat = null;
  let currentLon = null;
  let locationLocked = false;
  let saveTimer = null;

  let suggestTimer = null;
  let suggestAbort = null;
  let suggestItems = [];
  let activeSuggestIndex = -1;

  const PHOTON_URL = 'https://photon.komoot.io/api/';

  function persistState(extra = {}, immediate = false) {
    if (!map) return;

    const data = {
      lat: currentLat,
      lon: currentLon,
      centerLat: map.getCenter().lat,
      centerLon: map.getCenter().lng,
      zoom: map.getZoom(),
      mapView: currentView,
      ...extra,
    };

    if (immediate) {
      AppStorage.saveImmediate(data);
    } else {
      AppStorage.save(data);
    }
  }

  function schedulePersist(extra = {}) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistState(extra, true), 300);
  }

  function updateViewToggleUI() {
    const btn = document.getElementById('mapViewToggle');
    if (!btn) return;
    const isSatellite = currentView === 'satellite';
    btn.textContent = isSatellite ? 'Karte' : 'Satellit';
    btn.classList.toggle('is-satellite', isSatellite);
    btn.setAttribute('aria-pressed', isSatellite ? 'true' : 'false');
  }

  function setMapView(view) {
    if (!map || view === currentView) return;
    if (view !== 'map' && view !== 'satellite') return;

    if (activeLayer) map.removeLayer(activeLayer);
    activeLayer = view === 'satellite' ? satelliteLayer : osmLayer;
    activeLayer.addTo(map);
    currentView = view;
    updateViewToggleUI();
    persistState({}, true);
  }

  function toggleMapView() {
    setMapView(currentView === 'map' ? 'satellite' : 'map');
  }

  function formatPhotonLabel(props) {
    const streetLine = [props.name, props.housenumber, props.street]
      .filter(Boolean)
      .join(' ')
      .trim();
    const placeLine = [props.postcode, props.city || props.locality, props.state]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (streetLine && placeLine && !placeLine.includes(streetLine)) {
      return `${streetLine}, ${placeLine}`;
    }
    return streetLine || placeLine || props.country || 'Adresse';
  }

  function canChangeLocation() {
    return !locationLocked;
  }

  function updateLocationLockUI() {
    const btn = document.getElementById('locationLockBtn');
    const input = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const mapEl = document.getElementById('map');

    if (btn) {
      btn.setAttribute('aria-pressed', locationLocked ? 'true' : 'false');
      btn.classList.toggle('is-locked', locationLocked);
      const label = locationLocked
        ? 'Standort ist festgesetzt – klicken zum Entsperren'
        : 'Standort festsetzen';
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }

    if (input) input.disabled = locationLocked;
    if (searchBtn) searchBtn.disabled = locationLocked;

    if (marker?.dragging) {
      if (locationLocked) marker.dragging.disable();
      else marker.dragging.enable();
    }

    if (mapEl) mapEl.classList.toggle('location-locked', locationLocked);
  }

  function setLocationLocked(locked, { persist = true } = {}) {
    locationLocked = !!locked;
    if (locationLocked) hideSuggestions();
    updateLocationLockUI();

    if (persist) {
      persistState({ locationLocked }, true);
    }
  }

  function toggleLocationLock() {
    setLocationLocked(!locationLocked);
  }

  function initLocationLockButton() {
    const btn = document.getElementById('locationLockBtn');
    if (!btn) return;
    btn.addEventListener('click', toggleLocationLock);
  }

  function applySearchResult(lat, lon, label) {
    if (!canChangeLocation()) return null;
    const input = document.getElementById('searchInput');
    if (input) input.value = label;

    setLocation(lat, lon, true);
    map.setView([lat, lon], 17);
    persistState({ searchQuery: label }, true);
    hideSuggestions();

    if (window.WeatherGodApp) {
      window.WeatherGodApp.onLocationChanged(lat, lon);
    }

    return { lat, lon, displayName: label };
  }

  async function fetchPhoton(query, limit = 5) {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      lang: 'de',
      lat: String(currentLat),
      lon: String(currentLon),
    });

    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();

    const response = await fetch(`${PHOTON_URL}?${params}`, {
      signal: suggestAbort.signal,
    });

    if (!response.ok) {
      throw new Error(`Adresssuche fehlgeschlagen (${response.status})`);
    }

    const data = await response.json();
    return data.features || [];
  }

  async function searchAddress(query) {
    if (!canChangeLocation()) return null;
    if (!query.trim()) return null;

    const features = await fetchPhoton(query.trim(), 1);
    if (!features.length) {
      throw new Error('Keine Ergebnisse für diese Adresse');
    }

    const hit = features[0];
    const [lon, lat] = hit.geometry.coordinates;
    return applySearchResult(lat, lon, formatPhotonLabel(hit.properties));
  }

  function hideSuggestions() {
    const list = document.getElementById('searchSuggestions');
    const input = document.getElementById('searchInput');
    if (list) {
      list.hidden = true;
      list.innerHTML = '';
    }
    if (input) input.setAttribute('aria-expanded', 'false');
    suggestItems = [];
    activeSuggestIndex = -1;
  }

  function renderSuggestions(features) {
    const list = document.getElementById('searchSuggestions');
    const input = document.getElementById('searchInput');
    if (!list) return;

    suggestItems = features;
    activeSuggestIndex = -1;
    list.innerHTML = '';

    if (!features.length) {
      const li = document.createElement('li');
      li.className = 'suggest-hint';
      li.textContent = 'Keine Treffer';
      list.appendChild(li);
      list.hidden = false;
      if (input) input.setAttribute('aria-expanded', 'true');
      return;
    }

    features.forEach((feature, index) => {
      const li = document.createElement('li');
      li.role = 'option';
      li.textContent = formatPhotonLabel(feature.properties);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectSuggestion(index);
      });
      list.appendChild(li);
    });

    list.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function highlightSuggestion(index) {
    const list = document.getElementById('searchSuggestions');
    if (!list) return;

    list.querySelectorAll('li[role="option"]').forEach((li, i) => {
      li.classList.toggle('active', i === index);
    });
    activeSuggestIndex = index;
  }

  function selectSuggestion(index) {
    const feature = suggestItems[index];
    if (!feature) return;

    const [lon, lat] = feature.geometry.coordinates;
    applySearchResult(lat, lon, formatPhotonLabel(feature.properties));
  }

  function scheduleSuggestions(query) {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async () => {
      if (query.trim().length < 3) {
        hideSuggestions();
        return;
      }

      try {
        const features = await fetchPhoton(query.trim(), 6);
        renderSuggestions(features);
      } catch (err) {
        if (err.name !== 'AbortError') {
          hideSuggestions();
        }
      }
    }, 350);
  }

  function initSearchAutocomplete() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', () => {
      scheduleSuggestions(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSuggestions();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!suggestItems.length) return;
        const next = activeSuggestIndex < suggestItems.length - 1 ? activeSuggestIndex + 1 : 0;
        highlightSuggestion(next);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!suggestItems.length) return;
        const prev = activeSuggestIndex > 0 ? activeSuggestIndex - 1 : suggestItems.length - 1;
        highlightSuggestion(prev);
        return;
      }

      if (e.key === 'Enter' && activeSuggestIndex >= 0) {
        e.preventDefault();
        selectSuggestion(activeSuggestIndex);
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(hideSuggestions, 150);
    });
  }

  // Weltübersicht ohne gespeicherten Standort (kein Default-Standort)
  const MAP_VIEW_FALLBACK = { lat: 0, lon: 0, zoom: 2 };

  function init(defaultLat, defaultLon) {
    const saved = AppStorage.load();
    const lat = saved?.lat ?? defaultLat ?? null;
    const lon = saved?.lon ?? defaultLon ?? null;
    const hasLocation = lat != null && lon != null;
    const zoom = hasLocation ? (saved?.zoom ?? 14) : MAP_VIEW_FALLBACK.zoom;
    const centerLat = hasLocation ? (saved?.centerLat ?? lat) : MAP_VIEW_FALLBACK.lat;
    const centerLon = hasLocation ? (saved?.centerLon ?? lon) : MAP_VIEW_FALLBACK.lon;
    currentView = saved?.mapView === 'satellite' ? 'satellite' : 'map';

    currentLat = hasLocation ? lat : null;
    currentLon = hasLocation ? lon : null;

    map = L.map('map', {
      center: [centerLat, centerLon],
      zoom,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    });

    satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      }
    );

    activeLayer = currentView === 'satellite' ? satelliteLayer : osmLayer;
    activeLayer.addTo(map);

    marker = L.marker(hasLocation ? [currentLat, currentLon] : [centerLat, centerLon], {
      draggable: true,
      opacity: hasLocation ? 1 : 0.85,
    }).addTo(map);

    if (!hasLocation) {
      marker.bindPopup('Bitte Standort auf der Karte wählen oder suchen.').openPopup();
    }

    marker.on('dragend', () => {
      if (!canChangeLocation()) return;
      const pos = marker.getLatLng();
      setLocation(pos.lat, pos.lng, false);
      persistState({}, true);
      if (window.WeatherGodApp) {
        window.WeatherGodApp.onLocationChanged(pos.lat, pos.lng);
      }
    });

    map.on('click', (e) => {
      if (!canChangeLocation()) return;
      setLocation(e.latlng.lat, e.latlng.lng, true);
      persistState({}, true);
      if (window.WeatherGodApp) {
        window.WeatherGodApp.onLocationChanged(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('moveend zoomend', () => schedulePersist());

    const viewToggle = document.getElementById('mapViewToggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', toggleMapView);
      updateViewToggleUI();
    }

    if (saved?.searchQuery) {
      const input = document.getElementById('searchInput');
      if (input) input.value = saved.searchQuery;
    }

    locationLocked = !!saved?.locationLocked;
    initLocationLockButton();
    updateLocationLockUI();
    initSearchAutocomplete();
    updateCoordsDisplay();
    return map;
  }

  function setLocation(lat, lon, moveMarker = true) {
    currentLat = lat;
    currentLon = lon;
    if (moveMarker && marker) {
      marker.setLatLng([lat, lon]);
    }
    updateCoordsDisplay();
  }

  function updateCoordsDisplay() {
    const el = document.getElementById('coordsDisplay');
    if (!el) return;
    if (currentLat == null || currentLon == null) {
      el.textContent = 'Kein Standort – Karte anklicken oder suchen';
      return;
    }
    el.textContent = `${currentLat.toFixed(5)}°, ${currentLon.toFixed(5)}°`;
  }

  function getLocation() {
    return { lat: currentLat, lon: currentLon };
  }

  function getMap() {
    return map;
  }

  function getSavedSettings() {
    return AppStorage.load();
  }

  return {
    init,
    searchAddress,
    setLocation,
    getLocation,
    getMap,
    getSavedSettings,
    persistState,
    setMapView,
    toggleMapView,
    isLocationLocked: () => locationLocked,
    setLocationLocked,
    toggleLocationLock,
  };
})();
