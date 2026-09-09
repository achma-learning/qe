package online.qe.mcqbank;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.SequenceInputStream;
import java.nio.charset.StandardCharsets;

/**
 * The whole app is the static site from the repo root (index.html and its
 * sibling pages: report.html, high-yield.html, curriculum.html,
 * playlist-fmpm.html, data.html, planner.html, and the per-module viewers
 * under modules/). This activity is a thin WebView shell around it — no
 * network, no server, no separate native UI to keep in sync with the site.
 * Every page already works from file:// (see CONTEXT.md), so nothing in the
 * bundled assets needs to change to run inside this wrapper.
 */
public class MainActivity extends AppCompatActivity {

    // On a phone screen the topbar/sidebar chrome eats a lot of the viewport,
    // so the app defaults to the site's own "focus mode" (Z / toggleFocus())
    // here — hides the topbar/sidebar, widens the question pane. This is
    // Android-only: seeded by prepending one line to assets/app.js as it's
    // served (see shouldInterceptRequest below), not by forking app.js, so
    // `android/README.md`'s plain `cp assets/app.js ...` sync step still
    // works unmodified. It only sets the *default* — writes qe:focusMode
    // only if that key has never been set, so a user's own Z-key toggle
    // (on or off) always wins on every later launch.
    private static final String SEED_DEFAULT_FOCUS_MODE_JS =
            "try{if(localStorage.getItem('qe:focusMode')===null){"
            + "localStorage.setItem('qe:focusMode','true');}}catch(e){}\n";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // localStorage is how the app persists progress, exam sessions and
        // planner settings — required for the whole app to be useful.
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    // External resources (Data page archives/playlists, high-yield
                    // source links, etc.): hand off to the user's browser instead
                    // of navigating the offline shell.
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                if (request.isForMainFrame()) {
                    // High-yield "Ouvrir ↗" / "Télécharger ↓" on a bundled PDF or
                    // .docx. The WebView has no viewer for those, so navigating
                    // would just fail — hand the file to an app that can show it.
                    String assetPath = AssetDocs.assetPathFromUrlPath(uri.getPath());
                    if (assetPath != null && AssetDocs.opensExternally(assetPath)) {
                        openAssetInExternalViewer(assetPath);
                        return true;
                    }
                }
                return false; // ordinary file:// page navigation stays in the WebView
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath(); // e.g. /android_asset/assets/app.js
                if (path == null) return null;

                if (path.endsWith("/assets/app.js")) {
                    try {
                        InputStream original = getAssets().open("assets/app.js");
                        InputStream seeded = new SequenceInputStream(
                                new ByteArrayInputStream(SEED_DEFAULT_FOCUS_MODE_JS.getBytes(StandardCharsets.UTF_8)),
                                original);
                        return new WebResourceResponse("application/javascript", "UTF-8", seeded);
                    } catch (IOException e) {
                        return null; // fall through to normal asset loading
                    }
                }

                // The high-yield page's "Aperçu" opens the doc in an <iframe>.
                // A WebView renders nothing at all for a PDF there, which reads
                // as a broken page — say what's going on instead. (.txt/.md
                // previews render fine and are left alone.)
                if (!request.isForMainFrame()) {
                    String assetPath = AssetDocs.assetPathFromUrlPath(path);
                    if (assetPath != null && AssetDocs.opensExternally(assetPath)) {
                        byte[] html = AssetDocs
                                .previewUnavailableHtml(AssetDocs.fileNameOf(assetPath))
                                .getBytes(StandardCharsets.UTF_8);
                        return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html));
                    }
                }
                return null;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");

        // The site is a normal multi-page app (index.html, modules/*.html,
        // report.html, planner.html, ...) navigated via <a href>, so the
        // WebView's own back/forward stack already matches user expectation —
        // no custom in-page JS hook needed here, unlike a single-page app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    /**
     * Copies a bundled document out of the APK's assets (they aren't real files
     * on disk, so no other app can read them in place) into our cache dir, then
     * opens it with whatever the device uses for that type. From there the user
     * can share or save it themselves.
     */
    private void openAssetInExternalViewer(final String assetPath) {
        // Small files (~200 KB each), but this is still disk I/O — keep it off
        // the UI thread and only touch the WebView/Activity back on it.
        new Thread(new Runnable() {
            @Override
            public void run() {
                File copied = copyAssetToCache(assetPath);
                final File ready = copied;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (ready == null) {
                            toast("Fichier introuvable dans l'application");
                            return;
                        }
                        Uri shared = FileProvider.getUriForFile(
                                MainActivity.this, getPackageName() + ".fileprovider", ready);
                        Intent open = new Intent(Intent.ACTION_VIEW)
                                .setDataAndType(shared, AssetDocs.mimeFor(assetPath))
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                        | Intent.FLAG_ACTIVITY_NEW_TASK);
                        try {
                            startActivity(open);
                        } catch (ActivityNotFoundException e) {
                            toast("Aucune application installée pour ouvrir ce type de fichier");
                        }
                    }
                });
            }
        }).start();
    }

    /** Returns the cached copy, or null if the asset is missing/unreadable. */
    private File copyAssetToCache(String assetPath) {
        File out = new File(new File(getCacheDir(), "docs"), AssetDocs.fileNameOf(assetPath));
        File parent = out.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) return null;
        try (InputStream in = getAssets().open(assetPath);
             OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            return out;
        } catch (IOException e) {
            return null;
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
