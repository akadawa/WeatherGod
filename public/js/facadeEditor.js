const FacadeEditor = (() => {
  const HANDLE_DISTANCE = 70;
  let handleGroup = null;
  let handles = {};
  let updateTimer = null;

  function bearingBetween(lat1, lon1, lat2, lon2) {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  function makeHandleIcon(className, label) {
    return L.divIcon({
      className: `facade-handle ${className}`,
      html: `<span title="${label}"></span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  function scheduleMapUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => window.WeatherGodApp?.runUpdate(), 50);
  }

  function init(map) {
    handleGroup = L.layerGroup().addTo(map);
    refresh();
  }

  function clearHandles() {
    if (!handleGroup) return;
    handleGroup.clearLayers();
    handles = {};
  }

  function getHandlePositions(lat, lon, sector) {
    return {
      center: SunEngine.destinationPoint(lat, lon, sector.bearing, HANDLE_DISTANCE),
      left: SunEngine.destinationPoint(lat, lon, sector.start, HANDLE_DISTANCE),
      right: SunEngine.destinationPoint(lat, lon, sector.end, HANDLE_DISTANCE),
    };
  }

  function updateHandlePositions() {
    if (!handles.center || !window.MapModule) return;

    const { lat, lon } = MapModule.getLocation();
    const sector = FacadeLogic.getFacade(FacadeLogic.getSelectedId());
    if (!sector) return;
    const pts = getHandlePositions(lat, lon, sector);

    handles.center.setLatLng(pts.center);
    handles.left.setLatLng(pts.left);
    handles.right.setLatLng(pts.right);
  }

  function createDraggableMarker(lat, lon, icon, onDrag, onDragEnd) {
    const marker = L.marker([lat, lon], {
      icon,
      draggable: true,
      zIndexOffset: 1000,
    });

    marker.on('drag', (e) => {
      L.DomEvent.stopPropagation(e);
      onDrag(e.target.getLatLng());
    });

    marker.on('dragend', (e) => {
      L.DomEvent.stopPropagation(e);
      onDragEnd();
    });

    marker.on('mousedown touchstart', (e) => {
      L.DomEvent.stopPropagation(e);
    });

    handleGroup.addLayer(marker);
    return marker;
  }

  function refresh() {
    if (!handleGroup || !window.MapModule) return;

    const map = MapModule.getMap();
    if (!map) return;

    clearHandles();

    const { lat, lon } = MapModule.getLocation();
    const id = FacadeLogic.getSelectedId();
    const sector = FacadeLogic.getFacade(id);
    if (!sector) return;

    const pts = getHandlePositions(lat, lon, sector);

    const finishDrag = () => {
      FacadeLogic.syncEditorInputs(id);
      FacadeLogic.persist();
      window.WeatherGodApp?.runUpdate();
    };

    handles.center = createDraggableMarker(
      pts.center[0], pts.center[1],
      makeHandleIcon('facade-handle-center', 'Alle Sektoren drehen'),
      (pos) => {
        const bearing = bearingBetween(lat, lon, pos.lat, pos.lng);
        FacadeLogic.rotateToCenter(id, bearing, { silent: true });
        updateHandlePositions();
        scheduleMapUpdate();
      },
      finishDrag
    );

    handles.left = createDraggableMarker(
      pts.left[0], pts.left[1],
      makeHandleIcon('facade-handle-edge', 'Grenze zur Nachbarfassade'),
      (pos) => {
        const edgeBearing = bearingBetween(lat, lon, pos.lat, pos.lng);
        FacadeLogic.moveLeftBoundary(id, edgeBearing, { silent: true });
        updateHandlePositions();
        scheduleMapUpdate();
      },
      finishDrag
    );

    handles.right = createDraggableMarker(
      pts.right[0], pts.right[1],
      makeHandleIcon('facade-handle-edge', 'Grenze zur Nachbarfassade'),
      (pos) => {
        const edgeBearing = bearingBetween(lat, lon, pos.lat, pos.lng);
        FacadeLogic.moveRightBoundary(id, edgeBearing, { silent: true });
        updateHandlePositions();
        scheduleMapUpdate();
      },
      finishDrag
    );
  }

  return { init, refresh, updateHandlePositions, bearingBetween };
})();

window.FacadeEditor = FacadeEditor;
