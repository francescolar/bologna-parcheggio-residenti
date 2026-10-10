package dev.laruffa.parresbo.car;

import android.content.Context;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import dev.laruffa.parresbo.BuildConfig;

/** Scarica /api/streets dal server (con copia su disco, usata offline) e lo trasforma in ParkingData. */
public final class StreetRepository {

    /** Il server sta ancora preparando i dati (primo avvio): riprovare tra poco. */
    public static final class NotReadyException extends IOException {
        NotReadyException() { super("Dati in preparazione sul server"); }
    }

    private static final long FRESH_MS = 6L * 60 * 60 * 1000;   // entro 6 ore si usa la copia su disco
    private final File cache;
    private final String baseUrl;

    public StreetRepository(Context context) {
        this(new File(context.getFilesDir(), "streets.json"), BuildConfig.BASE_URL);
    }

    StreetRepository(File cache, String baseUrl) {
        this.cache = cache;
        this.baseUrl = baseUrl;
    }

    /** Bloccante: chiamare da un thread in background. */
    public ParkingData load(boolean forceNetwork) throws IOException, JSONException {
        boolean haveCache = cache.exists() && cache.length() > 0;
        if (haveCache && !forceNetwork && System.currentTimeMillis() - cache.lastModified() < FRESH_MS) {
            return ParkingData.parse(read(new FileInputStream(cache)));
        }
        try {
            String json = fetch();
            ParkingData data = ParkingData.parse(json);        // se non è valido non sovrascrive la copia
            try (FileOutputStream out = new FileOutputStream(cache)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            }
            return data;
        } catch (IOException | JSONException e) {
            if (!haveCache) throw e;                           // offline: meglio dati vecchi che nessun dato
            return ParkingData.parse(read(new FileInputStream(cache)));
        }
    }

    private String fetch() throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(baseUrl + "/api/streets").openConnection();
        c.setConnectTimeout(15_000);
        c.setReadTimeout(60_000);
        try {
            int code = c.getResponseCode();
            if (code == 503) throw new NotReadyException();
            if (code != 200) throw new IOException("HTTP " + code);
            return read(c.getInputStream());                   // gzip gestito da HttpURLConnection
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream(1 << 20)) {
            byte[] buf = new byte[16 * 1024];
            for (int n; (n = is.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
