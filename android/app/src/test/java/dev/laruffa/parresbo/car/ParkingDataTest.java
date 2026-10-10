package dev.laruffa.parresbo.car;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.Arrays;

/** Stessi casi di test/geo.test.js: la logica nativa deve dare gli stessi risultati di quella web. */
public class ParkingDataTest {

    // ~111 m ogni 0.001° di latitudine
    private static final String JSON = "{\"streets\":["
        + "{\"label\":\"Via A\",\"zones\":[\"1\"],\"matched\":true,\"polylines\":[[[44.4900,11.3400],[44.4900,11.3500]]]},"
        + "{\"label\":\"Via B\",\"zones\":[\"2\"],\"matched\":true,\"polylines\":[[[44.4950,11.3400],[44.4950,11.3500]]]},"
        + "{\"label\":\"Via C\",\"zones\":[\"2\"],\"matched\":true,\"polylines\":[[[44.5100,11.3450]]]},"
        + "{\"descr\":\"U(VIA)\",\"zones\":[\"2\"],\"matched\":false,\"polylines\":[]},"
        + "{\"descr\":\"M(VIA)\",\"zones\":[\"1\",\"B\",\"10\"],\"matched\":true,\"polylines\":[[[44.5,11.3],[44.5,11.31]]]}"
        + "]}";

    private ParkingData data() throws Exception {
        return ParkingData.parse(JSON);
    }

    @Test public void parseTieneSoloLeVieAbbinate() throws Exception {
        assertEquals(4, data().size());
    }

    @Test public void labelRipiegaSuDescr() throws Exception {
        assertEquals("M(VIA)", data().nearest(44.5, 11.305, null).street.label);
    }

    @Test public void zoneOrdinatePrimaINumeriPoiLeLettere() throws Exception {
        assertEquals(Arrays.asList("1", "2", "10", "B"), data().zones());
    }

    @Test public void closestOnSegmentDistanzaInMetri() {
        double[] r = ParkingData.closestOnSegment(44.4910, 11.3450, 44.4900, 11.3400, 44.4900, 11.3500);
        assertEquals(44.4900, r[1], 1e-9);
        assertEquals(11.3450, r[2], 1e-6);
        assertEquals(110.6, r[0], 1.0);
    }

    @Test public void closestOnSegmentFuoriDalSegmentoRipiegaSuiEstremi() {
        double[] r = ParkingData.closestOnSegment(44.4900, 11.3300, 44.4900, 11.3400, 44.4900, 11.3500);
        assertEquals(11.3400, r[2], 0.0);
        assertTrue(r[0] > 700 && r[0] < 800);
    }

    @Test public void closestOnSegmentDegenere() {
        double[] r = ParkingData.closestOnSegment(44.4910, 11.3450, 44.4900, 11.3450, 44.4900, 11.3450);
        assertEquals(44.4900, r[1], 0.0);
        assertEquals(110.6, r[0], 1.0);
    }

    @Test public void nearestSceglieLaViaPiuVicinaIgnorandoLeNonAbbinate() throws Exception {
        ParkingData.Nearest n = data().nearest(44.4902, 11.3450, null);
        assertEquals("Via A", n.street.label);
        assertTrue(n.distM < 30);
    }

    @Test public void nearestInZona() throws Exception {
        ParkingData.Nearest n = data().nearest(44.4902, 11.3450, "2");
        assertEquals("Via B", n.street.label);
        assertEquals(44.4950, n.lat, 1e-9);
        assertEquals(11.3450, n.lng, 1e-6);
    }

    @Test public void nearestGestisceLineeDiUnSoloPunto() throws Exception {
        ParkingData.Nearest n = data().nearest(44.5090, 11.3450, "2");
        assertEquals("Via C", n.street.label);
        assertEquals(44.5100, n.lat, 0.0);
    }

    @Test public void zonaSenzaVieOViaMistaPerTutteLeSueZone() throws Exception {
        assertNull(data().nearest(44.49, 11.34, "9"));
        assertEquals("M(VIA)", data().nearest(44.49, 11.34, "B").street.label);
        assertTrue(data().nearest(44.49, 11.34, "B").street.inZone("10"));
    }

    @Test public void classifySuUnaVia() throws Exception {
        ParkingData.Classification c = data().classify(44.4902, 11.3450);
        assertEquals(ParkingData.Kind.STREET, c.kind);
        assertEquals("Via A", c.nearest.street.label);
    }

    @Test public void classifyViciniMaSenzaZona() throws Exception {
        // ~220 m a nord di Via A e ~170 m a sud di Via B: oltre la soglia da entrambe
        ParkingData.Classification c = data().classify(44.4920, 11.3450);
        assertEquals(ParkingData.Kind.NO_ZONE, c.kind);
        assertTrue(c.nearest.distM > ParkingData.MAX_STREET_M && c.nearest.distM < ParkingData.OUTSIDE_M);
    }

    @Test public void classifyFuoriZonaComeNelleMarche() throws Exception {
        ParkingData.Classification c = data().classify(43.6, 13.5);
        assertEquals(ParkingData.Kind.OUTSIDE, c.kind);
        assertTrue(c.nearest.distM > ParkingData.OUTSIDE_M);
    }
}
