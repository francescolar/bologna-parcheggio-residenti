package it.bologna.parcheggio;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;

public class MainActivity extends Activity {

    private static final String PREFS   = "prefs";
    private static final String KEY_URL = "server_url";
    private static final int    REQ_LOC = 1001;

    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String  pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Nasconde la barra del titolo e va a schermo intero
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        // Layout: WebView + bottone impostazioni sovrapposto
        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
        setupWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Solo build debug: bottone ⚙ per puntare a un server diverso (es. locale)
        if (BuildConfig.DEBUG) {
            Button settingsBtn = new Button(this);
            settingsBtn.setText("⚙");
            settingsBtn.setTextSize(18f);
            settingsBtn.setTextColor(Color.WHITE);
            settingsBtn.setBackgroundColor(Color.argb(180, 0, 0, 0));
            settingsBtn.setPadding(20, 8, 20, 8);
            settingsBtn.setOnClickListener(v -> showUrlDialog());
            int dp8 = dp(8);
            FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            );
            btnParams.gravity = Gravity.BOTTOM | Gravity.START;
            btnParams.bottomMargin = dp8;
            btnParams.leftMargin = dp8;
            root.addView(settingsBtn, btnParams);
        }

        setContentView(root);

        loadUrl(baseUrl());
    }

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
        // La pagina web attiva gli strumenti di debug (posizione simulata) solo nella build debug
        if (BuildConfig.DEBUG) s.setUserAgentString(s.getUserAgentString() + " ParResBoDebug");

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
                // Naviga solo dentro il server configurato (stesso host), blocca il resto
                String host = Uri.parse(baseUrl()).getHost();
                return host == null || !host.equalsIgnoreCase(request.getUrl().getHost());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Solo la pagina principale: i tile della mappa che falliscono non devono interrompere l'app
                if (!request.isForMainFrame()) return;
                Toast.makeText(MainActivity.this,
                    "Impossibile raggiungere il server. Riprova tra poco.", Toast.LENGTH_LONG).show();
                if (BuildConfig.DEBUG) showUrlDialog();
            }
        });
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
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }
}
