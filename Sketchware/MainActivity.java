package com.flaynity.social;

import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.HttpResponseCache;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import java.util.Locale;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.appopen.AppOpenAd;
import com.google.android.gms.ads.VideoController;
import com.google.android.gms.ads.VideoOptions;
import com.google.android.gms.ads.initialization.InitializationStatus;
import com.google.android.gms.ads.initialization.OnInitializationCompleteListener;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import org.json.JSONArray;
import org.json.JSONObject;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.provider.MediaStore;
import android.util.Size;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

public class MainActivity extends Activity {

    private static final String APP_CONFIG_DB_PATH = "appConfig";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";
    private static final String PREF_NAME = "FlaynityAppPref";
    private static final String KEY_CACHED_URL = "cached_website_url";
    private static final String KEY_CACHED_SECRET = "cached_secret_key";
    private static final String KEY_NOTIFICATION_REQUESTED = "notification_permission_requested";
    private static final String KEY_THEME = "app_theme_pref";

    private boolean isDarkTheme = false;          // = page behind the STATUS BAR is dark (changes per page)
    private volatile boolean appDarkTheme = false; // = real app theme (Light / Dark) reported by app.js
    private static final String KEY_APP_THEME = "app_real_theme";
    private int lastNightMode = -1;

    private String websiteUrl = null; 
    private String secretKey = null;
    private String baseUserAgent = null;

    private static final int RC_SIGN_IN = 9001;
    private GoogleSignInClient mGoogleSignInClient;
    private static final String WEB_CLIENT_ID = "587469287255-gqjahk4vkefqvr2rlg83gg46kr6iptnu.apps.googleusercontent.com";

    private WebView webview1;
    private boolean isError = false; 
    
    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> uploadMessage;
    private final static int FILECHOOSER_RESULTCODE = 1;
    private String currentFcmToken = "";

    private Handler handler = new Handler(Looper.getMainLooper());

    // ---------------- AdMob NATIVE VIDEO (Feels ad, YouTube-Shorts style) ----------------
    // GOOGLE TEST native-video unit. Replace with your real NATIVE unit ID only after the app is published.
    // MANY ads: the loader rotates through this list. Test: video unit + image/native unit (different creatives).
    // For release put your real NATIVE unit ID(s) here (one is enough, more = more variety).
    private static final String[] FEELS_AD_UNIT_IDS = {
        "ca-app-pub-3940256099942544/1044960115",   // test native VIDEO
        "ca-app-pub-3940256099942544/2247696110"    // test native ADVANCED (image / video)
    };
    private static final int FEELS_AD_QUEUE_SIZE = 4;   // ads kept ready (different ad each time)
    // Video-ad progress bar (Feels style): thin line at the very bottom of the ad, just above the bottom navigation.
    private static final int FEELS_AD_PROGRESS_HEIGHT_DP = 3;
    private static final int FEELS_AD_PROGRESS_COLOR = 0xFFFF2E55;        // pink-red (same as the app's primary colour)
    private static final int FEELS_AD_PROGRESS_TRACK_COLOR = 0x33FFFFFF;  // faint track behind the fill
    private static final long FEELS_AD_WAIT_MS = 2500;  // ad slide reached with an empty pool: wait this long for an ad
    private static final long FEELS_CTA_DELAY_MS = 1500; // CTA button appears 1.5 s after the ad started
    private int feelsAdFailStreak = 0;                   // load failures in a row (retry back-off)
    private Runnable feelsWaitRunnable = null;
    // Video ads are shown first; when no video ad is ready an image ad is used instead (so ads never run out).
    private int feelsAdUnitIdx = 0;
    private final ArrayList<NativeAd> feelsAdQueue = new ArrayList<>(); // ads loaded in advance
    private AdLoader feelsAdLoader = null;
    private NativeAd feelsShownAd = null;
    private int feelsImpressionCount = 0, longImpressionCount = 0;   // Logcat tag ADMOB_IMP
    // true = a small on-screen message (Toast) shows every counted impression. Set false before publishing.
    private static final boolean FEELS_IMPRESSION_DEBUG_TOAST = false;
    private void feelsDebugToast(String msg) {
        if (!FEELS_IMPRESSION_DEBUG_TOAST || isDestroyed()) return;
        try { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); } catch (Throwable ignored) {}
    }
    private int feelsAdShownCount = 0;            // how many Feels ads were put on screen (compare with feelsImpressionCount in Logcat)
    private boolean feelsShownImpressionSeen = false;   // did the ad that is on screen now get its impression?
    private FrameLayout feelsAdOverlay = null;

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    // ================= App Open ad (Google TEST id) =================
    // Shows every time the user enters the app: on every cold start, and when coming back from the background.
    private static final String APP_OPEN_AD_UNIT_ID = "ca-app-pub-3940256099942544/9257395921";   // Google TEST App Open id
    private static final long APP_OPEN_MIN_AWAY_MS = 2000;       // came back after at least this long -> show again
    private static final long APP_OPEN_FIRST_WAIT_MS = 6000;     // on launch wait up to this long for the ad to load
    private static final long APP_OPEN_MAX_AGE_MS = 4L * 60 * 60 * 1000;   // a loaded App Open ad expires after 4 h
    private AppOpenAd appOpenAd = null;
    private boolean appOpenLoading = false, appOpenShowing = false, appOpenFirstDone = false;
    private boolean appOpenSuppressNext = false, appInForeground = false;
    private long appOpenLoadedAt = 0, appOpenLeftAt = 0, appOpenStartAt = SystemClock.elapsedRealtime();

    private boolean appOpenAvailable() {
        return appOpenAd != null && (SystemClock.elapsedRealtime() - appOpenLoadedAt) < APP_OPEN_MAX_AGE_MS;
    }

    private void loadAppOpenAd() {
        if (isDestroyed() || appOpenLoading || appOpenAvailable()) return;
        appOpenLoading = true;
        try {
            AppOpenAd.load(this, APP_OPEN_AD_UNIT_ID, new AdRequest.Builder().build(),
                new AppOpenAd.AppOpenAdLoadCallback() {
                    @Override
                    public void onAdLoaded(AppOpenAd ad) {
                        appOpenLoading = false;
                        appOpenAd = ad;
                        appOpenLoadedAt = SystemClock.elapsedRealtime();
                        // app start: show it as soon as it is ready (if the user is still waiting)
                        if (!appOpenFirstDone && appInForeground
                                && SystemClock.elapsedRealtime() - appOpenStartAt <= APP_OPEN_FIRST_WAIT_MS) {
                            appOpenFirstDone = true;
                            showAppOpenAd();
                        }
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        appOpenLoading = false;
                        appOpenAd = null;
                        android.util.Log.e("ADMOB", "app open load failed: " + error.getMessage());
                    }
                });
        } catch (Throwable t) {
            appOpenLoading = false;
            android.util.Log.e("ADMOB", "app open load error: " + t.getMessage());
        }
    }

    private boolean showAppOpenAd() {
        if (isDestroyed() || appOpenShowing || !appOpenAvailable() || feelsAdOverlay != null) return false;
        final AppOpenAd ad = appOpenAd;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                appOpenShowing = false;
                appOpenAd = null;
                appOpenLeftAt = 0;
                loadAppOpenAd();          // next one is ready for the next time the user enters the app
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError adError) {
                appOpenShowing = false;
                appOpenAd = null;
                appOpenLeftAt = 0;
                loadAppOpenAd();
            }
        });
        appOpenShowing = true;
        appOpenLeftAt = 0;
        try {
            ad.show(this);
            return true;
        } catch (Throwable t) {
            appOpenShowing = false;
            return false;
        }
    }

    private void initAds() {
        try {
            MobileAds.initialize(this, new OnInitializationCompleteListener() {
                @Override
                public void onInitializationComplete(InitializationStatus status) {
                    loadFeelsAd();
                    loadLongAd();
                    loadAppOpenAd();
                }
            });
        } catch (Exception e) {
            android.util.Log.e("ADMOB", "init failed: " + e.getMessage());
        }
    }

    // Keeps up to 2 ads ready, so an ad is available when the user comes back to the ad slide
    private void loadFeelsAd() {
        if (isDestroyed() || feelsAdQueue.size() >= FEELS_AD_QUEUE_SIZE) return;
        if (feelsAdLoader != null && feelsAdLoader.isLoading()) return;
        try {
            final String unitId = FEELS_AD_UNIT_IDS[feelsAdUnitIdx % FEELS_AD_UNIT_IDS.length];
            feelsAdUnitIdx++;
            int want = Math.max(1, Math.min(3, FEELS_AD_QUEUE_SIZE - feelsAdQueue.size()));
            feelsAdLoader = new AdLoader.Builder(this, unitId)
                .forNativeAd(new NativeAd.OnNativeAdLoadedListener() {
                    @Override
                    public void onNativeAdLoaded(NativeAd ad) {
                        if (isDestroyed()) { ad.destroy(); return; }
                        feelsAdFailStreak = 0;
                        feelsAdQueue.add(ad);
                        // keep filling the pool until it is full (next unit id in the list)
                        handler.postDelayed(new Runnable() {
                            @Override
                            public void run() { loadFeelsAd(); }
                        }, 500);
                    }
                })
                .withAdListener(new AdListener() {
                    @Override
                    public void onAdImpression() {
                        feelsImpressionCount++;
                        feelsShownImpressionSeen = true;
                        feelsDebugToast("Impression #" + feelsImpressionCount + " counted (ads shown: " + feelsAdShownCount + ")");
                        NativeAd shown = feelsShownAd;
                        android.util.Log.d("ADMOB_IMP", "FEELS IMPRESSION COUNTED #" + feelsImpressionCount
                            + " (ads shown so far: " + feelsAdShownCount + ")"
                            + " | slot=" + feelsShownSlot
                            + " | " + (shown != null && shown.getHeadline() != null ? shown.getHeadline() : "?")
                            + " | video=" + (shown != null && adHasVideo(shown))
                            + " | unit=" + unitId);
                    }

                    @Override
                    public void onAdClicked() {
                        android.util.Log.d("ADMOB_IMP", "FEELS click | slot=" + feelsShownSlot);
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        android.util.Log.e("ADMOB", "native load failed (" + unitId + "): " + error.getMessage());
                        // no ad (e.g. no video ad available): retry with the NEXT unit id (image / native advanced)
                        // so the pool never stays empty
                        feelsAdFailStreak++;
                        long retryMs = Math.min(30000L, 1500L * (1L << Math.min(feelsAdFailStreak, 5)));
                        handler.postDelayed(new Runnable() {
                            @Override
                            public void run() { loadFeelsAd(); }
                        }, retryMs);
                    }
                })
                .withNativeAdOptions(new NativeAdOptions.Builder()
                    .setVideoOptions(new VideoOptions.Builder().setStartMuted(false).build())
                    // AdChoices (i) sits in the top-right corner; it is moved onto the details card after layout
                    .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT)
                    .build())
                .build();
            feelsAdLoader.loadAds(new AdRequest.Builder().build(), want);
        } catch (Exception e) {
            android.util.Log.e("ADMOB", "load error: " + e.getMessage());
        }
    }

    // Full-screen frame. The ad follows the finger; a short swipe or a quick flick UP (next Feels)
    // or DOWN (previous Feels) sends it away, otherwise it snaps back.
    static final int FEELS_SWIPE_MS = 220;   // ad flies out (and the Feels feed underneath scrolls in) in this time
    static final int FEELS_SNAP_MS = 160;    // short swipe: ad springs back

    private static class SwipeFrame extends FrameLayout {
        interface Listener { void onSwipe(boolean up); void onGone(); void onDragStart(); void onDrag(float dy); void onSnapBack(); }
        Listener listener;
        private float downRawY, downRawX, lastRawY, vy;
        private long lastT = 0;
        private boolean dragging = false, done = false;
        private final int slop;
        private final float dist, fling;

        SwipeFrame(Context c) {
            super(c);
            float d = c.getResources().getDisplayMetrics().density;
            slop = ViewConfiguration.get(c).getScaledTouchSlop();
            dist = 48 * d;     // short swipe is enough
            fling = 600 * d;   // or a quick flick
        }

        private void track(MotionEvent e) {
            long t = e.getEventTime();
            float y = e.getRawY();
            if (lastT > 0 && t > lastT) {
                float inst = (y - lastRawY) / (t - lastT) * 1000f;
                vy = 0.5f * vy + 0.5f * inst;
            }
            lastRawY = y;
            lastT = t;
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            if (done) return true;
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN) {
                downRawY = e.getRawY(); downRawX = e.getRawX();
                dragging = false; vy = 0; lastT = 0;
                track(e);
            } else if (a == MotionEvent.ACTION_MOVE) {
                track(e);
                float dy = e.getRawY() - downRawY, dx = e.getRawX() - downRawX;
                if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) { beginDrag(); return true; }
            }
            return false;
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            int a = e.getActionMasked();
            if (done) return true;
            float dy = e.getRawY() - downRawY;
            if (a == MotionEvent.ACTION_DOWN) {
                downRawY = e.getRawY(); downRawX = e.getRawX();
                dragging = false; vy = 0; lastT = 0;
                track(e);
            } else if (a == MotionEvent.ACTION_MOVE) {
                track(e);
                if (!dragging && Math.abs(dy) > slop && Math.abs(dy) > Math.abs(e.getRawX() - downRawX)) beginDrag();
                if (dragging) { setTranslationY(dy); if (listener != null) listener.onDrag(dy); }
            } else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) {
                if (dragging) finishSwipe(dy);
                dragging = false;
            }
            return true; // never let touches reach the WebView under the ad
        }

        private void beginDrag() {
            if (dragging) return;
            dragging = true;
            if (listener != null) listener.onDragStart();
        }

        private void finishSwipe(float dy) {
            final boolean up = dy < 0;
            boolean flung = Math.abs(vy) > fling && ((vy < 0) == up);
            if (Math.abs(dy) > dist || flung) {
                done = true;
                if (listener != null) listener.onSwipe(up);   // Feels starts moving right now
                animate().translationY(up ? -getHeight() : getHeight()).setDuration(FEELS_SWIPE_MS)
                    .setInterpolator(new android.view.animation.DecelerateInterpolator(1.5f))   // same curve as the Feels feed (JS easeOutCubic)
                    .withEndAction(new Runnable() {
                        @Override
                        public void run() { if (listener != null) listener.onGone(); }
                    }).start();
            } else {
                if (listener != null) listener.onSnapBack();
                animate().translationY(0).setDuration(FEELS_SNAP_MS)
                    .setInterpolator(new android.view.animation.DecelerateInterpolator(1.5f)).start();
            }
        }
    }

    private static boolean adHasVideo(NativeAd ad) {
        try {
            if (ad.getMediaContent() == null) return false;
            if (ad.getMediaContent().hasVideoContent()) return true;
            return ad.getMediaContent().getDuration() > 0f;   // fallback: some video ads report a duration only
        } catch (Throwable t) { return false; }
    }

    // ---- the Feels feed under the ad is scrolled in sync with the finger (JS: feelsAdDrag*) ----
    private float feelsDragDy = 0f, feelsDragSent = Float.NaN;
    private boolean feelsDragBusy = false;

    private void evalFeelsJs(String js) {
        try { if (webview1 != null) webview1.evaluateJavascript(js, null); } catch (Throwable ignored) {}
    }

    private void pushFeelsDrag() {
        if (feelsDragBusy || webview1 == null) return;
        final float dy = feelsDragDy;
        if (dy == feelsDragSent) return;
        feelsDragBusy = true;
        feelsDragSent = dy;
        final float cssPx = dy / getResources().getDisplayMetrics().density;
        try {
            webview1.evaluateJavascript("if(window.feelsAdDragMove)window.feelsAdDragMove(" + cssPx + ");", new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String v) { feelsDragBusy = false; pushFeelsDrag(); }   // coalesces: always the latest finger position
            });
        } catch (Throwable t) { feelsDragBusy = false; }
    }

    // ---- smooth start: build the ad after the Feels scroll has settled, then fade it in ----
    private static final long FEELS_BUILD_DELAY_MS = 120;
    private Runnable feelsBuildRunnable = null;
    private NativeAd feelsPendingAd = null;

    // ---- the SAME ad slide always shows the SAME ad (and replays from the start when you come back to it) ----
    private final java.util.LinkedHashMap<String, NativeAd> feelsSlotAds = new java.util.LinkedHashMap<String, NativeAd>();
    private static final int FEELS_SLOT_CACHE = 8;
    // true  = coming back to an ad slide shows the SAME ad, but its video continues from where it stopped
    //         (AdMob has no "seek to 0:00" for native video ads, so the same ad cannot be restarted).
    // false = every time you come back the ad slide shows a NEW ad that plays from the very beginning.
    private static final boolean FEELS_SAME_AD_ON_RETURN = false;
    private String feelsShownSlot = null, feelsPendingSlot = null;

    private boolean isSlotCached(NativeAd ad) { return ad != null && feelsSlotAds.containsValue(ad); }

    private void cacheSlotAd(String slot, NativeAd ad) {
        feelsSlotAds.put(slot, ad);
        while (feelsSlotAds.size() > FEELS_SLOT_CACHE) {
            String eldest = feelsSlotAds.keySet().iterator().next();
            NativeAd old = feelsSlotAds.remove(eldest);
            if (old != null && old != feelsShownAd && old != feelsPendingAd) { try { old.destroy(); } catch (Exception ignored) {} }
        }
    }

    // video ads cannot seek: stop + play is the SDK's way to start the video over
    private void restartAdVideo(final NativeAd ad) {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    if (ad != feelsShownAd || ad.getMediaContent() == null) return;
                    VideoController vc = ad.getMediaContent().getVideoController();
                    if (vc == null) return;
                    vc.stop();
                    vc.play();
                } catch (Throwable ignored) {}
            }
        }, 150);
    }

    private void showFeelsAdNow(final String mode) { showFeelsAdNow(mode, null); }

    private void showFeelsAdNow(final String mode, final String slot) {
        if (feelsAdOverlay != null || feelsBuildRunnable != null) return;
        if (feelsAdQueue.isEmpty()) {
            loadFeelsAd();
            if (feelsWaitRunnable != null) return;   // already waiting
            final long t0 = System.currentTimeMillis();
            feelsWaitRunnable = new Runnable() {
                @Override
                public void run() {
                    if (isDestroyed()) { feelsWaitRunnable = null; return; }
                    if (!feelsAdQueue.isEmpty()) { feelsWaitRunnable = null; showFeelsAdNow(mode, slot); return; }
                    if (System.currentTimeMillis() - t0 >= FEELS_AD_WAIT_MS) {
                        feelsWaitRunnable = null;
                        notifyFeelsAdFinished("not_ready");
                        loadFeelsAd();
                        return;
                    }
                    loadFeelsAd();
                    handler.postDelayed(this, 250);
                }
            };
            handler.postDelayed(feelsWaitRunnable, 250);
            return;
        }
        final NativeAd cachedAd = (FEELS_SAME_AD_ON_RETURN && slot != null) ? feelsSlotAds.get(slot) : null;
        final NativeAd ad;
        if (cachedAd != null) {
            ad = cachedAd;                      // coming back to the same ad slide -> the same ad again
            feelsSlotAds.remove(slot); feelsSlotAds.put(slot, ad);   // most recently used
        } else {
            // a VIDEO ad is preferred; if the pool has none, the first image ad is used
            int pick = 0;
            for (int i = 0; i < feelsAdQueue.size(); i++) {
                if (adHasVideo(feelsAdQueue.get(i))) { pick = i; break; }
            }
            ad = feelsAdQueue.remove(pick);
            if (FEELS_SAME_AD_ON_RETURN && slot != null) cacheSlotAd(slot, ad);
        }
        feelsPendingAd = ad;
        feelsPendingSlot = slot;
        feelsBuildRunnable = new Runnable() {
            @Override
            public void run() {
                feelsBuildRunnable = null;
                feelsPendingAd = null;
                feelsPendingSlot = null;
                if (isDestroyed()) { try { ad.destroy(); } catch (Exception ignored) {} return; }
                try {
                    buildFeelsAdOverlay(ad, mode);
                    feelsShownSlot = slot;
                    feelsAdShownCount++;
                    feelsShownImpressionSeen = false;
                    final int shownNo = feelsAdShownCount;
                    // Logcat check: every ad that is shown should get an impression. If none arrives in 4 s, it is logged.
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (feelsShownAd != ad) return;   // already closed / swiped away
                            if (!feelsShownImpressionSeen) feelsDebugToast("Ad #" + shownNo + ": NO impression after 4s");
                            android.util.Log.d("ADMOB_IMP", feelsShownImpressionSeen
                                ? "FEELS check ad #" + shownNo + ": impression OK"
                                : "FEELS check ad #" + shownNo + ": NO impression after 4s (ad visible? assets registered?)");
                        }
                    }, 4000);
                    android.util.Log.d("ADMOB_IMP", "FEELS ad shown | slot=" + slot + " | reused=" + (cachedAd != null)
                        + " | " + (ad.getHeadline() != null ? ad.getHeadline() : "?") + " | video=" + adHasVideo(ad));
                    if (cachedAd != null) restartAdVideo(ad);   // returning to an ad: play it from the beginning
                } catch (Exception e) {
                    android.util.Log.e("ADMOB", "show failed: " + e.getMessage());
                    try { ad.destroy(); } catch (Exception ignored) {}
                    if (slot != null) feelsSlotAds.remove(slot);
                    feelsAdOverlay = null;
                    feelsShownAd = null;
                    notifyFeelsAdFinished("failed");
                }
                loadFeelsAd(); // top the queue up again
            }
        };
        handler.postDelayed(feelsBuildRunnable, FEELS_BUILD_DELAY_MS);
    }

    // Set to false to hide the Like / Comment / Save / Share buttons on the ad page
    private static final boolean FEELS_AD_SHOW_ACTIONS = true;
    // ---- Floating-CTA layout (non-INSTALL ads) ----
    // Gap between the CTA button (and the name/description text) and the RIGHT edge of the screen.
    // The Like/Comment/Save/Share column lives in this right gap. Bigger number = bigger gap.
    private static final int FEELS_CTA_RIGHT_GAP_DP = 76;
    // Right margin of the Like/Comment/Save/Share column
    private static final int FEELS_ACTIONS_RIGHT_DP = 12;
    // Distance from the screen-bottom edge of the ad to the bottom of the action column.
    // Same as FEELS_FLOAT_BOTTOM_DP = the last icon (Share) sits level with the CTA button. Smaller = lower.
    private static final int FEELS_ACTIONS_BOTTOM_DP = 26;
    // Bottom margin of the floating details stack (must match stackLp below) and CTA height
    private static final int FEELS_FLOAT_BOTTOM_DP = 26;
    private static final int FEELS_CTA_HEIGHT_DP = 48;
    // IMAGE ads (no action buttons): CTA / text is FULL WIDTH with this gap on BOTH screen sides. Bigger = more gap.
    private static final int FEELS_IMAGE_SIDE_GAP_DP = 12;
    // Music button (spinning disc) under Share
    private static final int FEELS_MUSIC_SIZE_DP = 48;
    private static final long FEELS_MUSIC_SPIN_MS = 4000;   // one full turn
    private android.animation.ObjectAnimator feelsMusicAnim = null;
    // Height of the app's bottom navigation (CSS: height calc(100vh - 48px)); the ad leaves it uncovered
    private static final int FEELS_NAV_HEIGHT_DP = 48;

    private TextView feelsText(int sizeSp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(sizeSp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    // Simple white icons (heart, comment, bookmark, share) drawn with paths
    private static class FeelsIcon extends View {
        static final int HEART = 0, COMMENT = 1, SAVE = 2, SHARE = 3;
        private final int type;
        boolean on = false;
        int onColor = Color.WHITE;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final RectF rect = new RectF();

        FeelsIcon(Context c, int type) {
            super(c);
            this.type = type;
            p.setStyle(Paint.Style.FILL);
        }

        void toggle(int color) {
            on = !on;
            onColor = color;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight();
            float box = Math.min(w, h) * 0.80f;
            canvas.save();
            canvas.translate((w - box) / 2f, (h - box) / 2f);
            canvas.scale(box / 24f, box / 24f);
            // solid shapes; the round stroke join softens every corner (like the reference icons)
            p.setStyle(Paint.Style.FILL_AND_STROKE);
            p.setStrokeWidth(1.4f);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setShadowLayer(1.2f, 0f, 0.6f, 0x66000000);
            p.setColor(on ? onColor : Color.WHITE);
            path.reset();
            if (type == HEART) {
                path.moveTo(12, 20f);
                path.cubicTo(6f, 15f, 2.8f, 12f, 2.8f, 8.4f);
                path.cubicTo(2.8f, 5.8f, 4.8f, 3.8f, 7.3f, 3.8f);
                path.cubicTo(9.2f, 3.8f, 10.9f, 4.8f, 12f, 6.4f);
                path.cubicTo(13.1f, 4.8f, 14.8f, 3.8f, 16.7f, 3.8f);
                path.cubicTo(19.2f, 3.8f, 21.2f, 5.8f, 21.2f, 8.4f);
                path.cubicTo(21.2f, 12f, 18f, 15f, 12f, 20f);
                path.close();
                canvas.drawPath(path, p);
            } else if (type == COMMENT) {
                // round speech bubble, small tail at the bottom-left, three dots
                rect.set(2.8f, 3.4f, 21.2f, 17.6f);
                canvas.drawOval(rect, p);
                path.moveTo(5.2f, 14.6f);
                path.quadTo(5.2f, 18.6f, 3.2f, 20.4f);
                path.quadTo(8.2f, 20.6f, 11f, 17.4f);
                path.close();
                canvas.drawPath(path, p);
                p.clearShadowLayer();
                p.setStyle(Paint.Style.FILL);
                p.setColor(0xFF000000);
                canvas.drawCircle(7.8f, 10.5f, 1.5f, p);
                canvas.drawCircle(12f, 10.5f, 1.5f, p);
                canvas.drawCircle(16.2f, 10.5f, 1.5f, p);
            } else if (type == SAVE) {
                // bookmark: rounded corners, V notch at the bottom
                path.moveTo(6.4f, 3.2f);
                path.lineTo(17.6f, 3.2f);
                path.lineTo(17.6f, 20.4f);
                path.lineTo(12f, 16.2f);
                path.lineTo(6.4f, 20.4f);
                path.close();
                canvas.drawPath(path, p);
            } else {
                // share: arrow head pointing right + curved tail from the bottom-left
                path.moveTo(14f, 4.4f);
                path.lineTo(21.2f, 11f);
                path.lineTo(14f, 17.4f);
                path.lineTo(14f, 13.6f);
                path.cubicTo(9f, 13.6f, 5.4f, 15.6f, 4.4f, 20.2f);
                path.cubicTo(4.4f, 12.8f, 8.2f, 8.8f, 14f, 8.2f);
                path.close();
                canvas.drawPath(path, p);
            }
            canvas.restore();
        }
    }

    // Music button: dark vinyl disc with a white label and a music note; the whole view is rotated by an animator
    private static class FeelsMusicDisc extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final RectF rect = new RectF();

        FeelsMusicDisc(Context c) { super(c); }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight();
            float cx = w / 2f, cy = h / 2f;
            float r = Math.min(w, h) / 2f * 0.92f;
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFF1C1C1C);
            canvas.drawCircle(cx, cy, r, p);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(r * 0.04f);
            p.setColor(0x44FFFFFF);
            canvas.drawCircle(cx, cy, r * 0.88f, p);
            canvas.drawCircle(cx, cy, r * 0.74f, p);
            canvas.drawCircle(cx, cy, r * 0.62f, p);
            p.setStrokeWidth(r * 0.07f);
            p.setColor(0xFFFFFFFF);
            canvas.drawCircle(cx, cy, r * 0.97f, p);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFFFFFFFF);
            float lr = r * 0.50f;
            canvas.drawCircle(cx, cy, lr, p);
            // music note on the label (24x24 design box)
            canvas.save();
            float sc = (lr * 2f * 0.78f) / 24f;
            canvas.translate(cx - 12f * sc, cy - 12f * sc);
            canvas.scale(sc, sc);
            p.setColor(0xFF000000);
            rect.set(5.8f, 14.8f, 12.2f, 19.6f);
            canvas.drawOval(rect, p);
            canvas.drawRect(11.0f, 4.0f, 12.6f, 17.4f, p);
            path.reset();
            path.moveTo(12.4f, 4f);
            path.cubicTo(13.4f, 7.6f, 16.4f, 7.4f, 17.8f, 10.8f);
            path.cubicTo(15.4f, 9.6f, 13.8f, 9.8f, 12.4f, 10.4f);
            path.close();
            canvas.drawPath(path, p);
            canvas.restore();
        }
    }

    // One right-side action: icon only
    private View feelsAction(int type, String label, final boolean toggles, final int onColor, boolean first) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER_HORIZONTAL);
        final FeelsIcon ic = new FeelsIcon(this, type);
        item.addView(ic, new LinearLayout.LayoutParams(dp(48), dp(48)));
        // no text label under the icon (icon only)
        if (toggles) {
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) { ic.toggle(onColor); }
            });
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (!first) lp.topMargin = dp(16);
        item.setLayoutParams(lp);
        return item;
    }

    // "For You" / "Subscribe" tab (same look as the Feels top switch)
    private View feelsTab(String label, boolean active, final String modeKey) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView t = feelsText(16, Color.WHITE, true);
        t.setText(label);
        t.setAlpha(active ? 1f : 0.72f);
        t.setShadowLayer(3f, 0f, 1f, 0x99000000);
        t.setPadding(0, dp(8), 0, dp(6));
        col.addView(t);
        View line = new View(this);
        line.setBackgroundColor(Color.WHITE);
        line.setVisibility(active ? View.VISIBLE : View.INVISIBLE);
        col.addView(line, new LinearLayout.LayoutParams(dp(24), dp(2)));
        if (!active) {
            col.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) { feelsAdSwitchMode(modeKey); }
            });
        }
        return col;
    }

    // User tapped the other top tab while the ad is open: close the ad and switch the feed
    private void feelsAdSwitchMode(String modeKey) {
        removeFeelsAdOverlay();
        if (webview1 != null) {
            webview1.evaluateJavascript(
                "if(typeof window.onFeelsAdFinished==='function'){window.onFeelsAdFinished('abort');}"
                + "if(typeof setFeelsFeedMode==='function'){setFeelsFeedMode('" + modeKey + "');}", null);
        }
    }

    // ---- LIVE blurred video background: a small frame of the playing video is grabbed ~12x/sec, blurred, shown behind ----
    private Runnable feelsBlurTicker = null;
    private boolean feelsCopyBusy = false;

    private static android.view.TextureView findTextureView(View v) {
        if (v instanceof android.view.TextureView) return (android.view.TextureView) v;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                android.view.TextureView r = findTextureView(g.getChildAt(i));
                if (r != null) return r;
            }
        }
        return null;
    }

    private void startFeelsBlurLoop(final MediaView media, final ImageView target, final float aspect) {
        stopFeelsBlurLoop();
        final int sw = 96;
        final int sh = Math.max(16, Math.round(sw / aspect));
        feelsBlurTicker = new Runnable() {
            @Override
            public void run() {
                if (feelsAdOverlay == null || feelsBlurTicker != this) return;
                try { captureFeelsFrame(media, target, sw, sh); } catch (Throwable ignored) {}
                handler.postDelayed(this, 160);
            }
        };
        handler.postDelayed(feelsBlurTicker, 300);
    }

    private void stopFeelsBlurLoop() {
        if (feelsBlurTicker != null) { handler.removeCallbacks(feelsBlurTicker); feelsBlurTicker = null; }
        feelsCopyBusy = false;
    }

    private void captureFeelsFrame(final MediaView media, final ImageView target, int sw, int sh) {
        if (media.getWidth() <= 0 || media.getHeight() <= 0 || !media.isShown()) return;
        final Bitmap bmp = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
        // 1) video drawn on a TextureView -> read it directly (cheap, only the video)
        android.view.TextureView tv = findTextureView(media);
        if (tv != null) {
            if (!tv.isAvailable()) return;
            tv.getBitmap(bmp);
            applyFeelsBlurFrame(target, bmp);
            return;
        }
        // 2) otherwise copy the MediaView area from the window (API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !feelsCopyBusy) {
            int[] loc = new int[2];
            media.getLocationInWindow(loc);
            android.graphics.Rect src = new android.graphics.Rect(loc[0], loc[1],
                loc[0] + media.getWidth(), loc[1] + media.getHeight());
            feelsCopyBusy = true;
            try {
                android.view.PixelCopy.request(getWindow(), src, bmp, copyResult -> {
                    feelsCopyBusy = false;
                    if (copyResult == android.view.PixelCopy.SUCCESS) applyFeelsBlurFrame(target, bmp);
                }, handler);
            } catch (Throwable t) {
                feelsCopyBusy = false;
            }
        }
    }

    private final java.util.concurrent.ExecutorService feelsBlurExec = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean feelsBlurWorking = new java.util.concurrent.atomic.AtomicBoolean(false);

    // the heavy pixel work (scan + blur + scale) runs on a background thread: the UI thread only grabs the tiny frame and sets the result
    private void applyFeelsBlurFrame(final ImageView target, final Bitmap bmp) {
        if (feelsAdOverlay == null) return;
        if (!feelsBlurWorking.compareAndSet(false, true)) return;     // previous frame still processing -> skip this one
        final boolean needLight = feelsCardVideoView != null;
        try {
            feelsBlurExec.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        int w = bmp.getWidth(), h = bmp.getHeight();
                        int[] px = new int[w * h];
                        bmp.getPixels(px, 0, w, 0, 0, w, h);
                        boolean any = false;
                        for (int c : px) { if ((c & 0x00FFFFFF) != 0) { any = true; break; } }
                        if (!any) return;   // empty / not started yet: keep the previous background
                        Bitmap light = null;
                        if (needLight) {
                            light = bmp.copy(Bitmap.Config.ARGB_8888, true);
                            if (light != null) boxBlur(light, 1, 1);
                        }
                        int bw = 48, bh = Math.max(16, Math.round(bw * (float) h / w));
                        Bitmap heavy = Bitmap.createScaledBitmap(bmp, bw, bh, true);
                        boxBlur(heavy, 2, 2);
                        final Bitmap fl = light, fh = heavy;
                        handler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (feelsAdOverlay == null) return;
                                if (fl != null) feelsCardVideoBmp = fl;
                                android.graphics.drawable.BitmapDrawable bd = new android.graphics.drawable.BitmapDrawable(getResources(), fh);
                                bd.setFilterBitmap(true);
                                target.setImageDrawable(bd);
                                syncFeelsCardBlur();
                            }
                        });
                    } catch (Throwable ignored) {
                    } finally {
                        feelsBlurWorking.set(false);
                    }
                }
            });
        } catch (Throwable t) {
            feelsBlurWorking.set(false);
        }
    }

    // ---- blurred background helpers (work on every Android version, no RenderEffect needed) ----
    private void setFeelsBlurBackground(ImageView bg, NativeAd ad) {
        try {
            android.graphics.drawable.Drawable d = null;
            try { if (ad.getMediaContent() != null) d = ad.getMediaContent().getMainImage(); } catch (Throwable ignored) {}
            if (d == null && ad.getImages() != null && !ad.getImages().isEmpty() && ad.getImages().get(0) != null) {
                d = ad.getImages().get(0).getDrawable();
            }
            if (d == null && ad.getIcon() != null) d = ad.getIcon().getDrawable();
            if (d == null) return;
            int sw = 40, sh = 72;
            Bitmap small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(small);
            int iw = d.getIntrinsicWidth(), ih = d.getIntrinsicHeight();
            if (iw <= 0 || ih <= 0) { iw = sw; ih = sh; }
            float sc = Math.max(sw / (float) iw, sh / (float) ih);
            float dw = iw * sc, dh = ih * sc;
            android.graphics.Rect old = d.copyBounds();
            d.setBounds(Math.round((sw - dw) / 2f), Math.round((sh - dh) / 2f),
                        Math.round((sw + dw) / 2f), Math.round((sh + dh) / 2f));
            d.draw(c);
            d.setBounds(old);
            boxBlur(small, 3, 3);
            android.graphics.drawable.BitmapDrawable bd = new android.graphics.drawable.BitmapDrawable(getResources(), small);
            bd.setFilterBitmap(true);
            bg.setImageDrawable(bd);
            syncFeelsCardBlur();
        } catch (Throwable t) {
            android.util.Log.e("ADMOB", "blur bg failed: " + t.getMessage());
        }
    }

    private static void boxBlur(Bitmap bmp, int radius, int passes) {
        int w = bmp.getWidth(), h = bmp.getHeight();
        int[] a = new int[w * h], b = new int[w * h];
        bmp.getPixels(a, 0, w, 0, 0, w, h);
        for (int i = 0; i < passes; i++) {
            blurPass(a, b, w, h, radius, true);
            blurPass(b, a, w, h, radius, false);
        }
        bmp.setPixels(a, 0, w, 0, 0, w, h);
    }

    private static void blurPass(int[] src, int[] dst, int w, int h, int r, boolean horiz) {
        int lines = horiz ? h : w, len = horiz ? w : h;
        for (int l = 0; l < lines; l++) {
            for (int i = 0; i < len; i++) {
                int A = 0, R = 0, G = 0, B = 0, n = 0;
                for (int k = -r; k <= r; k++) {
                    int j = i + k;
                    if (j < 0 || j >= len) continue;
                    int c = src[horiz ? l * w + j : j * w + l];
                    A += c >>> 24; R += (c >> 16) & 255; G += (c >> 8) & 255; B += c & 255; n++;
                }
                dst[horiz ? l * w + i : i * w + l] = ((A / n) << 24) | ((R / n) << 16) | ((G / n) << 8) | (B / n);
            }
        }
    }

    private void buildFeelsAdOverlay(NativeAd ad, String mode) {
        final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
        final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;
        final boolean subscribeMode = "subscribe".equals(mode);
        final boolean hasVideo = adHasVideo(ad);
        // Frosted card layout is switched off for all ads (kept in code, never used). All CTAs float (no card box).
        final boolean installMode = false;
        final int sbh = statusBarHeightPx();

        final SwipeFrame root = new SwipeFrame(this);
        root.setBackgroundColor(Color.BLACK);
        root.setClickable(true);
        root.listener = new SwipeFrame.Listener() {
            @Override
            public void onSwipe(boolean up) { notifyFeelsAdFinished(up ? "swiped_up" : "swiped_down"); }

            @Override
            public void onGone() { removeFeelsAdOverlay(); }

            @Override
            public void onDragStart() {
                feelsDragDy = 0f; feelsDragSent = Float.NaN;
                evalFeelsJs("if(window.feelsAdDragStart)window.feelsAdDragStart();");
            }

            @Override
            public void onDrag(float dy) { feelsDragDy = dy; pushFeelsDrag(); }

            @Override
            public void onSnapBack() {
                evalFeelsJs("if(window.feelsAdDragCancel)window.feelsAdDragCancel(" + FEELS_SNAP_MS + ");");
            }
        };

        final NativeAdView adView = new NativeAdView(this);
        // All our views live in `inner`. adView only gets padding so the SDK's AdChoices (i) lands on the card.
        final FrameLayout inner = new FrameLayout(this);
        adView.addView(inner, new FrameLayout.LayoutParams(MATCH, MATCH));

        // Media: same area the Feels videos use (above the bottom nav); video keeps its OWN ratio, centred
        // Blurred background (fills the whole ad area, visible around the 9:16 video)
        // Ratio rule: 16:9 or WIDER -> blurred background behind the video. 9:16 / full-screen / taller -> NO blur (plain black).
        float aspect = 0f;
        try { if (ad.getMediaContent() != null) aspect = ad.getMediaContent().getAspectRatio(); } catch (Throwable ignored) {}
        if (aspect <= 0f) aspect = 16f / 9f;
        final boolean useBlur = aspect >= (16f / 9f) - 0.02f;
        ImageView blurBg = new ImageView(this);
        blurBg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        if (useBlur) {
            FrameLayout.LayoutParams blurLp = new FrameLayout.LayoutParams(MATCH, MATCH);
            blurLp.topMargin = sbh;                       // status bar area stays pure black (root is black)
            inner.addView(blurBg, blurLp);
            View blurTint = new View(this);
            blurTint.setBackgroundColor(0x4D000000);
            FrameLayout.LayoutParams tintLp = new FrameLayout.LayoutParams(MATCH, MATCH);
            tintLp.topMargin = sbh;
            inner.addView(blurTint, tintLp);
        }

        // Video: 9:16 ratio, starts exactly above the bottom navigation
        ViewGroup area = (ViewGroup) findViewById(android.R.id.content);
        int areaW = area.getWidth() > 0 ? area.getWidth() : getResources().getDisplayMetrics().widthPixels;
        int areaH = (area.getHeight() > 0 ? area.getHeight() : getResources().getDisplayMetrics().heightPixels) - dp(FEELS_NAV_HEIGHT_DP) - sbh;
        int mediaW = areaW;
        int mediaH = Math.round(areaW * 16f / 9f);
        if (mediaH > areaH) { mediaH = areaH; mediaW = Math.round(areaH * 9f / 16f); }
        int vidW = mediaW;
        int vidH = Math.round(vidW / aspect);
        if (vidH > mediaH) { vidH = mediaH; vidW = Math.round(vidH * aspect); }
        MediaView media = new MediaView(this);
        media.setImageScaleType(ImageView.ScaleType.FIT_CENTER);
        // Video centred between the status bar (top) and the bottom navigation (bottom): equal gap above and below
        FrameLayout.LayoutParams mediaLp = new FrameLayout.LayoutParams(vidW, vidH, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        mediaLp.topMargin = sbh + Math.max(0, (areaH - vidH) / 2);
        inner.addView(media, mediaLp);

        // Dark gradient behind the bottom info
        View scrim = new View(this);
        if (useBlur) {
            // blurred background: LIGHT scrim, so the blur stays visible behind the bottom ad details (not a black band)
            scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x00000000, 0x80000000}));
            inner.addView(scrim, new FrameLayout.LayoutParams(MATCH, dp(260), Gravity.BOTTOM));
        } else {
            scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x00000000, installMode ? 0xCC000000 : 0xE6000000}));
            inner.addView(scrim, new FrameLayout.LayoutParams(MATCH, dp(installMode ? 320 : 380), Gravity.BOTTOM));
        }

        // Status bar area: solid BLACK (no blur / video behind it); blur starts right below it
        View statusBlack = new View(this);
        statusBlack.setBackgroundColor(Color.BLACK);
        inner.addView(statusBlack, new FrameLayout.LayoutParams(MATCH, sbh, Gravity.TOP));

        // Top switch: For You | Subscribe (same position as Feels)
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setGravity(Gravity.CENTER);
        tabs.addView(feelsTab("For You", !subscribeMode, "for-you"));
        View gap = new View(this);
        tabs.addView(gap, new LinearLayout.LayoutParams(dp(28), 1));
        tabs.addView(feelsTab("Subscribe", subscribeMode, "subscribe"));
        FrameLayout.LayoutParams tabsLp = new FrameLayout.LayoutParams(WRAP, WRAP, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        tabsLp.topMargin = dp(58);
        inner.addView(tabs, tabsLp);

        // "Ad" label (required)
        TextView badge = feelsText(12, Color.WHITE, true);
        badge.setText("Ad");
        badge.setPadding(dp(8), dp(2), dp(8), dp(2));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#66000000"));
        badgeBg.setCornerRadius(dp(4));
        badge.setBackground(badgeBg);
        FrameLayout.LayoutParams badgeLp = new FrameLayout.LayoutParams(WRAP, WRAP, Gravity.TOP | Gravity.START);
        badgeLp.setMargins(dp(14), dp(64), 0, 0);
        inner.addView(badge, badgeLp);

        // Bottom stack: actions (right) on top, full-width details card below (equal gap both sides)
        LinearLayout bottomStack = new LinearLayout(this);
        bottomStack.setOrientation(LinearLayout.VERTICAL);

        LinearLayout actionsView = null;
        FrameLayout.LayoutParams floatActionsLp = null;
        // Right side actions: Like, Comment, Save, Share
        // Every native VIDEO ad (any CTA, INSTALL too) shows Like/Comment/Save/Share/Music; image ads show none
        if (FEELS_AD_SHOW_ACTIONS && hasVideo) {
            LinearLayout actions = new LinearLayout(this);
            actions.setOrientation(LinearLayout.VERTICAL);
            actions.setGravity(Gravity.CENTER_HORIZONTAL);
            actions.addView(feelsAction(FeelsIcon.HEART, "Like", true, Color.parseColor("#D80E45"), true));
            actions.addView(feelsAction(FeelsIcon.COMMENT, "Comment", false, 0, false));
            actions.addView(feelsAction(FeelsIcon.SAVE, "Save", true, Color.parseColor("#FFD400"), false));
            actions.addView(feelsAction(FeelsIcon.SHARE, "Share", false, 0, false));
            // Music button (spinning disc) under Share; it sits level with the CTA button
            FeelsMusicDisc disc = new FeelsMusicDisc(this);
            LinearLayout.LayoutParams discLp = new LinearLayout.LayoutParams(dp(FEELS_MUSIC_SIZE_DP), dp(FEELS_MUSIC_SIZE_DP));
            discLp.topMargin = dp(16);
            actions.addView(disc, discLp);
            if (feelsMusicAnim != null) feelsMusicAnim.cancel();
            feelsMusicAnim = android.animation.ObjectAnimator.ofFloat(disc, "rotation", 0f, 360f);
            feelsMusicAnim.setDuration(FEELS_MUSIC_SPIN_MS);
            feelsMusicAnim.setRepeatCount(android.animation.ObjectAnimator.INFINITE);
            feelsMusicAnim.setInterpolator(new android.view.animation.LinearInterpolator());
            feelsMusicAnim.start();
            actionsView = actions;
            // column sits in the right gap, bottom icon level with the CTA button
            floatActionsLp = new FrameLayout.LayoutParams(WRAP, WRAP, Gravity.BOTTOM | Gravity.END);
            floatActionsLp.rightMargin = dp(FEELS_ACTIONS_RIGHT_DP);
            floatActionsLp.bottomMargin = dp(FEELS_ACTIONS_BOTTOM_DP);
            for (int i = 0; i < actions.getChildCount(); i++) actions.getChildAt(i).setAlpha(0f); // revealed later
        }

        // Bottom info (same place as Feels): icon + name + "Sponsored . rating" + CTA
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        FrameLayout cardHolder = new FrameLayout(this);
        ImageView cardBlur = null, cardVideo = null;
        if (installMode) {
            // frosted glass: a blurred copy of the playing video shows through the card
            card.setPadding(dp(12), dp(12), dp(12), dp(12));
            GradientDrawable holderBg = new GradientDrawable();
            holderBg.setColor(0x66000000);
            holderBg.setCornerRadius(dp(18));
            cardHolder.setBackground(holderBg);
            cardHolder.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            cardHolder.setClipToOutline(true);
            cardBlur = new ImageView(this);
            cardBlur.setScaleType(ImageView.ScaleType.MATRIX);
            cardHolder.addView(cardBlur, new FrameLayout.LayoutParams(MATCH, MATCH));
            // slightly blurred LIVE video on top of it, so the video shows through the card
            cardVideo = new ImageView(this);
            cardVideo.setScaleType(ImageView.ScaleType.MATRIX);
            cardHolder.addView(cardVideo, new FrameLayout.LayoutParams(MATCH, MATCH));
            GradientDrawable tintBg = new GradientDrawable();
            tintBg.setColor(0x40000000);   // light tint: the video is visible behind the card
            tintBg.setCornerRadius(dp(18));
            card.setBackground(tintBg);
        } else {
            card.setPadding(dp(4), 0, dp(4), 0);     // floating: no box, text sits on the video
        }
        cardHolder.addView(card, new FrameLayout.LayoutParams(MATCH, WRAP));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        ImageView icon = new ImageView(this);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setColor(Color.parseColor("#222222"));
        iconBg.setCornerRadius(installMode ? dp(12) : dp(24));
        icon.setBackground(iconBg);
        icon.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        icon.setClipToOutline(true);
        row.addView(icon, new LinearLayout.LayoutParams(dp(48), dp(48)));

        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams namesLp = new LinearLayout.LayoutParams(0, WRAP, 1f);
        namesLp.leftMargin = dp(10);

        TextView headline = feelsText(16, Color.WHITE, true);
        headline.setMaxLines(1);
        headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
        names.addView(headline, new LinearLayout.LayoutParams(MATCH, WRAP));

        LinearLayout subRow = new LinearLayout(this);
        subRow.setOrientation(LinearLayout.HORIZONTAL);
        TextView sponsored = feelsText(13, Color.WHITE, true);
        sponsored.setText("Sponsored");
        subRow.addView(sponsored, new LinearLayout.LayoutParams(WRAP, WRAP));
        TextView rating = feelsText(13, Color.WHITE, false);
        subRow.addView(rating, new LinearLayout.LayoutParams(WRAP, WRAP));
        names.addView(subRow, new LinearLayout.LayoutParams(MATCH, WRAP));
        row.addView(names, namesLp);
        row.setPadding(0, 0, dp(22), 0);   // room for the AdChoices (i) icon
        card.addView(row, new LinearLayout.LayoutParams(MATCH, WRAP));

        TextView body = null;
        if (!installMode && ad.getBody() != null) {
            body = feelsText(14, Color.WHITE, false);
            body.setMaxLines(1);
            body.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(MATCH, WRAP);
            bodyLp.topMargin = dp(10);
            card.addView(body, bodyLp);
        }
        if (!installMode) {
            headline.setShadowLayer(4f, 0f, 1f, 0x99000000);
            sponsored.setShadowLayer(4f, 0f, 1f, 0x99000000);
            rating.setShadowLayer(4f, 0f, 1f, 0x99000000);
            if (body != null) body.setShadowLayer(4f, 0f, 1f, 0x99000000);
        }

        Button cta = new Button(this);
        cta.setAllCaps(false);
        cta.setTextSize(16);
        cta.setTypeface(Typeface.DEFAULT_BOLD);
        cta.setTextColor(Color.BLACK);
        GradientDrawable ctaBg = new GradientDrawable();
        ctaBg.setColor(Color.WHITE);
        ctaBg.setCornerRadius(dp(26));
        cta.setBackground(ctaBg);
        LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(MATCH, dp(FEELS_CTA_HEIGHT_DP));
        ctaLp.topMargin = dp(10);
        card.addView(cta, ctaLp);

        bottomStack.addView(cardHolder, new LinearLayout.LayoutParams(MATCH, WRAP));
        FrameLayout.LayoutParams stackLp = new FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM);
        // floating mode keeps a bigger bottom gap so the CTA can slide up while staying INSIDE the ad view (validator)
        // INSTALL: same gap left and right. Floating: bigger gap on the RIGHT (room for Like/Comment/Save/Share)
        // Video ads: bigger right gap (the action buttons live there). Image ads: no buttons -> CTA full width, small gap on both sides.
        final boolean hasActionGutter = FEELS_AD_SHOW_ACTIONS && hasVideo;
        int leftGapDp = hasActionGutter ? 12 : FEELS_IMAGE_SIDE_GAP_DP;
        int rightGapDp = hasActionGutter ? FEELS_CTA_RIGHT_GAP_DP : FEELS_IMAGE_SIDE_GAP_DP;
        stackLp.setMargins(dp(leftGapDp), 0, dp(rightGapDp), dp(FEELS_FLOAT_BOTTOM_DP));
        inner.addView(bottomStack, stackLp);
        if (hasVideo) {
            FrameLayout progTrack = new FrameLayout(this);
            progTrack.setBackgroundColor(FEELS_AD_PROGRESS_TRACK_COLOR);
            View progFill = new View(this);
            progFill.setBackgroundColor(FEELS_AD_PROGRESS_COLOR);
            progFill.setPivotX(0f);
            progFill.setScaleX(0f);
            progTrack.addView(progFill, new FrameLayout.LayoutParams(MATCH, MATCH));
            inner.addView(progTrack, new FrameLayout.LayoutParams(MATCH, dp(FEELS_AD_PROGRESS_HEIGHT_DP), Gravity.BOTTOM));
            startFeelsProgress(ad, progFill);
        }
        if (floatActionsLp != null && actionsView != null) inner.addView(actionsView, floatActionsLp);
        feelsCardBlurView = cardBlur;
        feelsCardVideoView = cardVideo;
        feelsMediaView = media;
        feelsCardVideoBmp = null;
        feelsCardHolderView = installMode ? cardHolder : null;
        feelsStackView = bottomStack;
        feelsBlurBgView = blurBg;
        feelsCardBlurBmp = null;
        if (!installMode) {          // CTA appears 1.5 s after the ad started: fade + slide up
            cta.setAlpha(0f);
            cta.setTranslationY(dp(8));   // total offset (8 + 6) stays inside the 26dp bottom margin -> validator OK
        }

        // Details card starts hidden and slides in after the ad has started
        // IMPORTANT (AdMob validator): the card's assets must ALWAYS stay inside the native ad view,
        // so the intro animation uses fade + scale + a tiny slide (less than the 12dp bottom margin), never a big offset.
        bottomStack.setAlpha(0f);
        bottomStack.setScaleX(0.9f);
        bottomStack.setScaleY(0.9f);
        bottomStack.setTranslationY(dp(6));

        // Move the SDK AdChoices (i) icon onto the top-right corner of the details card
        final LinearLayout stackRef = bottomStack;
        final View cardRef = cardHolder;
        bottomStack.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int oR, int ob) {
                stackRef.setPivotX(stackRef.getWidth() / 2f);
                stackRef.setPivotY(stackRef.getHeight());      // grows from the bottom edge
                syncFeelsCardBlur();
                adView.post(new Runnable() {
                    @Override
                    public void run() { positionFeelsAdChoices(adView, inner, stackRef, cardRef); }
                });
            }
        });

        // Fill the ad assets and register them
        headline.setText(ad.getHeadline());
        adView.setHeadlineView(headline);
        if (body != null) {
            body.setText(ad.getBody());
            adView.setBodyView(body);
        }
        if (ad.getIcon() != null && ad.getIcon().getDrawable() != null) {
            icon.setImageDrawable(ad.getIcon().getDrawable());
            adView.setIconView(icon);
        } else {
            icon.setVisibility(View.GONE);
        }
        if (ad.getStarRating() != null) {
            rating.setText("  \u00B7  " + String.format(Locale.US, "%.1f", ad.getStarRating()) + " \u2605");
            adView.setStarRatingView(rating);
        }
        if (ad.getCallToAction() != null) {
            cta.setText(ad.getCallToAction());
            adView.setCallToActionView(cta);
        } else {
            cta.setVisibility(View.GONE);
        }
        if (useBlur) setFeelsBlurBackground(blurBg, ad);
        media.setMediaContent(ad.getMediaContent());
        adView.setMediaView(media);
        adView.setNativeAd(ad);

        root.addView(adView, new FrameLayout.LayoutParams(MATCH, MATCH));

        // The overlay stops above the bottom navigation, so the real nav bar stays visible and tappable
        ViewGroup content = (ViewGroup) findViewById(android.R.id.content);
        FrameLayout.LayoutParams rootLp = new FrameLayout.LayoutParams(MATCH, MATCH);
        rootLp.bottomMargin = dp(FEELS_NAV_HEIGHT_DP);
        content.addView(root, rootLp);
        root.setAlpha(0f);
        root.animate().alpha(1f).setDuration(200).start();   // fade in: no sudden pop
        feelsAdOverlay = root;
        feelsShownAd = ad;
        // black status bar -> white status-bar icons while the ad is open (restored when it closes)
        if (feelsSavedStatusDark == null) feelsSavedStatusDark = isDarkTheme;
        applyStatusBarTheme(true);
        if (useBlur) startFeelsBlurLoop(media, blurBg, aspect);

        // Reveal the details card (animated) once the ad is really playing
        feelsCardRevealed = false;
        final View fStack = bottomStack, fCta = cta, fActions = actionsView;
        feelsRevealFallback = new Runnable() {
            @Override
            public void run() { feelsRevealFallback = null; revealFeelsCard(fStack, fActions, fCta, installMode); }
        };
        long fallbackMs = 1800;
        try {
            if (hasVideo) {
                ad.getMediaContent().getVideoController().setVideoLifecycleCallbacks(
                    new VideoController.VideoLifecycleCallbacks() {
                        @Override
                        public void onVideoStart() { revealFeelsCard(fStack, fActions, fCta, installMode); }
                    });
            } else {
                fallbackMs = 50;    // image ad: starts at once
            }
        } catch (Throwable ignored) {}
        handler.postDelayed(feelsRevealFallback, fallbackMs);
    }

    // Put false to leave the AdChoices (i) in the screen's top-right corner (SDK default position).
    private static final boolean FEELS_ADCHOICES_ON_CARD = true;

    // AdChoices (i) is drawn by the Ads SDK in the top-right corner of the NativeAdView.
    // The NativeAdView keeps its FULL size (no padding / no clipping, so the validator stays happy);
    // only the SDK's own overlay view is moved down/left with translation so the icon sits on the card.
    private void positionFeelsAdChoices(NativeAdView adView, FrameLayout inner, View stack, View card) {
        if (!FEELS_ADCHOICES_ON_CARD || feelsAdOverlay == null || card.getHeight() <= 0) return;
        float ty = stack.getTop() + card.getTop() + dp(8);
        int rightGap = dp(12);
        try { rightGap = ((FrameLayout.LayoutParams) stack.getLayoutParams()).rightMargin; } catch (Throwable ignored) {}
        float tx = -(rightGap + dp(8));
        for (int i = 0; i < adView.getChildCount(); i++) {
            View c = adView.getChildAt(i);
            if (c == inner) continue;                 // our own views
            if (c.getTranslationY() != ty) c.setTranslationY(ty);
            if (c.getTranslationX() != tx) c.setTranslationX(tx);
        }
    }

    private ImageView feelsCardBlurView = null, feelsBlurBgView = null;   // frosted-glass backdrop of the card
    private ImageView feelsCardVideoView = null;   // lightly blurred live video inside the card
    private MediaView feelsMediaView = null;
    private Bitmap feelsCardVideoBmp = null;
    private View feelsCardHolderView = null, feelsStackView = null;
    private Bitmap feelsCardBlurBmp = null;
    private Runnable feelsCtaReveal = null;
    private Boolean feelsSavedStatusDark = null;
    private boolean feelsCardRevealed = false;
    private Runnable feelsRevealFallback = null;

    // Info slides up + fades in. INSTALL: action buttons fly in, CTA pops.
    // Other CTAs (floating mode): the CTA button slides up + fades in 2 seconds after the ad started.
    private void revealFeelsCard(View stack, View actions, final View cta, boolean installMode) {
        if (feelsCardRevealed || feelsAdOverlay == null) return;
        feelsCardRevealed = true;
        if (feelsRevealFallback != null) { handler.removeCallbacks(feelsRevealFallback); feelsRevealFallback = null; }
        stack.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0f).setStartDelay(0).setDuration(560)
            .setInterpolator(new android.view.animation.DecelerateInterpolator(2.2f)).start();
        if (actions instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) actions;
            for (int i = 0; i < g.getChildCount(); i++) {
                View item = g.getChildAt(i);
                item.setAlpha(0f);
                item.setTranslationX(dp(40));
                item.animate().alpha(1f).translationX(0f).setStartDelay(240 + i * 80L).setDuration(420)
                    .setInterpolator(new android.view.animation.OvershootInterpolator(1.6f)).start();
            }
        }
        if (installMode) {
            cta.setScaleX(0.88f);
            cta.setScaleY(0.88f);
            cta.animate().scaleX(1f).scaleY(1f).setStartDelay(320).setDuration(480)
                .setInterpolator(new android.view.animation.OvershootInterpolator(2.2f)).start();
        } else {
            feelsCtaReveal = new Runnable() {
                @Override
                public void run() {
                    feelsCtaReveal = null;
                    if (feelsAdOverlay == null) return;
                    cta.animate().alpha(1f).translationY(0f).setStartDelay(0).setDuration(500)
                        .setInterpolator(new android.view.animation.DecelerateInterpolator(2f)).start();
                }
            };
            handler.postDelayed(feelsCtaReveal, FEELS_CTA_DELAY_MS);
        }
    }

    // Frosted-glass card: shows the blurred video frame cropped to the area behind the card
    private void syncFeelsCardVideo() {
        ImageView cv = feelsCardVideoView;
        MediaView mv = feelsMediaView;
        View holder = feelsCardHolderView, stack = feelsStackView;
        Bitmap bm = feelsCardVideoBmp;
        if (cv == null || mv == null || holder == null || stack == null || bm == null) return;
        if (mv.getWidth() <= 0 || mv.getHeight() <= 0 || bm.getWidth() <= 0 || bm.getHeight() <= 0) return;
        if (cv.getTag() != bm) {
            cv.setTag(bm);
            android.graphics.drawable.BitmapDrawable nd = new android.graphics.drawable.BitmapDrawable(getResources(), bm);
            nd.setFilterBitmap(true);
            cv.setImageDrawable(nd);
        }
        // map the video frame onto the video's real rectangle, seen through the card
        float left = stack.getLeft() + holder.getLeft() - mv.getLeft();
        float top = stack.getTop() + holder.getTop() - mv.getTop();
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setScale(mv.getWidth() / (float) bm.getWidth(), mv.getHeight() / (float) bm.getHeight());
        m.postTranslate(-left, -top);
        cv.setImageMatrix(m);
    }

    private void syncFeelsCardBlur() {
        syncFeelsCardVideo();
        ImageView cb = feelsCardBlurView, bg = feelsBlurBgView;
        View holder = feelsCardHolderView, stack = feelsStackView;
        if (cb == null || bg == null || holder == null || stack == null) return;
        android.graphics.drawable.Drawable d = bg.getDrawable();
        if (!(d instanceof android.graphics.drawable.BitmapDrawable)) return;
        Bitmap bm = ((android.graphics.drawable.BitmapDrawable) d).getBitmap();
        if (bm == null) return;
        if (feelsCardBlurBmp != bm) {
            feelsCardBlurBmp = bm;
            android.graphics.drawable.BitmapDrawable nd = new android.graphics.drawable.BitmapDrawable(getResources(), bm);
            nd.setFilterBitmap(true);
            cb.setImageDrawable(nd);
        }
        int iw = bm.getWidth(), ih = bm.getHeight();
        int W = bg.getWidth(), H = bg.getHeight();
        if (iw <= 0 || ih <= 0 || W <= 0 || H <= 0) return;
        float sc = Math.max(W / (float) iw, H / (float) ih);      // same CENTER_CROP as the background
        float dx = (W - iw * sc) / 2f, dy = (H - ih * sc) / 2f;
        float left = stack.getLeft() + holder.getLeft() - bg.getLeft();
        float top = stack.getTop() + holder.getTop() - bg.getTop();
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setScale(sc, sc);
        m.postTranslate(dx - left, dy - top);
        cb.setImageMatrix(m);
    }

    // ---- Feels-style play-progress bar at the very bottom of the ad (just above the bottom navigation) ----
    private Runnable feelsProgTicker = null;
    private static java.lang.reflect.Method sCurTimeMethod = null;
    private static boolean sCurTimeLookedUp = false;

    private static float adCurrentTime(com.google.android.gms.ads.MediaContent mc) {
        try {
            if (!sCurTimeLookedUp) {
                sCurTimeLookedUp = true;
                try { sCurTimeMethod = com.google.android.gms.ads.MediaContent.class.getMethod("getCurrentTime"); } catch (Throwable t) { sCurTimeMethod = null; }
            }
            if (sCurTimeMethod == null) return -1f;
            Object o = sCurTimeMethod.invoke(mc);
            return o instanceof Number ? ((Number) o).floatValue() : -1f;
        } catch (Throwable t) { return -1f; }
    }

    private void stopFeelsProgress() {
        if (feelsProgTicker != null) { handler.removeCallbacks(feelsProgTicker); feelsProgTicker = null; }
    }

    private void startFeelsProgress(final NativeAd ad, final View fill) {
        stopFeelsProgress();
        final long t0 = SystemClock.elapsedRealtime();
        feelsProgTicker = new Runnable() {
            @Override
            public void run() {
                if (feelsProgTicker != this) return;
                float f = 0f;
                try {
                    com.google.android.gms.ads.MediaContent mc = ad.getMediaContent();
                    float dur = mc != null ? mc.getDuration() : 0f;
                    if (dur > 0f) {
                        float cur = adCurrentTime(mc);
                        float elapsed = (SystemClock.elapsedRealtime() - t0) / 1000f;
                        if (cur < 0f || (cur <= 0f && elapsed > 2f)) cur = Math.max(0f, elapsed - 0.5f);   // SDK without getCurrentTime: estimate
                        f = Math.max(0f, Math.min(1f, cur / dur));
                    }
                } catch (Throwable ignored) {}
                fill.animate().scaleX(f).setDuration(60).setInterpolator(new android.view.animation.LinearInterpolator()).start();
                handler.postDelayed(this, 50);
            }
        };
        handler.post(feelsProgTicker);
    }

    private void removeFeelsAdOverlay() {
        stopFeelsProgress();
        if (feelsWaitRunnable != null) { handler.removeCallbacks(feelsWaitRunnable); feelsWaitRunnable = null; }
        if (feelsBuildRunnable != null) {
            handler.removeCallbacks(feelsBuildRunnable); feelsBuildRunnable = null;
            if (feelsPendingAd != null) { if (!isSlotCached(feelsPendingAd)) { try { feelsPendingAd.destroy(); } catch (Exception ignored) {} } feelsPendingAd = null; feelsPendingSlot = null; }
        }
        feelsDragBusy = false; feelsDragSent = Float.NaN;
        stopFeelsBlurLoop();
        if (feelsRevealFallback != null) { handler.removeCallbacks(feelsRevealFallback); feelsRevealFallback = null; }
        if (feelsCtaReveal != null) { handler.removeCallbacks(feelsCtaReveal); feelsCtaReveal = null; }
        if (feelsMusicAnim != null) { try { feelsMusicAnim.cancel(); } catch (Exception ignored) {} feelsMusicAnim = null; }
        feelsCardBlurView = null; feelsBlurBgView = null; feelsCardHolderView = null; feelsStackView = null; feelsCardBlurBmp = null;
        feelsCardVideoView = null; feelsMediaView = null; feelsCardVideoBmp = null;
        if (feelsSavedStatusDark != null) { applyStatusBarTheme(feelsSavedStatusDark); feelsSavedStatusDark = null; }
        if (feelsAdOverlay != null) {
            try {
                ViewGroup parent = (ViewGroup) feelsAdOverlay.getParent();
                if (parent != null) parent.removeView(feelsAdOverlay);
            } catch (Exception ignored) {}
            feelsAdOverlay = null;
        }
        if (feelsShownAd != null) {
            if (isSlotCached(feelsShownAd)) {
                // kept for its slide: only stop it playing (sound) - it is shown again when the user comes back
                try { if (feelsShownAd.getMediaContent() != null && feelsShownAd.getMediaContent().getVideoController() != null) feelsShownAd.getMediaContent().getVideoController().pause(); } catch (Throwable ignored) {}
            } else {
                try { feelsShownAd.destroy(); } catch (Exception ignored) {}
            }
            feelsShownAd = null;
        }
        feelsShownSlot = null;
        loadFeelsAd();
    }

    // Back button: close the ad at once
    private void dismissFeelsAd(String result) {
        if (feelsAdOverlay == null) return;
        notifyFeelsAdFinished(result);
        removeFeelsAdOverlay();
    }

    private void destroyFeelsAds() {
        try {
            for (NativeAd a : feelsAdQueue) a.destroy();
            feelsAdQueue.clear();
            for (NativeAd a : feelsSlotAds.values()) { try { a.destroy(); } catch (Exception ignored) {} }
            feelsSlotAds.clear();
            if (feelsShownAd != null) { feelsShownAd.destroy(); feelsShownAd = null; }
        } catch (Exception ignored) {}
    }

    private void notifyFeelsAdFinished(final String result) {
        runOnUiThread(() -> {
            if (webview1 != null) {
                webview1.evaluateJavascript(
                    "if(typeof window.onFeelsAdFinished==='function'){window.onFeelsAdFinished('" + result + "');}", null);
            }
        });
    }

    // ================= LONG VIDEO ADS (pre-roll / mid-roll, YouTube style) =================
    // GOOGLE TEST native-video unit. Replace with your real NATIVE unit ID only after the app is published.
    private static final String LONG_AD_UNIT_ID = "ca-app-pub-3940256099942544/1044960115";
    private static final int LONG_AD_SKIP_AFTER_SEC = 5;     // "Skip" button appears after 5 seconds
    private static final int LONG_AD_IMAGE_ONLY_SEC = 8;     // ad without video: auto-finish after 8 seconds
    private static final int LONG_AD_BUTTON_COLOR = 0xFF7F1335;   // "Sign up" button colour (maroon, like the design)
    private static final int LONG_AD_PROGRESS_COLOR = 0xFFE8BB2A; // yellow line under the video
    // The video has its own mute button at the bottom-left (removed now). Increase this if you ever show it again,
    // so the ad attribution is never covered (AdMob validator requires it to be fully visible).
    private static final int LONG_AD_SPONSORED_LEFT_DP = 92;
    // Texts of the two info cards (the ad network gives no card titles, so these are fixed)
    private static final String LONG_AD_CARD1_TITLE = "About this offer";
    private static final String LONG_AD_CARD2_TITLE = "Learn more";
    private static final String LONG_AD_CARD2_TEXT = "Tap the button below to continue.";

    private final ArrayList<NativeAd> longAdQueue = new ArrayList<>();
    private AdLoader longAdLoader = null;
    private NativeAd longShownAd = null;
    private FrameLayout longAdOverlay = null;
    private boolean longAdFinished = false;
    private int longAdSecondsLeft = 0;
    private Runnable longAdTicker = null;
    private Runnable longAdAutoFinish = null;
    private Runnable longProgressTicker = null;
    private long longElapsedMs = 0, longDurationMs = 0;
    private boolean longVideoPlaying = true;
    // views kept so the layout can follow rotation (portrait <-> landscape)
    private ViewGroup longContent = null;
    private FrameLayout longStage = null;
    private LinearLayout longSheet = null;
    private View longHandle = null, longHeaderRow = null, longHintBox = null, longProgressFill = null;
    private HorizontalScrollView longCarousel = null;
    private LinearLayout longSkipPill = null;
    private LinearLayout longSponsoredBox = null;
    private TextView longHeadline, longAdvertiser;
    private Button longCta = null;
    private int longTopPortrait = 0;
    private int longTextMain = Color.WHITE, longTextMuted = 0xFFAAAAAA, longSheetBg = Color.WHITE;
    private ImageView longLogo = null;
    private LinearLayout longMetaRow = null;
    private final ArrayList<View> longCardBadges = new ArrayList<>();

    // ---------- tiny SVG-path reader (M m L l H h V v C c Z z) for the Material icons ----------
    private static Path svgPath(String d) {
        Path path = new Path();
        ArrayList<String> tk = new ArrayList<>();
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("[a-zA-Z]|-?(?:\\d+\\.?\\d*|\\.\\d+)").matcher(d);
        while (m.find()) tk.add(m.group());
        int i = 0;
        char cmd = 'M';
        float cx = 0, cy = 0, sx = 0, sy = 0;
        while (i < tk.size()) {
            String t = tk.get(i);
            if (Character.isLetter(t.charAt(0))) {
                cmd = t.charAt(0);
                i++;
                if (cmd == 'z' || cmd == 'Z') { path.close(); cx = sx; cy = sy; continue; }
            }
            boolean rel = Character.isLowerCase(cmd);
            switch (Character.toUpperCase(cmd)) {
                case 'M': {
                    float x = Float.parseFloat(tk.get(i++)), y = Float.parseFloat(tk.get(i++));
                    if (rel) { x += cx; y += cy; }
                    path.moveTo(x, y); cx = sx = x; cy = sy = y;
                    cmd = rel ? 'l' : 'L';
                    break;
                }
                case 'L': {
                    float x = Float.parseFloat(tk.get(i++)), y = Float.parseFloat(tk.get(i++));
                    if (rel) { x += cx; y += cy; }
                    path.lineTo(x, y); cx = x; cy = y;
                    break;
                }
                case 'H': {
                    float x = Float.parseFloat(tk.get(i++));
                    if (rel) x += cx;
                    path.lineTo(x, cy); cx = x;
                    break;
                }
                case 'V': {
                    float y = Float.parseFloat(tk.get(i++));
                    if (rel) y += cy;
                    path.lineTo(cx, y); cy = y;
                    break;
                }
                case 'C': {
                    float x1 = Float.parseFloat(tk.get(i++)), y1 = Float.parseFloat(tk.get(i++));
                    float x2 = Float.parseFloat(tk.get(i++)), y2 = Float.parseFloat(tk.get(i++));
                    float x = Float.parseFloat(tk.get(i++)), y = Float.parseFloat(tk.get(i++));
                    if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
                    path.cubicTo(x1, y1, x2, y2, x, y); cx = x; cy = y;
                    break;
                }
                default: i = tk.size(); // unsupported command: stop
            }
        }
        return path;
    }

    // Icons of the ad page, drawn in code (no image files needed):
    // like (thumb up), share (forward arrow), more (3 dots), close (X), info (i in circle), skip (>|), chevron (^)
    private static class LongIcon extends View {
        static final int LIKE = 0, SHARE = 1, MORE = 2, CLOSE = 3, INFO = 4, SKIP = 5, CHEVRON = 6, STAR = 7;
        private static final Path P_LIKE = svgPath("M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z");
        private static final Path P_SHARE = svgPath("M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z");
        private static final Path P_STAR = svgPath("M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z");
        private final int type;
        private int color;
        boolean on = false;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        LongIcon(Context c, int type, int color) {
            super(c);
            this.type = type;
            this.color = color;
        }

        void setIconColor(int c) { color = c; invalidate(); }

        void toggle() { on = !on; invalidate(); }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth() - getPaddingLeft() - getPaddingRight();
            float h = getHeight() - getPaddingTop() - getPaddingBottom();
            float box = Math.min(w, h);
            canvas.save();
            canvas.translate(getPaddingLeft() + (w - box) / 2f, getPaddingTop() + (h - box) / 2f);
            canvas.scale(box / 24f, box / 24f);
            p.setColor(color);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            switch (type) {
                case LIKE:
                    p.setStyle(on ? Paint.Style.FILL_AND_STROKE : Paint.Style.STROKE);
                    p.setStrokeWidth(1.7f);
                    canvas.drawPath(P_LIKE, p);
                    break;
                case SHARE:
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(1.7f);
                    canvas.drawPath(P_SHARE, p);
                    break;
                case MORE:
                    p.setStyle(Paint.Style.FILL);
                    canvas.drawCircle(5f, 12f, 2.1f, p);
                    canvas.drawCircle(12f, 12f, 2.1f, p);
                    canvas.drawCircle(19f, 12f, 2.1f, p);
                    break;
                case CLOSE:
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(2.3f);
                    canvas.drawLine(5f, 5f, 19f, 19f, p);
                    canvas.drawLine(19f, 5f, 5f, 19f, p);
                    break;
                case INFO:
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(1.9f);
                    canvas.drawCircle(12f, 12f, 9.2f, p);
                    canvas.drawLine(12f, 11f, 12f, 17f, p);
                    p.setStyle(Paint.Style.FILL);
                    canvas.drawCircle(12f, 7.4f, 1.3f, p);
                    break;
                case SKIP: {
                    p.setStyle(Paint.Style.FILL);
                    Path tri = new Path();
                    tri.moveTo(5.5f, 5f); tri.lineTo(5.5f, 19f); tri.lineTo(15.5f, 12f); tri.close();
                    canvas.drawPath(tri, p);
                    canvas.drawRect(17.2f, 5f, 19.4f, 19f, p);
                    break;
                }
                case STAR:
                    p.setStyle(Paint.Style.FILL_AND_STROKE);
                    p.setStrokeWidth(1f);
                    canvas.drawPath(P_STAR, p);
                    break;
                default: // CHEVRON (up)
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(2.2f);
                    canvas.drawLine(5.5f, 15f, 12f, 8.5f, p);
                    canvas.drawLine(12f, 8.5f, 18.5f, 15f, p);
                    break;
            }
            canvas.restore();
        }
    }

    // Keeps up to 2 ads ready so pre-roll / mid-roll can start instantly
    private void loadLongAd() {
        if (isDestroyed() || longAdQueue.size() >= 2) return;
        if (longAdLoader != null && longAdLoader.isLoading()) return;
        try {
            longAdLoader = new AdLoader.Builder(this, LONG_AD_UNIT_ID)
                .forNativeAd(new NativeAd.OnNativeAdLoadedListener() {
                    @Override
                    public void onNativeAdLoaded(NativeAd ad) {
                        if (isDestroyed()) { ad.destroy(); return; }
                        longAdQueue.add(ad);
                    }
                })
                .withAdListener(new AdListener() {
                    @Override
                    public void onAdImpression() {
                        longImpressionCount++;
                        android.util.Log.d("ADMOB_IMP", "LONG impression #" + longImpressionCount);
                    }

                    @Override
                    public void onAdClicked() {
                        android.util.Log.d("ADMOB_IMP", "LONG click");
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        android.util.Log.e("ADMOB", "long ad load failed: " + error.getMessage());
                    }
                })
                .withNativeAdOptions(new NativeAdOptions.Builder()
                    // custom controls requested = AdMob hides its own Mute / Pause buttons on the video
                    .setVideoOptions(new VideoOptions.Builder().setStartMuted(false).setCustomControlsRequested(true).build())
                    // top-left: the top-right corner is used by "Visit advertiser"
                    .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_LEFT)
                    .build())
                .build();
            longAdLoader.loadAds(new AdRequest.Builder().build(), 2);
        } catch (Exception e) {
            android.util.Log.e("ADMOB", "long ad load error: " + e.getMessage());
        }
    }

    private void showLongVideoAdNow(String kind, double cssTop) {
        if (longAdOverlay != null) return;
        if (longAdQueue.isEmpty()) {
            notifyLongAdFinished("not_ready");
            loadLongAd();
            return;
        }
        final NativeAd ad = longAdQueue.remove(0);
        try {
            buildLongAdOverlay(ad, cssTop);
        } catch (Exception e) {
            android.util.Log.e("ADMOB", "long ad show failed: " + e.getMessage());
            try { ad.destroy(); } catch (Exception ignored) {}
            removeLongAdOverlay();
            notifyLongAdFinished("failed");
            return;
        }
        loadLongAd();
    }

    private GradientDrawable longRound(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(Math.round(radiusDp)));
        return g;
    }

    private LongIcon longIconButton(LinearLayout parent, int type, int color, int widthDp, View.OnClickListener l) {
        LongIcon ic = new LongIcon(this, type, color);
        ic.setPadding(dp(14), dp(14), dp(14), dp(14));
        ic.setOnClickListener(l);
        parent.addView(ic, new LinearLayout.LayoutParams(dp(widthDp), dp(56)));
        return ic;
    }

    private void showLongAdInfo(NativeAd ad) {
        try {
            String who = ad.getAdvertiser() != null ? ad.getAdvertiser() : "an advertiser";
            new AlertDialog.Builder(this)
                .setTitle("Sponsored")
                .setMessage("This ad is from " + who + " and is delivered by Google AdMob.")
                .setPositiveButton("OK", null)
                .show();
        } catch (Exception ignored) {}
    }

    private void buildLongAdOverlay(final NativeAd ad, double cssTop) {
        final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
        final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;
        // Colours follow the REAL app theme (Dark app = dark sheet, Light app = light sheet)
        final boolean dark = appDarkTheme;
        final int sheetBg = dark ? 0xFF16161A : 0xFFFFFFFF;
        final int cardBg = dark ? 0xFF222227 : 0xFFF6F6F8;
        final int cardBorder = dark ? 0xFF303037 : 0xFFE7E7EC;
        final int pillBg = dark ? 0xFF2E2E35 : 0xFFEDEDF1;
        final int handleBg = dark ? 0xFF4A4A53 : 0xFFD8D8DE;
        final int textMain = dark ? 0xFFF5F5F7 : 0xFF111114;
        final int textMuted = dark ? 0xFFA1A1AC : 0xFF6B6B76;
        final int accent = dark ? 0xFFFF7A9C : LONG_AD_BUTTON_COLOR;
        final int accentSoft = dark ? 0x33FF7A9C : 0x1A7F1335;

        final ViewGroup content = (ViewGroup) findViewById(android.R.id.content);

        // The ad sits exactly on the 16:9 video player of the watch page
        int[] wl = new int[2], cl = new int[2];
        webview1.getLocationOnScreen(wl);
        content.getLocationOnScreen(cl);
        float density = getResources().getDisplayMetrics().density;
        int top = (wl[1] - cl[1]) + Math.round((float) (cssTop * density));
        int stageW = content.getWidth() > 0 ? content.getWidth() : getResources().getDisplayMetrics().widthPixels;
        final int stageH = Math.round(stageW * 9f / 16f);

        longAdFinished = false;

        // Root blocks every touch to the page under the ad (black shows behind the rounded sheet corners)
        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setClickable(true);

        NativeAdView adView = new NativeAdView(this);

        // ================= 16:9 stage (video) =================
        FrameLayout stage = new FrameLayout(this);
        stage.setBackgroundColor(Color.BLACK);
        adView.addView(stage, new FrameLayout.LayoutParams(MATCH, stageH, Gravity.TOP));

        MediaView media = new MediaView(this);
        media.setImageScaleType(ImageView.ScaleType.FIT_CENTER);
        stage.addView(media, new FrameLayout.LayoutParams(MATCH, MATCH));

        // "Visit advertiser" (top-right). Not clickable itself: a tap goes to the video = ad click.
        TextView visit = feelsText(14, Color.WHITE, false);
        visit.setText("Visit advertiser");
        visit.setShadowLayer(4f, 0f, 1f, 0x99000000);
        FrameLayout.LayoutParams visitLp = new FrameLayout.LayoutParams(WRAP, WRAP, Gravity.TOP | Gravity.END);
        visitLp.setMargins(0, dp(18), dp(12), 0);
        stage.addView(visit, visitLp);

        // "Sponsored (i)" (bottom-left)
        LinearLayout sponsoredBox = new LinearLayout(this);
        sponsoredBox.setOrientation(LinearLayout.HORIZONTAL);
        sponsoredBox.setGravity(Gravity.CENTER_VERTICAL);
        TextView sponsoredLbl = feelsText(14, Color.WHITE, false);
        sponsoredLbl.setText("Sponsored");
        sponsoredLbl.setShadowLayer(3f, 0f, 1f, 0x99000000);
        sponsoredBox.addView(sponsoredLbl, new LinearLayout.LayoutParams(WRAP, WRAP));
        LongIcon infoIc = new LongIcon(this, LongIcon.INFO, Color.WHITE);
        LinearLayout.LayoutParams infoLp = new LinearLayout.LayoutParams(dp(16), dp(16));
        infoLp.leftMargin = dp(8);
        sponsoredBox.addView(infoIc, infoLp);
        sponsoredBox.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { showLongAdInfo(ad); }
        });
        FrameLayout.LayoutParams spLp = new FrameLayout.LayoutParams(WRAP, WRAP, Gravity.BOTTOM | Gravity.START);
        spLp.setMargins(dp(LONG_AD_SPONSORED_LEFT_DP), 0, 0, dp(16));
        stage.addView(sponsoredBox, spLp);

        // Skip pill: "Skip in 5 ... 1" then "Skip >|"
        final LinearLayout skipPill = new LinearLayout(this);
        skipPill.setOrientation(LinearLayout.HORIZONTAL);
        skipPill.setGravity(Gravity.CENTER_VERTICAL);
        skipPill.setPadding(dp(18), 0, dp(14), 0);
        skipPill.setBackground(longRound(0x99000000, 20));
        final TextView skipTxt = feelsText(16, Color.WHITE, true);
        longAdSecondsLeft = LONG_AD_SKIP_AFTER_SEC;
        skipTxt.setText("Skip in " + longAdSecondsLeft);
        skipPill.addView(skipTxt, new LinearLayout.LayoutParams(WRAP, WRAP));
        final LongIcon skipIc = new LongIcon(this, LongIcon.SKIP, Color.WHITE);
        LinearLayout.LayoutParams skipIcLp = new LinearLayout.LayoutParams(dp(22), dp(22));
        skipIcLp.leftMargin = dp(8);
        skipPill.addView(skipIc, skipIcLp);
        skipIc.setVisibility(View.GONE);
        skipPill.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (longAdSecondsLeft <= 0) finishLongAd("skipped");
            }
        });
        FrameLayout.LayoutParams skipLp = new FrameLayout.LayoutParams(WRAP, dp(36), Gravity.BOTTOM | Gravity.END);
        skipLp.setMargins(0, 0, dp(8), dp(63));
        stage.addView(skipPill, skipLp);

        // Yellow ad progress line (bottom of the video)
        FrameLayout progressTrack = new FrameLayout(this);
        progressTrack.setBackgroundColor((LONG_AD_PROGRESS_COLOR & 0x00FFFFFF) | 0x66000000);
        View progressFill = new View(this);
        progressFill.setBackgroundColor(LONG_AD_PROGRESS_COLOR);
        progressFill.setPivotX(0f);
        progressFill.setScaleX(0f);
        progressTrack.addView(progressFill, new FrameLayout.LayoutParams(MATCH, MATCH));
        stage.addView(progressTrack, new FrameLayout.LayoutParams(MATCH, dp(3), Gravity.BOTTOM));

        // ================= premium bottom sheet =================
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setElevation(dp(12));
        FrameLayout.LayoutParams sheetLp = new FrameLayout.LayoutParams(MATCH, MATCH);
        sheetLp.topMargin = stageH;
        adView.addView(sheet, sheetLp);

        // drag handle
        View handle = new View(this);
        handle.setBackground(longRound(handleBg, 3));
        LinearLayout.LayoutParams handleLp = new LinearLayout.LayoutParams(dp(40), dp(4));
        handleLp.gravity = Gravity.CENTER_HORIZONTAL;
        handleLp.topMargin = dp(10);
        sheet.addView(handle, handleLp);

        // header: [Sponsored badge] ........ (like) (close)
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView badge = feelsText(11, textMuted, true);
        badge.setText("Sponsored");
        badge.setLetterSpacing(0.04f);
        badge.setPadding(dp(10), dp(4), dp(10), dp(4));
        badge.setBackground(longRound(pillBg, 12));
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(WRAP, WRAP);
        badgeLp.leftMargin = dp(18);
        header.addView(badge, badgeLp);
        View spacer = new View(this);
        header.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));
        final LongIcon likeIc = new LongIcon(this, LongIcon.LIKE, textMain);
        likeIc.setPadding(dp(10), dp(10), dp(10), dp(10));
        GradientDrawable likeBg = new GradientDrawable();
        likeBg.setShape(GradientDrawable.OVAL);
        likeBg.setColor(pillBg);
        likeIc.setBackground(likeBg);
        likeIc.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { likeIc.toggle(); }
        });
        LinearLayout.LayoutParams likeLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        likeLp.rightMargin = dp(10);
        header.addView(likeIc, likeLp);
        LongIcon closeIc = new LongIcon(this, LongIcon.CLOSE, textMain);
        closeIc.setPadding(dp(11), dp(11), dp(11), dp(11));
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setShape(GradientDrawable.OVAL);
        closeBg.setColor(pillBg);
        closeIc.setBackground(closeBg);
        closeIc.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { finishLongAd("back"); }
        });
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        closeLp.rightMargin = dp(16);
        header.addView(closeIc, closeLp);
        LinearLayout.LayoutParams headerLp = new LinearLayout.LayoutParams(MATCH, dp(52));
        headerLp.topMargin = dp(2);
        sheet.addView(header, headerLp);

        // advertiser row: app icon + title + domain + (store / price / rating)
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(18), 0, dp(18), 0);
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(MATCH, WRAP);
        rowLp.topMargin = dp(10);
        sheet.addView(row, rowLp);

        ImageView icon = new ImageView(this);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setColor(dark ? 0xFF2A2A30 : 0xFFF1F1F4);
        iconBg.setCornerRadius(dp(18));
        iconBg.setStroke(dp(1), cardBorder);
        icon.setBackground(iconBg);
        icon.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        icon.setClipToOutline(true);
        icon.setElevation(dp(2));
        row.addView(icon, new LinearLayout.LayoutParams(dp(68), dp(68)));

        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams namesLp = new LinearLayout.LayoutParams(0, WRAP, 1f);
        namesLp.leftMargin = dp(14);
        row.addView(names, namesLp);

        TextView headline = feelsText(19, textMain, true);
        headline.setMaxLines(2);
        headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
        names.addView(headline, new LinearLayout.LayoutParams(MATCH, WRAP));

        TextView advertiser = feelsText(13, textMuted, false);
        advertiser.setMaxLines(1);
        advertiser.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams advLp = new LinearLayout.LayoutParams(MATCH, WRAP);
        advLp.topMargin = dp(3);
        names.addView(advertiser, advLp);

        final TextView store = feelsText(13, textMuted, false);
        final TextView price = feelsText(13, 0xFF2E9E4F, true);
        price.setTag("keep");
        final TextView rating = feelsText(13, textMuted, false);
        LinearLayout meta = new LinearLayout(this);
        meta.setOrientation(LinearLayout.HORIZONTAL);
        meta.setGravity(Gravity.CENTER_VERTICAL);
        meta.addView(store, new LinearLayout.LayoutParams(WRAP, WRAP));
        LinearLayout.LayoutParams pLp = new LinearLayout.LayoutParams(WRAP, WRAP);
        pLp.leftMargin = dp(10);
        meta.addView(price, pLp);
        LinearLayout.LayoutParams rLp = new LinearLayout.LayoutParams(WRAP, WRAP);
        rLp.leftMargin = dp(10);
        meta.addView(rating, rLp);
        LinearLayout.LayoutParams metaLp = new LinearLayout.LayoutParams(MATCH, WRAP);
        metaLp.topMargin = dp(6);
        names.addView(meta, metaLp);

        // ---------- info cards (swipe sideways) ----------
        HorizontalScrollView carousel = new HorizontalScrollView(this);
        carousel.setHorizontalScrollBarEnabled(false);
        carousel.setOverScrollMode(View.OVER_SCROLL_NEVER);
        carousel.setClipToPadding(false);
        carousel.setPadding(dp(18), 0, dp(18), 0);
        LinearLayout cards = new LinearLayout(this);
        cards.setOrientation(LinearLayout.HORIZONTAL);
        carousel.addView(cards, new FrameLayout.LayoutParams(WRAP, MATCH));
        LinearLayout.LayoutParams carLp = new LinearLayout.LayoutParams(MATCH, 0, 1f);
        carLp.topMargin = dp(20);
        sheet.addView(carousel, carLp);
        final int cardW = Math.round(stageW * 0.77f);

        final TextView body = feelsText(14, textMuted, false);
        body.setMaxLines(3);
        body.setEllipsize(android.text.TextUtils.TruncateAt.END);
        boolean haveBody = ad.getBody() != null;
        boolean haveInfo = ad.getStore() != null || ad.getPrice() != null || ad.getStarRating() != null;
        meta.setVisibility(haveInfo ? View.VISIBLE : View.GONE);

        // IMPORTANT (AdMob validator): every registered asset must be fully inside the screen,
        // so assets live only in card 1 / the header row. Card 2 has fixed text only.
        longCardBadges.clear();
        if (haveBody) {
            LinearLayout c1 = new LinearLayout(this);
            c1.setOrientation(LinearLayout.VERTICAL);
            c1.setPadding(dp(18), dp(18), dp(18), dp(20));
            GradientDrawable c1Bg = longRound(cardBg, 22);
            c1Bg.setStroke(dp(1), cardBorder);
            c1.setBackground(c1Bg);
            LongIcon b1 = new LongIcon(this, LongIcon.INFO, accent);
            b1.setPadding(dp(9), dp(9), dp(9), dp(9));
            b1.setBackground(longRound(accentSoft, 20));
            c1.addView(b1, new LinearLayout.LayoutParams(dp(40), dp(40)));
            longCardBadges.add(b1);
            c1.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1f));
            TextView t1 = feelsText(19, textMain, true);
            t1.setText(LONG_AD_CARD1_TITLE);
            c1.addView(t1, new LinearLayout.LayoutParams(MATCH, WRAP));
            LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(MATCH, WRAP);
            bodyLp.topMargin = dp(6);
            c1.addView(body, bodyLp);
            final TextView more = feelsText(13, textMain, true);
            more.setText("More info");
            more.setGravity(Gravity.CENTER);
            more.setPadding(dp(18), 0, dp(18), 0);
            more.setBackground(longRound(pillBg, 18));
            more.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    boolean open = body.getMaxLines() > 3;
                    body.setMaxLines(open ? 3 : 12);
                    more.setText(open ? "More info" : "Less");
                }
            });
            LinearLayout.LayoutParams moreLp = new LinearLayout.LayoutParams(WRAP, dp(36));
            moreLp.topMargin = dp(14);
            c1.addView(more, moreLp);
            LinearLayout.LayoutParams c1Lp = new LinearLayout.LayoutParams(cardW, MATCH);
            c1Lp.rightMargin = dp(12);
            cards.addView(c1, c1Lp);

            // card 2: fixed text only (no ad assets), peeks in from the right
            LinearLayout c2 = new LinearLayout(this);
            c2.setOrientation(LinearLayout.VERTICAL);
            c2.setPadding(dp(18), dp(18), dp(18), dp(20));
            GradientDrawable c2Bg = longRound(cardBg, 22);
            c2Bg.setStroke(dp(1), cardBorder);
            c2.setBackground(c2Bg);
            LongIcon b2 = new LongIcon(this, LongIcon.STAR, accent);
            b2.setPadding(dp(9), dp(9), dp(9), dp(9));
            b2.setBackground(longRound(accentSoft, 20));
            c2.addView(b2, new LinearLayout.LayoutParams(dp(40), dp(40)));
            longCardBadges.add(b2);
            c2.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1f));
            TextView t2 = feelsText(19, textMain, true);
            t2.setText(LONG_AD_CARD2_TITLE);
            c2.addView(t2, new LinearLayout.LayoutParams(MATCH, WRAP));
            TextView d2 = feelsText(14, textMuted, false);
            d2.setText(LONG_AD_CARD2_TEXT);
            LinearLayout.LayoutParams d2Lp = new LinearLayout.LayoutParams(MATCH, WRAP);
            d2Lp.topMargin = dp(6);
            c2.addView(d2, d2Lp);
            LinearLayout.LayoutParams c2Lp = new LinearLayout.LayoutParams(cardW, MATCH);
            c2Lp.rightMargin = dp(12);
            cards.addView(c2, c2Lp);
        } else {
            carousel.setVisibility(View.GONE);
        }
        // small screens: hide the round badges so the text always fits
        carousel.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int oR, int ob) {
                int vis = (b - t) < dp(190) ? View.GONE : View.VISIBLE;
                for (View bv : longCardBadges) if (bv.getVisibility() != vis) bv.setVisibility(vis);
            }
        });

        // ---------- CTA button (gradient) ----------
        Button cta = new Button(this);
        cta.setAllCaps(false);
        cta.setTextSize(16);
        cta.setTypeface(Typeface.DEFAULT_BOLD);
        cta.setTextColor(Color.WHITE);
        cta.setPadding(0, 0, 0, 0);
        try { cta.setStateListAnimator(null); } catch (Throwable ignored) {}
        GradientDrawable ctaBg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{0xFF8F1842, 0xFF6C0F2D});
        ctaBg.setCornerRadius(dp(26));
        cta.setBackground(ctaBg);
        cta.setElevation(dp(4));
        LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(MATCH, dp(52));
        ctaLp.setMargins(dp(18), dp(16), dp(18), 0);
        sheet.addView(cta, ctaLp);

        // ---------- "Swipe to view site" hint (visual only) ----------
        LinearLayout hint = new LinearLayout(this);
        hint.setOrientation(LinearLayout.VERTICAL);
        hint.setGravity(Gravity.CENTER_HORIZONTAL);
        LongIcon chev = new LongIcon(this, LongIcon.CHEVRON, textMuted);
        hint.addView(chev, new LinearLayout.LayoutParams(dp(26), dp(22)));
        TextView hintTxt = feelsText(13, textMuted, false);
        hintTxt.setText("Swipe to view site");
        hint.addView(hintTxt, new LinearLayout.LayoutParams(WRAP, WRAP));
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(MATCH, WRAP);
        hintLp.topMargin = dp(8);
        hintLp.bottomMargin = dp(12);
        sheet.addView(hint, hintLp);

        // ---------- fill + REGISTER every asset (required by AdMob policy) ----------
        headline.setText(ad.getHeadline());
        adView.setHeadlineView(headline);

        if (ad.getIcon() != null && ad.getIcon().getDrawable() != null) {
            icon.setImageDrawable(ad.getIcon().getDrawable());
            adView.setIconView(icon);
        } else {
            icon.setVisibility(View.GONE);
        }
        if (ad.getAdvertiser() != null) {
            advertiser.setText(ad.getAdvertiser());
            adView.setAdvertiserView(advertiser);
        } else {
            advertiser.setVisibility(View.GONE);
        }
        if (haveBody) {
            body.setText(ad.getBody());
            adView.setBodyView(body);
        }
        if (ad.getStore() != null) {
            store.setText(ad.getStore());
            adView.setStoreView(store);
        } else {
            store.setVisibility(View.GONE);
        }
        if (ad.getPrice() != null) {
            price.setText(ad.getPrice());
            adView.setPriceView(price);
        } else {
            price.setVisibility(View.GONE);
        }
        if (ad.getStarRating() != null) {
            rating.setText(String.format(Locale.US, "%.1f \u2605", ad.getStarRating()));
            adView.setStarRatingView(rating);
        } else {
            rating.setVisibility(View.GONE);
        }
        if (ad.getCallToAction() != null) {
            cta.setText(ad.getCallToAction());
            adView.setCallToActionView(cta);
        } else {
            cta.setVisibility(View.GONE);
        }

        media.setMediaContent(ad.getMediaContent());
        adView.setMediaView(media);
        adView.setNativeAd(ad);

        root.addView(adView, new FrameLayout.LayoutParams(MATCH, MATCH));

        FrameLayout.LayoutParams rootLp = new FrameLayout.LayoutParams(MATCH, MATCH);
        rootLp.topMargin = Math.max(0, top);
        content.addView(root, rootLp);
        longAdOverlay = root;
        longShownAd = ad;
        longContent = content;
        longStage = stage;
        longSheet = sheet;
        longHandle = handle;
        longHeaderRow = header;
        longHintBox = hint;
        longCarousel = carousel;
        longSkipPill = skipPill;
        longSponsoredBox = sponsoredBox;
        longHeadline = headline;
        longAdvertiser = advertiser;
        longCta = cta;
        longProgressFill = progressFill;
        longTextMain = textMain;
        longTextMuted = textMuted;
        longSheetBg = sheetBg;
        longLogo = icon;
        longMetaRow = meta;
        // portrait: ad starts below the status bar / exactly on the player; if built in landscape use status bar height
        longTopPortrait = (stageW < content.getHeight()) ? Math.max(0, top) : statusBarHeightPx();
        root.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int oR, int ob) {
                if ((r - l) != (oR - ol) || (b - t) != (ob - ot)) {
                    v.post(new Runnable() {
                        @Override
                        public void run() { applyLongAdLayout(); }
                    });
                }
            }
        });
        applyLongAdLayout();

        // Video ad: finishes when the video ends. Image-only ad: auto-finish after a few seconds.
        boolean hasVideo = false;
        longElapsedMs = 0;
        longVideoPlaying = true;
        longDurationMs = LONG_AD_IMAGE_ONLY_SEC * 1000L;
        try {
            hasVideo = ad.getMediaContent() != null && ad.getMediaContent().hasVideoContent();
            if (hasVideo) {
                float dur = ad.getMediaContent().getDuration();
                if (dur > 0f) longDurationMs = (long) (dur * 1000f);
                ad.getMediaContent().getVideoController().setVideoLifecycleCallbacks(
                    new VideoController.VideoLifecycleCallbacks() {
                        @Override
                        public void onVideoStart() { longVideoPlaying = true; }

                        @Override
                        public void onVideoPlay() { longVideoPlaying = true; }

                        @Override
                        public void onVideoPause() { longVideoPlaying = false; }

                        @Override
                        public void onVideoEnd() { finishLongAd("completed"); }
                    });
            }
        } catch (Exception ignored) {}
        if (!hasVideo) {
            longAdAutoFinish = new Runnable() {
                @Override
                public void run() { finishLongAd("completed"); }
            };
            handler.postDelayed(longAdAutoFinish, LONG_AD_IMAGE_ONLY_SEC * 1000L);
        }

        // yellow progress line
        longProgressTicker = new Runnable() {
            @Override
            public void run() {
                if (longAdOverlay == null || longAdFinished || longProgressFill == null) return;
                if (longVideoPlaying) longElapsedMs += 100;
                float f = longDurationMs > 0 ? Math.min(1f, (float) longElapsedMs / longDurationMs) : 0f;
                longProgressFill.setScaleX(f);
                handler.postDelayed(this, 100);
            }
        };
        handler.postDelayed(longProgressTicker, 100);

        // "Skip in 5 ... 1" countdown
        longAdTicker = new Runnable() {
            @Override
            public void run() {
                if (longAdOverlay == null || longAdFinished) return;
                longAdSecondsLeft--;
                if (longAdSecondsLeft > 0) {
                    skipTxt.setText("Skip in " + longAdSecondsLeft);
                    handler.postDelayed(this, 1000);
                } else {
                    skipTxt.setText("Skip");
                    skipIc.setVisibility(View.VISIBLE);
                }
            }
        };
        handler.postDelayed(longAdTicker, 1000);
    }

    private int statusBarHeightPx() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : dp(24);
    }

    // Portrait: 16:9 video on top + white bottom sheet (the design).
    // Landscape: video fills the whole screen + compact app card (logo, title, button) at the bottom-left.
    private void applyLongAdLayout() {
        if (longAdOverlay == null || longContent == null || longStage == null || longSheet == null) return;
        final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
        final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;
        int W = longContent.getWidth(), H = longContent.getHeight();
        if (W <= 0 || H <= 0) return;
        boolean land = W > H;

        FrameLayout.LayoutParams rootLp = (FrameLayout.LayoutParams) longAdOverlay.getLayoutParams();
        int wantTop = land ? 0 : longTopPortrait;
        if (rootLp.topMargin != wantTop) {
            rootLp.topMargin = wantTop;
            longAdOverlay.setLayoutParams(rootLp);
        }

        FrameLayout.LayoutParams stLp = (FrameLayout.LayoutParams) longStage.getLayoutParams();
        FrameLayout.LayoutParams shLp = (FrameLayout.LayoutParams) longSheet.getLayoutParams();
        FrameLayout.LayoutParams skLp = (FrameLayout.LayoutParams) longSkipPill.getLayoutParams();
        FrameLayout.LayoutParams spLp = (FrameLayout.LayoutParams) longSponsoredBox.getLayoutParams();
        LinearLayout.LayoutParams ctaLp = (LinearLayout.LayoutParams) longCta.getLayoutParams();

        if (land) {
            stLp.width = MATCH; stLp.height = MATCH; stLp.gravity = Gravity.TOP;
            shLp.width = Math.min((int) (W * 0.5f), dp(420)); shLp.height = WRAP;
            shLp.gravity = Gravity.BOTTOM | Gravity.START;
            shLp.topMargin = 0; shLp.leftMargin = dp(12); shLp.rightMargin = 0; shLp.bottomMargin = dp(14);
            longSheet.setBackground(longRound(0xCC000000, 16));
            longSheet.setPadding(dp(12), dp(12), dp(12), dp(12));
            longHandle.setVisibility(View.GONE);
            longHeaderRow.setVisibility(View.GONE);
            longCarousel.setVisibility(View.GONE);
            longHintBox.setVisibility(View.GONE);
            longHeadline.setTextSize(16);
            longHeadline.setTextColor(Color.WHITE);
            longAdvertiser.setTextColor(0xFFCCCCCC);
            setLongMetaColor(0xFFCCCCCC);
            longLogo.getLayoutParams().width = dp(48); longLogo.getLayoutParams().height = dp(48);
            longLogo.requestLayout();
            ctaLp.height = dp(42); ctaLp.setMargins(0, dp(10), 0, 0);
            skLp.bottomMargin = dp(24);
            spLp.setMargins(dp(52), dp(16), 0, 0);
            spLp.gravity = Gravity.TOP | Gravity.START;
        } else {
            int stageH = Math.round(W * 9f / 16f);
            stLp.width = MATCH; stLp.height = stageH; stLp.gravity = Gravity.TOP;
            shLp.width = MATCH; shLp.height = MATCH; shLp.gravity = Gravity.TOP | Gravity.START;
            shLp.topMargin = stageH; shLp.leftMargin = 0; shLp.rightMargin = 0; shLp.bottomMargin = 0;
            // white sheet with rounded top corners
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(longSheetBg);
            float r = dp(28);
            bg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});
            longSheet.setBackground(bg);
            longSheet.setPadding(0, 0, 0, dp(8));
            longHandle.setVisibility(View.VISIBLE);
            longHeaderRow.setVisibility(View.VISIBLE);
            longCarousel.setVisibility(longCarousel.getChildCount() > 0
                && ((ViewGroup) longCarousel.getChildAt(0)).getChildCount() > 0 ? View.VISIBLE : View.GONE);
            longHintBox.setVisibility(View.VISIBLE);
            longHeadline.setTextSize(19);
            longHeadline.setTextColor(longTextMain);
            longAdvertiser.setTextColor(longTextMuted);
            setLongMetaColor(longTextMuted);
            longLogo.getLayoutParams().width = dp(68); longLogo.getLayoutParams().height = dp(68);
            longLogo.requestLayout();
            ctaLp.height = dp(52); ctaLp.setMargins(dp(18), dp(16), dp(18), 0);
            skLp.bottomMargin = dp(63);
            spLp.setMargins(dp(LONG_AD_SPONSORED_LEFT_DP), 0, 0, dp(16));
            spLp.gravity = Gravity.BOTTOM | Gravity.START;
        }
        longStage.setLayoutParams(stLp);
        longSheet.setLayoutParams(shLp);
        longSkipPill.setLayoutParams(skLp);
        longSponsoredBox.setLayoutParams(spLp);
        longCta.setLayoutParams(ctaLp);
    }

    private void setLongMetaColor(int color) {
        if (longMetaRow == null) return;
        for (int i = 0; i < longMetaRow.getChildCount(); i++) {
            View c = longMetaRow.getChildAt(i);
            if (c instanceof TextView && !"keep".equals(c.getTag())) ((TextView) c).setTextColor(color);
        }
    }

    private void finishLongAd(String result) {
        if (longAdOverlay == null || longAdFinished) return;
        longAdFinished = true;
        removeLongAdOverlay();
        notifyLongAdFinished(result);
    }

    private void removeLongAdOverlay() {
        if (longAdTicker != null) { handler.removeCallbacks(longAdTicker); longAdTicker = null; }
        if (longAdAutoFinish != null) { handler.removeCallbacks(longAdAutoFinish); longAdAutoFinish = null; }
        if (longProgressTicker != null) { handler.removeCallbacks(longProgressTicker); longProgressTicker = null; }
        if (longAdOverlay != null) {
            try {
                ViewGroup parent = (ViewGroup) longAdOverlay.getParent();
                if (parent != null) parent.removeView(longAdOverlay);
            } catch (Exception ignored) {}
            longAdOverlay = null;
        }
        longContent = null; longStage = null; longSheet = null; longCta = null;
        longHandle = null; longHeaderRow = null; longHintBox = null; longCarousel = null;
        longSkipPill = null; longSponsoredBox = null; longProgressFill = null;
        longHeadline = null; longAdvertiser = null; longLogo = null; longMetaRow = null;
        longCardBadges.clear();
        if (longShownAd != null) {
            try { longShownAd.destroy(); } catch (Exception ignored) {}
            longShownAd = null;
        }
        loadLongAd();
    }

    private void destroyLongAds() {
        try {
            for (NativeAd a : longAdQueue) a.destroy();
            longAdQueue.clear();
            if (longShownAd != null) { longShownAd.destroy(); longShownAd = null; }
        } catch (Exception ignored) {}
    }

    private void notifyLongAdFinished(final String result) {
        runOnUiThread(() -> {
            if (webview1 != null) {
                webview1.evaluateJavascript(
                    "if(typeof window.onLongVideoAdFinished==='function'){window.onLongVideoAdFinished('" + result + "');}", null);
            }
        });
    }
    // ================= /LONG VIDEO ADS =================

    // ================= PLAYER LANDSCAPE (Landscape button of the long video player) =================
    private boolean playerLandscape = false;
    private int orientationBeforeLandscape = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    // Called from app.js (flySetLandscape). on=true: rotate to landscape + hide system bars. on=false: back to normal.
    private void setPlayerLandscapeNow(boolean on) {
        if (on == playerLandscape) return;
        playerLandscape = on;
        if (on) {
            orientationBeforeLandscape = getRequestedOrientation();
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            hidePlayerSystemBars();
        } else {
            int back = orientationBeforeLandscape;
            if (back == ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    || back == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    || back == ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
                    || back == ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE) {
                back = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            }
            setRequestedOrientation(back);
            showNormalSystemBars();
        }
    }

    private void hidePlayerSystemBars() {
        Window window = getWindow();
        if (window == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = window.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    private void showNormalSystemBars() {
        Window window = getWindow();
        if (window != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = window.getInsetsController();
            if (c != null) c.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        }
        setupFullScreen();
    }

    // Tell the web page the landscape state changed (Back button etc.) so the icon / layout follow
    private void notifyPlayerLandscape(final boolean on) {
        runOnUiThread(() -> {
            if (webview1 != null) {
                webview1.evaluateJavascript(
                    "if(typeof window.flyOnLandscapeChanged==='function'){window.flyOnLandscapeChanged(" + on + ");}", null);
            }
        });
    }
    // ================= /PLAYER LANDSCAPE =================

    // ================= MEDIA PICKER (custom gallery for the upload page) =================
    // The web page asks for the list through AndroidBridge.getMediaList(); thumbnails and files are served to
    // the page through a private virtual host (https://flaynity-media.local/...) inside shouldInterceptRequest.
    private static final String MEDIA_HOST = "flaynity-media.local";
    private static final int RC_MEDIA_PERMISSION = 104;
    private final String mediaToken = java.util.UUID.randomUUID().toString().replace("-", "");
    private volatile boolean mediaPickerOpen = false;

    private boolean permGranted(String p) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || checkSelfPermission(p) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasMediaPermission() {
        if (Build.VERSION.SDK_INT >= 34) {
            return permGranted("android.permission.READ_MEDIA_IMAGES")
                || permGranted("android.permission.READ_MEDIA_VIDEO")
                || permGranted("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");   // "Select photos" (partial access)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            return permGranted("android.permission.READ_MEDIA_IMAGES") || permGranted("android.permission.READ_MEDIA_VIDEO");
        }
        return permGranted(android.Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private void requestMediaPermissionNow() {
        if (hasMediaPermission()) { notifyMediaPermission(true); return; }
        String[] perms;
        if (Build.VERSION.SDK_INT >= 34) {
            perms = new String[]{"android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO",
                                 "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"};
        } else if (Build.VERSION.SDK_INT >= 33) {
            perms = new String[]{"android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO"};
        } else {
            perms = new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE};
        }
        appOpenSuppressNext = true;   // returning from the permission dialog is not a new app entry
        requestPermissions(perms, RC_MEDIA_PERMISSION);
    }

    private void notifyMediaPermission(final boolean granted) {
        runOnUiThread(() -> {
            if (webview1 != null) {
                webview1.evaluateJavascript(
                    "if(typeof window.onMediaPermissionResult==='function'){window.onMediaPermissionResult(" + granted + ");}", null);
            }
        });
    }

    private void openAppSettingsNow() {
        try {
            appOpenSuppressNext = true;
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getPackageName(), null));
            startActivity(i);
        } catch (Exception ignored) {}
    }

    // type: "all" | "videos" | "photos"
    private String mediaSelection(String type, String bucketId, ArrayList<String> args) {
        StringBuilder sb = new StringBuilder();
        if ("videos".equals(type)) { sb.append("media_type=?"); args.add("3"); }
        else if ("photos".equals(type)) { sb.append("media_type=?"); args.add("1"); }
        else { sb.append("(media_type=? OR media_type=?)"); args.add("1"); args.add("3"); }
        if (bucketId != null && !bucketId.isEmpty() && !"all".equals(bucketId)) {
            sb.append(" AND bucket_id=?");
            args.add(bucketId);
        }
        return sb.toString();
    }

    private Cursor queryMedia(String[] proj, String sel, String[] args, int offset, int limit) {
        Uri uri = MediaStore.Files.getContentUri("external");
        ContentResolver cr = getContentResolver();
        String sort = "date_added DESC, _id DESC";
        if (Build.VERSION.SDK_INT >= 29) {
            Bundle b = new Bundle();
            b.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, sel);
            b.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args);
            b.putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, sort);
            if (limit > 0) {
                b.putInt(ContentResolver.QUERY_ARG_LIMIT, limit);
                b.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
            }
            return cr.query(uri, proj, b, null);
        }
        return cr.query(uri, proj, sel, args, limit > 0 ? sort + " LIMIT " + limit + " OFFSET " + offset : sort);
    }

    private long videoDuration(long id) {
        Cursor c = null;
        try {
            c = getContentResolver().query(ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id),
                new String[]{MediaStore.Video.Media.DURATION}, null, null, null);
            if (c != null && c.moveToFirst()) return c.getLong(0);
        } catch (Exception ignored) {
        } finally { if (c != null) c.close(); }
        return 0;
    }

    private String queryMediaList(String type, String bucketId, int offset, int limit) {
        JSONObject out = new JSONObject();
        JSONArray items = new JSONArray();
        Cursor c = null;
        try {
            out.put("token", mediaToken);
            if (!hasMediaPermission()) { out.put("items", items); out.put("end", true); return out.toString(); }
            if (limit <= 0 || limit > 200) limit = 60;
            ArrayList<String> args = new ArrayList<>();
            String sel = mediaSelection(type, bucketId, args);
            String[] a = args.toArray(new String[0]);
            boolean durInRow = true;
            try {
                c = queryMedia(new String[]{"_id", "media_type", "mime_type", "_display_name", "date_added", "duration"}, sel, a, offset, limit);
            } catch (Exception e) {
                durInRow = false;          // old Android: no duration column in the files table
                c = queryMedia(new String[]{"_id", "media_type", "mime_type", "_display_name", "date_added"}, sel, a, offset, limit);
            }
            int n = 0;
            if (c != null) {
                while (c.moveToNext()) {
                    n++;
                    long id = c.getLong(0);
                    boolean video = c.getInt(1) == 3;
                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("v", video ? 1 : 0);
                    o.put("m", c.getString(2));
                    o.put("n", c.getString(3));
                    o.put("t", c.getLong(4));
                    if (video) o.put("d", durInRow ? c.getLong(5) : videoDuration(id));
                    items.put(o);
                }
            }
            out.put("items", items);
            out.put("end", n < limit);
            return out.toString();
        } catch (Exception e) {
            android.util.Log.e("MEDIA_PICKER", "list failed: " + e.getMessage());
            return "{\"token\":\"" + mediaToken + "\",\"items\":[],\"end\":true}";
        } finally {
            if (c != null) c.close();
        }
    }

    private String queryMediaAlbums(String type) {
        JSONArray arr = new JSONArray();
        Cursor c = null;
        try {
            if (!hasMediaPermission()) return "[]";
            ArrayList<String> args = new ArrayList<>();
            String sel = mediaSelection(type, null, args);
            c = queryMedia(new String[]{"bucket_id", "bucket_display_name", "_id", "media_type"}, sel, args.toArray(new String[0]), 0, 0);
            java.util.LinkedHashMap<String, String> names = new java.util.LinkedHashMap<>();
            java.util.HashMap<String, Integer> counts = new java.util.HashMap<>();
            java.util.HashMap<String, long[]> covers = new java.util.HashMap<>();
            if (c != null) {
                while (c.moveToNext()) {
                    String id = c.getString(0);
                    if (id == null) continue;
                    if (!names.containsKey(id)) {
                        String nm = c.getString(1);
                        names.put(id, (nm == null || nm.isEmpty()) ? "Other" : nm);
                        covers.put(id, new long[]{c.getLong(2), c.getInt(3) == 3 ? 1 : 0});   // newest item = album cover
                    }
                    Integer cur = counts.get(id);
                    counts.put(id, cur == null ? 1 : cur + 1);
                }
            }
            for (Map.Entry<String, String> e : names.entrySet()) {
                JSONObject o = new JSONObject();
                o.put("id", e.getKey());
                o.put("name", e.getValue());
                o.put("count", counts.get(e.getKey()));
                long[] cv = covers.get(e.getKey());
                o.put("cover", cv[0]);
                o.put("cv", cv[1]);
                arr.put(o);
            }
        } catch (Exception e) {
            android.util.Log.e("MEDIA_PICKER", "albums failed: " + e.getMessage());
        } finally {
            if (c != null) c.close();
        }
        return arr.toString();
    }

    private Bitmap loadMediaThumb(Uri content, long id, boolean video) {
        try {
            if (Build.VERSION.SDK_INT >= 29) return getContentResolver().loadThumbnail(content, new Size(400, 400), null);
            ContentResolver cr = getContentResolver();
            if (video) return MediaStore.Video.Thumbnails.getThumbnail(cr, id, MediaStore.Video.Thumbnails.MINI_KIND, null);
            return MediaStore.Images.Thumbnails.getThumbnail(cr, id, MediaStore.Images.Thumbnails.MINI_KIND, null);
        } catch (Throwable t) {
            return null;
        }
    }

    private WebResourceResponse mediaReply(int code, String msg, Map<String, String> h, java.io.InputStream body, String mime) {
        return new WebResourceResponse(mime, null, code, msg, h, body);
    }

    // https://flaynity-media.local/thumb/<id>?k=v|i&t=<token>   and   .../file/<id>?k=v|i&t=<token>
    private WebResourceResponse serveMedia(WebResourceRequest request) {
        Uri u = request.getUrl();
        if (u == null || !MEDIA_HOST.equalsIgnoreCase(u.getHost())) return null;
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Access-Control-Allow-Headers", "*");
        try {
            if ("OPTIONS".equalsIgnoreCase(request.getMethod()))
                return mediaReply(200, "OK", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
            if (!mediaToken.equals(u.getQueryParameter("t")) || !hasMediaPermission())
                return mediaReply(403, "Forbidden", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
            java.util.List<String> seg = u.getPathSegments();
            if (seg.size() < 2)
                return mediaReply(404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
            long id = Long.parseLong(seg.get(1));
            boolean video = "v".equals(u.getQueryParameter("k"));
            Uri content = ContentUris.withAppendedId(
                video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
            if ("thumb".equals(seg.get(0))) {
                Bitmap bmp = loadMediaThumb(content, id, video);
                if (bmp == null)
                    return mediaReply(404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 82, bos);
                bmp.recycle();
                h.put("Cache-Control", "max-age=86400");
                return mediaReply(200, "OK", h, new java.io.ByteArrayInputStream(bos.toByteArray()), "image/jpeg");
            }
            String mime = getContentResolver().getType(content);
            if (mime == null) mime = video ? "video/mp4" : "image/jpeg";
            java.io.InputStream in = getContentResolver().openInputStream(content);
            if (in == null)
                return mediaReply(404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
            return mediaReply(200, "OK", h, in, mime);
        } catch (Exception e) {
            return mediaReply(404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]), "text/plain");
        }
    }
    // ================= /MEDIA PICKER =================

    private boolean hasWebBackStack = false;
    private boolean pageRequested = false;

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }
        
        @JavascriptInterface
        public String getFcmToken() {
            return currentFcmToken;
        }

        // Called from app.js: "dark" = page behind status bar is dark => WHITE icons, "light" => BLACK icons
        @JavascriptInterface
        public void setStatusBarTheme(final String theme) {
            final boolean dark = "dark".equalsIgnoreCase(theme);
            getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_THEME, dark ? "dark" : "light").apply();
            runOnUiThread(() -> applyStatusBarTheme(dark));
        }

        // Called from app.js (applyTheme): the real app theme "dark" / "light"
        @JavascriptInterface
        public void setAppTheme(final String theme) {
            final boolean dark = "dark".equalsIgnoreCase(theme);
            appDarkTheme = dark;
            getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_APP_THEME, dark ? "dark" : "light").apply();
        }

        @JavascriptInterface
        public void setBackStackStatus(boolean hasHistory) {
            hasWebBackStack = hasHistory;
        }

        @JavascriptInterface
        public void triggerGoogleSignIn() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (mGoogleSignInClient != null) {
                        mGoogleSignInClient.signOut(); 
                        Intent signInIntent = mGoogleSignInClient.getSignInIntent();
                        appOpenSuppressNext = true;   // returning from sign-in is not a new app entry
                        startActivityForResult(signInIntent, RC_SIGN_IN); 
                    }
                }
            });
        }

        // Called from app.js when the user reaches a Feels ad slide
        @JavascriptInterface
        public void showFeelsAd(final String mode) {
            runOnUiThread(() -> showFeelsAdNow(mode, null));
        }

        // same as showFeelsAd, but the slide id is passed: the same slide always gets the same ad
        @JavascriptInterface
        public void showFeelsAdSlot(final String mode, final String slot) {
            runOnUiThread(() -> showFeelsAdNow(mode, slot));
        }

        // Called from app.js when the user taps a bottom-nav tab while the ad is open
        @JavascriptInterface
        public void hideFeelsAd() {
            runOnUiThread(() -> removeFeelsAdOverlay());
        }

        // Called from app.js: kind = "preroll" | "midroll", cssTop = top of the 16:9 player in CSS px
        @JavascriptInterface
        public void showLongVideoAd(final String kind, final double cssTop) {
            runOnUiThread(() -> showLongVideoAdNow(kind, cssTop));
        }

        // Called from app.js when the user leaves the watch page / switches tab while the ad is open
        @JavascriptInterface
        public void hideLongVideoAd() {
            runOnUiThread(() -> removeLongAdOverlay());
        }

        // Called from app.js (Landscape button of the long video player): true = landscape, false = back to normal
        @JavascriptInterface
        public void setPlayerLandscape(final boolean on) {
            runOnUiThread(() -> setPlayerLandscapeNow(on));
        }

        @JavascriptInterface
        public void showRewardedVideoAd() {
            runOnUiThread(() -> {
                if (webview1 != null) {
                    webview1.evaluateJavascript("javascript:onAdRewardEarned();", null);
                }
            });
        }

        @JavascriptInterface
        public void showDownloadRewardedAd() {
            runOnUiThread(() -> {
                if (webview1 != null) {
                    webview1.evaluateJavascript("javascript:onDownloadAdRewardEarned();", null);
                }
            });
        }

        // ---- Media picker (see MEDIA PICKER block) ----
        @JavascriptInterface
        public boolean hasMediaPermission() { return MainActivity.this.hasMediaPermission(); }

        @JavascriptInterface
        public void requestMediaPermission() { runOnUiThread(() -> requestMediaPermissionNow()); }

        @JavascriptInterface
        public void openAppSettings() { runOnUiThread(() -> openAppSettingsNow()); }

        // type: all | videos | photos ; bucketId: "all" or an album id. Returns JSON {token, items:[{id,v,m,n,d}], end}
        @JavascriptInterface
        public String getMediaList(String type, String bucketId, int offset, int limit) {
            return queryMediaList(type, bucketId, offset, limit);
        }

        @JavascriptInterface
        public String getMediaAlbums(String type) { return queryMediaAlbums(type); }

        @JavascriptInterface
        public void setMediaPickerOpen(boolean open) { mediaPickerOpen = open; }

        @JavascriptInterface
        public void retryConnection() {
            runOnUiThread(() -> MainActivity.this.retryConnection());
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> MainActivity.this.requestNotificationPermission());
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        
        // 🔴 ভিপিএন/প্রক্সি ডিটেকশন (ক্লিন এক্সিট)
        if (isVpnOrProxyActive()) {
            Toast.makeText(this, "Security Alert: VPN or Proxy detected! Please disable it.", Toast.LENGTH_LONG).show();
            finishAffinity();
            return;
        }

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // Disk cache used by the "always revalidate" interceptor (fast 304 responses)
        try {
            if (HttpResponseCache.getInstalled() == null) {
                HttpResponseCache.install(new File(getCacheDir(), "http_cache"), 50L * 1024 * 1024);
            }
        } catch (Exception ignored) {}

        // Last used theme -> status bar is correct from the very first frame
        isDarkTheme = "dark".equals(getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE).getString(KEY_THEME, "light"));

        appDarkTheme = "dark".equals(getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE).getString(KEY_APP_THEME, "light"));
        lastNightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        setContentView(R.layout.main);
        webview1 = findViewById(R.id.webview1);

        setupFullScreen(); 

        try {
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(WEB_CLIENT_ID) 
                .requestEmail()
                .build();
            mGoogleSignInClient = GoogleSignIn.getClient(this, gso); 
        } catch (Exception e) {
            android.util.Log.e("GOOGLE_AUTH_INIT", "Initialization failed: " + e.getMessage());
        }
        
        setupWebView();
        startLoadingApp();
        // Non-critical work is moved after the first frame so the page starts loading first
        handler.post(() -> {
            fetchFcmToken();
            registerNetworkCallback();
            initAds();
        });
    }

    private boolean isVpnOrProxyActive() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network activeNetwork = cm.getActiveNetwork();
                NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                    return true;
                }
            }
            String proxyHost = System.getProperty("http.proxyHost");
            if (proxyHost != null && !proxyHost.trim().isEmpty()) {
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            if (playerLandscape) hidePlayerSystemBars();
            else setupFullScreen();
        }
    }

    // Status bar is ALWAYS visible and TRANSPARENT: the app UI is drawn behind it (same top position as before).
    // Only the colour of the status bar icons/text changes (white on dark pages, black on light pages).
    private void setupFullScreen() {
        Window window = getWindow();
        if (window == null) return;
        if (playerLandscape) { hidePlayerSystemBars(); return; }

        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        try { window.setStatusBarColor(Color.TRANSPARENT); } catch (Exception ignored) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.statusBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        applyStatusBarTheme(isDarkTheme);
    }

    // pageIsDark == true  -> status bar icons WHITE  (page behind the status bar is dark)
    // pageIsDark == false -> status bar icons BLACK  (page behind the status bar is light)
    private void applyStatusBarTheme(boolean pageIsDark) {
        isDarkTheme = pageIsDark;
        Window window = getWindow();
        if (window == null) return;

        try { window.setStatusBarColor(Color.TRANSPARENT); } catch (Exception ignored) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = window.getInsetsController();
            if (c != null) {
                c.setSystemBarsAppearance(
                    pageIsDark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            int flags = decor.getSystemUiVisibility();
            if (pageIsDark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            flags &= ~View.SYSTEM_UI_FLAG_FULLSCREEN;
            decor.setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (longAdOverlay != null) {
            handler.postDelayed(new Runnable() {
                @Override
                public void run() { applyLongAdLayout(); }
            }, 200);
        }
        int currentNightMode = newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK;
        // Rotation (landscape button) must NOT touch the theme: only react when dark/light really changed
        if (lastNightMode == currentNightMode) return;
        lastNightMode = currentNightMode;
        String themeMode = "light";
        if (currentNightMode == Configuration.UI_MODE_NIGHT_YES) {
            themeMode = "dark";
        }
        final String finalTheme = themeMode;
        runOnUiThread(() -> {
            if (webview1 != null) {
                webview1.evaluateJavascript("if(typeof window.selectThemeVal === 'function'){ window.selectThemeVal('" + finalTheme + "'); }", null);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == RC_SIGN_IN) {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data); 
            try {
                GoogleSignInAccount account = task.getResult(ApiException.class);
                if (account != null) {
                    String idToken = account.getIdToken(); 
                    if (webview1 != null) {
                        webview1.evaluateJavascript("javascript:handleNativeGoogleSignIn('" + idToken + "');", null);
                    }
                }
            } catch (ApiException e) {
                android.util.Log.e("GOOGLE_AUTH_FAILED", "Code: " + e.getStatusCode());
                final int errorCode = e.getStatusCode();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Google Error Code: " + errorCode, Toast.LENGTH_LONG).show());
                if (webview1 != null) {
                    webview1.evaluateJavascript("javascript:showNotification('Google Sign-In Failed', 'error');", null);
                }
            }
        } 
        else if (requestCode == FILECHOOSER_RESULTCODE) {
            if (uploadMessage == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null) {
                    String dataString = data.getDataString();
                    ClipData clipData = data.getClipData();
                    if (clipData != null) {
                        results = new Uri[clipData.getItemCount()];
                        for (int i = 0; i < clipData.getItemCount(); i++) {
                            ClipData.Item item = clipData.getItemAt(i);
                            results[i] = item.getUri();
                        }
                    }
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
            }
            uploadMessage.onReceiveValue(results);
            uploadMessage = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    private String getDynamicFirebaseDbUrl() {
        try {
            FirebaseApp app = FirebaseApp.getInstance();
            if (app != null && app.getOptions() != null) {
                String url = app.getOptions().getDatabaseUrl();
                if (url != null && !url.trim().isEmpty()) return url.trim();

                String projId = app.getOptions().getProjectId();
                if (projId != null && !projId.trim().isEmpty()) {
                    return "https://" + projId + "-default-rtdb.firebaseio.com";
                }
            }
        } catch (Exception ignored) {}

        try {
            int resId = getResources().getIdentifier("firebase_database_url", "string", getPackageName());
            if (resId != 0) {
                String url = getString(resId);
                if (url != null && !url.trim().isEmpty()) return url.trim();
            }
        } catch (Exception ignored) {}

        return null;
    }

    private void applySecretKeyToUserAgent(String key) {
        if (key == null || key.trim().isEmpty() || webview1 == null) return;
        runOnUiThread(() -> {
            WebSettings ws = webview1.getSettings();
            if (baseUserAgent == null) {
                baseUserAgent = ws.getUserAgentString();
            }
            String targetKey = key.trim();
            if (!ws.getUserAgentString().contains(targetKey)) {
                ws.setUserAgentString(baseUserAgent + " " + targetKey);
            }
        });
    }

    private void startLoadingApp() {
        isError = false;

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String cachedUrl = prefs.getString(KEY_CACHED_URL, null);
        String cachedSecret = prefs.getString(KEY_CACHED_SECRET, null);

        if (cachedSecret != null && !cachedSecret.trim().isEmpty()) {
            secretKey = cachedSecret.trim();
            applySecretKeyToUserAgent(secretKey);
        }

        if (cachedUrl != null && !cachedUrl.trim().isEmpty()) {
            websiteUrl = cachedUrl.trim();
        }

        if (!isNetworkAvailable()) {
            if (websiteUrl != null && !websiteUrl.trim().isEmpty()) {
                loadWebsiteUrl();
            } else if (webview1 != null) {
                webview1.loadUrl(OFFLINE_URL);
            }
            return;
        }

        if (websiteUrl != null && !websiteUrl.trim().isEmpty()) {
            loadWebsiteUrl();
        }

        handler.postDelayed(() -> {
            if (websiteUrl == null && !isFinishing() && webview1 != null) {
                webview1.loadUrl(OFFLINE_URL);
            }
        }, 6000);

        // Fast REST fetch first; Firebase SDK only as a fallback if REST fails
        fetchConfigDirectFromFirebase();
    }

    private void fetchConfigViaSdk() {
        try {
            String dbUrl = getDynamicFirebaseDbUrl();
            DatabaseReference configRef;
            if (dbUrl != null) {
                configRef = FirebaseDatabase.getInstance(dbUrl).getReference(APP_CONFIG_DB_PATH);
            } else {
                configRef = FirebaseDatabase.getInstance().getReference(APP_CONFIG_DB_PATH);
            }

            configRef.addListenerForSingleValueEvent(new ValueEventListener() {
                @Override
                public void onDataChange(DataSnapshot snapshot) {
                    String remoteUrl = snapshot.child("websiteUrl").getValue(String.class);
                    String remoteSecret = snapshot.child("secretKey").getValue(String.class);
                    saveAndApplyConfig(remoteUrl, remoteSecret);
                }

                @Override
                public void onCancelled(DatabaseError error) {
                    android.util.Log.e("FIREBASE_CONFIG", "Failed: " + error.getMessage());
                }
            });
        } catch (Exception e) {
            android.util.Log.e("FIREBASE_CONFIG", "SDK Init failed: " + e.getMessage());
        }
    }

    private void saveAndApplyConfig(final String url, final String secret) {
        runOnUiThread(() -> {
            SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            boolean secretChanged = false;
            if (secret != null && !secret.trim().isEmpty()) {
                String newSecret = secret.trim();
                secretChanged = (secretKey == null || !secretKey.equals(newSecret));
                secretKey = newSecret;
                editor.putString(KEY_CACHED_SECRET, secretKey);
                if (secretChanged) applySecretKeyToUserAgent(secretKey);
            }

            boolean needReload = secretChanged;
            if (url != null && !url.trim().isEmpty()) {
                String cleanUrl = url.trim();
                if (cleanUrl.startsWith("https://") || cleanUrl.startsWith("http://")) {
                    boolean urlChanged = (websiteUrl == null || !websiteUrl.equals(cleanUrl));
                    websiteUrl = cleanUrl;
                    editor.putString(KEY_CACHED_URL, websiteUrl);
                    if (urlChanged) needReload = true;
                }
            }
            editor.apply();

            // First launch ever (nothing loaded yet) or real change => load. Otherwise DON'T reload (this was the slowness).
            if (needReload || (!pageRequested && websiteUrl != null)) {
                loadWebsiteUrl();
            }
        });
    }

    private void fetchConfigDirectFromFirebase() {
        new Thread(() -> {
            HttpURLConnection conn = null;
            BufferedReader reader = null;
            boolean ok = false;
            try {
                String dynamicDbUrl = getDynamicFirebaseDbUrl();
                if (dynamicDbUrl == null || dynamicDbUrl.trim().isEmpty()) return; // finally -> SDK fallback

                if (dynamicDbUrl.endsWith("/")) {
                    dynamicDbUrl = dynamicDbUrl.substring(0, dynamicDbUrl.length() - 1);
                }

                URL url = new URL(dynamicDbUrl + "/" + APP_CONFIG_DB_PATH + ".json");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setUseCaches(false);

                if (conn.getResponseCode() == 200) {
                    reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }

                    JSONObject json = new JSONObject(sb.toString().trim());
                    String remoteUrl = json.optString("websiteUrl", null);
                    String remoteSecret = json.optString("secretKey", null);

                    saveAndApplyConfig(remoteUrl, remoteSecret);
                    ok = true;
                }
            } catch (Exception e) {
                android.util.Log.e("FIREBASE_FETCH", "Error: " + e.getMessage());
            } finally {
                if (reader != null) {
                    try { reader.close(); } catch (Exception ignored) {}
                }
                if (conn != null) {
                    conn.disconnect();
                }
                if (!ok) {
                    runOnUiThread(() -> fetchConfigViaSdk());
                }
            }
        }).start();
    }

    private void loadWebsiteUrl() {
        if (webview1 == null) return;

        if (websiteUrl == null || websiteUrl.trim().isEmpty()) {
            webview1.loadUrl(OFFLINE_URL);
            return;
        }

        pageRequested = true;
        if (isNetworkAvailable()) {
            // Online: html/js/css are always re-validated with the server (see shouldInterceptRequest)
            webview1.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            webview1.loadUrl(websiteUrl);
        } else {
            webview1.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            webview1.loadUrl(resolveOfflineRedirect(websiteUrl));
        }
    }

    // ---------------------------------------------------------------
    // ALWAYS-FRESH + FAST: html / js / css / json from YOUR domain are fetched with
    // "Cache-Control: no-cache" -> server answers 304 (tiny, instant) when unchanged
    // or sends the new file immediately when you edited it. Images/videos use normal cache.
    // ---------------------------------------------------------------
    private boolean isFreshnessTarget(Uri uri) {
        try {
            if (websiteUrl == null || uri == null) return false;
            String host = Uri.parse(websiteUrl).getHost();
            if (host == null || !host.equalsIgnoreCase(uri.getHost())) return false;
            String path = uri.getPath();
            if (path == null || path.isEmpty() || path.endsWith("/")) return true;
            String p = path.toLowerCase();
            int dot = p.lastIndexOf('.');
            if (dot < p.lastIndexOf('/')) return true; // no extension
            String ext = p.substring(dot + 1);
            return ext.equals("html") || ext.equals("htm") || ext.equals("js") || ext.equals("mjs")
                || ext.equals("css") || ext.equals("json") || ext.equals("php");
        } catch (Exception e) {
            return false;
        }
    }

    // ---------- offline copy of html/js/css/json (so the app opens without internet) ----------
    private File offlineDir() {
        File d = new File(getCacheDir(), "offline_files");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private String cacheKey(String url) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(url.hashCode());
        }
    }

    private void writeSmallFile(File f, byte[] data) throws java.io.IOException {
        File tmp = new File(f.getPath() + ".tmp");
        java.io.FileOutputStream out = new java.io.FileOutputStream(tmp);
        try { out.write(data); } finally { out.close(); }
        if (f.exists()) f.delete();
        tmp.renameTo(f);
    }

    private void saveOfflineCopy(String url, byte[] body, String mime, String enc) {
        try {
            String key = cacheKey(url);
            File dir = offlineDir();
            writeSmallFile(new File(dir, key + ".meta"), (mime + "\n" + enc).getBytes("UTF-8"));
            writeSmallFile(new File(dir, key + ".body"), body);
            File redir = new File(dir, key + ".redir");
            if (redir.exists()) redir.delete();
        } catch (Exception ignored) {}
    }

    private void saveOfflineRedirect(String url, String target) {
        try {
            writeSmallFile(new File(offlineDir(), cacheKey(url) + ".redir"), target.getBytes("UTF-8"));
        } catch (Exception ignored) {}
    }

    private String readTextFile(File f) {
        try {
            java.io.FileInputStream in = new java.io.FileInputStream(f);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private WebResourceResponse readOfflineCopy(String url) {
        try {
            String key = cacheKey(url);
            File body = new File(offlineDir(), key + ".body");
            File meta = new File(offlineDir(), key + ".meta");
            if (!body.exists() || !meta.exists()) return null;
            String m = readTextFile(meta);
            if (m == null) return null;
            String[] parts = m.split("\n");
            String mime = parts.length > 0 ? parts[0] : "text/html";
            String enc = parts.length > 1 ? parts[1] : "utf-8";
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, enc, 200, "OK", headers, new java.io.FileInputStream(body));
        } catch (Exception e) {
            return null;
        }
    }

    // Offline: follow saved redirects (example http -> https, / -> /index.html)
    private String resolveOfflineRedirect(String url) {
        String cur = url;
        for (int i = 0; i < 4; i++) {
            File r = new File(offlineDir(), cacheKey(cur) + ".redir");
            if (!r.exists()) break;
            String t = readTextFile(r);
            if (t == null || t.trim().isEmpty()) break;
            cur = t.trim();
        }
        return cur;
    }

    private WebResourceResponse fetchFresh(WebResourceRequest request) {
        HttpURLConnection conn = null;
        String urlStr = null;
        try {
            if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) return null;
            if (!isFreshnessTarget(uri)) return null;
            urlStr = uri.toString();

            // Offline -> serve the last saved copy (if none, WebView uses its own old cache)
            if (!isNetworkAvailable()) return readOfflineCopy(urlStr);

            Map<String, String> reqHeaders = request.getRequestHeaders();
            if (reqHeaders != null && reqHeaders.containsKey("Range")) return null;

            conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(20000);
            conn.setInstanceFollowRedirects(false);
            conn.setUseCaches(true);

            if (reqHeaders != null) {
                for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                    String k = h.getKey();
                    if (k == null || k.equalsIgnoreCase("Accept-Encoding")) continue;
                    conn.setRequestProperty(k, h.getValue());
                }
            }
            conn.setRequestProperty("Cache-Control", "no-cache");

            String cookies = CookieManager.getInstance().getCookie(urlStr);
            if (cookies != null && !cookies.isEmpty()) conn.setRequestProperty("Cookie", cookies);

            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = conn.getHeaderField("Location");
                if (loc != null) {
                    try { saveOfflineRedirect(urlStr, new URL(new URL(urlStr), loc).toString()); } catch (Exception ignored) {}
                }
                return null; // WebView follows the redirect itself
            }
            if (code != 200) return null;

            Map<String, String> outHeaders = new HashMap<>();
            for (Map.Entry<String, java.util.List<String>> e : conn.getHeaderFields().entrySet()) {
                String k = e.getKey();
                if (k == null || e.getValue() == null) continue;
                if (k.equalsIgnoreCase("Set-Cookie")) {
                    for (String c : e.getValue()) CookieManager.getInstance().setCookie(urlStr, c);
                    continue;
                }
                if (k.equalsIgnoreCase("Content-Encoding") || k.equalsIgnoreCase("Content-Length")
                        || k.equalsIgnoreCase("Transfer-Encoding")) continue;
                outHeaders.put(k, android.text.TextUtils.join(",", e.getValue()));
            }
            outHeaders.put("Cache-Control", "no-cache");

            String contentType = conn.getContentType();
            String mime = "text/html";
            String enc = "utf-8";
            if (contentType != null) {
                String[] parts = contentType.split(";");
                mime = parts[0].trim();
                for (int i = 1; i < parts.length; i++) {
                    String part = parts[i].trim();
                    if (part.toLowerCase().startsWith("charset=")) enc = part.substring(8).trim();
                }
            } else {
                String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase();
                if (path.endsWith(".js") || path.endsWith(".mjs")) mime = "application/javascript";
                else if (path.endsWith(".css")) mime = "text/css";
                else if (path.endsWith(".json")) mime = "application/json";
            }

            // Read the (small) file fully, keep an offline copy, then hand it to WebView
            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            byte[] data = bos.toByteArray();

            if (data.length < 8 * 1024 * 1024) saveOfflineCopy(urlStr, data, mime, enc);
            return new WebResourceResponse(mime, enc, 200, "OK", outHeaders, new java.io.ByteArrayInputStream(data));
        } catch (Exception e) {
            if (conn != null) conn.disconnect();
            // Network dropped / timeout -> last saved copy, otherwise normal WebView request
            return urlStr != null ? readOfflineCopy(urlStr) : null;
        }
    }

    private void retryConnection() {
        if (isVpnOrProxyActive()) {
            Toast.makeText(this, "Security Alert: VPN or Proxy detected!", Toast.LENGTH_LONG).show();
            return;
        }

        if (!isNetworkAvailable()) {
            runOnUiThread(() -> {
                Toast.makeText(MainActivity.this, "Still No Internet Connection 😕", Toast.LENGTH_SHORT).show();
                if (webview1 != null) {
                    webview1.evaluateJavascript("if(typeof window.stopRefreshAnimation === 'function'){ window.stopRefreshAnimation(); }", null);
                }
            });
            return; 
        }

        runOnUiThread(() -> {
            isError = false;

            if (websiteUrl == null || websiteUrl.trim().isEmpty()) {
                SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
                websiteUrl = prefs.getString(KEY_CACHED_URL, null);
                secretKey = prefs.getString(KEY_CACHED_SECRET, null);
                if (secretKey != null) applySecretKeyToUserAgent(secretKey);
            }

            if (webview1 != null) {
                webview1.evaluateJavascript("if(typeof window.stopRefreshAnimation === 'function'){ window.stopRefreshAnimation(); }", null);
            }

            if (websiteUrl != null && !websiteUrl.trim().isEmpty()) {
                loadWebsiteUrl();
            } else {
                startLoadingApp();
            }
        });
    }

    private void setupWebView() {
        if (webview1 == null) return;
        WebSettings ws = webview1.getSettings();
        
        String defaultUA = ws.getUserAgentString();
        if (defaultUA != null) {
            baseUserAgent = defaultUA.replaceAll("(?i);\\s*wv", "")
                                     .replaceAll("(?i)Version/\\d+\\.\\d+\\s*", "");
            ws.setUserAgentString(baseUserAgent); 
        }
        
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webview1, true);
        }

        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setGeolocationEnabled(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
        
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setMediaPlaybackRequiresUserGesture(false); 
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webview1.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        webview1.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // Flaynity launch animation starts on #0F0F0F: the WebView must be dark too, so no white frame
        // shows before the page paints its first frame (restored to the real theme in onPageFinished).
        webview1.setBackgroundColor(0xFF0F0F0F);
        ws.setLoadsImagesAutomatically(true);
        
        webview1.setVerticalScrollBarEnabled(false);
        webview1.setHorizontalScrollBarEnabled(false);
        webview1.setScrollBarStyle(View.SCROLLBARS_OUTSIDE_OVERLAY);

        webview1.addJavascriptInterface(new WebAppInterface(this), "AndroidBridge");

        webview1.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                WebResourceResponse media = serveMedia(request);
                if (media != null) return media;
                WebResourceResponse fresh = fetchFresh(request);
                return fresh != null ? fresh : super.shouldInterceptRequest(v, request);
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                super.onPageStarted(v, url, fav);
                mediaPickerOpen = false;
                isError = false; 
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                // The launch splash is already painted by the page now: give the WebView its normal background back.
                try { v.setBackgroundColor(appDarkTheme ? 0xFF0F0F0F : Color.WHITE); } catch (Throwable ignored) {}
                if (!isError && !url.equals("about:blank") && !url.equals(OFFLINE_URL)) {
                    v.evaluateJavascript("if (typeof syncFcmToken === 'function') { syncFcmToken(); }", null);
                }
            }

            @Override
            public void onReceivedError(WebView v, int code, String desc, String url) {
                super.onReceivedError(v, code, desc, url);
                if (url != null && ((websiteUrl != null && url.startsWith(websiteUrl)) || url.equals("about:blank"))) {
                    isError = true;
                    if (webview1 != null) webview1.loadUrl(OFFLINE_URL);
                }
            }

            @TargetApi(Build.VERSION_CODES.M)
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                super.onReceivedError(v, r, e);
                if (r.isForMainFrame()) {
                    isError = true;
                    if (webview1 != null) webview1.loadUrl(OFFLINE_URL);
                }
            }

            @Override
            public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) { 
                h.cancel();
                isError = true;
                v.loadUrl(OFFLINE_URL);
            }
            
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleUrlRouting(url);
            }

            @TargetApi(Build.VERSION_CODES.N)
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return handleUrlRouting(request.getUrl().toString());
            }
        });

        webview1.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton("OK", (d, w) -> r.confirm()).setCancelable(false).show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton("Yes", (d, w) -> r.confirm())
                    .setNegativeButton("No",  (d, w) -> r.cancel()).setCancelable(false).show();
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String o, GeolocationPermissions.Callback c) {
                c.invoke(o, true, false);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    ArrayList<String> missingPermissions = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                                MainActivity.this.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_DENIED) {
                                missingPermissions.add(android.Manifest.permission.RECORD_AUDIO);
                            }
                        }
                        if (resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                                MainActivity.this.checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_DENIED) {
                                missingPermissions.add(android.Manifest.permission.CAMERA);
                            }
                        }
                    }
                    if (!missingPermissions.isEmpty()) {
                        pendingPermissionRequest = request;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            MainActivity.this.requestPermissions(missingPermissions.toArray(new String[0]), 102);
                        }
                    } else {
                        request.grant(request.getResources());
                    }
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, WebChromeClient.FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    appOpenSuppressNext = true;   // returning from the file picker is not a new app entry
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    Toast.makeText(MainActivity.this, "Cannot open file chooser", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });
    }

    private boolean handleUrlRouting(String url) {
        if (url == null) return false;

        if (url.startsWith("intent:") || url.contains("t.me") || url.contains("telegram.me") || url.startsWith("whatsapp:") || url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("market:")) {
            try {
                Intent intent;
                if (url.startsWith("intent:")) {
                    intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                } else {
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                }

                if (intent != null) {
                    if (getPackageManager().resolveActivity(intent, 0) != null) {
                        startActivity(intent);
                    }
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return true;
        }

        return false; 
    }

    private void fetchFcmToken() {
        try {
            com.google.firebase.iid.FirebaseInstanceId.getInstance().getInstanceId()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult() != null) {
                        currentFcmToken = task.getResult().getToken();
                        try {
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("all");
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                });
        } catch (Exception e) {
            try {
                currentFcmToken = com.google.firebase.iid.FirebaseInstanceId.getInstance().getToken();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        }
    }

    private void registerNetworkCallback() {
        try {
            ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && connectivityManager != null) {
                connectivityManager.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        runOnUiThread(() -> {
                            String currentUrl = (webview1 != null) ? webview1.getUrl() : "";
                            if (isError || (currentUrl != null && currentUrl.equals(OFFLINE_URL))) {
                                retryConnection();
                            }
                        });
                    }

                    @Override
                    public void onLost(Network network) {
                        runOnUiThread(() -> {});
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ArrayList<String> permissions = new ArrayList<>();
            
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_DENIED) {
                permissions.add(android.Manifest.permission.RECORD_AUDIO);
            }

            if (Build.VERSION.SDK_INT >= 33) { 
                if (checkSelfPermission("android.permission.READ_MEDIA_IMAGES") == android.content.pm.PackageManager.PERMISSION_DENIED) {
                    permissions.add("android.permission.READ_MEDIA_IMAGES");
                }
                if (checkSelfPermission("android.permission.READ_MEDIA_VIDEO") == android.content.pm.PackageManager.PERMISSION_DENIED) {
                    permissions.add("android.permission.READ_MEDIA_VIDEO");
                }
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_DENIED) {
                    permissions.add("android.permission.POST_NOTIFICATIONS");
                }
            } else {
                if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_DENIED) {
                    permissions.add(android.Manifest.permission.READ_EXTERNAL_STORAGE);
                }
                if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_DENIED) {
                    permissions.add(android.Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
            }
            
            if (!permissions.isEmpty()) {
                requestPermissions(permissions.toArray(new String[0]), 101);
            }
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_NOTIFICATION_REQUESTED, false)) return;

        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            prefs.edit().putBoolean(KEY_NOTIFICATION_REQUESTED, true).apply();
            return;
        }

        prefs.edit().putBoolean(KEY_NOTIFICATION_REQUESTED, true).apply();
        requestPermissions(
            new String[]{"android.permission.POST_NOTIFICATIONS"},
            103
        );
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == RC_MEDIA_PERMISSION) {
            notifyMediaPermission(hasMediaPermission());
            return;
        }

        if (requestCode == 102 && pendingPermissionRequest != null) {
            PermissionRequest request = pendingPermissionRequest;
            pendingPermissionRequest = null;

            boolean cameraGranted = true;
            boolean audioGranted = true;

            for (int i = 0; i < permissions.length; i++) {
                if (android.Manifest.permission.CAMERA.equals(permissions[i])) {
                    cameraGranted = grantResults[i] == android.content.pm.PackageManager.PERMISSION_GRANTED;
                } else if (android.Manifest.permission.RECORD_AUDIO.equals(permissions[i])) {
                    audioGranted = grantResults[i] == android.content.pm.PackageManager.PERMISSION_GRANTED;
                }
            }

            if (cameraGranted && audioGranted) {
                try {
                    request.grant(request.getResources());
                } catch (Exception e) {
                    android.util.Log.e("WEBVIEW_PERMISSION", "Grant failed: " + e.getMessage());
                }
            } else {
                try {
                    request.deny();
                } catch (Exception ignored) {}
            }
            return;
        }

        if (requestCode == 103) {
            // Notification permission is requested only after the Home page is reached.
            return;
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnected();
        }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (mediaPickerOpen) {            // custom media picker is open: Back closes it first
            if (webview1 != null) {
                webview1.evaluateJavascript("(window.closeMediaPicker&&window.closeMediaPicker())?1:0", value -> {
                    if (value == null || !value.contains("1")) mediaPickerOpen = false;   // never get stuck
                });
            } else mediaPickerOpen = false;
            return;
        }
        if (longAdOverlay != null) {
            finishLongAd("back");
            return;
        }
        if (feelsAdOverlay != null) {
            dismissFeelsAd("closed");
            return;
        }
        if (playerLandscape) {            // Back while the video is landscape: go back to portrait first
            setPlayerLandscapeNow(false);
            notifyPlayerLandscape(false);
            return;
        }
        if (webview1 == null) {
            super.onBackPressed();
            return;
        }

        String currentUrl = webview1.getUrl();
        if (currentUrl != null && currentUrl.equals(OFFLINE_URL)) {
            finish();
            return;
        }

        if (webview1.canGoBack()) {
            webview1.goBack();
            return;
        }

        webview1.evaluateJavascript(
            "(function(){"
            + "try {"
            + "if (window.app && typeof window.app.executeBackAction === 'function') {"
            + "window.app.executeBackAction(); return 'handled';"
            + "}"
            + "if (typeof window.executeBackAction === 'function') {"
            + "window.executeBackAction(); return 'handled';"
            + "}"
            + "} catch(e) {"
            + "console.error('Back navigation error:', e);"
            + "}"
            + "return 'not_handled';"
            + "})()",
            value -> {
                if (value == null || value.contains("not_handled")) {
                    finish();
                }
            }
        );
    }

    @Override 
    protected void onResume() { 
        super.onResume();  
        applyStatusBarTheme(isDarkTheme);
        if (webview1 != null) webview1.onResume();  
        appInForeground = true;
        // back in the app after being away -> App Open ad again
        if (appOpenSuppressNext) {
            appOpenSuppressNext = false;
            appOpenLeftAt = 0;
        } else if ((appOpenFirstDone || SystemClock.elapsedRealtime() - appOpenStartAt > APP_OPEN_FIRST_WAIT_MS)
                && !appOpenShowing && appOpenLeftAt > 0
                && SystemClock.elapsedRealtime() - appOpenLeftAt >= APP_OPEN_MIN_AWAY_MS) {
            appOpenLeftAt = 0;
            if (!showAppOpenAd()) loadAppOpenAd();
        }
        // cold start where the ad was ready before the screen came up
        if (!appOpenFirstDone && appOpenAvailable()
                && SystemClock.elapsedRealtime() - appOpenStartAt <= APP_OPEN_FIRST_WAIT_MS) {
            appOpenFirstDone = true;
            showAppOpenAd();
        }
    }

    @Override 
    protected void onPause() { 
        super.onPause();   
        appInForeground = false;
        if (!appOpenShowing) appOpenLeftAt = SystemClock.elapsedRealtime();
        if (webview1 != null) webview1.onPause();   
    }

    @Override 
    protected void onDestroy() {
        super.onDestroy();
        destroyFeelsAds();
        destroyLongAds();
        appOpenAd = null;
        try { feelsBlurExec.shutdownNow(); } catch (Exception ignored) {}
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (webview1 != null) {
            webview1.destroy();
        }
    }
}
