package com.ulevelp.redo;

import static org.junit.Assert.*;
import android.content.Intent;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeBoundaryTest {
    private ActivityScenario<MainActivity> scenario;
    @Before public void launch() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitText("document.getElementById('state')?.textContent", "Native fixture ready");
        String previousDocument = js("performance.timeOrigin");
        click("reset");
        awaitText("String(performance.timeOrigin !== " + previousDocument + ")", "true");
        awaitText("document.getElementById('state')?.textContent", "Native fixture ready");
    }
    @After public void close() { if (scenario != null) scenario.close(); }
    private String js(String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(source, result -> { value.set(result); done.countDown(); }));
        assertTrue("JS callback deadline", done.await(10, TimeUnit.SECONDS));
        Object parsed = new JSONTokener(value.get()).nextValue();
        return String.valueOf(parsed);
    }
    private void awaitText(String source, String expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        String actual;
        do {
            actual = js(source);
            if (actual.contains(expected)) return;
        } while (System.nanoTime() < deadline);
        fail("Expected " + expected + ", received " + actual + "; state=" + js("document.getElementById('state')?.textContent"));
    }
    private void click(String id) throws Exception { js("document.getElementById('" + id + "').click()"); }
    private void auth(String expected) throws Exception { awaitText("document.getElementById('auth')?.textContent", expected); }
    private void open(String query) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("ulevelp://auth/callback?" + query));
        intent.setPackage("com.ulevelp.redo");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        InstrumentationRegistry.getInstrumentation().getTargetContext().startActivity(intent);
    }
    @Test public void warmCallbackDuplicateCancelAndInvalidUrl() throws Exception {
        click("login"); auth("waiting");
        open("code=A"); auth("Auth A Profile A idle Exchanges 1");
        open("code=A"); auth("Auth A Profile A idle Exchanges 1");
        click("logout"); auth("Auth guest Profile none idle");
        click("login"); auth("waiting");
        open("code=A&code=B"); auth("error");
        click("logout"); auth("Auth guest Profile none idle");
        click("login"); auth("waiting");
        click("logout"); auth("Auth guest Profile none idle");
        open("code=A"); auth("Auth guest Profile none idle Exchanges 1");
    }
    @Test public void accountRaceAndTokenRefresh() throws Exception {
        click("hold"); click("login"); auth("waiting");
        open("code=A"); auth("Auth A Profile none idle");
        click("userB"); auth("Auth B Profile B idle");
        click("release"); auth("Auth B Profile B idle");
        click("refresh"); auth("Auth B Profile B idle");
        click("expire"); auth("Auth guest Profile none idle");
    }
    @Test public void prepareColdCallback() throws Exception {
        click("login"); auth("Auth guest Profile none waiting");
        assertTrue(js("localStorage.getItem('uxn:verifier')").startsWith("fixture-verifier-fixture-flow-"));
        assertTrue(js("localStorage.getItem('ulp:native-oauth')").contains("fixture-flow"));
    }
}
