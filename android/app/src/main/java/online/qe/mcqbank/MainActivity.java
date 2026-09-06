package online.qe.mcqbank;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

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
                return false; // file:// asset navigation stays in the WebView
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
}
