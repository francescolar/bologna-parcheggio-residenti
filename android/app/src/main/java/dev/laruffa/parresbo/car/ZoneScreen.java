package dev.laruffa.parresbo.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.List;

import dev.laruffa.parresbo.Prefs;

/** Scelta della zona di residenza. In marcia le liste hanno pochi elementi: si pagina. */
public class ZoneScreen extends Screen {

    private final List<String> zones;
    private final int offset;

    public ZoneScreen(@NonNull CarContext carContext, List<String> zones, int offset) {
        super(carContext);
        this.zones = zones;
        this.offset = offset;
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        int limit = getCarContext().getCarService(ConstraintManager.class)
            .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST);
        boolean needsPaging = zones.size() > limit;
        int perPage = needsPaging ? limit - 1 : zones.size();      // un posto per "Altre zone"
        int end = Math.min(offset + perPage, zones.size());
        String current = Prefs.myZone(getCarContext());

        ItemList.Builder list = new ItemList.Builder();
        for (String z : zones.subList(offset, end)) {
            list.addItem(new Row.Builder()
                .setTitle("Zona " + z + (z.equals(current) ? "  ✓" : ""))
                .setOnClickListener(() -> {
                    Prefs.setMyZone(getCarContext(), z);
                    getScreenManager().pop();
                })
                .build());
        }
        if (needsPaging) {
            boolean last = end >= zones.size();
            list.addItem(new Row.Builder()
                .setTitle(last ? "Torna all'inizio" : "Altre zone")
                .setOnClickListener(() -> getScreenManager().push(
                    new ZoneScreen(getCarContext(), zones, last ? 0 : end)))
                .build());
        }
        return new ListTemplate.Builder()
            .setSingleList(list.build())
            .setTitle("La mia zona")
            .setHeaderAction(Action.BACK)
            .build();
    }
}
