(() => {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const container = nav.querySelector(':scope > div');
  if (!container) return;

  const brand = container.querySelector('a[href="index.html"]');
  if (!brand) return;

  const linkGroup = Array.from(container.children).find((node) => node.tagName === 'DIV');
  if (!linkGroup) return;

  nav.id = 'siteNavBar';
  container.id = 'siteNavInner';
  brand.id = 'siteNavBrand';

  const styleId = 'orastories-nav-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #siteNavBar { will-change: transform; }
      #siteNavInner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      #siteNavBrand { white-space: nowrap; }
      #siteNavControls {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      #siteNavLinks {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: flex-start;
        gap: 1rem;
      }
      #siteNavLinks a {
        white-space: nowrap;
        border-bottom: 1px solid transparent;
      }
      #siteNavLinks a[aria-current="page"] { border-bottom-color: currentColor; }
      #navCollapseToggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #themeToggle.is-mobile-theme-toggle {
        position: fixed;
        right: 3.8rem;
        top: calc(env(safe-area-inset-top, 0px) + 0.7rem);
        bottom: auto;
        z-index: 95;
        border: 1px solid rgba(17, 24, 39, 0.12);
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(8px);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
        animation: themeFabFloat 2.6s ease-in-out infinite;
      }
      .dark-mode #themeToggle.is-mobile-theme-toggle {
        border-color: rgba(255, 255, 255, 0.18);
        background: rgba(15, 15, 15, 0.88);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
      }
      @keyframes themeFabFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
      @media (max-width: 1023px) {
        #siteNavInner { align-items: flex-start; }
        #siteNavLinks {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding-bottom: 0.2rem;
        }
        #siteNavLinks::-webkit-scrollbar { display: none; }
      }
      @media (min-width: 1024px) {
        #siteNavInner {
          flex-wrap: nowrap;
          justify-content: center;
          align-items: center;
          gap: 1rem;
        }
        #siteNavBrand { order: 1; }
        #siteNavControls {
          order: 3;
          margin-left: 0;
        }
        #siteNavLinks {
          order: 2;
          width: auto;
          margin: 0 auto;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

  nav.classList.add('transition-transform', 'duration-300');
  linkGroup.classList.add(
    'w-full',
    'mt-2',
    'md:mt-3',
    'overflow-hidden',
    'transition-all',
    'duration-300',
    'ease-out'
  );

  const themeToggle = linkGroup.querySelector('#themeToggle');
  const contentStart = document.querySelector('#contentWrapper, main');
  const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

  const controls = document.createElement('div');
  controls.id = 'siteNavControls';
  controls.className = 'flex items-center gap-2';

  const collapseBtn = document.createElement('button');
  collapseBtn.id = 'navCollapseToggle';
  collapseBtn.type = 'button';
  collapseBtn.className = 'p-2 rounded-full border border-black/15 dark-mode:border-white/15 hover:bg-black/5 dark-mode:hover:bg-white/10 transition-colors';
  collapseBtn.setAttribute('aria-controls', 'siteNavLinks');

  const getToggleIcon = (isCollapsed) =>
    isCollapsed
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

  if (themeToggle) {
    linkGroup.removeChild(themeToggle);
    controls.appendChild(themeToggle);
  }
  controls.appendChild(collapseBtn);
  brand.insertAdjacentElement('afterend', controls);

  linkGroup.id = 'siteNavLinks';
  const navLinks = Array.from(linkGroup.querySelectorAll('a[href]'));

  const normalizePath = (value) => {
    const cleaned = (value || '').split('?')[0].split('#')[0];
    const leaf = cleaned.substring(cleaned.lastIndexOf('/') + 1);
    return (leaf || 'index.html').toLowerCase();
  };

  const currentPath = normalizePath(window.location.pathname);
  navLinks.forEach((anchor) => {
    const href = normalizePath(anchor.getAttribute('href'));
    if (href !== currentPath) return;
    anchor.classList.add('font-semibold', 'text-amber-700', 'dark-mode:text-amber-400');
    anchor.setAttribute('aria-current', 'page');
  });

  const storageKey = 'orastories-nav-collapsed';
  const defaultCollapsed = currentPath !== 'index.html';
  let collapsed = localStorage.getItem(storageKey);
  collapsed = collapsed === null ? defaultCollapsed : collapsed === 'true';

  const setCollapsed = (nextCollapsed) => {
    collapsed = nextCollapsed;
    localStorage.setItem(storageKey, String(nextCollapsed));

    collapseBtn.innerHTML = getToggleIcon(nextCollapsed);
    collapseBtn.setAttribute('aria-label', nextCollapsed ? 'Expand navigation' : 'Collapse navigation');
    collapseBtn.title = nextCollapsed ? 'Expand navigation' : 'Collapse navigation';
    collapseBtn.setAttribute('aria-expanded', String(!nextCollapsed));

    if (nextCollapsed) {
      linkGroup.classList.remove('max-h-96', 'opacity-100', 'translate-y-0', 'pointer-events-auto');
      linkGroup.classList.add('max-h-0', 'opacity-0', '-translate-y-2', 'pointer-events-none');
      queueOffsetSync();
      return;
    }

    linkGroup.classList.remove('max-h-0', 'opacity-0', '-translate-y-2', 'pointer-events-none');
    linkGroup.classList.add('max-h-96', 'opacity-100', 'translate-y-0', 'pointer-events-auto');
    queueOffsetSync();
  };

  const syncContentOffset = () => {
    if (!contentStart) return;
    const navHeight = Math.ceil(nav.getBoundingClientRect().height);
    contentStart.style.paddingTop = `${navHeight + 12}px`;
  };

  const queueOffsetSync = () => {
    syncContentOffset();
    window.setTimeout(syncContentOffset, 320);
  };

  const syncThemeTogglePlacement = () => {
    if (!themeToggle) return;

    if (mobileMediaQuery.matches) {
      if (themeToggle.parentElement !== document.body) {
        document.body.appendChild(themeToggle);
      }
      themeToggle.classList.add('is-mobile-theme-toggle');
      return;
    }

    if (themeToggle.parentElement !== controls) {
      controls.prepend(themeToggle);
    }
    themeToggle.classList.remove('is-mobile-theme-toggle');
  };

  collapseBtn.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(collapsed);
  syncThemeTogglePlacement();
  queueOffsetSync();

  window.addEventListener('resize', queueOffsetSync);
  window.addEventListener('resize', syncThemeTogglePlacement);
  if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', syncThemeTogglePlacement);
  } else if (typeof mobileMediaQuery.addListener === 'function') {
    mobileMediaQuery.addListener(syncThemeTogglePlacement);
  }

  let previousScrollY = window.scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      const delta = y - previousScrollY;

      nav.classList.toggle('shadow-lg', y > 10);

      if (Math.abs(delta) >= 8 && y > 120 && delta > 0 && collapsed) {
        nav.classList.add('-translate-y-full');
      } else {
        nav.classList.remove('-translate-y-full');
      }

      previousScrollY = y;
    },
    { passive: true }
  );
})();
