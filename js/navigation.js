/**
 * FLAYNITY — NAVIGATION CONTROLLER & SPA ROUTER
 * Optimized for Android WebView & Sketchware. Handles dynamic page loading,
 * script execution, hardware back button, bottom navigation states & memory preservation.
 */

(function() {
  'use strict';

  const ROOT_CONTAINER_ID = 'example';
  const VALID_PAGES = ['home', 'shorts', 'upload', 'discover', 'you'];
  let currentPage = null;
  const pageCache = new Map();

  window.FlaynityNav = {
    /**
     * Main Navigation Method
     * @param {string} pageName - Target page: 'home', 'shorts', 'upload', 'discover', 'you'
     * @param {boolean} pushState - Whether to record in browser history (default: true)
     */
    async navigateTo(pageName, pushState = true) {
      const target = pageName.toLowerCase().trim();
      if (!VALID_PAGES.includes(target)) {
        console.error(`[FlaynityNav] Invalid page requested: ${target}`);
        return;
      }

      if (currentPage === target && target !== 'home') {
        return; // Avoid unnecessary re-rendering of current page
      }

      const rootContainer = document.getElementById(ROOT_CONTAINER_ID);
      if (!rootContainer) {
        console.error(`[FlaynityNav] Root container #${ROOT_CONTAINER_ID} not found.`);
        return;
      }

      try {
        // 1. Fetch Page HTML (with Cache or Network)
        let htmlContent = '';
        if (pageCache.has(target)) {
          htmlContent = pageCache.get(target);
        } else {
          const response = await fetch(`pages/${target}.html?v=${Date.now()}`);
          if (!response.ok) throw new Error(`HTTP ${response.status} loading pages/${target}.html`);
          htmlContent = await response.text();
          pageCache.set(target, htmlContent);
        }

        // 2. Clean previous page video elements (Prevent memory leaks / background playback)
        const activeVideos = rootContainer.querySelectorAll('video');
        activeVideos.forEach(v => {
          v.pause();
          v.src = '';
          v.load();
        });

        // 3. Inject HTML into Root Container
        rootContainer.innerHTML = htmlContent;
        currentPage = target;

        // 4. Extract and Execute Embedded Scripts
        executePageScripts(rootContainer);

        // 5. Update Active Bottom Navigation Tab State
        updateActiveNavTab(target);

        // 6. Scroll Viewport to Top
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

        // 7. Update Browser / Android WebView History State
        if (pushState) {
          history.pushState({ page: target }, '', `#${target}`);
        }

        console.log(`[FlaynityNav] Navigated to: ${target}`);
      } catch (error) {
        console.error(`[FlaynityNav] Navigation failed:`, error);
        rootContainer.innerHTML = `
          <div style="padding: 40px 20px; text-align: center; font-family: sans-serif;">
            <h2 style="font-size: 18px; color: #111; margin-bottom: 8px;">Failed to load page</h2>
            <p style="font-size: 13px; color: #666; margin-bottom: 16px;">${error.message}</p>
            <button onclick="FlaynityNav.navigateTo('home')" style="padding: 10px 20px; background: #FF0033; color: #FFF; border: none; border-radius: 20px; font-weight: 600;">
              Return Home
            </button>
          </div>
        `;
      }
    },

    /**
     * Returns Current Page Identifier
     */
    getCurrentPage() {
      return currentPage;
    }
  };

  /**
   * Evaluates and executes <script> tags injected via innerHTML
   */
  function executePageScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  /**
   * Highlights Active Navigation Icon
   */
  function updateActiveNavTab(pageName) {
    const navItems = document.querySelectorAll('.fl-bottom-nav .fl-nav-item');
    navItems.forEach(item => {
      item.classList.remove('active');
      const icon = item.querySelector('.material-symbols-outlined');
      if (icon) icon.classList.remove('filled');

      // Match item click handler target
      const onClickAttr = item.getAttribute('onclick') || '';
      if (onClickAttr.includes(`'${pageName}'`)) {
        item.classList.add('active');
        if (icon) icon.classList.add('filled');
      }
    });
  }

  /**
   * Android Hardware Back Button & Browser History Handling
   */
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
      FlaynityNav.navigateTo(event.state.page, false);
    } else {
      const hashPage = window.location.hash.replace('#', '');
      if (VALID_PAGES.includes(hashPage)) {
        FlaynityNav.navigateTo(hashPage, false);
      } else {
        FlaynityNav.navigateTo('home', false);
      }
    }
  });

  /**
   * Initial App Entry Point Loader
   */
  document.addEventListener('DOMContentLoaded', () => {
    const initialHash = window.location.hash.replace('#', '');
    const startPage = VALID_PAGES.includes(initialHash) ? initialHash : 'home';
    FlaynityNav.navigateTo(startPage, false);
  });

})();
