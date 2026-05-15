/* LogMyStack — shared mobile nav + avatar menu.
 *
 * Loaded by /app/, /app/feed/, /app/create/, /app/saved/, /app/my/.
 *
 *  • On viewports ≤ 768px hides the inline header nav and shows a
 *    hamburger in the TOP-LEFT of the header. Tap opens a right-side
 *    drawer with all nav items.
 *  • Enhances the existing .avatar in the header — wraps it so click
 *    opens a small menu (email · Settings · Sign out). Visible on every
 *    page, every breakpoint.
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
        margin-right: 10px;
        flex-shrink: 0;
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

      /* Force the avatar to be a real circle even inside a flex container */
      .avatar {
        flex-shrink: 0;
        aspect-ratio: 1 / 1;
        min-width: 30px;
        min-height: 30px;
        cursor: pointer;
        transition: transform 0.12s;
      }
      .avatar:hover { transform: scale(1.05); }

      /* Avatar dropdown menu */
      .lms-avatar-wrap { position: relative; flex-shrink: 0; }
      .lms-avatar-menu {
        position: absolute; top: calc(100% + 8px); right: 0;
        background: var(--panel, #111);
        border: 1px solid var(--border, #262626);
        border-radius: 10px;
        padding: 6px;
        min-width: 220px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
        z-index: 80;
        opacity: 0; pointer-events: none; transform: translateY(-4px);
        transition: opacity 0.15s, transform 0.15s;
      }
      .lms-avatar-menu.open {
        opacity: 1; pointer-events: all; transform: translateY(0);
      }
      .lms-avatar-menu-email {
        padding: 9px 10px 10px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px; color: var(--muted-2, #737373);
        border-bottom: 1px solid var(--border-2, #1f1f1f);
        margin-bottom: 4px;
        word-break: break-all;
      }
      .lms-avatar-menu-item {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 12px;
        font-size: 13.5px; color: var(--text, #fafafa);
        background: transparent; border: none; cursor: pointer;
        border-radius: 7px; text-decoration: none;
        width: 100%; text-align: left;
        font-family: 'Inter', sans-serif;
        transition: background 0.12s;
      }
      .lms-avatar-menu-item:hover { background: var(--panel-2, #161616); }
      .lms-avatar-menu-item.danger { color: var(--danger, #f87171); }
      .lms-avatar-menu-item.danger:hover { background: rgba(248,113,113,0.08); }
      .lms-avatar-menu-item svg { width: 15px; height: 15px; opacity: 0.7; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
  }

  // ---------------- Hamburger (TOP-LEFT) ----------------
  function injectHamburger() {
    if (document.querySelector('.lms-hamburger')) return;
    const header = document.querySelector('header');
    if (!header) return;
    // The header's outer flex row holds the LEFT group first and RIGHT group second.
    // We want the hamburger as the FIRST child of the left group (before the logo).
    const leftGroup = header.querySelector('.flex.items-center.gap-8');
    if (!leftGroup) return;
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
    leftGroup.insertBefore(btn, leftGroup.firstChild);
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
      const el = (onAppHome && item.page)
        ? Object.assign(document.createElement('button'), {
            className: 'lms-drawer-link' + (isCurrentSurface ? '' : ''),
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

  // ---------------- Avatar menu ----------------
  function enhanceAvatar() {
    const avatar = document.getElementById('header-avatar');
    if (!avatar) return;
    if (avatar.dataset.lmsEnhanced === '1') return;
    avatar.dataset.lmsEnhanced = '1';

    // Wrap the avatar so we can absolutely-position the menu next to it
    const wrap = document.createElement('div');
    wrap.className = 'lms-avatar-wrap';
    avatar.parentNode.insertBefore(wrap, avatar);
    wrap.appendChild(avatar);

    // Menu
    const menu = document.createElement('div');
    menu.className = 'lms-avatar-menu';
    menu.innerHTML = `
      <div class="lms-avatar-menu-email" id="lms-avatar-menu-email">—</div>
      <button class="lms-avatar-menu-item" id="lms-avatar-menu-settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </button>
      <button class="lms-avatar-menu-item danger" id="lms-avatar-menu-signout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign out
      </button>
    `;
    wrap.appendChild(menu);

    // Show email
    function setEmail() {
      const email = (window.currentUser && window.currentUser.email)
                 || (window.lms && window.lms.currentUser && window.lms.currentUser.email)
                 || '';
      const node = document.getElementById('lms-avatar-menu-email');
      if (node) node.textContent = email || '—';
    }
    setEmail();
    // Re-check email after a small delay (auth might still be hydrating)
    setTimeout(setEmail, 700);
    setTimeout(setEmail, 2000);

    // Toggle
    avatar.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setEmail();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.lms-avatar-wrap')) menu.classList.remove('open');
    });

    // Settings: switchTab on /app/, navigate on others
    document.getElementById('lms-avatar-menu-settings').addEventListener('click', (ev) => {
      ev.preventDefault();
      menu.classList.remove('open');
      if (isAppHome() && typeof window.switchTab === 'function') {
        window.switchTab('settings');
      } else {
        location.href = '/app/?tab=settings';
      }
    });

    // Sign out
    document.getElementById('lms-avatar-menu-signout').addEventListener('click', () => {
      menu.classList.remove('open');
      if (typeof window.signOut === 'function') window.signOut();
      else if (window.lms && window.lms.signOut) window.lms.signOut();
    });
  }

  function init() {
    injectStyles();
    injectHamburger();
    injectDrawer();
    enhanceAvatar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
