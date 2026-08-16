// ==========================================
// SPA NAVIGATION & APP INITIALIZATION ENGINE
// ==========================================

const pagesToLoad = ['home', 'shorts', 'upload', 'discover', 'you'];
const rootContainer = document.getElementById('flaynity-root');

// Bottom Navigation HTML Template
const bottomNavHTML = `
<style>
    #bottom-navigation {
        position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background: #ffffff;
        display: flex; justify-content: space-around; align-items: center;
        border-top: 1px solid #f0f0f0; z-index: 9000; padding-bottom: env(safe-area-inset-bottom);
    }
    .nav-item {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 4px; color: #0f0f0f; cursor: pointer; width: 20%; height: 100%; transition: transform 0.2s;
    }
    .nav-item:active { transform: scale(0.9); background: rgba(0,0,0,0.05); border-radius: 12px; }
    .nav-item .material-symbols-rounded { font-size: 24px; font-variation-settings: 'FILL' 0; }
    .nav-item.active .material-symbols-rounded { font-variation-settings: 'FILL' 1; }
    .nav-item .nav-label { font-size: 10px; font-weight: 500; }
    
    .nav-upload {
        width: 44px; height: 44px; border-radius: 50%; border: 1px solid #0f0f0f;
        display: flex; align-items: center; justify-content: center; background: transparent;
    }
    .nav-upload .material-symbols-rounded { font-size: 28px; font-weight: 300; }
</style>
<div id="bottom-navigation">
    <div class="nav-item active" data-target="home">
        <span class="material-symbols-rounded">home</span><span class="nav-label">Home</span>
    </div>
    <div class="nav-item" data-target="shorts">
        <span class="material-symbols-rounded">app_shortcut</span><span class="nav-label">Shorts</span>
    </div>
    <div class="nav-item" data-target="upload">
        <div class="nav-upload"><span class="material-symbols-rounded">add</span></div>
    </div>
    <div class="nav-item" data-target="discover">
        <span class="material-symbols-rounded">search</span><span class="nav-label">Discover</span>
    </div>
    <div class="nav-item" data-target="you">
        <span class="material-symbols-rounded">person</span><span class="nav-label">You</span>
    </div>
</div>
`;

// Initialize Application
async function buildAppStructure() {
    // 1. Fetch and inject all HTML pages
    for (let page of pagesToLoad) {
        try {
            const response = await fetch(`pages/${page}.html`);
            const htmlContent = await response.text();
            
            const pageDiv = document.createElement('div');
            pageDiv.id = `flaynity-page-${page}`;
            pageDiv.style.width = '100%';
            pageDiv.style.height = '100%';
            pageDiv.style.display = (page === 'home') ? 'block' : 'none'; // Only show home initially
            pageDiv.innerHTML = htmlContent;
            
            rootContainer.appendChild(pageDiv);
        } catch (error) {
            console.error(`Failed to load page: ${page}`, error);
        }
    }

    // 2. Inject Bottom Navigation
    document.body.insertAdjacentHTML('beforeend', bottomNavHTML);

    // 3. Setup Listeners
    setupNavListeners();
    if(window.initAuthUI) window.initAuthUI();
    
    // Hardware Back Button Integration (Android WebView)
    window.addEventListener('popstate', (e) => {
        if(e.state && e.state.page) {
            switchPage(e.state.page, false);
        }
    });
    history.replaceState({ page: 'home' }, "Home", "?page=home");
}

function setupNavListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.getAttribute('data-target');
            
            if (targetPage === 'upload') {
                // Upload is a Bottom Sheet overlay over the 'upload' page view
                switchPage('upload');
                const uploadSheet = document.getElementById('upload-selection-sheet');
                if(uploadSheet) uploadSheet.style.transform = 'translateY(0)';
                return;
            }
            
            // Update Active State
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            switchPage(targetPage);
        }, { passive: true }); // WebView touch optimization
    });

    // Upload Form Listeners Setup
    setTimeout(() => {
        const closeUpload = document.getElementById('close-upload');
        if(closeUpload) closeUpload.addEventListener('click', () => switchPage('home')); // Back to home
        
        // Setup Logout
        const logoutBtn = document.getElementById('menu-logout');
        if(logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                firebase.auth().signOut().then(() => switchPage('home'));
            });
        }
    }, 1000);
}

function switchPage(pageId, pushState = true) {
    // Hide all pages, show target
    pagesToLoad.forEach(p => {
        const pageEl = document.getElementById(`flaynity-page-${p}`);
        if(pageEl) {
            pageEl.style.display = (p === pageId) ? 'block' : 'none';
        }
    });

    if(pushState) {
        history.pushState({ page: pageId }, pageId, `?page=${pageId}`);
    }

    // Update bottom nav visual if navigated via back button
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => {
        if(n.getAttribute('data-target') === pageId) {
            n.classList.add('active');
        } else {
            n.classList.remove('active');
        }
    });
}

// Start App Architecture Generation on Load
document.addEventListener('DOMContentLoaded', buildAppStructure);
