/**
 * Flaynity - Centralized Navigation & SPA Router
 * Updated to match the new Minimal & Premium Design UI
 */

(function() {
    // 1. Build the App Shell Layout inside #root
    const root = document.getElementById('root');
    root.innerHTML = `
        <div id="page-container" style="width: 100%; height: 100%; position: relative;"></div>
        
        <!-- Upload Bottom Sheet -->
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

        <!-- Centralized Bottom Navigation (New Design) -->
        <nav class="bottom-nav">
            <div class="nav-item active" data-page="home">
                <span class="material-symbols-outlined nav-icon">home</span>
                <span class="nav-label">Home</span>
            </div>
            <div class="nav-item" data-page="shorts">
                <span class="material-symbols-outlined nav-icon">app_shortcut</span>
                <span class="nav-label">Shorts</span>
            </div>
            
            <!-- Center Add Button -->
            <div class="nav-item add-btn" onclick="openUploadSheet()">
                <div class="add-btn-circle">
                    <span class="material-symbols-outlined">add</span>
                </div>
            </div>
            
            <div class="nav-item" data-page="discover">
                <span class="material-symbols-outlined nav-icon">explore</span>
                <span class="nav-label">Discover</span>
            </div>
            <div class="nav-item" data-page="you">
                <div class="nav-avatar-container" id="nav-you-container">
                    <span class="material-symbols-outlined nav-icon">account_circle</span>
                </div>
                <span class="nav-label">You</span>
            </div>
        </nav>
    `;

    // 2. Inject Shared Navigation & Sheet CSS dynamically
    const navStyle = document.createElement('style');
    navStyle.innerHTML = `
        :root {
            --nav-height: 60px;
            --nav-active-color: #ff0b37; /* Image exact red */
            --nav-inactive-color: #000000;
        }
        
        .bottom-nav {
            position: fixed; bottom: 0; left: 0; width: 100%;
            height: calc(var(--nav-height) + var(--safe-area-bottom));
            background-color: #ffffff;
            border-top: 1px solid #f0f0f0;
            display: flex; justify-content: space-around; align-items: center;
            padding-bottom: var(--safe-area-bottom);
            z-index: 1000;
        }
        .nav-item {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            flex: 1; color: var(--nav-inactive-color); cursor: pointer; transition: color 0.2s;
        }
        .nav-item.active { color: var(--nav-active-color); }
        .nav-icon { font-size: 26px; font-variation-settings: 'FILL' 0; transition: 0.2s; }
        .nav-item.active .nav-icon { font-variation-settings: 'FILL' 1; }
        .nav-label { font-size: 11px; font-weight: 600; margin-top: 4px; }
        
        /* Center Add Button */
        .add-btn { flex: 0.8; }
        .add-btn-circle {
            width: 44px; height: 44px; 
            background-color: #f2f2f2; 
            border-radius: 50%; 
            display: flex; justify-content: center; align-items: center;
            transition: transform 0.2s;
        }
        .add-btn-circle:active { transform: scale(0.9); background-color: #e5e5e5; }
        .add-btn-circle .material-symbols-outlined { font-size: 28px; color: #000; }
        
        /* You Profile Avatar Icon */
        .nav-avatar-container {
            width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            padding: 2px; border: 2px solid transparent; transition: border-color 0.2s;
        }
        .nav-item.active .nav-avatar-container { border-color: var(--nav-active-color); }
        .nav-avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }

        /* Bottom Sheet Styling */
        .bottom-sheet { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2000; display: none; }
        .bottom-sheet.active { display: block; }
        .sheet-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); opacity: 0; transition: opacity 0.3s; }
        .bottom-sheet.active .sheet-overlay { opacity: 1; }
        .sheet-content {
            position: absolute; bottom: 0; left: 0; width: 100%; background-color: #ffffff;
            border-radius: 20px 20px 0 0; padding: 12px 16px 32px;
            transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .bottom-sheet.active .sheet-content { transform: translateY(0); }
        .sheet-drag-handle { width: 40px; height: 4px; background-color: #e0e0e0; border-radius: 2px; margin: 0 auto 16px; }
        .sheet-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #000; }
        .sheet-option { display: flex; align-items: center; padding: 12px 0; gap: 16px; cursor: pointer;}
        .sheet-option:active { background-color: #f9f9f9; border-radius: 8px;}
        .option-icon-bg { width: 44px; height: 44px; border-radius: 50%; background-color: #f2f2f2; display: flex; align-items: center; justify-content: center; color: #000;}
        .option-text { font-size: 16px; font-weight: 600; color: #000;}
    `;
    document.head.appendChild(navStyle);

    // 3. SPA Routing Logic
    const pageContainer = document.getElementById('page-container');
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pageCache = {}; 

    async function loadPage(pageName, addToHistory = true) {
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) item.classList.add('active');
        });

        if (addToHistory) history.pushState({ page: pageName }, '', `#${pageName}`);

        try {
            let html = pageCache[pageName];
            if (!html) {
                const response = await fetch(`pages/${pageName}.html`);
                if (!response.ok) throw new Error("Page not found");
                html = await response.text();
                pageCache[pageName] = html;
            }

            pageContainer.innerHTML = html;
            const scripts = pageContainer.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) newScript.src = oldScript.src;
                else newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript).parentNode.removeChild(newScript);
            });
            window.scrollTo(0, 0);
        } catch (error) {
            console.error(`[Flaynity] Failed to load ${pageName}:`, error);
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            if(history.state?.page !== page) loadPage(page);
        });
    });

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
        loadPage('upload').then(() => {
            setTimeout(() => {
                if(window.openVideoUploadForm) window.openVideoUploadForm(type);
            }, 100);
        });
    };

    window.addEventListener('popstate', (e) => {
        if (bottomSheet.classList.contains('active')) {
            bottomSheet.classList.remove('active');
            return;
        }
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
        // Handle overlays in you.html safely
        const overlays = document.querySelectorAll('.fullscreen-overlay.active');
        if(overlays.length > 0) {
            overlays.forEach(o => o.classList.remove('active'));
            return;
        }

        const targetPage = e.state?.page || 'home';
        loadPage(targetPage, false);
    });

    // Handle User Profile Avatar dynamically
    window.addEventListener('load', () => {
        setTimeout(() => {
            if(window.auth || window.firebase) {
                const fAuth = window.auth || window.firebase.auth();
                fAuth.onAuthStateChanged(user => {
                    const container = document.getElementById('nav-you-container');
                    if (user && user.photoURL) {
                        container.innerHTML = `<img src="${user.photoURL}" class="nav-avatar-img">`;
                    } else {
                        container.innerHTML = `<span class="material-symbols-outlined nav-icon">account_circle</span>`;
                    }
                });
            }
        }, 1000);
    });

    const initialHash = window.location.hash.replace('#', '') || 'home';
    loadPage(initialHash.split('?')[0]);

})();
