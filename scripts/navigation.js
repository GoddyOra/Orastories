(() => {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const container = nav.querySelector(':scope > div');
  if (!container) return;

  const brand = container.querySelector('a[href="/"]');
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
        right: 1.1rem;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 1.1rem);
        top: auto;
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
  collapseBtn.className = 'p-2 rounded-full border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 transition-colors';
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

  // Handles both the new extensionless links (/about) and, for anyone who
  // still lands on an old bookmarked /about.html URL (GitHub Pages serves
  // both - see Phase I), the legacy form too, so nav highlighting doesn't
  // silently break for either.
  const normalizePath = (value) => {
    const cleaned = (value || '').split('?')[0].split('#')[0];
    const leaf = cleaned.substring(cleaned.lastIndexOf('/') + 1).replace(/\.html$/i, '');
    return (leaf || 'index').toLowerCase();
  };

  const currentPath = normalizePath(window.location.pathname);
  navLinks.forEach((anchor) => {
    const href = normalizePath(anchor.getAttribute('href'));
    if (href !== currentPath) return;
    anchor.classList.add('font-semibold', 'text-amber-700', 'dark:text-amber-400');
    anchor.setAttribute('aria-current', 'page');
  });

  const storageKey = 'orastories-nav-collapsed';
  const defaultCollapsed = currentPath !== 'index';
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

// Site-wide auth widget: shows the signed-in reader's username in the nav on
// every static page. index.html runs the full React app, which already owns
// #siteNavControls via NavAccountControl - this widget skips itself there
// entirely and only handles the plain marketing/blog pages. Sign-in itself
// still only ever happens inside the React app; this only *reads* the
// session Supabase already persisted to localStorage on sign-in there (the
// storage key is project-scoped, not script-scoped, so a second, independent
// Supabase client instance here sees the exact same session for free).
(async () => {
  if (document.getElementById('root')) return;

  const controls = document.getElementById('siteNavControls');
  if (!controls) return;

  const SUPABASE_URL = 'https://spordcubtugawsyelqxz.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwb3JkY3VidHVnYXdzeWVscXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTQ0MTMsImV4cCI6MjEwMTY5MDQxM30.jQhzR_pTDIFpaJDfBmxn0-9gFovxNRZEt4nfy20uNbg';

  let supabase;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error('Orastories nav auth: failed to load Supabase client', error);
    return;
  }

  const isLight = () => !document.body.classList.contains('dark-mode');

  const wrapper = document.createElement('div');
  wrapper.id = 'siteNavAuth';
  wrapper.className = 'relative';
  controls.appendChild(wrapper);

  let themeUpdaters = [];
  // orastories-theme-change is only dispatched by index.html's inline theme
  // script (to sync into the React app) - other static pages just toggle
  // body's dark-mode class directly with no event at all. Observing the
  // class attribute itself works uniformly across every page regardless of
  // how each one's own toggle script is implemented.
  new MutationObserver(() => themeUpdaters.forEach((fn) => fn())).observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  function renderSignedOut() {
    wrapper.innerHTML = '';
    themeUpdaters = [];

    const link = document.createElement('a');
    link.href = '/?openPortal=1';
    link.textContent = 'Sign In';

    const update = () => {
      link.className = `text-sm sm:text-base font-medium transition-colors ${
        isLight() ? 'text-gray-900 hover:text-amber-700' : 'text-gray-100 hover:text-amber-400'
      }`;
    };
    update();
    themeUpdaters.push(update);
    wrapper.appendChild(link);
  }

  function renderSignedIn(label) {
    wrapper.innerHTML = '';
    themeUpdaters = [];

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-haspopup', 'true');

    const menu = document.createElement('div');
    menu.classList.add('hidden', 'absolute', 'right-0', 'mt-2', 'w-40', 'rounded-sm', 'border', 'shadow-lg', 'py-1', 'z-50', 'overflow-hidden');

    const accountLink = document.createElement('a');
    accountLink.href = '/?openPortal=1';
    accountLink.textContent = 'My Account';

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.textContent = 'Sign Out';

    const update = () => {
      const light = isLight();
      button.className = `text-sm sm:text-base font-medium transition-colors ${
        light ? 'text-gray-900 hover:text-amber-700' : 'text-gray-100 hover:text-amber-400'
      }`;

      menu.classList.remove('bg-white', 'border-black/10', 'bg-[#161616]', 'border-white/10');
      (light ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10').split(' ').forEach((c) => menu.classList.add(c));

      const itemClass = `block w-full text-left px-4 py-2 text-sm transition-colors ${
        light ? 'text-gray-900 hover:bg-black/5' : 'text-white hover:bg-white/10'
      }`;
      accountLink.className = itemClass;
      signOutBtn.className = itemClass;
    };
    update();
    themeUpdaters.push(update);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.toggle('hidden');
    });

    signOutBtn.addEventListener('click', async () => {
      menu.classList.add('hidden');
      await supabase.auth.signOut({ scope: 'local' });
      renderSignedOut();
    });

    menu.appendChild(accountLink);
    menu.appendChild(signOutBtn);
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
  }

  document.addEventListener('click', (event) => {
    if (wrapper.contains(event.target)) return;
    const menu = wrapper.querySelector('div');
    if (menu) menu.classList.add('hidden');
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    renderSignedOut();
    return;
  }

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', session.user.id).maybeSingle();

  const label = (profile && profile.username) || (session.user.email ? session.user.email.split('@')[0] : 'Account');
  renderSignedIn(label);
})();
