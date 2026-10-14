package dev.laruffa.parresbo.car;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Dati di /api/streets in forma compatta, più la ricerca della via (o del punto di una zona) più vicina.
 * Stessa logica di public/geo.js: java puro, senza dipendenze Android, quindi testabile con JUnit.
 */
public final class ParkingData {

    public static final class Street {
        public final String label;
        public final String[] zones;
        public final double[][][] lines;   // [linea][punto] = {lat, lng}

        Street(String label, String[] zones, double[][][] lines) {
            this.label = label;
            this.zones = zones;
            this.lines = lines;
        }

        public boolean inZone(String zone) {
            return zone != null && Arrays.asList(zones).contains(zone);
        }
    }

    public static final class Nearest {
        public final Street street;
        public final double distM, lat, lng;

        Nearest(Street street, double distM, double lat, double lng) {
            this.street = street;
            this.distM = distM;
            this.lat = lat;
            this.lng = lng;
        }
    }

    private static final double M_PER_DEG_LNG_AT_EQUATOR = 111320;
    private static final double M_PER_DEG_LAT = 110574;

    /** Oltre questa distanza dalla via più vicina non sei su una via con zona residenti (errore GPS incluso). */
    public static final double MAX_STREET_M = 60;
    /** Oltre questa distanza dalla via più vicina sei fuori dall'area coperta dai dati. */
    public static final double OUTSIDE_M = 3000;

    public enum Kind { STREET, NO_ZONE, OUTSIDE }

    public static final class Classification {
        public final Kind kind;
        public final Nearest nearest;   // null solo se non ci sono dati

        Classification(Kind kind, Nearest nearest) {
            this.kind = kind;
            this.nearest = nearest;
        }
    }

    /** Lato di una cella dell'indice in latitudine (~220 m). */
    private static final double CELL_DEG = 0.002;

    private static final class Seg {
        final Street street;
        final double aLat, aLng, bLat, bLng;

        Seg(Street street, double aLat, double aLng, double bLat, double bLng) {
            this.street = street;
            this.aLat = aLat;
            this.aLng = aLng;
            this.bLat = bLat;
            this.bLng = bLng;
        }
    }

    private final List<Street> streets;

    // Indice a griglia dei segmenti (come in public/geo.js): la ricerca guarda solo le celle attorno al punto.
    private final Map<Long, List<Seg>> cells = new HashMap<>();
    private int segCount;
    private int cols, rows;
    private double minLat, minLng, cellLng;

    private ParkingData(List<Street> streets) {
        this.streets = streets;
        buildIndex();
    }

    private void buildIndex() {
        List<Seg> segs = new ArrayList<>();
        double loLat = Double.POSITIVE_INFINITY, hiLat = Double.NEGATIVE_INFINITY;
        double loLng = Double.POSITIVE_INFINITY, hiLng = Double.NEGATIVE_INFINITY;
        for (Street s : streets) {
            for (double[][] line : s.lines) {
                int last = line.length == 1 ? 1 : line.length - 1;   // linea di un solo punto = segmento nullo
                for (int i = 0; i < last; i++) {
                    double[] a = line[i], b = line[Math.min(i + 1, line.length - 1)];
                    segs.add(new Seg(s, a[0], a[1], b[0], b[1]));
                    loLat = Math.min(loLat, Math.min(a[0], b[0]));
                    hiLat = Math.max(hiLat, Math.max(a[0], b[0]));
                    loLng = Math.min(loLng, Math.min(a[1], b[1]));
                    hiLng = Math.max(hiLng, Math.max(a[1], b[1]));
                }
            }
        }
        segCount = segs.size();
        if (segCount == 0) return;
        minLat = loLat;
        minLng = loLng;
        cellLng = CELL_DEG / Math.cos(Math.toRadians((loLat + hiLat) / 2));   // celle ~quadrate in metri
        cols = (int) Math.floor((hiLng - loLng) / cellLng) + 1;
        rows = (int) Math.floor((hiLat - loLat) / CELL_DEG) + 1;
        for (Seg g : segs) {
            int x0 = (int) Math.floor((Math.min(g.aLng, g.bLng) - minLng) / cellLng);
            int x1 = (int) Math.floor((Math.max(g.aLng, g.bLng) - minLng) / cellLng);
            int y0 = (int) Math.floor((Math.min(g.aLat, g.bLat) - minLat) / CELL_DEG);
            int y1 = (int) Math.floor((Math.max(g.aLat, g.bLat) - minLat) / CELL_DEG);
            for (int y = y0; y <= y1; y++) {
                for (int x = x0; x <= x1; x++) {
                    long key = (long) y * cols + x;
                    List<Seg> cell = cells.get(key);
                    if (cell == null) cells.put(key, cell = new ArrayList<>());
                    cell.add(g);
                }
            }
        }
    }

    public int size() {
        return streets.size();
    }

    /** Legge la risposta di /api/streets: tiene solo le vie abbinate a una geometria. */
    public static ParkingData parse(String json) throws JSONException {
        JSONArray arr = new JSONObject(json).getJSONArray("streets");
        List<Street> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            if (!o.optBoolean("matched", false)) continue;
            JSONArray pls = o.getJSONArray("polylines");
            if (pls.length() == 0) continue;

            double[][][] lines = new double[pls.length()][][];
            for (int l = 0; l < pls.length(); l++) {
                JSONArray pts = pls.getJSONArray(l);
                lines[l] = new double[pts.length()][2];
                for (int p = 0; p < pts.length(); p++) {
                    JSONArray pt = pts.getJSONArray(p);
                    lines[l][p][0] = pt.getDouble(0);
                    lines[l][p][1] = pt.getDouble(1);
                }
            }
            JSONArray zs = o.getJSONArray("zones");
            String[] zones = new String[zs.length()];
            for (int z = 0; z < zs.length(); z++) zones[z] = zs.getString(z);
            out.add(new Street(o.optString("label", o.optString("descr", "")), zones, lines));
        }
        return new ParkingData(out);
    }

    /** Tutte le zone presenti, ordinate: prima i numeri, poi le lettere. */
    public List<String> zones() {
        Set<String> set = new LinkedHashSet<>();
        for (Street s : streets) Collections.addAll(set, s.zones);
        List<String> list = new ArrayList<>(set);
        Collections.sort(list, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                Double na = num(a), nb = num(b);
                if (na != null && nb != null) return Double.compare(na, nb);
                if (na != null) return -1;
                if (nb != null) return 1;
                return a.compareTo(b);
            }
        });
        return list;
    }

    private static Double num(String s) {
        try {
            return Double.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Via più vicina a (lat, lng). Con {@code zone} != null considera solo le vie di quella zona. */
    public Nearest nearest(double lat, double lng, String zone) {
        if (segCount == 0) return null;
        int cx = (int) Math.floor((lng - minLng) / cellLng);
        int cy = (int) Math.floor((lat - minLat) / CELL_DEG);
        // Un segmento non ancora visto dopo l'anello r dista almeno r celle: da qui il criterio di stop.
        double minCellM = Math.min(CELL_DEG * M_PER_DEG_LAT,
                cellLng * Math.cos(Math.toRadians(lat)) * M_PER_DEG_LNG_AT_EQUATOR);
        // Gli anelli prima di r0 non toccano la griglia (punto lontano dai dati): si salta direttamente a r0.
        int r0 = Math.max(Math.max(0, -cx), Math.max(cx - (cols - 1), Math.max(-cy, cy - (rows - 1))));
        int rMax = r0 + Math.max(cols, rows);

        Nearest[] best = new Nearest[1];
        for (int r = r0; r <= rMax; r++) {
            int xa = Math.max(cx - r, 0), xb = Math.min(cx + r, cols - 1);
            int ya = Math.max(cy - r, 0), yb = Math.min(cy + r, rows - 1);
            for (int y = ya; y <= yb; y++) {
                if (y == cy - r || y == cy + r) {
                    for (int x = xa; x <= xb; x++) scan(x, y, lat, lng, zone, best);
                } else {
                    if (cx - r >= 0) scan(cx - r, y, lat, lng, zone, best);
                    if (cx + r < cols) scan(cx + r, y, lat, lng, zone, best);
                }
            }
            if (best[0] != null && best[0].distM <= r * minCellM) break;
        }
        return best[0];
    }

    private void scan(int x, int y, double lat, double lng, String zone, Nearest[] best) {
        List<Seg> cell = cells.get((long) y * cols + x);
        if (cell == null) return;
        for (Seg g : cell) {
            if (zone != null && !g.street.inZone(zone)) continue;
            double[] c = closestOnSegment(lat, lng, g.aLat, g.aLng, g.bLat, g.bLng);   // {distM, lat, lng}
            if (best[0] == null || c[0] < best[0].distM) best[0] = new Nearest(g.street, c[0], c[1], c[2]);
        }
    }

    /** Dove sei rispetto ai dati: su una via con zona, vicino ma senza zona, oppure fuori zona (come Geo.classify). */
    public Classification classify(double lat, double lng) {
        Nearest n = nearest(lat, lng, null);
        if (n == null) return new Classification(Kind.OUTSIDE, null);
        if (n.distM <= MAX_STREET_M) return new Classification(Kind.STREET, n);
        return new Classification(n.distM > OUTSIDE_M ? Kind.OUTSIDE : Kind.NO_ZONE, n);
    }

    /** Punto più vicino a (qLat, qLng) sul segmento a→b, in una proiezione piana locale (metri). */
    static double[] closestOnSegment(double qLat, double qLng, double aLat, double aLng, double bLat, double bLng) {
        double kx = Math.cos(Math.toRadians(qLat)) * M_PER_DEG_LNG_AT_EQUATOR;
        double ky = M_PER_DEG_LAT;
        double ax = (aLng - qLng) * kx, ay = (aLat - qLat) * ky;
        double bx = (bLng - qLng) * kx, by = (bLat - qLat) * ky;
        double dx = bx - ax, dy = by - ay;
        double len2 = dx * dx + dy * dy;
        double t = len2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        return new double[]{
            Math.hypot(ax + t * dx, ay + t * dy),
            aLat + t * (bLat - aLat),
            aLng + t * (bLng - aLng),
        };
    }
}
