/* ExoClick ad integration for Flaynity WebView.
 * VAST ads require an active ExoClick zone and network access.
 * If an ad fails, organic content continues.
 */
(function () {
  'use strict';
  const EXO = {
    longVast: 'https://s.magsrv.com/v1/vast.php?idz=6067025',
    feelsVast: 'https://s.magsrv.com/v1/vast.php?idzone=6067029',
    bannerZone: '6067031',
    bannerScript: 'https://a.magsrv.com/ad-provider.js'
  };
  let fluidPromise;
  const adSeen = new WeakSet();
  let feelsOrganicSinceAd = 0;
  let feelsAdSlotSlideId = '';
  let feelsAdActive = false;

  function loadFluidPlayer() {
    if (window.fluidPlayer) return Promise.resolve(window.fluidPlayer);
    if (fluidPromise) return fluidPromise;
    fluidPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.fluidplayer.com/v3/current/fluidplayer.min.js';
      script.async = true;
      script.onload = () => window.fluidPlayer ? resolve(window.fluidPlayer) : reject(new Error('Fluid Player unavailable'));
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return fluidPromise;
  }

  function attachLongVideoAds(video) {
    if (!video || adSeen.has(video) || !video.id || video.id !== 'fly-video') return;
    adSeen.add(video);
    loadFluidPlayer().then((fluidPlayer) => {
      if (!video.isConnected || !video.currentSrc) return;
      try {
        fluidPlayer(video, {
          layoutControls: { autoPlay: false, mute: false, controlBar: { autoHide: true } },
          vastOptions: {
            adList: [
              { roll: 'preRoll', vastTag: EXO.longVast },
              { roll: 'midRoll', vastTag: EXO.longVast, rollPoint: '00:00:30' },
              { roll: 'postRoll', vastTag: EXO.longVast }
            ],
            skipButtonCaption: 'Skip ad in [ Seconds ]',
            skipButtonClickCaption: 'Skip Ad',
            adText: 'Advertisement',
            showPlayButton: false
          }
        });
        video.dataset.exoclickVastAttached = 'true';
      } catch (e) {
        console.warn('[ExoClick] Long-video VAST setup failed; continuing organic playback.', e);
      }
    }).catch((e) => console.warn('[ExoClick] VAST player could not load.', e));
  }

  function bannerMarkup() {
    return '<div class="exoclick-post-ad" data-exoclick-ad="banner" aria-label="Advertisement" style="display:flex;justify-content:center;align-items:center;min-height:250px;margin:12px auto;max-width:100%;overflow:hidden;"><ins class="eas6a97888e2" data-zoneid="' + EXO.bannerZone + '"></ins></div>';
  }

  function loadBannerAds(root) {
    if (!root) return;
    const posts = Array.from(root.querySelectorAll('.post-card')).filter(el => !el.closest('.exoclick-post-ad'));
    root.querySelectorAll('.exoclick-post-ad').forEach(el => el.remove());
    if (posts.length < 3) return;
    for (let i = 3; i < posts.length; i += 4) {
      const post = posts[i];
      if (!post || !post.parentNode) continue;
      post.insertAdjacentHTML('beforebegin', bannerMarkup());
    }
    if (root.querySelector('.exoclick-post-ad ins')) {
      if (!document.querySelector('script[data-exoclick-banner-loader]')) {
        const s = document.createElement('script');
        s.src = EXO.bannerScript;
        s.async = true;
        s.type = 'application/javascript';
        s.dataset.exoclickBannerLoader = 'true';
        s.onerror = () => console.warn('[ExoClick] Banner loader failed.');
        document.head.appendChild(s);
      } else {
        try { (window.AdProvider = window.AdProvider || []).push({ serve: {} }); } catch (e) {}
      }
    }
  }

  function createFeelsAdLayer(slide, contentVideo) {
    if (!slide || slide.querySelector('.exoclick-feels-ad')) return;
    const layer = document.createElement('div');
    layer.className = 'exoclick-feels-ad';
    layer.style.cssText = 'position:absolute;inset:0;z-index:30;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
    layer.innerHTML = '<div style="position:absolute;top:14px;left:14px;z-index:2;color:#fff;background:#222b;padding:5px 8px;border-radius:4px;font:12px sans-serif;">Advertisement</div><video playsinline webkit-playsinline controls preload="none" style="width:100%;height:100%;object-fit:contain;background:#000;"></video><button type="button" style="position:absolute;right:14px;top:12px;z-index:3;border:0;border-radius:18px;padding:7px 12px;background:#333;color:#fff;">Close ad</button>';
    slide.classList.add('exoclick-feels-ad-slot');
    slide.appendChild(layer);
    // Hide the entire organic Feels card so the third slot is ad-only.
    Array.from(slide.children).forEach(child => { if (child !== layer) child.style.setProperty('visibility', 'hidden', 'important'); });
    const organicVideo = contentVideo;
    if (organicVideo) {
      organicVideo.pause();
      organicVideo.removeAttribute('autoplay');
      organicVideo.style.setProperty('display', 'none', 'important');
    }
    const adVideo = layer.querySelector('video');
    const close = () => {
      if (!layer.isConnected) return;
      try { adVideo.pause(); } catch (e) {}
      // Keep the ad slot organic-content-free for this feed session.
      layer.remove();
      const placeholder = document.createElement('div');
      placeholder.className = 'exoclick-feels-ad-fallback';
      placeholder.style.cssText = 'position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font:14px sans-serif;';
      placeholder.textContent = 'Advertisement unavailable';
      slide.appendChild(placeholder);
      feelsAdActive = false;
      // The organic Feels item used as this ad slot must not resume after the ad.
      if (contentVideo && contentVideo.isConnected) {
        contentVideo.pause();
        contentVideo.currentTime = 0;
        contentVideo.style.setProperty('display', 'none', 'important');
        contentVideo.style.setProperty('visibility', 'hidden', 'important');
      }
    };
    layer.querySelector('button').addEventListener('click', close);
    adVideo.addEventListener('ended', close, { once: true });
    adVideo.addEventListener('error', close, { once: true });
    feelsAdActive = true;
    if (contentVideo) {
      contentVideo.pause();
      contentVideo.currentTime = 0;
      contentVideo.style.visibility = 'hidden';
    }
    loadFluidPlayer().then((fluidPlayer) => {
      if (!layer.isConnected) return;
      try {
        fluidPlayer(adVideo, {
          layoutControls: { autoPlay: true, mute: false, controlBar: { autoHide: true } },
          vastOptions: {
            adList: [{ roll: 'preRoll', vastTag: EXO.feelsVast }],
            adText: 'Advertisement',
            showPlayButton: true
          }
        });
      } catch (e) { close(); }
    }).catch(close);
  }

  function watchFeels() {
    const root = document.getElementById('feels-swiper-container');
    if (!root || root.dataset.exoclickFeelsWatching) return;
    root.dataset.exoclickFeelsWatching = 'true';
    let lastId = '';
    const onVisible = (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.65) return;
        const slide = entry.target;
        const id = slide.getAttribute('data-shortid');
        if (!id || id === lastId) return;
        lastId = id;
        if (feelsAdActive) return;
        feelsOrganicSinceAd++;
        // Every second Feels slot is an ad-only slot: do not play its organic video.
        if (feelsOrganicSinceAd >= 2 && feelsAdSlotSlideId !== id) {
          feelsOrganicSinceAd = 0;
          feelsAdSlotSlideId = id;
          const video = slide.querySelector('video.short-video-el');
          if (video) createFeelsAdLayer(slide, video);
        }
      });
    };
    const observer = new IntersectionObserver(onVisible, { root, threshold: [0.65] });
    const scan = () => root.querySelectorAll('.short-slide[data-shortid]').forEach(el => observer.observe(el));
    new MutationObserver(scan).observe(root, { childList: true, subtree: true });
    scan();
  }

  function scan() {
    const home = document.getElementById('home-feed-container');
    if (home && (typeof activeHomeCategory === 'undefined' || activeHomeCategory === 'Posts')) loadBannerAds(home);
    else if (home) home.querySelectorAll('.exoclick-post-ad').forEach(el => el.remove());
    const video = document.getElementById('fly-video');
    if (video && video.currentSrc && !video.dataset.exoclickVastAttached) attachLongVideoAds(video);
    watchFeels();
  }

  // Existing player creates its video node dynamically; wait until a source is assigned.
  const bodyObserver = new MutationObserver(scan);
  function start() {
    scan();
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.addEventListener('loadedmetadata', (event) => {
      if (event.target && event.target.id === 'fly-video') attachLongVideoAds(event.target);
    }, true);
    document.addEventListener('play', (event) => {
      if (event.target && event.target.id === 'fly-video' && !event.target.dataset.exoclickVastAttached) attachLongVideoAds(event.target);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();