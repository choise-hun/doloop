package com.ulevelp.redo;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ProductSmokeTest {
    @Test public void launchesRealProductWebView() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            String result = "";
            do {
                CountDownLatch done = new CountDownLatch(1);
                AtomicReference<String> state = new AtomicReference<>();
                scenario.onActivity(activity -> {
                    assertEquals("com.ulevelp.redo", activity.getPackageName());
                    activity.getBridge().getWebView().evaluateJavascript("JSON.stringify({home:!!document.getElementById('recentSongCard'),fixture:!!document.getElementById('state')})", value -> { state.set(value); done.countDown(); });
                });
                assertTrue(done.await(10, TimeUnit.SECONDS));
                result = state.get();
                if (result.contains("home\\\":true")) break;
            } while (System.nanoTime() < deadline);
            assertTrue("Real home rendered: " + result, result.contains("home\\\":true"));
            assertTrue("Fixture excluded: " + result, result.contains("fixture\\\":false"));
            scenario.recreate();
        }
    }
}
