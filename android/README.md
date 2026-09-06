# QE — MCQ Bank — Android app

A thin native wrapper around the site itself (`index.html` and its sibling
pages, `assets/`, `data/`, `modules/`, `qe-analysis/`). One `WebView`, no
network calls, no separate native UI to keep in sync — the whole app is the
same offline-first site described in `CONTEXT.md`, bundled under
`app/src/main/assets/`.

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
`anki/`, `docs/`, `issues/` and `.github/` are **not** bundled — only the
baked `.data.js` files and the pages/scripts the site actually loads at
runtime, same split the GitHub Pages deploy uses.

## Notes

- `MainActivity` is a plain `WebView` shell. The site is a normal multi-page
  app (`index.html`, `modules/*.html`, `report.html`, `planner.html`, ...)
  navigated via `<a href>`, so the WebView's own back/forward stack already
  matches what a user expects on the hardware/gesture back button — no
  custom in-page JS hook needed (unlike a single-page app).
- The launcher icon is a set of PNGs under `res/mipmap-*dpi/`, generated
  from the same rounded-square "QE" mark used for `icon.svg` and the pages'
  favicon, so it matches the web app's branding.
- Everything the site loads already works from `file://` (see the root
  `CONTEXT.md` — "Run offline: Double-click `index.html`"), so nothing in
  the bundled assets needed to change to run inside this wrapper.
