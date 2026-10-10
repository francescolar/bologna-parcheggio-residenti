package dev.laruffa.parresbo.car;

import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/** Punto d'ingresso per Android Auto (categoria "parcheggio" della Car App Library). */
public class ParResBoCarService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // TODO prima della pubblicazione su Play: sostituire con l'elenco degli host Google ammessi
        // (HostValidator.Builder + addAllowedHosts). Per i test via sideload/DHU serve ALLOW_ALL.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        throw new IllegalStateException("Configurare l'elenco degli host ammessi per la build release");
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
