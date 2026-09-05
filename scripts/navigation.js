// Nav interactivity - attaches to markup that's now baked statically into
// each page's own HTML (see index.html's <nav id="siteNavBar"> for the
// canonical structure: #siteNavInner > #siteNavBrand, #siteNavControls
// (#themeToggle, #siteNavSearch, #siteNavAuth, #navCollapseToggle),
// #siteNavLinks). Previously this script built that whole structure and its
// layout CSS at runtime, which meant the nav visibly reflowed ~150ms after
// first paint - the dominant cause of a 0.62 CLS score on desktop (traced
// directly with instrumented Playwright runs, not guessed). Baking the
// final DOM and CSS statically means this script only ever attaches
// behavior to elements that already exist in their final position/size.
(() => {
  const nav = document.getElementById('siteNavBar');
  if (!nav) return;

  const linkGroup = document.getElementById('siteNavLinks');
  const controls = document.getElementById('siteNavControls');
  if (!linkGroup || !controls) return;

  const themeToggle = document.getElementById('themeToggle');
  const collapseBtn = document.getElementById('navCollapseToggle');
  const contentStart = document.querySelector('#contentWrapper, main');
  const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

  const getToggleIcon = (isCollapsed) =>
    isCollapsed
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

  const storageKey = 'orastories-nav-collapsed';
  // Each page already bakes in the right default (expanded on the homepage,
  // collapsed elsewhere) via siteNavLinks' initial classes, so a first-time
  // visitor with no stored preference needs zero correction here. Only a
  // returning visitor whose stored choice differs from that default causes
  // any DOM change at all.
  const defaultCollapsed = linkGroup.classList.contains('max-h-0');
  const stored = localStorage.getItem(storageKey);
  let collapsed = stored === null ? defaultCollapsed : stored === 'true';

  const applyCollapsed = (nextCollapsed, persist) => {
    collapsed = nextCollapsed;
    if (persist) localStorage.setItem(storageKey, String(nextCollapsed));

    if (collapseBtn) {
      collapseBtn.innerHTML = getToggleIcon(nextCollapsed);
      collapseBtn.setAttribute('aria-label', nextCollapsed ? 'Expand navigation' : 'Collapse navigation');
      collapseBtn.title = nextCollapsed ? 'Expand navigation' : 'Collapse navigation';
      collapseBtn.setAttribute('aria-expanded', String(!nextCollapsed));
    }

    if (nextCollapsed) {
      linkGroup.classList.remove('max-h-96', 'opacity-100', 'translate-y-0', 'pointer-events-auto');
      linkGroup.classList.add('max-h-0', 'opacity-0', '-translate-y-2', 'pointer-events-none');
    } else {
      linkGroup.classList.remove('max-h-0', 'opacity-0', '-translate-y-2', 'pointer-events-none');
      linkGroup.classList.add('max-h-96', 'opacity-100', 'translate-y-0', 'pointer-events-auto');
    }
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

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => applyCollapsed(!collapsed, true));
  }

  // Only touch the DOM here if a stored preference actually disagrees with
  // what the page already baked in - the common case (no stored preference,
  // or it matches the default) needs no correction at all.
  if (stored !== null && (stored === 'true') !== defaultCollapsed) {
    applyCollapsed(collapsed, false);
  } else {
    queueOffsetSync();
  }
  syncThemeTogglePlacement();

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

// Site-wide search: unlike the auth widget below, this runs on every page
// including index.html - search has nothing to do with the React app's own
// state, so there's no reason to special-case it out. The toggle button and
// panel markup are now baked into the page (#siteNavSearchToggle/Panel/
// Input/Results) rather than built here, so this only wires up behavior -
// nothing about the page's layout changes when this finishes loading.
(async () => {
  const toggleBtn = document.getElementById('siteNavSearchToggle');
  const panel = document.getElementById('siteNavSearchPanel');
  const input = document.getElementById('siteNavSearchInput');
  const resultsBox = document.getElementById('siteNavSearchResults');
  if (!toggleBtn || !panel || !input || !resultsBox) return;

  const SUPABASE_URL = 'https://spordcubtugawsyelqxz.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwb3JkY3VidHVnYXdzeWVscXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTQ0MTMsImV4cCI6MjEwMTY5MDQxM30.jQhzR_pTDIFpaJDfBmxn0-9gFovxNRZEt4nfy20uNbg';

  let supabase;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error('Orastories nav search: failed to load Supabase client', error);
    return;
  }

  const wrapper = document.getElementById('siteNavSearch');

  const CATEGORY_LABELS = { book: 'Books', article: 'Articles', creator: 'Creators' };
  let activeItems = [];
  let activeIndex = -1;

  const setActiveIndex = (index) => {
    activeIndex = index;
    activeItems.forEach((el, i) => {
      el.classList.toggle('bg-black/5', i === activeIndex);
      el.classList.toggle('dark:bg-white/10', i === activeIndex);
    });
    if (activeIndex >= 0) activeItems[activeIndex].scrollIntoView({ block: 'nearest' });
  };

  const openPanel = () => {
    panel.classList.remove('hidden');
  };
  const closePanel = () => {
    panel.classList.add('hidden');
    activeItems = [];
    activeIndex = -1;
  };

  function renderResults(query, rows) {
    resultsBox.innerHTML = '';
    activeItems = [];
    activeIndex = -1;

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'px-3 py-4 text-sm text-gray-500 dark:text-gray-400';
      empty.textContent = `No results for "${query}".`;
      resultsBox.appendChild(empty);
      return;
    }

    const byKind = { book: [], article: [], creator: [] };
    rows.forEach((row) => {
      if (byKind[row.kind]) byKind[row.kind].push(row);
    });

    Object.entries(byKind).forEach(([kind, items]) => {
      if (!items.length) return;
      const heading = document.createElement('p');
      heading.className = 'px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.2em] font-semibold text-gray-400 dark:text-gray-500';
      heading.textContent = CATEGORY_LABELS[kind];
      resultsBox.appendChild(heading);

      items.forEach((row) => {
        const a = document.createElement('a');
        a.href = `/${row.slug}`;
        a.className =
          'flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors text-gray-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10';

        if (row.image) {
          const img = document.createElement('img');
          img.src = row.image;
          img.alt = '';
          img.className = 'w-8 h-11 object-cover rounded-sm flex-shrink-0 bg-black/5';
          a.appendChild(img);
        }

        const textWrap = document.createElement('div');
        textWrap.className = 'min-w-0';
        const titleEl = document.createElement('p');
        titleEl.className = 'truncate font-medium';
        titleEl.textContent = row.title;
        textWrap.appendChild(titleEl);
        if (row.subtitle) {
          const subEl = document.createElement('p');
          subEl.className = 'truncate text-xs text-gray-500 dark:text-gray-400';
          subEl.textContent = row.subtitle;
          textWrap.appendChild(subEl);
        }
        a.appendChild(textWrap);

        resultsBox.appendChild(a);
        activeItems.push(a);
      });
    });

    const seeAll = document.createElement('a');
    seeAll.href = `/search?q=${encodeURIComponent(query)}`;
    seeAll.className =
      'block px-3 py-2 text-xs uppercase tracking-[0.15em] font-semibold border-t text-amber-700 border-black/10 hover:bg-black/5 dark:text-amber-400 dark:border-white/10 dark:hover:bg-white/10';
    seeAll.textContent = `See all results for "${query}"`;
    resultsBox.appendChild(seeAll);
  }

  let debounceTimer;
  let latestQuery = '';
  const runSearch = (query) => {
    latestQuery = query;
    supabase
      .rpc('search_site', { search_query: query, per_category_limit: 3 })
      .then(({ data, error }) => {
        if (query !== latestQuery) return; // a newer keystroke already superseded this request
        if (error) {
          console.error('Orastories search failed:', error);
          renderResults(query, []);
          return;
        }
        renderResults(query, data || []);
        openPanel();
      });
  };

  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
      openPanel();
      input.focus();
    } else {
      closePanel();
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const value = input.value.trim();
    if (!value) {
      closePanel();
      return;
    }
    debounceTimer = setTimeout(() => runSearch(value), 250);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
      input.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (activeItems.length) setActiveIndex(Math.min(activeIndex + 1, activeItems.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (activeItems.length) setActiveIndex(Math.max(activeIndex - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && activeItems[activeIndex]) {
        window.location.href = activeItems[activeIndex].getAttribute('href');
      } else if (input.value.trim()) {
        window.location.href = `/search?q=${encodeURIComponent(input.value.trim())}`;
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (wrapper && wrapper.contains(event.target)) return;
    closePanel();
  });
})();

// Site-wide auth widget: shows the signed-in reader's username in the nav on
// every static page. index.html runs the full React app, which already owns
// #siteNavControls via NavAccountControl - this widget skips itself there
// entirely and only handles the plain marketing/blog pages. Sign-in itself
// still only ever happens inside the React app; this only *reads* the
// session Supabase already persisted to localStorage on sign-in there.
//
// The nav bakes in a "Sign In" link by default (#siteNavSignIn) - for the
// common signed-out visitor, this widget finds no session and returns
// without touching the DOM at all. It only replaces that link with the
// account menu for the smaller, returning-signed-in-visitor case.
(async () => {
  if (document.getElementById('root')) return;

  const wrapper = document.getElementById('siteNavAuth');
  if (!wrapper) return;

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

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) return; // the baked-in "Sign In" link is already correct

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', session.user.id).maybeSingle();
  const label = (profile && profile.username) || (session.user.email ? session.user.email.split('@')[0] : 'Account');

  wrapper.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-haspopup', 'true');
  button.className = 'text-sm sm:text-base font-medium transition-colors text-gray-900 hover:text-amber-700 dark:text-gray-100 dark:hover:text-amber-400';

  const menu = document.createElement('div');
  menu.className =
    'hidden absolute right-0 mt-2 w-40 rounded-sm border shadow-lg py-1 z-50 overflow-hidden bg-white border-black/10 dark:bg-[#161616] dark:border-white/10';

  const itemClass =
    'block w-full text-left px-4 py-2 text-sm transition-colors text-gray-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10';

  const accountLink = document.createElement('a');
  accountLink.href = '/?openPortal=1';
  accountLink.textContent = 'My Account';
  accountLink.className = itemClass;

  const signOutBtn = document.createElement('button');
  signOutBtn.type = 'button';
  signOutBtn.textContent = 'Sign Out';
  signOutBtn.className = itemClass;

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.classList.toggle('hidden');
  });

  signOutBtn.addEventListener('click', async () => {
    menu.classList.add('hidden');
    await supabase.auth.signOut({ scope: 'local' });
    wrapper.innerHTML = '<a href="/?openPortal=1" id="siteNavSignIn" class="text-sm sm:text-base font-medium transition-colors text-gray-900 dark:text-gray-100 hover:text-amber-700 dark:hover:text-amber-400">Sign In</a>';
  });

  menu.appendChild(accountLink);
  menu.appendChild(signOutBtn);
  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  document.addEventListener('click', (event) => {
    if (wrapper.contains(event.target)) return;
    menu.classList.add('hidden');
  });
})();
