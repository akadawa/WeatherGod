const DashboardRadar = (() => {
  const API_URL = '/api/radar/maps';
  const TILE_SIZE = 256;
  const COLOR_SCHEME = 2;
  const TILE_OPTIONS = '1_1';
  const API_REFRESH_MS = 2 * 60 * 1000;
  const DEFAULT_ZOOM = 7;
  const MIN_ZOOM = 6;
  const MAP_MAX_ZOOM = 12;
  const PAST_NATIVE_ZOOM = 7;
  const PAST_MAX_ZOOM = 7;

  let map = null;
  let baseLayer = null;
  let radarLayer = null;
  let locationMarker = null;
  let hostEl = null;
  let widgetEl = null;
  let timeEl = null;
  let stateEl = null;
  let creditEl = null;

  let currentLat = null;
  let currentLon = null;
  let frames = [];
  let pendingMaps = null;
  let apiTimer = null;
  let loadSeq = 0;

  function formatFrameTime(frame) {
    if (!frame?.time) return '–';
    const date = new Date(frame.time * 1000);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function buildFrames(data) {
    const pastHost = data.meta?.pastHost || data.host;
    const past = (Array.isArray(data?.radar?.past) ? data.radar.past : [])
      .map((frame) => ({
        ...frame,
        kind: 'past',
        tileHost: pastHost,
        maxNativeZoom: data.meta?.pastMaxZoom || PAST_NATIVE_ZOOM,
      }));
    return past;
  }

  function latestPastFrameIndex() {
    return frames.length ? frames.length - 1 : -1;
  }

  function frameTileUrl(frame) {
    if (!frame?.tileHost || !frame.path) return '';
    return `${frame.tileHost}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${TILE_OPTIONS}.png`;
  }

  function updateCredit(meta) {
    if (!creditEl || !meta) return;
    creditEl.textContent = meta.creditLabel || 'RainViewer';
    creditEl.href = meta.creditUrl || 'https://www.rainviewer.com/';
    if (meta.creditTitle) creditEl.title = meta.creditTitle;
    else creditEl.removeAttribute('title');
  }

  function updateStatusLabel() {
    const frame = frames[latestPastFrameIndex()];
    if (!frame) {
      if (timeEl) timeEl.textContent = '–';
      if (stateEl) stateEl.textContent = 'Keine Radardaten';
      return;
    }

    if (timeEl) timeEl.textContent = formatFrameTime(frame);
    if (stateEl) stateEl.textContent = 'Aktuelle Messung';
  }

  function showCurrentFrame() {
    if (!map || !frames.length) {
      updateStatusLabel();
      return;
    }

    const frame = frames[latestPastFrameIndex()];
    if (!frame) return;

    if (radarLayer) {
      map.removeLayer(radarLayer);
      radarLayer = null;
    }

    map.setMinZoom(MIN_ZOOM);
    map.setMaxZoom(PAST_MAX_ZOOM);
    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) map.setZoom(MIN_ZOOM);
    else if (zoom > PAST_MAX_ZOOM) map.setZoom(PAST_MAX_ZOOM);

    radarLayer = L.tileLayer(frameTileUrl(frame), {
      tileSize: TILE_SIZE,
      opacity: 0.82,
      maxNativeZoom: frame.maxNativeZoom || PAST_NATIVE_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: PAST_MAX_ZOOM,
    });
    radarLayer.addTo(map);
    widgetEl?.classList.remove('is-nowcast-frame');
    updateStatusLabel();
  }

  function applyMapsPayload(data) {
    if (!data || !map) return false;
    updateCredit(data.meta);
    frames = buildFrames(data);
    showCurrentFrame();
    return true;
  }

  function ingestMaps(data) {
    if (!data) return;
    pendingMaps = data;
    applyMapsPayload(data);
    if (map) pendingMaps = null;
  }

  async function loadFrames({ forceFetch = false } = {}) {
    const seq = ++loadSeq;
    if (!forceFetch && pendingMaps && map) {
      const data = pendingMaps;
      pendingMaps = null;
      if (applyMapsPayload(data)) return;
    }

    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Radardaten nicht verfügbar');
      const data = await res.json();
      if (seq !== loadSeq || !map) return;

      updateCredit(data.meta);
      frames = buildFrames(data);
      showCurrentFrame();
    } catch (err) {
      console.warn('[DashboardRadar]', err.message);
      if (timeEl) timeEl.textContent = '–';
      if (stateEl) stateEl.textContent = 'Radardaten nicht verfügbar';
    }
  }

  function handleAction(action) {
    if (action === 'zoom-in') {
      map?.zoomIn();
    } else if (action === 'zoom-out') {
      map?.zoomOut();
    }
  }

  function bindControls() {
    if (!widgetEl || widgetEl.dataset.radarBound === '1') return;
    widgetEl.dataset.radarBound = '1';

    widgetEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-radar-action]');
      if (!btn || btn.disabled) return;
      handleAction(btn.dataset.radarAction);
    });
  }

  function destroy() {
    loadSeq += 1;
    if (apiTimer) {
      clearInterval(apiTimer);
      apiTimer = null;
    }
    if (widgetEl) delete widgetEl.dataset.radarBound;
    if (map) {
      map.remove();
      map = null;
    }
    baseLayer = null;
    radarLayer = null;
    locationMarker = null;
    hostEl = null;
    widgetEl = null;
    timeEl = null;
    stateEl = null;
    creditEl = null;
    currentLat = null;
    currentLon = null;
    frames = [];
    pendingMaps = null;
  }

  function mount(host, lat, lon, controls) {
    if (!host || typeof L === 'undefined') return;

    const sameSpot = map
      && currentLat === lat
      && currentLon === lon
      && hostEl === host;

    if (sameSpot) {
      invalidateSize();
      loadFrames({ forceFetch: !pendingMaps });
      return;
    }

    destroy();

    hostEl = host;
    widgetEl = host.closest('.radar-widget') || controls?.closest('.radar-widget') || null;
    currentLat = lat;
    currentLon = lon;
    timeEl = controls?.querySelector('.radar-time');
    stateEl = controls?.querySelector('.radar-state');
    creditEl = controls?.querySelector('.radar-credit');
    bindControls();

    map = L.map(host, {
      center: [lat, lon],
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: PAST_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
    });

    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAP_MAX_ZOOM,
      opacity: 0.92,
    }).addTo(map);

    locationMarker = L.circleMarker([lat, lon], {
      radius: 6,
      color: '#ffffff',
      fillColor: '#3388ff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    loadFrames({ forceFetch: !pendingMaps });
    apiTimer = setInterval(() => loadFrames({ forceFetch: true }), API_REFRESH_MS);

    window.setTimeout(() => {
      if (map) map.invalidateSize();
    }, 60);
    window.setTimeout(() => {
      if (map) map.invalidateSize();
    }, 320);
  }

  function invalidateSize() {
    if (!map) return;
    map.invalidateSize();
  }

  function refresh() {
    if (!map) return;
    loadFrames({ forceFetch: !pendingMaps });
  }

  return {
    mount,
    destroy,
    invalidateSize,
    refresh,
    ingestMaps,
  };
})();
