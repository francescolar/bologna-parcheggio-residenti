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
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;

public class MainActivity extends Activity {

    private static final String PREFS   = "prefs";
    private static final String KEY_URL = "server_url";
    private static final int    REQ_LOC = 1001;
    private static final int    RED     = Color.parseColor("#C8102E");
    private static final int    GREY    = Color.parseColor("#64748B");

    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String  pendingGeoOrigin;

    // Barra inferiore nativa: 0 = Mappa, 1 = Impostazioni
    private View errorBox;
    private boolean loadFailed = false;
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

        // Schermata "server non raggiungibile" al posto della pagina di errore del browser
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        TextView msg = new TextView(this);
        msg.setText("Impossibile raggiungere ParResBo.\nControlla la connessione e riprova.");
        msg.setTextSize(16f);
        msg.setTextColor(Color.parseColor("#334155"));
        msg.setGravity(Gravity.CENTER);
        box.addView(msg);
        Button retry = new Button(this);
        retry.setText("Riprova");
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundColor(RED);
        retry.setOnClickListener(v -> {
            loadFailed = false;
            box.setVisibility(View.GONE);
            loadUrl(baseUrl());
        });
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(20);
        box.addView(retry, rp);
        box.setVisibility(View.GONE);
        errorBox = box;
        webHolder.addView(box, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

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
            return getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_URL, BuildConfig.BASE_URL);
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
        // La pagina riconosce l'app (niente pulsanti web ridondanti); la build debug attiva gli strumenti di debug
        s.setUserAgentString(s.getUserAgentString() + " ParResBoApp/" + BuildConfig.VERSION_NAME + (BuildConfig.DEBUG ? " ParResBoDebug" : ""));

        // Niente selezione/menu "Copia, Seleziona tutto…" con pressione prolungata
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

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
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loadFailed) errorBox.setVisibility(View.GONE);
                applyTabToPage(); // riallinea la vista alla scheda scelta (es. dopo un ricaricamento)
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Solo la pagina principale: i tile della mappa che falliscono non devono interrompere l'app
                if (!request.isForMainFrame()) return;
                loadFailed = true;
                errorBox.setVisibility(View.VISIBLE);
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
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String current = prefs.getString(KEY_URL, BuildConfig.BASE_URL);

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
                    prefs.edit().putString(KEY_URL, url).apply();
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
