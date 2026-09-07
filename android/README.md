# QE — MCQ Bank — Android app

A thin native wrapper around the site itself (`index.html` and its sibling
pages, `assets/`, `data/`, `modules/`, `qe-analysis/`). One `WebView`, no
network calls, no separate native UI to keep in sync — the whole app is the
same offline-first site described in `CONTEXT.md`, bundled under
`app/src/main/assets/`.

Everything the site links to is bundled, including the **high-yield analysis
documents** (every `.pdf` / `.docx` / `.txt` listed in `qe-analysis/_analysis.js`),
so the High-Yield page works with no connection at all.

- **Package:** `online.qe.mcqbank`
- **Min SDK:** 23 (Android 6.0) · **Target SDK:** 34
- **Permissions:** none. The app never touches the network; external links
  (Data page archives/playlists, high-yield source docs, etc.) hand off to
  the device's browser instead.
- **Storage:** progress, exam sessions, planner settings and theme persist
  via the WebView's local storage, scoped to this app — same behavior as the
  browser version, just backed by the app's private data instead of a
  desktop browser profile.
- **Focus mode by default:** on first launch the app turns on the site's own
  "focus mode" (topbar/sidebar hidden, question pane widened) for better use
  of a phone-sized screen. Tap the floating "✕ Focus" button, or press `Z`
  with a keyboard, to turn it off — that choice is then remembered like any
  other `qe:*` setting and is never overridden again. This is Android-only:
  `MainActivity` seeds `qe:focusMode` by prepending one line to `assets/app.js`
  as it's served (`shouldInterceptRequest`), rather than forking the file, so
  the "Rebuild from source" `cp` step below stays a plain, unmodified copy.

## Install the prebuilt APK

`dist/qe-bank-debug.apk` is a debug build, self-signed with Gradle's default
debug key (fine to sideload for personal use; not suitable for Play Store
distribution as-is). On the device: enable "install unknown apps" for the
app you use to open the file, then open the APK.

## Rebuild from source

Whenever `data/*.data.js`, `assets/app.js`, or any of the bundled pages
change, refresh the assets before building:

```sh
cp index.html report.html high-yield.html curriculum.html playlist-fmpm.html \
   data.html planner.html manifest.webmanifest icon.svg \
   android/app/src/main/assets/
cp -r assets/app.js assets/modules.js assets/style.css android/app/src/main/assets/assets/
cp data/_counts.js data/_topics.js data/*.data.js android/app/src/main/assets/data/
cp "data/liste cours/_curriculum.js" "android/app/src/main/assets/data/liste cours/"
cp modules/*.html android/app/src/main/assets/modules/
cp qe-analysis/_analysis.js android/app/src/main/assets/qe-analysis/

# High-yield docs: copy exactly what the manifest lists, so a new analysis
# doc can't be silently left out of the app (and the 11 MB of source material
# under "original motivation and how i got them/" stays out of the APK).
node -e "
global.window={};require('./qe-analysis/_analysis.js');
const fs=require('fs'),path=require('path');
const dst='android/app/src/main/assets/qe-analysis';
for(const [slug,files] of Object.entries(window.QE_ANALYSIS)){
  fs.mkdirSync(path.join(dst,slug),{recursive:true});
  for(const f of files) fs.copyFileSync(path.join('qe-analysis',slug,f), path.join(dst,slug,f));
}"

cd android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.

Requires a JDK (17+) and the Android SDK (`platform-tools`,
`platforms;android-34`, `build-tools;34.0.0`). Point `local.properties` (not
committed — machine-specific) at your SDK:

```
sdk.dir=/path/to/Android/sdk
```

The raw `data/s5..s10/*.txt` exam sources, `curriculum data/` (source PDFs),
`qe-analysis/original motivation and how i got them/`, `anki/`, `docs/`,
`issues/` and `.github/` are **not** bundled — only the baked `.data.js`
files, the manifest-listed analysis docs, and the pages/scripts the site
actually loads at runtime.

## Notes

- `MainActivity` is a plain `WebView` shell. The site is a normal multi-page
  app (`index.html`, `modules/*.html`, `report.html`, `planner.html`, ...)
  navigated via `<a href>`, so the WebView's own back/forward stack already
  matches what a user expects on the hardware/gesture back button — no
  custom in-page JS hook needed (unlike a single-page app).
- **High-yield documents open in the device's viewer.** A `WebView` renders
  HTML/CSS/JS/text but has no PDF or Office viewer, so navigating to a
  bundled `.pdf`/`.docx` would just fail. `MainActivity` intercepts those
  taps ("Ouvrir ↗" / "Télécharger ↓"), copies the file out of the APK's
  assets into `cacheDir/docs/` (assets aren't real files, so no other app
  can read them in place) and hands that copy to `ACTION_VIEW` as a
  `content://` URI via `FileProvider` — a `file://` one throws
  `FileUriExposedException` on API 24+. From the viewer the user can share
  or save it. If nothing on the device handles the type, a toast says so.
  The path/MIME logic lives in `AssetDocs.java`, free of Android types so it
  can be checked without a device.
- **The inline "Aperçu" is replaced with a note.** That button loads the doc
  in an `<iframe>`, where a WebView shows a blank pane for a PDF. The app
  serves a short "use Ouvrir ↗ instead" page in its place rather than
  looking broken. `.txt`/`.md` previews render normally and are untouched.
- The launcher icon is a set of PNGs under `res/mipmap-*dpi/`, generated
  from the same rounded-square "QE" mark used for `icon.svg` and the pages'
  favicon, so it matches the web app's branding.
- Everything the site loads already works from `file://` (see the root
  `CONTEXT.md` — "Run offline: Double-click `index.html`"), so nothing in
  the bundled assets needed to change to run inside this wrapper.
