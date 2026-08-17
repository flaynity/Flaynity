/**
 * Flaynity - Centralized Navigation & SPA Router
 * Manages Bottom Navigation, Page Routing, Back History, and the Upload Bottom Sheet.
 */

(function() {
    // 1. Build the App Shell Layout inside #root
    const root = document.getElementById('root');
    root.innerHTML = `
        <div id="page-container" style="width: 100%; height: 100%; position: relative;"></div>
        
        <!-- Upload Bottom Sheet (Hidden by default) -->
        <div id="upload-bottom-sheet" class="bottom-sheet">
            <div class="sheet-overlay" onclick="closeUploadSheet()"></div>
            <div class="sheet-content">
                <div class="sheet-drag-handle"></div>
                <h3 class="sheet-title">Create</h3>
                <div class="sheet-options">
                    <div class="sheet-option" onclick="triggerUpload('video')">
                        <div class="option-icon-bg"><span class="material-symbols-outlined">upload</span></div>
                        <span class="option-text">Upload a Video</span>
                    </div>
                    <div class="sheet-option" onclick="triggerUpload('short')">
                        <div class="option-icon-bg"><span class="material-symbols-outlined">bolt</span></div>
                        <span class="option-text">Create a Short</span>
                    </div>
                    <div class="sheet-option" onclick="triggerUpload('post')">
                        <div class="option-icon-bg"><span class="material-symbols-outlined">edit_square</span></div>
                        <span class="option-text">Create a Post</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Centralized Bottom Navigation -->
        <nav class="bottom-nav">
            <div class="nav-item active" data-page="home">
                <span class="material-symbols-outlined nav-icon">home</span>
                <span class="nav-label">Home</span>
            </div>
            <div class="nav-item" data-page="shorts">
                <span class="material-symbols-outlined nav-icon">app_shortcut</span>
                <span class="nav-label">Shorts</span>
            </div>
            <div class="nav-item add-btn" onclick="openUploadSheet()">
                <span class="material-symbols-outlined">add_circle</span>
            </div>
            <div class="nav-item" data-page="discover">
                <span class="material-symbols-outlined nav-icon">explore</span>
                <span class="nav-label">Discover</span>
            </div>
            <div class="nav-item" data-page="you">
                <span class="material-symbols-outlined nav-icon" id="nav-you-icon">account_circle</span>
                <span class="nav-label">You</span>
            </div>
        </nav>
    `;

    // 2. Inject Shared Navigation & Sheet CSS dynamically
    const navStyle = document.createElement('style');
    navStyle.innerHTML = `
        .bottom-nav {
            position: fixed; bottom: 0; left: 0; width: 100%;
            height: calc(var(--nav-height) + var(--safe-area-bottom));
            background-color: var(--bg-primary);
            border-top: 1px solid var(--bg-surface-light);
            display: flex; justify-content: space-around; align-items: center;
            padding-bottom: var(--safe-area-bottom);
            z-index: 1000;
        }
        .nav-item {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            flex: 1; color: var(--text-secondary); cursor: pointer; transition: color 0.2s;
        }
        .nav-item.active { color: var(--text-primary); }
        .nav-icon { font-size: 26px; font-variation-settings: 'FILL' 0; transition: 0.2s; }
        .nav-item.active .nav-icon { font-variation-settings: 'FILL' 1; }
        .nav-label { font-size: 10px; font-weight: 500; margin-top: 4px; }
        
        .add-btn .material-symbols-outlined { font-size: 42px; font-variation-settings: 'wght' 200; color: var(--text-primary); }
        
        /* Bottom Sheet Styling */
        .bottom-sheet { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2000; display: none; }
        .bottom-sheet.active { display: block; }
        .sheet-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); opacity: 0; transition: opacity 0.3s; }
        .bottom-sheet.active .sheet-overlay { opacity: 1; }
        .sheet-content {
            position: absolute; bottom: 0; left: 0; width: 100%; background-color: var(--bg-surface);
            border-radius: 16px 16px 0 0; padding: 12px 16px 32px;
            transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .bottom-sheet.active .sheet-content { transform: translateY(0); }
        .sheet-drag-handle { width: 40px; height: 4px; background-color: var(--bg-surface-light); border-radius: 2px; margin: 0 auto 16px; }
        .sheet-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
        .sheet-option { display: flex; align-items: center; padding: 12px 0; gap: 16px; }
        .option-icon-bg { width: 40px; height: 40px; border-radius: 50%; background-color: var(--bg-surface-light); display: flex; align-items: center; justify-content: center; }
        .option-text { font-size: 16px; font-weight: 500; }
    `;
    document.head.appendChild(navStyle);

    // 3. SPA Routing Logic
    const pageContainer = document.getElementById('page-container');
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pageCache = {}; // Cache fetched HTML to prevent redundant network calls

    async function loadPage(pageName, addToHistory = true) {
        // Highlight active nav item
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) item.classList.add('active');
        });

        // Handle Back History
        if (addToHistory) {
            history.pushState({ page: pageName }, '', `#${pageName}`);
        }

        try {
            // Fetch HTML file from pages/
            let html = pageCache[pageName];
            if (!html) {
                const response = await fetch(`pages/${pageName}.html`);
                if (!response.ok) throw new Error("Page not found");
                html = await response.text();
                pageCache[pageName] = html; // Cache it
            }

            // Inject HTML
            pageContainer.innerHTML = html;

            // Execute scripts inside the fetched HTML safely
            const scripts = pageContainer.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                document.body.appendChild(newScript).parentNode.removeChild(newScript);
            });

            // Scroll to top safely
            window.scrollTo(0, 0);

        } catch (error) {
            console.error(`[Flaynity] Failed to load ${pageName}:`, error);
            pageContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-secondary);">Error loading page. Please check connection.</div>`;
        }
    }

    // 4. Attach Event Listeners to Nav
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            if(history.state?.page !== page) {
                loadPage(page);
            }
        });
    });

    // 5. Upload Bottom Sheet Logic
    const bottomSheet = document.getElementById('upload-bottom-sheet');
    window.openUploadSheet = function() {
        bottomSheet.classList.add('active');
        history.pushState({ bottomSheet: true }, '', '#create');
    };
    
    window.closeUploadSheet = function() {
        bottomSheet.classList.remove('active');
        if(history.state?.bottomSheet) history.back();
    };

    window.triggerUpload = function(type) {
        closeUploadSheet();
        // Route to Upload page and trigger specific UI
        loadPage('upload').then(() => {
            // Short delay to allow scripts to execute and DOM to mount
            setTimeout(() => {
                if(window.openVideoUploadForm) window.openVideoUploadForm(type);
            }, 100);
        });
    };

    // 6. Handle Android Back Button / Browser Back Navigation intelligently
    window.addEventListener('popstate', (e) => {
        if (bottomSheet.classList.contains('active')) {
            bottomSheet.classList.remove('active');
            return;
        }

        // Handle specific component closes (Watch Page overlay, Upload Form overlay)
        const watchPage = document.getElementById('watch-page');
        if (watchPage && watchPage.classList.contains('active')) {
            window.closeWatchPage();
            return;
        }

        const uploadForm = document.getElementById('video-upload-form');
        if (uploadForm && uploadForm.classList.contains('active')) {
            window.closeUploadForm();
            return;
        }

        // Standard page navigation fallback
        const targetPage = e.state?.page || 'home';
        loadPage(targetPage, false);
    });

    // 7. Update User Icon visually if Auth State Changes
    window.addEventListener('load', () => {
        setTimeout(() => {
            if(window.auth) {
                window.auth.onAuthStateChanged(user => {
                    const icon = document.getElementById('nav-you-icon');
                    if (user && user.photoURL) {
                        icon.outerHTML = `<img src="${user.photoURL}" class="nav-icon" id="nav-you-icon" style="width:26px; height:26px; border-radius:50%; object-fit:cover; border:1px solid var(--text-primary);">`;
                    } else {
                        icon.outerHTML = `<span class="material-symbols-outlined nav-icon" id="nav-you-icon">account_circle</span>`;
                    }
                });
            }
        }, 1000);
    });

    // 8. Application Startup Sequence
    // Initial Route parsing
    const initialHash = window.location.hash.replace('#', '') || 'home';
    loadPage(initialHash.split('?')[0]);

})();
