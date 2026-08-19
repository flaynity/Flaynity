<style>
/* ==========================================
   PREMIUM UPLOAD STUDIO THEME (ISOLATED CSS)
   ========================================== */
.page-upload-root {
    --up-bg: #ffffff;
    --up-surface: #f2f2f6;
    --up-text: #000000;
    --up-text-sec: #606060;
    --up-accent: #007aff;
    --up-divider: #e5e5ea;
    --up-radius: 24px;
    --up-safe-top: max(env(safe-area-inset-top), 24px);
    --up-safe-bottom: max(env(safe-area-inset-bottom), 24px);

    width: 100%; height: 100%; position: absolute; z-index: 3000; top: 0; left: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--up-text); pointer-events: none;
}

/* ==========================================
   PREMIUM UPLOAD SELECTION BOX (GLASSMORPHISM)
   ========================================== */
.up-backdrop {
    position: absolute; inset: 0; background: rgba(0,0,0,0.5); 
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    opacity: 0; transition: opacity 0.3s ease;
    display: flex; align-items: center; justify-content: center; pointer-events: none;
    z-index: 3050; padding: 20px;
}
.up-backdrop.active { opacity: 1; pointer-events: auto; }

.up-premium-modal {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
    width: 100%; max-width: 380px; border-radius: 32px;
    padding: 32px 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.2);
    transform: scale(0.9) translateY(20px); opacity: 0;
    transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    border: 1px solid rgba(255,255,255,0.5);
    display: flex; flex-direction: column; align-items: center;
}
.up-backdrop.active .up-premium-modal { transform: scale(1) translateY(0); opacity: 1; }

.up-pm-header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
.up-pm-title { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
.up-pm-close { width: 36px; height: 36px; background: rgba(0,0,0,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #111; transition: 0.2s; }
.up-pm-close:active { transform: scale(0.9); background: rgba(0,0,0,0.1); }

.up-pm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; }

.up-pm-item {
    display: flex; flex-direction: column; align-items: center; gap: 12px; cursor: pointer;
    padding: 16px 8px; border-radius: 20px; transition: all 0.2s ease;
}
.up-pm-item:active { transform: scale(0.95); background: rgba(0,0,0,0.05); }

.up-pm-icon-wrap {
    width: 64px; height: 64px; border-radius: 20px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 20px rgba(0,0,0,0.1); color: #fff;
}
.up-pm-icon-wrap.video { background: linear-gradient(135deg, #ff2a5f, #ff4b2b); }
.up-pm-icon-wrap.short { background: linear-gradient(135deg, #8a2387, #e94057, #f27121); }
.up-pm-icon-wrap.post  { background: linear-gradient(135deg, #00c6ff, #0072ff); }

.up-pm-icon-wrap .material-symbols-outlined { font-size: 32px; font-variation-settings: 'FILL' 1; }
.up-pm-label { font-size: 14px; font-weight: 600; color: #333; }

/* ==========================================
   FULL SCREEN FLOW LAYERS
   ========================================== */
.up-flow-layer {
    position: absolute; inset: 0; background: var(--up-bg); z-index: 3100;
    display: flex; flex-direction: column; transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.2,0.8,0.2,1); pointer-events: none;
}
.up-flow-layer.active { transform: translateY(0); pointer-events: auto; }
.up-flow-layer.bg-dark { background: #000000; color: #ffffff; --up-text: #ffffff; --up-surface: #1a1a1a; --up-bg: #000000; --up-divider: #333333; }

.up-top-bar {
    height: calc(56px + var(--up-safe-top)); padding: var(--up-safe-top) 16px 0;
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: transparent; z-index: 10;
}
.up-top-bar.bordered { border-bottom: 1px solid var(--up-divider); background: var(--up-bg); }
.up-top-bar .icon-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 50%; background: rgba(0,0,0,0.05); }
.up-flow-layer.bg-dark .icon-btn { background: rgba(255,255,255,0.15); color: #fff; }
.up-top-bar .title { font-size: 18px; font-weight: 700; text-transform: capitalize; }
.up-btn-primary { background: var(--up-accent); color: #fff; padding: 8px 24px; border-radius: 20px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; transition: opacity 0.2s; }
.up-btn-primary:active { opacity: 0.8; }
.up-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; padding-bottom: var(--up-safe-bottom); }

/* ==========================================
   CAMERA UI FIXES
   ========================================== */
.up-camera-view { flex: 1; position: relative; background: #000; overflow: hidden; border-radius: 0 0 24px 24px; }
.up-cam-video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); transition: filter 0.3s; background: #111; }
.up-cam-overlay { position: absolute; inset: 0; padding: var(--up-safe-top) 16px 24px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.up-cam-top-row { display: flex; justify-content: space-between; pointer-events: auto; }
.up-cam-add-sound { background: rgba(0,0,0,0.4); color: #fff; padding: 8px 16px; border-radius: 20px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; backdrop-filter: blur(4px); }
.up-cam-tools-right { display: flex; flex-direction: column; gap: 16px; background: rgba(0,0,0,0.3); padding: 12px 8px; border-radius: 32px; backdrop-filter: blur(4px); }
.up-cam-tool { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: pointer; font-size: 11px; }
.up-cam-tool .material-symbols-outlined { font-size: 28px; }

.up-cam-bottom { display: flex; flex-direction: column; align-items: center; gap: 24px; pointer-events: auto; padding-bottom: var(--up-safe-bottom); }
.up-duration-selector { display: flex; gap: 16px; background: rgba(0,0,0,0.4); padding: 6px 16px; border-radius: 20px; color: #fff; font-size: 13px; font-weight: 600; backdrop-filter: blur(4px); }
.up-dur-opt { opacity: 0.5; transition: 0.2s; cursor: pointer; }
.up-dur-opt.active { opacity: 1; }

.up-record-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 32px; }
.up-gallery-shortcut { width: 40px; height: 40px; border-radius: 8px; border: 2px solid #fff; overflow: hidden; background: #333; cursor: pointer; }
.up-record-btn-wrapper { position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
.up-record-ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid rgba(255,255,255,0.3); pointer-events: none; }
.up-record-btn { width: 64px; height: 64px; background: #ff0000; border-radius: 50%; cursor: pointer; transition: all 0.2s ease; border: 2px solid #fff; }
.up-record-btn.recording { transform: scale(0.5); border-radius: 8px; background: #ff0000; }
.up-cam-next { background: #fff; color: #000; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; cursor: pointer; opacity: 0; pointer-events: none; transition: 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.up-cam-next.show { opacity: 1; pointer-events: auto; transform: scale(1.1); }

/* ==========================================
   POST UPLOAD UI
   ========================================== */
.up-post-box { padding: 20px; }
.up-post-image-picker { width: 100%; aspect-ratio: 4/3; background: var(--up-surface); border: 2px dashed #ccc; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--up-text-sec); cursor: pointer; position: relative; overflow: hidden; margin-bottom: 20px; transition: 0.3s; }
.up-post-image-picker:active { transform: scale(0.98); }
.up-post-image-picker img { width: 100%; height: 100%; object-fit: contain; position: absolute; inset: 0; z-index: 1; background: #000; }
.up-post-text { width: 100%; min-height: 120px; background: var(--up-surface); border: none; border-radius: 20px; padding: 20px; font-size: 16px; color: var(--up-text); resize: none; outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }

/* Details & Preview Forms */
.up-preview-container { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; }
.up-preview-video { width: 100%; height: 100%; object-fit: contain; }
.up-form-group { padding: 16px 20px; border-bottom: 1px solid var(--up-divider); }
.up-input-title { width: 100%; font-size: 20px; font-weight: 600; border: none; outline: none; background: transparent; color: var(--up-text); padding: 8px 0; }
.up-input-desc { width: 100%; font-size: 15px; border: none; outline: none; background: transparent; color: var(--up-text-sec); min-height: 80px; resize: none; margin-top: 8px; }

/* Custom Thumb Picker */
.up-thumb-picker { width: 100%; aspect-ratio: 16/9; background: var(--up-surface); border-radius: 12px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px dashed #ccc; }
.up-thumb-picker img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; z-index: 1; }
.up-thumb-picker .edit-badge { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; padding: 4px 8px; border-radius: 4px; z-index: 2; font-size: 12px; display: flex; align-items: center; gap: 4px; }
.up-list-item { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; cursor: pointer; }
.up-list-left { display: flex; align-items: center; gap: 16px; font-size: 16px; font-weight: 500; }
.up-list-left .material-symbols-outlined { color: var(--up-text-sec); font-size: 24px; }
.up-list-sub { font-size: 13px; color: var(--up-text-sec); display: block; margin-top: 4px; }

/* Progress UI */
.up-manager-overlay { position: absolute; inset: 0; background: var(--up-bg); z-index: 4000; display: flex; flex-direction: column; transform: translateY(100%); transition: transform 0.4s; }
.up-manager-overlay.active { transform: translateY(0); pointer-events: auto;}
.up-manager-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; text-align: center; }
</style>

<div class="page-upload-root" id="upload-root">

    <!-- PREMIUM UPLOAD MODAL -->
    <div class="up-backdrop" id="up-backdrop">
        <div class="up-premium-modal" id="up-sheet">
            <div class="up-pm-header">
                <div class="up-pm-title">Create</div>
                <div class="up-pm-close" id="btn-up-close"><span class="material-symbols-outlined">close</span></div>
            </div>
            
            <div class="up-pm-grid">
                <div class="up-pm-item" data-type="video" onclick="app.triggerUploadType('video')">
                    <div class="up-pm-icon-wrap video"><span class="material-symbols-outlined">upload_file</span></div>
                    <span class="up-pm-label">Video</span>
                </div>
                <div class="up-pm-item" data-type="short" onclick="app.triggerUploadType('short')">
                    <div class="up-pm-icon-wrap short"><span class="material-symbols-outlined">app_shortcut</span></div>
                    <span class="up-pm-label">Short</span>
                </div>
                <div class="up-pm-item" data-type="post" onclick="app.triggerUploadType('post')">
                    <div class="up-pm-icon-wrap post"><span class="material-symbols-outlined">edit_square</span></div>
                    <span class="up-pm-label">Post</span>
                </div>
            </div>
        </div>
    </div>

    <!-- HIDDEN FILE PICKERS -->
    <input type="file" id="up-native-video-picker" accept="video/mp4,video/webm,video/x-m4v,video/*" class="flaynity-hidden">
    <input type="file" id="up-native-thumb-picker" accept="image/jpeg,image/png,image/webp" class="flaynity-hidden">
    <input type="file" id="up-native-post-picker" accept="image/jpeg,image/png,image/webp" class="flaynity-hidden">

    <!-- VIDEO/SHORT EDITOR LAYER -->
    <div class="up-flow-layer bg-dark" id="up-layer-edit">
        <div class="up-top-bar">
            <div class="icon-btn" id="btn-edit-back"><span class="material-symbols-outlined">arrow_back</span></div>
            <div class="title" style="font-size:15px;">Preview</div>
            <div class="icon-btn" id="btn-edit-next" style="background:var(--up-accent);"><span class="material-symbols-outlined" style="color:#fff;">arrow_forward</span></div>
        </div>
        <div class="up-preview-container" id="up-preview-clicker">
            <video class="up-preview-video" id="up-main-video" playsinline preload="auto" loop></video>
        </div>
    </div>

    <!-- CAMERA LAYER (SHORTS) -->
    <div class="up-flow-layer bg-dark" id="up-layer-camera">
        <div class="up-camera-view">
            <video class="up-cam-video" id="up-live-cam" autoplay muted playsinline></video>
            <div class="up-cam-overlay">
                <div class="up-cam-top-row">
                    <div class="icon-btn" id="btn-cam-close" style="color:#fff;"><span class="material-symbols-outlined">close</span></div>
                    <div class="up-cam-tools-right">
                        <div class="up-cam-tool" id="btn-cam-flip"><span class="material-symbols-outlined">flip_camera_ios</span></div>
                    </div>
                </div>
                <div class="up-cam-bottom">
                    <div class="up-duration-selector"><div class="up-dur-opt active">Shorts Camera</div></div>
                    <div class="up-record-row">
                        <div class="up-gallery-shortcut" onclick="document.getElementById('up-native-video-picker').click()">
                            <span class="material-symbols-outlined" style="color:#fff; padding:8px;">photo_library</span>
                        </div>
                        <div class="up-record-btn-wrapper" id="up-cam-record-wrap">
                            <div class="up-record-ring"></div>
                            <div class="up-record-btn" id="btn-cam-record"></div>
                        </div>
                        <div class="up-cam-next" id="btn-cam-next"><span class="material-symbols-outlined">check</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- DETAILS PAGE LAYER -->
    <div class="up-flow-layer" id="up-layer-details">
        <div class="up-top-bar bordered">
            <div class="icon-btn" id="btn-details-back"><span class="material-symbols-outlined">arrow_back</span></div>
            <div class="title" id="up-details-title">Details</div>
            <button class="up-btn-primary" id="btn-publish-final">Upload</button>
        </div>
        <div class="up-scroll-area">
            <div class="up-form-group">
                <div class="up-thumb-picker" id="btn-pick-custom-thumb">
                    <img id="up-final-thumb" src="">
                    <div class="edit-badge"><span class="material-symbols-outlined" style="font-size:14px;">image</span> Edit</div>
                </div>
            </div>
            
            <div class="up-form-group">
                <input type="text" class="up-input-title" id="up-input-title" placeholder="Write a catchy title..." maxlength="100">
                <textarea class="up-input-desc" id="up-input-desc" placeholder="Add description..." maxlength="5000"></textarea>
            </div>

            <div class="up-form-group" style="padding: 0 20px;">
                <div class="up-list-item">
                    <div class="up-list-left">
                        <span class="material-symbols-outlined">visibility</span>
                        <div>Visibility<span class="up-list-sub" id="up-vis-label">Public</span></div>
                    </div>
                    <select id="up-input-vis" style="opacity:0; position:absolute; width:100%; height:48px;">
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                    </select>
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
                
                <div class="up-list-item" id="up-cat-container">
                    <div class="up-list-left">
                        <span class="material-symbols-outlined">category</span>
                        <div>Category<span class="up-list-sub" id="up-cat-label">Entertainment</span></div>
                    </div>
                    <select id="up-input-cat" style="opacity:0; position:absolute; width:100%; height:48px;">
                        <option value="Entertainment">Entertainment</option>
                        <option value="Gaming">Gaming</option>
                        <option value="Education">Education</option>
                        <option value="Music">Music</option>
                    </select>
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
            </div>
        </div>
    </div>

    <!-- POST UPLOAD LAYER -->
    <div class="up-flow-layer" id="up-layer-post">
        <div class="up-top-bar bordered">
            <div class="icon-btn" id="btn-post-back"><span class="material-symbols-outlined">close</span></div>
            <div class="title">Create Post</div>
            <button class="up-btn-primary" id="btn-publish-post">Post</button>
        </div>
        <div class="up-scroll-area up-post-box">
            <div class="up-post-image-picker" id="btn-pick-post-image">
                <span class="material-symbols-outlined" style="font-size:40px; margin-bottom:12px; color:#999;">add_photo_alternate</span>
                <span style="font-weight:600; font-size:15px; color:#666;">Tap to select image</span>
                <img id="up-post-preview" src="" class="flaynity-hidden">
            </div>
            <textarea class="up-post-text" id="up-post-text" placeholder="What's on your mind?"></textarea>
        </div>
    </div>

    <!-- PROGRESS MANAGER -->
    <div class="up-manager-overlay" id="up-manager">
        <div class="up-manager-center">
            <h2 id="up-prog-pct" style="font-size:48px; margin-bottom:16px;">0%</h2>
            <div class="up-manager-status" id="up-prog-status">Uploading...</div>
            <div class="up-manager-details" id="up-prog-detail">Please do not close the app</div>
        </div>
    </div>

</div>
