package dev.laruffa.parresbo.car;

import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

import dev.laruffa.parresbo.R;

/** Punto d'ingresso per Android Auto (categoria "parcheggio" della Car App Library). */
public class ParResBoCarService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // Build di sviluppo (sideload, Desktop Head Unit): qualunque host. Release: solo gli host Google.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        return new HostValidator.Builder(getApplicationContext())
            .addAllowedHosts(R.array.car_hosts_allowlist)
            .build();
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new Session() {
            @NonNull
            @Override
            public Screen onCreateScreen(@androidx.annotation.NonNull android.content.Intent intent) {
                return new ParkingScreen(getCarContext());
            }
        };
    }
}
