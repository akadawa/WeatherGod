const NotifyRules = (() => {
  const DEFAULT_MESSAGE = '☀️ Die Sonne ist jetzt auf der {fassade}seite. Weg ca. {leaveTime} Uhr.';
  const DEFAULT_LEAVE = '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite. Auf der {naechsteFassade}seite wieder ca. {enterTime} Uhr.';

  const LEGACY_ENTER_MESSAGES = new Set([
    '☀️ Die Sonne ist jetzt auf der {fassade}seite.',
    '☀️ Die Sonne ist jetzt auf der {fassade}seite',
  ]);

  const LEGACY_LEAVE_MESSAGES = new Set([
    '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite.',
    '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite',
    '🌤️ Die Sonne verlässt die {fassade}seite.',
  ]);

  function upgradeEnterMessage(message) {
    const trimmed = (message || '').trim();
    if (!trimmed || LEGACY_ENTER_MESSAGES.has(trimmed)) return DEFAULT_MESSAGE;
    if (!/\{leaveTime\}/i.test(trimmed) && /Die Sonne ist jetzt auf der \{fassade\}seite/i.test(trimmed)) {
      return DEFAULT_MESSAGE;
    }
    return trimmed;
  }

  function upgradeLeaveMessage(message) {
    const trimmed = (message || '').trim();
    if (!trimmed || LEGACY_LEAVE_MESSAGES.has(trimmed)) return DEFAULT_LEAVE;
    if (!/\{enterTime\}/i.test(trimmed) && /Die Sonne ist nicht mehr auf der \{fassade\}seite/i.test(trimmed)) {
      return DEFAULT_LEAVE;
    }
    return trimmed;
  }

  function normalizeRule(rule = {}) {
    return {
      enabled: !!(rule.enabled ?? rule.enter),
      message: upgradeEnterMessage(rule.message || rule.messageEnter),
      leaveEnabled: !!(rule.leaveEnabled ?? rule.leave),
      messageLeave: upgradeLeaveMessage(rule.messageLeave),
    };
  }

  function buildUI(savedRules = {}) {
    const container = document.getElementById('facadeNotifyRules');
    if (!container) return;

    container.innerHTML = '';

    for (const id of FacadeLogic.ORDER) {
      const meta = FacadeLogic.FACADES[id];
      const rule = normalizeRule(savedRules[id]);

      const row = document.createElement('div');
      row.className = 'notify-row';
      row.dataset.facade = id;
      row.innerHTML = `
        <div class="notify-row-head">
          <strong>${meta.label}</strong>
          <label class="notify-check">
            <input type="checkbox" id="notify-${id}-enabled" ${rule.enabled ? 'checked' : ''}>
            Push: Sonne sichtbar
          </label>
          <label class="notify-check">
            <input type="checkbox" id="notify-${id}-leave" ${rule.leaveEnabled ? 'checked' : ''}>
            Push: Sonne weg
          </label>
        </div>
        <label class="field notify-field">
          <span>Nachricht Sonne sichtbar</span>
          <input type="text" id="notify-${id}-msg" value="${escapeAttr(rule.message || DEFAULT_MESSAGE)}">
        </label>
        <label class="field notify-field">
          <span>Nachricht Sonne weg</span>
          <input type="text" id="notify-${id}-msg-leave" value="${escapeAttr(rule.messageLeave || DEFAULT_LEAVE)}">
        </label>
        <div class="notify-test-row">
          <button type="button" class="btn-notify-test" data-facade="${id}">Test</button>
          <span class="notify-test-status" id="notify-${id}-status"></span>
        </div>
      `;
      container.appendChild(row);
    }

    bindSaveEvents();
    bindTestEvents();
    highlightSunsetFacade(FacadeLogic.getSunsetFacadeId?.() ?? null);
  }

  function highlightSunsetFacade(facadeId) {
    document.querySelectorAll('.notify-row').forEach((row) => {
      const isSunset = facadeId && row.dataset.facade === facadeId;
      row.classList.toggle('sunset-facade', isSunset);
      const badge = row.querySelector('.sunset-badge');
      if (isSunset && !badge) {
        const el = document.createElement('span');
        el.className = 'sunset-badge';
        el.textContent = 'Untergang';
        row.querySelector('.notify-row-head')?.appendChild(el);
      } else if (!isSunset && badge) {
        badge.remove();
      }
    });
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function collect() {
    const rules = {};
    for (const id of FacadeLogic.ORDER) {
      rules[id] = {
        enabled: document.getElementById(`notify-${id}-enabled`)?.checked || false,
        message: document.getElementById(`notify-${id}-msg`)?.value.trim() || '',
        leaveEnabled: document.getElementById(`notify-${id}-leave`)?.checked || false,
        messageLeave: document.getElementById(`notify-${id}-msg-leave`)?.value.trim() || '',
      };
    }
    return rules;
  }

  function countActiveRules(rules = collect()) {
    return Object.values(rules).filter((r) => r.enabled || r.leaveEnabled).length;
  }

  async function sendFacadeTest(facadeId, event, lat, lon) {
    const msgField = document.getElementById(
      `notify-${facadeId}-msg${event === 'leave' ? '-leave' : ''}`
    );

    const res = await fetch('/api/ntfy/test-facade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facadeId,
        event,
        message: msgField?.value.trim() || '',
        lat,
        lon,
      }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Fehler');
    }

    return data;
  }

  function formatTestHint(event, data) {
    if (event === 'enter' && data.leaveTime) {
      return `Sichtbar (Weg ca. ${data.leaveTime} Uhr)`;
    }
    if (event === 'leave' && data.enterTime) {
      return `Weg (${data.naechsteFassade}seite ca. ${data.enterTime} Uhr)`;
    }
    return event === 'enter' ? 'Sichtbar' : 'Weg';
  }

  async function testFacade(facadeId) {
    const statusEl = document.getElementById(`notify-${facadeId}-status`);
    const button = document.querySelector(`.btn-notify-test[data-facade="${facadeId}"]`);
    const enterEnabled = document.getElementById(`notify-${facadeId}-enabled`)?.checked;
    const leaveEnabled = document.getElementById(`notify-${facadeId}-leave`)?.checked;
    const { lat, lon } = MapModule.getLocation();

    if (!enterEnabled && !leaveEnabled) {
      if (statusEl) {
        statusEl.textContent = 'Mindestens einen Push-Typ oben aktivieren';
        statusEl.className = 'notify-test-status err';
      }
      return;
    }

    if (button) button.disabled = true;
    if (statusEl) {
      statusEl.textContent = 'Sende…';
      statusEl.className = 'notify-test-status';
    }

    try {
      const parts = [];
      if (enterEnabled) {
        const data = await sendFacadeTest(facadeId, 'enter', lat, lon);
        parts.push(formatTestHint('enter', data));
      }
      if (leaveEnabled) {
        const data = await sendFacadeTest(facadeId, 'leave', lat, lon);
        parts.push(formatTestHint('leave', data));
      }

      if (statusEl) {
        statusEl.textContent = `Gesendet ✓ – ${parts.join(', ')}`;
        statusEl.className = 'notify-test-status ok';
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message;
        statusEl.className = 'notify-test-status err';
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  let saveTimer = null;

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await AppStorage.saveImmediate({ facadeNotifications: collect() });
      } catch (err) {
        console.warn('[NotifyRules]', err.message);
      }
    }, 400);
  }

  function bindSaveEvents() {
    const container = document.getElementById('facadeNotifyRules');
    if (!container) return;

    container.querySelectorAll('input').forEach((el) => {
      el.addEventListener('change', scheduleSave);
      el.addEventListener('blur', scheduleSave);
    });
  }

  function bindTestEvents() {
    document.querySelectorAll('.btn-notify-test').forEach((btn) => {
      btn.addEventListener('click', () => {
        testFacade(btn.dataset.facade);
      });
    });
  }

  return {
    buildUI,
    collect,
    countActiveRules,
    highlightSunsetFacade,
    DEFAULT_MESSAGE,
    DEFAULT_LEAVE,
  };
})();
