(() => {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const container = nav.querySelector(':scope > div');
  if (!container) return;

  const brand = container.querySelector('a[href="index.html"]');
  if (!brand) return;

  const linkGroup = Array.from(container.children).find((node) => node.tagName === 'DIV');
  if (!linkGroup) return;

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

  const controls = document.createElement('div');
  controls.className = 'ml-auto flex items-center gap-2';

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

  collapseBtn.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(collapsed);
  queueOffsetSync();

  window.addEventListener('resize', queueOffsetSync);

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
