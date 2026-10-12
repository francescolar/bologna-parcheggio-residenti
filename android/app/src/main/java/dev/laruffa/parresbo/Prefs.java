package dev.laruffa.parresbo;

import android.content.Context;
import android.content.SharedPreferences;

/** Impostazioni condivise tra l'app (WebView) e l'app per Android Auto. */
public final class Prefs {
    public static final String FILE        = "prefs";
    public static final String KEY_URL     = "server_url";   // solo build debug
    private static final String KEY_ZONE   = "my_zone";
    private static final String KEY_DISCLAIMER = "disclaimer_v2";   // corrisponde a DISCLAIMER_KEY in app.js

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static String myZone(Context c) {
        return sp(c).getString(KEY_ZONE, "");
    }

    public static void setMyZone(Context c, String zone) {
        sp(c).edit().putString(KEY_ZONE, zone == null ? "" : zone).apply();
    }

    /** Avviso legale accettato (nell'app o sull'auto): vale per entrambi. */
    public static boolean disclaimerAccepted(Context c) {
        return sp(c).getBoolean(KEY_DISCLAIMER, false);
    }

    public static void acceptDisclaimer(Context c) {
        sp(c).edit().putBoolean(KEY_DISCLAIMER, true).apply();
    }
}
