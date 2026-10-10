package dev.laruffa.parresbo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;

public class MainActivity extends Activity {

    private static final int    REQ_LOC = 1001;
    private static final int    RED     = Color.parseColor("#C8102E");
    private static final int    GREY    = Color.parseColor("#64748B");

    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String  pendingGeoOrigin;

    // Barra inferiore nativa: 0 = Mappa, 1 = Impostazioni
    private LinearLayout overlay;          // caricamento / errore, sopra la WebView
    private ProgressBar overlaySpinner;
    private TextView overlayText;
    private Button overlayRetry;
    private boolean loadFailed = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private static final long SLOW_MS = 10_000;   // dopo 10 s senza pagina: "connessione lenta"
    private final Runnable slowRunnable = () ->
        showOverlay("Connessione lenta o assente.\nContinuo a provare…", true, true);
    private int currentTab = 0;
    private final ImageView[] tabIcons  = new ImageView[2];
    private final TextView[]  tabLabels = new TextView[2];

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sotto la tacca/foro della fotocamera: la pagina usa tutto lo schermo
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        // Layout: WebView (sopra) + barra Mappa/Impostazioni (sotto)
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(Color.WHITE);

        FrameLayout webHolder = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(RED); // rosso come lo splash finché la pagina non disegna
        setupWebView();
        webHolder.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Solo build debug: bottone ⚙ per puntare a un server diverso (es. locale)
        if (BuildConfig.DEBUG) {
            Button settingsBtn = new Button(this);
            settingsBtn.setText("⚙");
            settingsBtn.setTextSize(14f);
            settingsBtn.setTextColor(Color.WHITE);
            settingsBtn.setBackgroundColor(Color.argb(180, 0, 0, 0));
            settingsBtn.setPadding(16, 4, 16, 4);
            settingsBtn.setMinWidth(0);
            settingsBtn.setMinimumWidth(0);
            settingsBtn.setOnClickListener(v -> showUrlDialog());
            FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            );
            btnParams.gravity = Gravity.BOTTOM | Gravity.START;
            btnParams.bottomMargin = dp(8);
            btnParams.leftMargin = dp(8);
            webHolder.addView(settingsBtn, btnParams);
        }

        // Caricamento / errore: fondo rosso con logo e indicatore, finché la pagina non è arrivata
        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(RED);
        overlay.setPadding(dp(32), dp(32), dp(32), dp(32));
        overlay.setClickable(true);   // non lascia passare i tocchi alla pagina sotto

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        overlay.addView(logo, new LinearLayout.LayoutParams(dp(160), dp(160)));

        overlaySpinner = new ProgressBar(this);
        overlaySpinner.getIndeterminateDrawable().setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(36), dp(36));
        sp.topMargin = dp(8);
        overlay.addView(overlaySpinner, sp);

        overlayText = new TextView(this);
        overlayText.setTextSize(15f);
        overlayText.setTextColor(Color.WHITE);
        overlayText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tp.topMargin = dp(16);
        overlay.addView(overlayText, tp);

        overlayRetry = new Button(this);
        overlayRetry.setText("Riprova");
        overlayRetry.setTextColor(RED);
        overlayRetry.setBackgroundColor(Color.WHITE);
        overlayRetry.setOnClickListener(v -> retryLoad());
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(20);
        overlay.addView(overlayRetry, rp);

        webHolder.addView(overlay, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        showOverlay("Carico ParResBo…", false, true);

        column.addView(webHolder, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bar = buildTabBar();
        column.addView(bar, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(58)));

        setContentView(column);

        // Se le barre di sistema compaiono (swipe dal bordo) la barra nativa non finisce sotto
        column.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom());
            return insets;
        });

        selectTab(0, false);
        handler.postDelayed(slowRunnable, SLOW_MS);
        loadUrl(baseUrl());
    }

    // ── SCHERMO INTERO ───────────────────────────────────────────────────────
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    @SuppressWarnings("deprecation")
    private void enterImmersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    // ── BARRA INFERIORE ──────────────────────────────────────────────────────
    private LinearLayout buildTabBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.WHITE);
        bar.setElevation(dp(8));

        String[] labels = { "Mappa", "Impostazioni" };
        int[] icons = { R.drawable.ic_map, R.drawable.ic_settings };
        for (int i = 0; i < 2; i++) {
            final int index = i;
            LinearLayout tab = new LinearLayout(this);
            tab.setOrientation(LinearLayout.VERTICAL);
            tab.setGravity(Gravity.CENTER);
            tab.setClickable(true);
            tab.setHapticFeedbackEnabled(false);

            ImageView icon = new ImageView(this);
            icon.setImageResource(icons[i]);
            tab.addView(icon, new LinearLayout.LayoutParams(dp(24), dp(24)));

            TextView label = new TextView(this);
            label.setText(labels[i]);
            label.setTextSize(11f);
            label.setGravity(Gravity.CENTER);
            label.setPadding(0, dp(2), 0, 0);
            tab.addView(label, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            tab.setOnClickListener(v -> selectTab(index, true));
            tabIcons[i]  = icon;
            tabLabels[i] = label;
            bar.addView(tab, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
        }
        return bar;
    }

    private void showOverlay(String text, boolean retry, boolean spinner) {
        overlayText.setText(text);
        overlayRetry.setVisibility(retry ? View.VISIBLE : View.GONE);
        overlaySpinner.setVisibility(spinner ? View.VISIBLE : View.GONE);
        overlay.setVisibility(View.VISIBLE);
    }

    private void hideOverlay() {
        handler.removeCallbacks(slowRunnable);
        overlay.setVisibility(View.GONE);
    }

    private void retryLoad() {
        loadFailed = false;
        showOverlay("Carico ParResBo…", false, true);
        handler.removeCallbacks(slowRunnable);
        handler.postDelayed(slowRunnable, SLOW_MS);
        loadUrl(baseUrl());
    }

    /** Evidenzia la scheda e mostra la vista corrispondente nella pagina web. */
    private void selectTab(int index, boolean apply) {
        currentTab = index;
        for (int i = 0; i < 2; i++) {
            int color = (i == index) ? RED : GREY;
            tabIcons[i].setColorFilter(color);
            tabLabels[i].setTextColor(color);
            tabLabels[i].setTypeface(null, (i == index) ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        }
        if (apply) applyTabToPage();
    }

    private void applyTabToPage() {
        String view = currentTab == 0 ? "map" : "settings";
        webView.evaluateJavascript(
            "window.ParResBo && window.ParResBo.showView('" + view + "')", null);
    }

    // ── WEBVIEW ──────────────────────────────────────────────────────────────
    /** URL del server: fisso in release, sovrascrivibile (⚙) nella build debug. */
    private String baseUrl() {
        if (BuildConfig.DEBUG) {
            return getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE)
                .getString(Prefs.KEY_URL, BuildConfig.BASE_URL);
        }
        return BuildConfig.BASE_URL;
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(BuildConfig.DEBUG
            ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        // Comportamento da app, non da browser: niente zoom della pagina, popup, accesso ai file
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        // La pagina riconosce l'app (niente pulsanti web ridondanti) e ne legge la versione
        s.setUserAgentString(s.getUserAgentString() + " ParResBoApp/" + BuildConfig.VERSION_NAME);

        // Niente selezione/menu "Copia, Seleziona tutto…" con pressione prolungata
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Ponte con la pagina: la zona scelta è condivisa con l'app per Android Auto
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public String getMyZone() { return Prefs.myZone(MainActivity.this); }
            @JavascriptInterface public void setMyZone(String zone) { Prefs.setMyZone(MainActivity.this, zone); }
            @JavascriptInterface public boolean isDisclaimerAccepted() { return Prefs.disclaimerAccepted(MainActivity.this); }
            @JavascriptInterface public void acceptDisclaimer() { Prefs.acceptDisclaimer(MainActivity.this); }
        }, "ParResBoNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false);
                } else {
                    pendingGeoCallback = cb;
                    pendingGeoOrigin   = origin;
                    requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    }, REQ_LOC);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Navigazione verso un parcheggio: lascia scegliere l'app di mappe/navigazione
                if ("geo".equals(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this,
                            "Nessuna app di mappe installata.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                // Link di attribuzione richiesti dalle licenze: nel browser esterno (solo https, solo su tocco)
                if (request.hasGesture() && "https".equals(uri.getScheme()) && isAttributionHost(uri.getHost())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) { }
                    return true;
                }
                // Il resto: solo dentro il server configurato (stesso host), blocca il resto
                String host = Uri.parse(baseUrl()).getHost();
                return host == null || !host.equalsIgnoreCase(uri.getHost());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                loadFailed = false;
                showOverlay("Carico ParResBo…", false, true);
                handler.removeCallbacks(slowRunnable);
                handler.postDelayed(slowRunnable, SLOW_MS);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loadFailed) hideOverlay();
                applyTabToPage(); // riallinea la vista alla scheda scelta (es. dopo un ricaricamento)
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Solo la pagina principale: i tile della mappa che falliscono non devono interrompere l'app
                if (!request.isForMainFrame()) return;
                loadFailed = true;
                handler.removeCallbacks(slowRunnable);
                showOverlay("Impossibile raggiungere ParResBo.\nControlla la connessione e riprova.", true, false);
                if (BuildConfig.DEBUG) showUrlDialog();
            }
        });
    }

    /** Domini dei link di attribuzione (OpenStreetMap, Leaflet): gli unici link esterni consentiti. */
    private static boolean isAttributionHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase();
        return host.equals("openstreetmap.org") || host.endsWith(".openstreetmap.org")
            || host.equals("leafletjs.com") || host.endsWith(".leafletjs.com");
    }

    private void loadUrl(String url) {
        webView.loadUrl(url);
    }

    private void showUrlDialog() {
        SharedPreferences prefs = getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE);
        String current = prefs.getString(Prefs.KEY_URL, BuildConfig.BASE_URL);

        EditText input = new EditText(this);
        input.setText(current);
        input.setSelectAllOnFocus(true);
        int pad = dp(16);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(pad * 2, pad, pad * 2, pad / 2);
        layout.addView(input);

        new AlertDialog.Builder(this)
            .setTitle("Server (debug)")
            .setMessage("URL del server, es. http://192.168.1.x:3000")
            .setView(layout)
            .setPositiveButton("Connetti", (d, w) -> {
                String url = input.getText().toString().trim().replaceAll("/$", "");
                if (!url.isEmpty()) {
                    prefs.edit().putString(Prefs.KEY_URL, url).apply();
                    webView.stopLoading();
                    loadUrl(url);
                }
            })
            .setNegativeButton("Annulla", null)
            .setCancelable(false)
            .show();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_LOC && pendingGeoCallback != null) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin   = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (currentTab != 0) selectTab(0, true);   // dalle impostazioni si torna alla mappa
        else super.onBackPressed();
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }
}
