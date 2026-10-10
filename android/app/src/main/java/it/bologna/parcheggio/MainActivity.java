package it.bologna.parcheggio;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
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

        // Bottone ⚙ in alto a destra per cambiare server
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
        btnParams.gravity = Gravity.TOP | Gravity.END;
        btnParams.topMargin = dp8;
        btnParams.rightMargin = dp8;
        root.addView(settingsBtn, btnParams);

        setContentView(root);

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String url = prefs.getString(KEY_URL, null);
        if (url == null) {
            showUrlDialog();
        } else {
            loadUrl(url);
        }
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);

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
                // Blocca qualsiasi navigazione fuori dal server configurato
                SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                String base = prefs.getString(KEY_URL, "");
                String target = request.getUrl().toString();
                if (!base.isEmpty() && target.startsWith(base)) {
                    return false; // lascia caricare
                }
                return true; // blocca
            }

            @Override
            public void onReceivedError(WebView view, int code, String desc, String url) {
                showUrlDialog();
            }
        });
    }

    private void loadUrl(String url) {
        webView.loadUrl(url);
    }

    private void showUrlDialog() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String current = prefs.getString(KEY_URL, "http://192.168.1.x:3000");

        EditText input = new EditText(this);
        input.setText(current);
        input.setSelectAllOnFocus(true);
        int pad = dp(16);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(pad * 2, pad, pad * 2, pad / 2);
        layout.addView(input);

        new AlertDialog.Builder(this)
            .setTitle("Server Docker")
            .setMessage("Indirizzo IP e porta del server (stesso WiFi)")
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
