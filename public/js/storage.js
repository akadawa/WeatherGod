const AppStorage = (() => {
  const LOCAL_KEY = 'weathergod-state';
  const LEGACY_LOCAL_KEY = 'solarpilot-state';
  let cache = null;
  let saveTimer = null;
  let ready = false;
  let pendingSave = false;

  function migrateLegacyKey() {
    try {
      if (localStorage.getItem(LOCAL_KEY) != null) return;
      const legacy = localStorage.getItem(LEGACY_LOCAL_KEY);
      if (legacy == null) return;
      localStorage.setItem(LOCAL_KEY, legacy);
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    } catch {
      /* ignorieren */
    }
  }

  function loadLocal() {
    migrateLegacyKey();
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(stripMeta(data)));
    } catch (err) {
      console.warn('[Storage] localStorage:', err.message);
    }
  }

  function stripMeta(data) {
    if (!data) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith('_'))
    );
  }

  function localDiffersFromServer(local, server) {
    const a = stripMeta(local);
    const b = stripMeta(server);
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  async function pushToServer(data, { keepalive = false } = {}) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stripMeta(data)),
      keepalive,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Speichern fehlgeschlagen (${res.status})`);
    }

    cache = await res.json();
    saveLocal(cache);
    pendingSave = false;
    return cache;
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!cache || !pendingSave) return;
    try {
      await pushToServer(cache, { keepalive: true });
    } catch (err) {
      console.warn('[Storage] Flush:', err.message);
    }
  }

  function schedulePush() {
    pendingSave = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await pushToServer(cache);
      } catch (err) {
        console.warn('[Storage] Server:', err.message);
      }
    }, 350);
  }

  async function saveImmediate(partial) {
    cache = { ...(cache || {}), ...partial };
    saveLocal(cache);
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingSave = false;
    try {
      await pushToServer(cache);
    } catch (err) {
      console.warn('[Storage] Sofort-Speichern:', err.message);
      pendingSave = true;
      schedulePush();
    }
  }

  async function init() {
    if (ready) return cache;

    const local = loadLocal();

    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (!res.ok) throw new Error('API nicht erreichbar');

      const payload = await res.json();
      const { _persisted, _updatedAt, ...serverSettings } = payload;

      if (_persisted) {
        // DB ist maßgeblich – localStorage nur als Cache aktualisieren
        cache = payload;
        saveLocal(cache);
      } else if (local && localDiffersFromServer(local, serverSettings)) {
        cache = await pushToServer({ ...serverSettings, ...stripMeta(local) });
      } else {
        cache = payload;
        saveLocal(cache);
      }
    } catch (err) {
      console.warn('[Storage] Fallback localStorage:', err.message);
      cache = local || {};
    }

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', () => flush());

    ready = true;
    return cache;
  }

  function load() {
    if (!cache) return null;
    const { _persisted, _updatedAt, ...settings } = cache;
    return { ...settings };
  }

  function save(partial, { immediate = false } = {}) {
    if (immediate) {
      saveImmediate(partial);
      return;
    }
    cache = { ...(cache || {}), ...partial };
    saveLocal(cache);
    schedulePush();
  }

  return { init, load, save, saveImmediate, flush };
})();
