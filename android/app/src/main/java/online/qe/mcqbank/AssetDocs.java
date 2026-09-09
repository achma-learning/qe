package online.qe.mcqbank;

/**
 * Pure string helpers for the bundled high-yield documents
 * (`qe-analysis/&lt;slug&gt;/*.pdf|docx|txt`).
 *
 * <p>A WebView renders HTML/CSS/JS/text but has no PDF or Office viewer, so
 * those files are handed to whatever app the device uses for them instead.
 * The path and MIME juggling that needs is kept here — free of Android types
 * — so it can be exercised without a device or an emulator.
 */
final class AssetDocs {

    private AssetDocs() {}

    private static final String ASSET_PREFIX = "/android_asset/";

    /**
     * Turns the path of a `file:///android_asset/...` URL into the path
     * {@code AssetManager.open()} wants, or null for anything else.
     *
     * <p>Pass {@code Uri.getPath()}, which is already percent-decoded — the
     * page builds these hrefs with {@code encodeURIComponent()} and the file
     * names contain spaces and accents.
     */
    static String assetPathFromUrlPath(String urlPath) {
        if (urlPath == null || !urlPath.startsWith(ASSET_PREFIX)) return null;
        String path = urlPath.substring(ASSET_PREFIX.length());
        // A traversal outside the asset root would be a caller bug, not a
        // reachable state from our own pages — refuse it rather than resolve it.
        if (path.isEmpty() || path.contains("../")) return null;
        return path;
    }

    /**
     * True for file types the WebView can't display itself, so they have to be
     * opened by another app. Everything else (html, css, js, txt, md, images)
     * stays in the WebView.
     */
    static boolean opensExternally(String path) {
        switch (extensionOf(path)) {
            case "pdf":
            case "doc":
            case "docx":
            case "ppt":
            case "pptx":
            case "xls":
            case "xlsx":
            case "zip":
            case "apkg":
                return true;
            default:
                return false;
        }
    }

    /** MIME type for the ACTION_VIEW intent; viewers key off this, not the name. */
    static String mimeFor(String path) {
        switch (extensionOf(path)) {
            case "pdf":  return "application/pdf";
            case "doc":  return "application/msword";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "ppt":  return "application/vnd.ms-powerpoint";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "xls":  return "application/vnd.ms-excel";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "zip":  return "application/zip";
            case "txt":  return "text/plain";
            default:     return "application/octet-stream";
        }
    }

    /** Last path segment — the name the copy in the cache dir gets. */
    static String fileNameOf(String path) {
        if (path == null) return "";
        int slash = path.lastIndexOf('/');
        return slash < 0 ? path : path.substring(slash + 1);
    }

    /** Lower-case extension without the dot, or "" when there isn't one. */
    private static String extensionOf(String path) {
        if (path == null) return "";
        String name = fileNameOf(path);
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "";
        return name.substring(dot + 1).toLowerCase(java.util.Locale.US);
    }

    /**
     * Stand-in page for the high-yield "Aperçu" iframe when it points at a PDF:
     * the WebView would render nothing at all there, which reads as a bug. The
     * file itself is bundled — "Ouvrir ↗" hands it to a real PDF viewer.
     */
    static String previewUnavailableHtml(String fileName) {
        return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<style>:root{color-scheme:light dark}"
                + "body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"
                + "font:14px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;"
                + "background:transparent;color:#8a93b8;text-align:center}"
                + "div{padding:20px;max-width:32em}b{color:inherit}</style></head><body><div>"
                + "📄 <b>" + escapeHtml(fileName) + "</b><br><br>"
                + "L'aperçu PDF intégré n'existe pas dans l'application Android.<br>"
                + "Le fichier est déjà inclus hors ligne — appuie sur « Ouvrir ↗ » "
                + "pour le lire dans ton lecteur PDF."
                + "</div></body></html>";
    }

    /** Minimal escaping for the one interpolated value above. */
    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
