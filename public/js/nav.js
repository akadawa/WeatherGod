const ProjectNav = (() => {
  const STORAGE_KEY = 'weathergod-nav-collapsed';
  const LEGACY_STORAGE_KEY = 'solarpilot-nav-collapsed';

  const ITEMS = [
    {
      id: 'dashboard',
      label: 'Wetterdashboard',
      href: '/dashboard.html',
      icon: 'dashboard',
      match: (path) => path === '/dashboard.html' || path === '/dashboard',
    },
    {
      id: 'monitor',
      label: 'Sonnen-Monitor',
      href: '/',
      icon: 'monitor',
      match: (path) => path === '/' || path === '/index.html',
    },
    {
      id: 'rolladen',
      label: 'Rolladen',
      href: '/rolladen',
      icon: 'blinds',
      disabled: true,
    },
    {
      id: 'settings',
      label: 'Projekt',
      href: '/settings',
      icon: 'settings',
      disabled: true,
    },
  ];

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>',
    monitor: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>',
    blinds: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M3 15h18M9 3v18"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>',
    collapse: '<svg class="nav-toggle-icon nav-toggle-collapse" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>',
    expand: '<svg class="nav-toggle-icon nav-toggle-expand" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>',
  };

  function isCollapsed() {
    return document.documentElement.dataset.navCollapsed === 'true';
  }

  function updateToggleUI() {
    const btn = document.getElementById('projectNavToggle');
    if (!btn) return;

    const collapsed = isCollapsed();
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Menü ausklappen' : 'Menü einklappen';
    btn.setAttribute('aria-label', btn.title);
  }

  function setCollapsed(collapsed, { persist = true } = {}) {
    document.documentElement.dataset.navCollapsed = collapsed ? 'true' : 'false';
    updateToggleUI();

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
      } catch {
        /* ignorieren */
      }

      if (window.AppStorage?.save) {
        AppStorage.save({ navCollapsed: collapsed });
      }
    }
  }

  function toggle() {
    setCollapsed(!isCollapsed(), { persist: true });
  }

  function renderItems() {
    const list = document.getElementById('projectNavList');
    if (!list) return;

    const path = window.location.pathname;
    list.innerHTML = '';

    for (const item of ITEMS) {
      const active = !item.disabled && item.match ? item.match(path) : false;
      const el = document.createElement(item.disabled ? 'span' : 'a');
      el.className = 'project-nav-item';
      if (active) el.classList.add('is-active');
      if (item.disabled) {
        el.classList.add('is-disabled');
        el.title = `${item.label} – demnächst verfügbar`;
      } else {
        el.href = item.href;
        if (active) el.setAttribute('aria-current', 'page');
      }

      el.innerHTML = `
        <span class="project-nav-icon">${ICONS[item.icon] || ''}</span>
        <span class="project-nav-label">${item.label}</span>
      `;

      list.appendChild(el);
    }
  }

  function readStoredCollapsed() {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (stored == null) {
        stored = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored != null) {
          localStorage.setItem(STORAGE_KEY, stored);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      return stored;
    } catch {
      return null;
    }
  }

  function applyStoredState() {
    let collapsed = true;

    const stored = readStoredCollapsed();
    if (stored === 'false') collapsed = false;
    else if (stored === 'true') collapsed = true;

    setCollapsed(collapsed, { persist: false });
  }

  function syncFromSettings(saved) {
    if (typeof saved?.navCollapsed === 'boolean') {
      setCollapsed(saved.navCollapsed, { persist: false });
      try {
        localStorage.setItem(STORAGE_KEY, saved.navCollapsed ? 'true' : 'false');
      } catch {
        /* ignorieren */
      }
    }
  }

  function initToggle() {
    const btn = document.getElementById('projectNavToggle');
    if (!btn) return;

    btn.innerHTML = `${ICONS.collapse}${ICONS.expand}`;
    btn.addEventListener('click', toggle);
    updateToggleUI();
  }

  function init() {
    renderItems();
    initToggle();
    applyStoredState();
  }

  return {
    init,
    toggle,
    setCollapsed,
    isCollapsed,
    syncFromSettings,
    ITEMS,
  };
})();
