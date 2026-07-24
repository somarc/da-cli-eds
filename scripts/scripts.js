import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('.hero') || picture.closest('.hero')) {
      return; // Don't create a duplicate hero block
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

function pageSlug() {
  const route = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
  return route.replace(/\.html$/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function decorateDocument(doc, main) {
  main.id = 'main-content';
  document.body.classList.add(`page-${pageSlug()}`);

  if (!doc.querySelector('.skip-link')) {
    const skipLink = document.createElement('a');
    skipLink.className = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to content';
    doc.body.prepend(skipLink);
  }
}

function decoratePageIntro(main) {
  if (!main.isConnected || pageSlug() === 'home') return;
  const firstSection = main.querySelector(':scope > .section');
  if (!firstSection || firstSection.querySelector('.video-hero, .hero')) return;

  firstSection.classList.add('page-intro');
  const content = firstSection.querySelector(':scope > div');
  const firstParagraph = content?.querySelector(':scope > p:first-child');
  if (firstParagraph?.nextElementSibling?.matches('h1')) firstParagraph.classList.add('page-kicker');
}

function headingId(heading) {
  if (heading.id) return heading.id;
  const slug = heading.textContent
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
  let id = slug;
  let count = 2;
  while (document.getElementById(id)) {
    id = `${slug}-${count}`;
    count += 1;
  }
  heading.id = id;
  return id;
}

function buildDocsNavigation(main) {
  if (pageSlug() === 'home') return;
  const headings = [...main.querySelectorAll('h2')]
    .filter((heading) => !heading.closest('footer, header'));
  if (headings.length < 4) return;

  const sections = [...main.children]
    .filter((child) => child.classList.contains('section') && !child.classList.contains('page-intro'));
  if (!sections.length) return;

  const shell = document.createElement('div');
  const content = document.createElement('div');
  const toc = document.createElement('nav');
  const label = document.createElement('p');
  const progress = document.createElement('div');
  const progressBar = document.createElement('span');
  const list = document.createElement('ol');

  shell.className = 'docs-shell';
  content.className = 'docs-content';
  toc.className = 'docs-toc';
  toc.setAttribute('aria-label', 'On this page');
  label.className = 'docs-toc-label';
  label.textContent = 'On this page';
  progress.className = 'docs-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.append(progressBar);

  headings.forEach((heading) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${headingId(heading)}`;
    link.textContent = heading.textContent;
    item.append(link);
    list.append(item);
  });

  toc.append(label, progress, list);
  sections.forEach((section) => content.append(section));
  shell.append(toc, content);
  main.append(shell);

  const links = [...toc.querySelectorAll('a')];
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    links.forEach((link) => {
      if (link.hash === `#${visible.target.id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-18% 0px -70% 0px', threshold: 0 });
  headings.forEach((heading) => observer.observe(heading));

  let scheduled = false;
  const updateProgress = () => {
    const rect = content.getBoundingClientRect();
    const range = Math.max(1, rect.height - window.innerHeight);
    const value = Math.min(1, Math.max(0, -rect.top / range));
    toc.style.setProperty('--reading-progress', value.toFixed(3));
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(updateProgress);
    }
  }, { passive: true });
  updateProgress();
}

function decorateCodeExamples(main) {
  main.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.code-copy')) return;
    const source = pre.querySelector('code')?.textContent || pre.textContent;
    const button = document.createElement('button');
    const status = document.createElement('span');
    button.type = 'button';
    button.className = 'code-copy';
    button.textContent = 'copy';
    button.setAttribute('aria-label', 'Copy code example');
    status.className = 'code-copy-status visually-hidden';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(source.trim());
        button.textContent = 'copied';
        button.setAttribute('aria-label', 'Code copied');
        status.textContent = 'Code copied to the clipboard.';
      } catch {
        button.textContent = 'select + copy';
        button.setAttribute('aria-label', 'Copy unavailable; select the code and copy manually');
        status.textContent = 'Copy unavailable. Select the code and copy it manually.';
      }
      window.setTimeout(() => {
        button.textContent = 'copy';
        button.setAttribute('aria-label', 'Copy code example');
        status.textContent = '';
      }, 1600);
    });
    pre.append(status, button);
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decoratePageIntro(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateDocument(doc, main);
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  await loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  decorateCodeExamples(main);
  buildDocsNavigation(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
