package dev.laruffa.parresbo.car;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.CarIcon;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Template;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import java.util.Collections;
import java.util.Locale;

import dev.laruffa.parresbo.Prefs;
import dev.laruffa.parresbo.R;

/**
 * Schermata principale per l'auto: "Posso parcheggiare qui?" → SÌ / NO!, con la posizione del telefono.
 * Nel NO! propone la navigazione verso il punto più vicino della propria zona.
 */
public class ParkingScreen extends Screen implements DefaultLifecycleObserver, LocationListener {

    private final StreetRepository repo;
    private ParkingData data;
    private String error;
    private boolean loading;
    private Location location;
    private LocationManager locationManager;
    private String lastSignature = "";

    public ParkingScreen(@NonNull CarContext carContext) {
        super(carContext);
        repo = new StreetRepository(carContext);
        getLifecycle().addObserver(this);
    }

    // ── ciclo di vita ────────────────────────────────────────────────────────
    @Override
    public void onStart(@NonNull LifecycleOwner owner) {
        startLocation();
        if (data == null && !loading) load(false);
        invalidate();   // la zona può essere cambiata nell'app o in ZoneScreen
    }

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        if (locationManager != null) locationManager.removeUpdates(this);
    }

    // ── dati ─────────────────────────────────────────────────────────────────
    private void load(boolean force) {
        loading = true;
        error = null;
        invalidate();
        new Thread(() -> {
            ParkingData loaded = null;
            String err = null;
            try {
                loaded = repo.load(force);
            } catch (StreetRepository.NotReadyException e) {
                err = "I dati sono in preparazione sul server. Riprova tra qualche minuto.";
            } catch (Exception e) {
                err = "Impossibile caricare i dati. Controlla la connessione del telefono.";
            }
            final ParkingData d = loaded;
            final String er = err;
            ContextCompat.getMainExecutor(getCarContext()).execute(() -> {
                data = d;
                error = er;
                loading = false;
                invalidate();
            });
        }, "parresbo-load").start();
    }

    // ── posizione ────────────────────────────────────────────────────────────
    private boolean hasLocationPermission() {
        return getCarContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    private void startLocation() {
        if (!hasLocationPermission()) return;
        locationManager = (LocationManager) getCarContext().getSystemService(CarContext.LOCATION_SERVICE);
        if (locationManager == null) return;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            if (!locationManager.isProviderEnabled(provider)) continue;
            Location last = locationManager.getLastKnownLocation(provider);
            if (last != null && (location == null || last.getTime() > location.getTime())) location = last;
            locationManager.requestLocationUpdates(provider, 4_000L, 8f, this, Looper.getMainLooper());
        }
    }

    @Override public void onLocationChanged(@NonNull Location l) {
        location = l;
        invalidate();
    }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(@NonNull String provider) { startLocation(); }
    @Override public void onProviderDisabled(@NonNull String provider) { }

    // ── interfaccia ──────────────────────────────────────────────────────────
    private Action action(String title, Runnable r) {
        return new Action.Builder().setTitle(title).setOnClickListener(r::run).build();
    }

    private MessageTemplate.Builder base(String message, String title) {
        return new MessageTemplate.Builder(message).setTitle(title).setHeaderAction(Action.APP_ICON);
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        String zone = Prefs.myZone(getCarContext());

        if (!Prefs.disclaimerAccepted(getCarContext())) {
            return base("Dati pubblici del Comune di Bologna: possono essere incompleti o imprecisi. "
                    + "App non ufficiale. Fa sempre fede la segnaletica stradale.", "Prima di iniziare")
                .addAction(action("Ho capito", () -> {
                    Prefs.acceptDisclaimer(getCarContext());
                    invalidate();
                })).build();
        }
        if (error != null) {
            return base(error, "ParResBo").addAction(action("Riprova", () -> load(true))).build();
        }
        if (data == null) {
            return new MessageTemplate.Builder("Carico le zone di Bologna…")
                .setTitle("ParResBo").setHeaderAction(Action.APP_ICON).setLoading(true).build();
        }
        if (!hasLocationPermission()) {
            return base("Serve il permesso di posizione per sapere dove sei.", "ParResBo")
                .addAction(action("Consenti", () -> getCarContext().requestPermissions(
                    Collections.singletonList(Manifest.permission.ACCESS_FINE_LOCATION),
                    (granted, rejected) -> { startLocation(); invalidate(); })))
                .build();
        }
        if (zone.isEmpty()) {
            return base("Scegli la tua zona di residenza per sapere dove puoi parcheggiare.", "ParResBo")
                .addAction(action("Scegli la zona", this::openZones)).build();
        }
        if (location == null) {
            return new MessageTemplate.Builder("Cerco la tua posizione…")
                .setTitle("ParResBo").setHeaderAction(Action.APP_ICON).setLoading(true).build();
        }

        ParkingData.Classification where = data.classify(location.getLatitude(), location.getLongitude());
        ActionStrip zoneStrip = new ActionStrip.Builder()
            .addAction(action("Zona " + zone, this::openZones)).build();
        if (where.kind != ParkingData.Kind.STREET) {
            // Lontano da ogni via con zona residenti: né SÌ né NO
            ParkingData.Nearest n = where.nearest;
            if (where.kind == ParkingData.Kind.OUTSIDE) {
                return base(n == null ? "Non ci sono dati per questa posizione."
                        : "Le strade con zona residenti di Bologna più vicine sono a circa " + fmt(n.distM) + ".",
                    "Sei fuori zona").setActionStrip(zoneStrip).build();
            }
            return base("Nessuna via con zona residenti entro " + (int) ParkingData.MAX_STREET_M + " m. La più vicina è "
                    + n.street.label + " (" + fmt(n.distM) + ").", "Nessuna zona qui")
                .setActionStrip(zoneStrip).build();
        }
        ParkingData.Nearest here = where.nearest;

        if (here.street.inZone(zone)) {
            return base(here.street.label + "\n" + zoneText(here.street.zones) + " · verifica la segnaletica", "SÌ, puoi parcheggiare qui")
                .setIcon(icon(R.drawable.ic_car_yes, CarColor.GREEN))
                .setActionStrip(zoneStrip).build();
        }

        MessageTemplate.Builder b = base(here.street.label + "\n" + zoneText(here.street.zones) + " · la tua è " + zone, "NO! Non è la tua zona")
            .setIcon(icon(R.drawable.ic_car_no, CarColor.RED))
            .setActionStrip(zoneStrip);
        ParkingData.Nearest spot = data.nearest(location.getLatitude(), location.getLongitude(), zone);
        if (spot != null) {
            b.addAction(action(String.format(Locale.ITALY, "Parcheggio più vicino · %s", fmt(spot.distM)),
                () -> navigateTo(spot, zone)));
        }
        return b.build();
    }

    private void openZones() {
        if (data == null) return;
        getScreenManager().push(new ZoneScreen(getCarContext(), data.zones(), 0));
    }

    private void navigateTo(ParkingData.Nearest spot, String zone) {
        String label = spot.street.label + " (zona " + zone + ")";
        Uri uri = Uri.parse("geo:" + spot.lat + "," + spot.lng + "?q=" + spot.lat + "," + spot.lng
            + "(" + Uri.encode(label) + ")");
        try {
            getCarContext().startCarApp(new Intent(CarContext.ACTION_NAVIGATE, uri));
        } catch (Exception e) {
            CarToast.makeText(getCarContext(), "Nessuna app di navigazione disponibile", CarToast.LENGTH_LONG).show();
        }
    }

    private CarIcon icon(int res, CarColor tint) {
        return new CarIcon.Builder(IconCompat.createWithResource(getCarContext(), res)).setTint(tint).build();
    }

    // Il messaggio sull'auto mostra al massimo due righe: la seconda deve restare breve
    private static String zoneText(String[] zones) {
        return (zones.length > 1 ? "Zone " : "Zona ") + join(zones);
    }

    private static String join(String[] zones) {
        return String.join(", ", zones);
    }

    private static String fmt(double m) {
        return m < 1000 ? ((int) (Math.round(m / 10.0) * 10)) + " m" : String.format(Locale.ITALY, "%.1f km", m / 1000);
    }
}
