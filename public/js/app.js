const WeatherGodApp = (() => {
  const LIVE_INTERVAL_MS = 30 * 1000;

  let config = {};
  let liveTimer = null;
  let intervalMinutes = 5;
  let westThreshold = 15;
  let monitoring = false;
  let lastError = null;
  let monitorStatusTimer = null;

  function countEnabledNotifications() {
    return NotifyRules.countActiveRules?.() ?? 0;
  }

  function formatMonitorTime(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleTimeString('de-DE');
  }

  function updateMonitorUI(status = {}) {
    const box = document.getElementById('monitorStatusBox');
    const stateEl = document.getElementById('monitorStateVal');
    const lastEl = document.getElementById('monitorLastCheckVal');
    const facadeEl = document.getElementById('monitorFacadeVal');
    const ntfyEl = document.getElementById('monitorNtfyVal');
    const hintEl = document.getElementById('monitorHint');
    const applyBtn = document.getElementById('applyBtn');
    const stopBtn = document.getElementById('stopBtn');

    monitoring = !!status.active;
    applyBtn?.classList.toggle('is-running', monitoring);
    if (stopBtn) stopBtn.disabled = !monitoring;

    if (!box || !stateEl) return;

    box.classList.remove('is-active', 'is-error');

    if (!monitoring) {
      stateEl.textContent = 'Inaktiv';
      if (lastEl) lastEl.textContent = '–';
      if (facadeEl) facadeEl.textContent = '–';
      if (ntfyEl) ntfyEl.textContent = status.ntfyConfigured ? 'Topic gesetzt' : 'Topic fehlt';
      if (hintEl) {
        hintEl.textContent = 'Starten aktiviert Server-Checks im Hintergrund – bleibt aktiv nach Seitenwechsel und Server-Neustart, bis du stoppst.';
      }
      return;
    }

    const interval = status.intervalMinutes || intervalMinutes;
    const enabled = countEnabledNotifications();
    stateEl.textContent = `Aktiv (alle ${interval} Min.)`;
    box.classList.add('is-active');

    if (lastEl) lastEl.textContent = formatMonitorTime(status.lastCheck);
    if (facadeEl) {
      facadeEl.textContent = status.lastFacade?.label
        ? `${status.lastFacade.label}seite`
        : 'keine (Sonne unter Horizont)';
    }

    if (ntfyEl) {
      if (!status.ntfyConfigured) {
        ntfyEl.textContent = 'Topic fehlt';
      } else if (enabled === 0) {
        ntfyEl.textContent = 'Kein Push eingeschaltet';
      } else {
        ntfyEl.textContent = `${enabled} Push-Regel(n) aktiv`;
      }
    }

    if (status.lastError) {
      box.classList.remove('is-active');
      box.classList.add('is-error');
      stateEl.textContent = 'Fehler';
      if (hintEl) hintEl.textContent = status.lastError;
      return;
    }

    if (hintEl) {
      hintEl.textContent = enabled === 0 && status.ntfyConfigured
        ? 'Monitor läuft im Hintergrund, aber es sind keine Push-Regeln aktiv – unten bei ntfy mindestens eine Fassade ankreuzen.'
        : 'Server-Monitor läuft im Hintergrund (auch nach Seitenwechsel und Neustart). Push bei Fassadenwechsel.';
    }
  }

  async function refreshMonitorStatus() {
    try {
      const res = await fetch('/api/monitor/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('Status nicht erreichbar');
      const status = await res.json();
      updateMonitorUI(status);
      return status;
    } catch (err) {
      console.warn('[Monitor Status]', err.message);
      return null;
    }
  }

  function startMonitorStatusPolling() {
    stopMonitorStatusPolling();
    monitorStatusTimer = setInterval(refreshMonitorStatus, 15000);
  }

  function stopMonitorStatusPolling() {
    if (monitorStatusTimer) {
      clearInterval(monitorStatusTimer);
      monitorStatusTimer = null;
    }
  }

  function updateNtfyHint() {
    const topic = document.getElementById('ntfyTopicInput')?.value.trim() || '';
    const hint = document.getElementById('ntfyHint');
    if (!hint) return;

    if (!topic) {
      hint.textContent = 'Topic eintragen. Push bei Fassadenwechsel (sichtbar / weg) – Überwachung starten.';
      return;
    }

    hint.textContent = `Topic „${topic}“ – Push bei Sonnensichtbarkeit und/oder wenn Sonne die Fassade verlässt.`;
  }

  async function saveNtfyTopic() {
    const input = document.getElementById('ntfyTopicInput');
    if (!input) return;

    const topic = input.value.trim();
    input.value = topic;

    try {
      await AppStorage.saveImmediate({ ntfyTopic: topic });
      config.ntfyConfigured = !!topic;
      config.ntfyAutoAllowed = !config.isDev && topic;
      updateNtfyHint();
    } catch (err) {
      showError(`ntfy Topic speichern: ${err.message}`);
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Config nicht erreichbar');
      config = await res.json();
      westThreshold = config.westAngleThreshold || 15;
      document.getElementById('westThresholdInput').value = westThreshold;
    } catch (err) {
      showError(`Konfiguration: ${err.message}`);
    }
  }

  function showError(msg) {
    lastError = msg;
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.hidden = false;
    console.warn('[WeatherGod]', msg);
  }

  function clearError() {
    lastError = null;
    document.getElementById('errorBox').hidden = true;
  }

  function runUpdate() {
    try {
      clearError();
      const { lat, lon } = MapModule.getLocation();
      const now = new Date();

      const { azimuthDeg, altitudeDeg } = SunEngine.getSunPosition(lat, lon, now);
      const facade = FacadeLogic.getIlluminatedFacade(azimuthDeg, altitudeDeg, westThreshold);

      SunEngine.updateSunInfo(azimuthDeg, altitudeDeg, now);
      FacadeLogic.updateSunsetFacadeInfo(lat, lon, now);
      SunEngine.updateMapVisualization(MapModule, lat, lon, facade, now);
      FacadeLogic.updateFacadeUI(facade);
    } catch (err) {
      showError(`Aktualisierung fehlgeschlagen: ${err.message}. Nächstes Intervall wird abgewartet.`);
    }
  }

  function startLiveView() {
    stopLiveView();
    liveTimer = setInterval(runUpdate, LIVE_INTERVAL_MS);
  }

  function stopLiveView() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  async function startMonitoring() {
    intervalMinutes = Math.max(1, parseInt(document.getElementById('intervalInput').value, 10) || 5);
    westThreshold = Math.max(5, parseInt(document.getElementById('westThresholdInput').value, 10) || 15);
    document.getElementById('intervalInput').value = intervalMinutes;
    document.getElementById('westThresholdInput').value = westThreshold;

    monitoring = true;
    runUpdate();

    const { lat, lon } = MapModule.getLocation();
    await AppStorage.saveImmediate({
      intervalMinutes,
      westThreshold,
      facadeNotifications: NotifyRules.collect(),
    });

    try {
      const res = await fetch('/api/monitor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, intervalMinutes }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Start fehlgeschlagen');
      }

      updateMonitorUI(data);
      startMonitorStatusPolling();
    } catch (err) {
      monitoring = false;
      updateMonitorUI({ active: false, ntfyConfigured: config.ntfyConfigured });
      showError(`Server-Monitor: ${err.message}. Lokale Anzeige läuft weiter.`);
    }
  }

  async function stopMonitoring() {
    monitoring = false;
    stopMonitorStatusPolling();

    try {
      const res = await fetch('/api/monitor/stop', { method: 'POST' });
      const data = await res.json();
      updateMonitorUI(data);
    } catch {
      updateMonitorUI({ active: false, ntfyConfigured: config.ntfyConfigured });
    }
  }

  function onLocationChanged(lat, lon) {
    FacadeEditor?.updateHandlePositions();
    runUpdate();
    if (monitoring) {
      fetch('/api/monitor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, intervalMinutes }),
      })
        .then((res) => res.json())
        .then((data) => updateMonitorUI(data))
        .catch(() => {});
    }
  }

  async function testNtfyCurrent() {
    const btn = document.getElementById('ntfyTestCurrentBtn');
    const status = document.getElementById('ntfyStatus');
    const reportEl = document.getElementById('ntfyTestReport');
    const { lat, lon } = MapModule.getLocation();

    btn.disabled = true;
    status.textContent = 'Prüfe aktuellen Sonnenstand…';
    status.className = 'status-msg';
    if (reportEl) reportEl.hidden = true;

    try {
      const res = await fetch('/api/ntfy/test-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Test fehlgeschlagen');
      }

      renderNtfyTestReport(data);

      if (data.sentCount > 0) {
        status.textContent = `${data.sentCount} Push(s) für aktuellen Stand gesendet.`;
        status.className = 'status-msg ok';
      } else {
        status.textContent = 'Kein Push gesendet – siehe Vorschau unten.';
        status.className = 'status-msg';
      }
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-msg err';
      if (reportEl) reportEl.hidden = true;
    } finally {
      btn.disabled = false;
    }
  }

  function renderNtfyTestReport(data) {
    const reportEl = document.getElementById('ntfyTestReport');
    if (!reportEl) return;

    const facadeLabel = data.currentFacade?.label
      ? `${data.currentFacade.label}seite`
      : 'keine (Sonne unter Horizont)';

    let html = `
      <div class="ntfy-test-report-head">
        Aktuell: <strong>${facadeLabel}</strong>
        · Azimut ${data.azimuthDeg ?? '–'}° · Höhe ${data.altitudeDeg ?? '–'}°
      </div>
    `;

    for (const item of data.items || []) {
      const eventLabel = item.event === 'enter'
        ? 'Sonne sichtbar'
        : item.event === 'leave'
          ? 'Sonne weg'
          : 'Status';
      const sentLabel = item.sent ? 'Gesendet' : 'Nur Vorschau';

      html += `
        <div class="ntfy-test-item ${item.sent ? 'is-sent' : ''}">
          <strong>${sentLabel}: ${eventLabel}${item.label ? ` (${item.label})` : ''}</strong>
          <p class="msg">${escapeHtml(item.message)}</p>
          <p class="note">${escapeHtml(item.note || '')}</p>
        </div>
      `;
    }

    reportEl.innerHTML = html;
    reportEl.hidden = false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function testNtfy() {
    const btn = document.getElementById('ntfyTestBtn');
    const status = document.getElementById('ntfyStatus');
    btn.disabled = true;
    status.textContent = 'Sende Test-Push…';
    status.className = 'status-msg';

    try {
      const res = await fetch('/api/ntfy/test', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unbekannter Fehler');
      }

      status.textContent = `Push gesendet (${data.topic})`;
      status.className = 'status-msg ok';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-msg err';
    } finally {
      btn.disabled = false;
    }
  }

  async function handleSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    btn.disabled = true;

    try {
      clearError();
      const result = await MapModule.searchAddress(input.value);
      if (result) {
        onLocationChanged(result.lat, result.lon);
      }
    } catch (err) {
      showError(`Suche: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  function bindFacadeEvents() {
    document.querySelectorAll('.facade-card').forEach((card) => {
      card.addEventListener('click', () => {
        FacadeLogic.setSelectedId(card.dataset.facade);
        runUpdate();
      });
    });

    document.getElementById('facadeBearingInput').addEventListener('input', (e) => {
      const id = FacadeLogic.getSelectedId();
      FacadeLogic.rotateToCenter(id, parseInt(e.target.value, 10));
      FacadeEditor.updateHandlePositions();
      runUpdate();
    });

    document.getElementById('facadeSpreadInput').addEventListener('input', (e) => {
      const id = FacadeLogic.getSelectedId();
      FacadeLogic.setFacadeWidth(id, parseInt(e.target.value, 10));
      FacadeEditor.updateHandlePositions();
      runUpdate();
    });

    document.getElementById('facadeResetBtn').addEventListener('click', () => {
      FacadeLogic.resetPartition();
      FacadeEditor.refresh();
      runUpdate();
    });
  }

  function bindEvents() {
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSearch();
    });
    document.getElementById('applyBtn').addEventListener('click', startMonitoring);
    document.getElementById('stopBtn').addEventListener('click', stopMonitoring);
    document.getElementById('ntfyTestCurrentBtn').addEventListener('click', testNtfyCurrent);
    document.getElementById('ntfyTestBtn').addEventListener('click', testNtfy);
    document.getElementById('ntfyTopicInput').addEventListener('change', saveNtfyTopic);
    document.getElementById('ntfyTopicInput').addEventListener('blur', saveNtfyTopic);
  }

  async function init() {
    await fetchConfig();
    ProjectNav.init();
    await AppStorage.init();
    ProjectNav.syncFromSettings(AppStorage.load());

    const saved = AppStorage.load();
    if (saved?.intervalMinutes) {
      intervalMinutes = saved.intervalMinutes;
      document.getElementById('intervalInput').value = intervalMinutes;
    }
    if (saved?.westThreshold) {
      westThreshold = saved.westThreshold;
      document.getElementById('westThresholdInput').value = westThreshold;
    }

    const topicInput = document.getElementById('ntfyTopicInput');
    if (topicInput) {
      topicInput.value = saved?.ntfyTopic || config.ntfyEnvTopic || '';
      updateNtfyHint();
    }

    FacadeLogic.loadFromStorage(saved);
    NotifyRules.buildUI(saved?.facadeNotifications);

    MapModule.init(config.defaultLat, config.defaultLon);
    FacadeEditor.init(MapModule.getMap());
    FacadeLogic.updateSelectionUI();
    bindEvents();
    bindFacadeEvents();
    runUpdate();
    startLiveView();

    const status = await refreshMonitorStatus();
    if (status?.active) {
      startMonitorStatusPolling();
    } else {
      updateMonitorUI({ active: false, ntfyConfigured: config.ntfyConfigured });
    }
  }

  return { init, onLocationChanged, runUpdate };
})();

window.WeatherGodApp = WeatherGodApp;
document.addEventListener('DOMContentLoaded', () => WeatherGodApp.init());
