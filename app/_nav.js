/* LogMyStack — shared mobile nav drawer.
 *
 * Loaded by /app/, /app/feed/, /app/create/, /app/saved/, /app/my/.
 * On viewports ≤ 768px, hides the inline header nav and shows a
 * hamburger button. Tapping the hamburger opens a right-side drawer
 * with the full nav list. The drawer reuses the existing tab handlers
 * for /app/'s in-page tab buttons, and uses real <a href> nav for the
 * other surfaces.
 */
(function () {
  const NAV_ITEMS = [
    { label: 'Today',    page: 'today',    href: '/app/' },
    { label: 'Stack',    page: 'stack',    href: '/app/' },
    { label: 'History',  page: 'history',  href: '/app/' },
    { label: 'Metrics',  page: 'metrics',  href: '/app/' },
    { label: 'Feed',     href: '/app/feed/' },
    { label: 'My Cards', href: '/app/my/' },
    { label: 'Saved',    href: '/app/saved/' },
    { label: 'Settings', page: 'settings', href: '/app/' },
  ];

  function isAppHome() {
    const p = location.pathname.replace(/\/+$/, '');
    return p === '/app' || p === '/app/index.html';
  }
  function currentSurfaceHref() {
    const p = location.pathname.replace(/\/+$/, '');
    if (p.startsWith('/app/feed'))   return '/app/feed/';
    if (p.startsWith('/app/create')) return '/app/create/';
    if (p.startsWith('/app/saved'))  return '/app/saved/';
    if (p.startsWith('/app/my'))     return '/app/my/';
    return '/app/';
  }

  function injectStyles() {
    if (document.getElementById('lms-nav-styles')) return;
    const style = document.createElement('style');
    style.id = 'lms-nav-styles';
    style.textContent = `
      .lms-hamburger {
        display: none; align-items: center; justify-content: center;
        width: 38px; height: 38px;
        background: transparent; border: 1px solid var(--border, #262626);
        color: var(--text, #fafafa); border-radius: 9px; cursor: pointer;
        padding: 0; transition: all 0.15s;
      }
      .lms-hamburger:hover { background: var(--panel-2, #161616); border-color: #333; }
      @media (max-width: 768px) {
        header nav { display: none !important; }
        .lms-hamburger { display: inline-flex !important; }
      }
      .lms-drawer-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        z-index: 200; opacity: 0; pointer-events: none;
        transition: opacity 0.2s;
      }
      .lms-drawer-overlay.open { opacity: 1; pointer-events: all; }
      .lms-drawer {
        position: fixed; top: 0; right: 0; bottom: 0;
        width: 320px; max-width: 88vw;
        background: var(--panel, #111); border-left: 1px solid var(--border, #262626);
        z-index: 201; transform: translateX(100%);
        transition: transform 0.25s ease;
        display: flex; flex-direction: column;
        overflow-y: auto;
      }
      .lms-drawer.open { transform: translateX(0); }
      .lms-drawer-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 18px 14px;
        border-bottom: 1px solid var(--border, #262626);
      }
      .lms-drawer-brand {
        display: flex; align-items: center; gap: 8px;
        font-size: 14px; font-weight: 700;
      }
      .lms-drawer-close {
        width: 32px; height: 32px;
        background: transparent; border: none; color: var(--muted, #a3a3a3);
        cursor: pointer; border-radius: 8px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .lms-drawer-close:hover { background: var(--panel-2, #161616); color: var(--text, #fafafa); }
      .lms-drawer-list {
        padding: 12px 12px 24px; display: flex; flex-direction: column; gap: 2px;
      }
      .lms-drawer-link {
        display: flex; align-items: center; padding: 11px 14px;
        font-size: 14.5px; color: var(--muted, #a3a3a3);
        text-decoration: none; border-radius: 9px;
        cursor: pointer; background: transparent; border: none;
        font-family: 'Inter', sans-serif; text-align: left;
        transition: all 0.15s;
      }
      .lms-drawer-link:hover { background: var(--panel-2, #161616); color: var(--text, #fafafa); }
      .lms-drawer-link.active {
        background: rgba(52,211,153,0.08); color: var(--accent, #34d399);
      }
    `;
    document.head.appendChild(style);
  }

  function injectHamburger() {
    if (document.querySelector('.lms-hamburger')) return;
    const header = document.querySelector('header');
    if (!header) return;
    // Find the right-side container in the header (second flex group)
    const rightSide = header.querySelector('.flex.items-center.gap-3, .flex.items-center.gap-2');
    if (!rightSide) return;
    const btn = document.createElement('button');
    btn.className = 'lms-hamburger';
    btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6"  x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>`;
    btn.addEventListener('click', openDrawer);
    rightSide.appendChild(btn);
  }

  function injectDrawer() {
    if (document.getElementById('lms-drawer')) return;
    const onAppHome = isAppHome();
    const currentHref = currentSurfaceHref();
    const overlay = document.createElement('div');
    overlay.className = 'lms-drawer-overlay';
    overlay.id = 'lms-drawer-overlay';
    overlay.addEventListener('click', closeDrawer);
    const drawer = document.createElement('div');
    drawer.className = 'lms-drawer';
    drawer.id = 'lms-drawer';
    drawer.innerHTML = `
      <div class="lms-drawer-head">
        <div class="lms-drawer-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L22 8 L22 16 L12 22 L2 16 L2 8 Z" stroke="#34d399" stroke-width="1.5"/>
            <path d="M12 8 L17 11 L17 13 L12 16 L7 13 L7 11 Z" fill="#34d399"/>
          </svg>
          <span>LogMyStack</span>
        </div>
        <button class="lms-drawer-close" id="lms-drawer-close-btn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <nav class="lms-drawer-list" id="lms-drawer-nav"></nav>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    document.getElementById('lms-drawer-close-btn').addEventListener('click', closeDrawer);

    const list = document.getElementById('lms-drawer-nav');
    NAV_ITEMS.forEach(item => {
      const itemHref = item.href || '/app/';
      const isCurrentSurface = (currentHref === itemHref);
      const isAppPage = (itemHref === '/app/');
      // On /app/, "page"-keyed items toggle in-page tabs; otherwise they navigate.
      // On non-/app/ surfaces, all items navigate normally.
      const el = (onAppHome && item.page)
        ? Object.assign(document.createElement('button'), {
            className: 'lms-drawer-link' + (isCurrentSurface && (typeof window.activeTab === 'string' ? window.activeTab === item.page : false) ? ' active' : ''),
            type: 'button',
          })
        : Object.assign(document.createElement('a'), {
            className: 'lms-drawer-link' + (isCurrentSurface ? ' active' : ''),
            href: itemHref,
          });
      el.textContent = item.label;
      if (onAppHome && item.page) {
        el.addEventListener('click', () => {
          closeDrawer();
          if (typeof window.switchTab === 'function') window.switchTab(item.page);
        });
      } else {
        el.addEventListener('click', closeDrawer);
      }
      list.appendChild(el);
    });
  }

  function openDrawer() {
    document.getElementById('lms-drawer-overlay').classList.add('open');
    document.getElementById('lms-drawer').classList.add('open');
  }
  function closeDrawer() {
    document.getElementById('lms-drawer-overlay').classList.remove('open');
    document.getElementById('lms-drawer').classList.remove('open');
  }

  function init() {
    injectStyles();
    injectHamburger();
    injectDrawer();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
