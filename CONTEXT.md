# qe — MCQ Question Bank — AI Context File
_Last synced: 2026-10-29 @ c98b689 (+ Android 1.4 work)_

## 1. What This Is (Plain English)
- **In one sentence:** a website (and Android app) that drills you on ~15,500 real past medical-school exam multiple-choice questions, fully offline, driven from the keyboard.
- **Why it exists:** the owner is a med student at FMPM (Marrakech) with years of past exam papers saved as plain `.txt` dumps. This turns them into a fast trainer: answer, get corrected, see which topics and lessons you're weak on — no login, no internet, no app store.
- **Who uses it:** the owner, probably classmates. Personal study tool; all question data lives in the repo. Content is French.
- **Vibe:** polished personal tool. Heavily iterated (command palette, analytics, exam mode with the real /20 grade, lesson filter, planner) but deliberately framework-free and offline-first.

## 2. How To Run It
- **Setup once:** nothing. No install, no env file. Node is only needed to rebuild data.
- **Run dev:**
  ```sh
  python3 -m http.server 8000   # then open http://localhost:8000/
  ```
  Or just double-click `index.html` — it works from `file://`.
- **After editing a question `.txt`:** the site reads the *baked* files, so rebuild:
  ```sh
  node tools/check-data.js      # catches silent typos that drop a question
  node tools/build-data.js      # .txt → data/<slug>.data.js + _counts.js + _topics.js
  node tools/build-lessons.js   # question topics → curriculum lessons (data/_lessons.js)
  ```
  Commit the regenerated `data/*` files. Full guide: `how-to-add-new-exam.md`.
- **Deploy:** push to `main`. `.github/workflows/deploy.yml` validates, bakes, deploys to GitHub Pages (`https://achma-learning.github.io/qe/`) and best-effort commits the baked files back.
- **Android APK:** copy steps + `./gradlew assembleDebug` in `android/README.md`; publish with `.github/workflows/release-apk.yml` (Actions tab → "Release Android APK" → Run workflow with a tag like `android-v1.4.0`; this session's git proxy can't push tags, so the owner runs it). Full routine: `RELEASE.md`.
- **How app users update:** inside the app, **⬇ Mettre à jour l'app** (dashboard, Settings, command palette) opens the latest release's APK in the phone's browser; opening the downloaded file updates the app in place and keeps progress. No auto-check — the app has no INTERNET permission, so it can't know a new version exists; the button always fetches whatever release is newest.
- **Required env vars:** none. The app makes no network calls.

## 3. Tech Stack
- **Language + runtime:** vanilla browser JavaScript, HTML, CSS. Node scripts for builds — no `package.json`/lockfile; CI pins Node 20 (`deploy.yml`). Android wrapper: Java 17, Gradle 8.14.3 wrapper, Android Gradle Plugin 8.5.2 (`android/build.gradle`), minSdk 23 / target 34, `androidx.appcompat:appcompat:1.7.0` only.
- **Framework / libraries:** **none on purpose.** No framework, bundler, CDN or npm.
- **What kind of project:** static multi-page web app + installable offline PWA (`sw.js`, `manifest.webmanifest`) + Node CLI tools + a thin Android WebView app.
- **External services:** none at runtime. GitHub Pages hosts; questions originally from e-qe.online (only linked out via optional `(Correction officielle) : https://…` lines).

## 4. Code Map (The Important Files Only)
- `index.html` — **open first.** Dashboard: loads `modules.js`, `_counts.js`, `_topics.js`, `app.js`, calls `QE.bootDashboard()`.
- `assets/app.js` — **the monolith (~5,200 lines, one IIFE).** Everything: parser, dashboard, viewer, keyboard layer, command palette, analytics, exam grading, focus mode, pomodoro, lesson filter, every page's `boot*()`. Banners `// ===== … =====` split it; exports at `window.QE` (`app.js:5266`).
- `assets/style.css` — all styling: dark/light themes, focus mode, responsive breakpoints (1100 / 900 / 600 / 380 px).
- `assets/modules.js` — hand-kept **manifest** `window.QE_MODULES = [{ sem, slug, name, file, cur }]` + `QE_SEMESTERS`. `cur` = module name in the curriculum (drives the lesson filter).
- `modules/<slug>.html` — one viewer page per module (22, near-identical): `data-module="<slug>"`, loads its `.data.js` + `_lessons.js`, calls `QE.bootViewer()`.
- `data/<sem>/<Module>.txt` — **the only hand-edited question data** (S5–S10).
- `data/<slug>.data.js`, `data/_counts.js`, `data/_topics.js`, `data/_lessons.js` — generated. **Never edit.**
- `data/liste cours/` — curriculum S1–S10 outlines (`curriculum_FMPM_S1-S10.txt` + one per semester), `lesson-aliases.json` (hand fixes topic → lesson), `_curriculum.js` (generated, for `curriculum.html`).
- `tools/build-data.js` / `check-data.js` / `parser-bridge.js` — bake, validate, and the shared loader that lifts the parser out of `app.js`.
- `tools/build-lessons.js` — fuzzy-maps each question topic to curriculum lessons (+ aliases); `--report` lists every mapping. 15,383 / 15,542 questions mapped.
- `tools/build-curriculum.js`, `tools/build-analysis.js` — bake `_curriculum.js` and `qe-analysis/_analysis.js`. `tools/missing-corrections.js` — prompt builder for unanswered questions (currently 0).
- Other pages: `report.html` (AI prompt from your mistakes), `high-yield.html` (docs in `qe-analysis/<slug>/`), `curriculum.html`, `planner.html` (activity heatmap + daily plan), `playlist-fmpm.html`, `data.html` (links live inline in that file as `window.QE_DATA_LINKS`).
- `sw.js` + `manifest.webmanifest` — PWA, network-first with 3 s cache fallback. Bump `CACHE` to evict.
- `android/` — WebView shell (`MainActivity.java`, `AssetDocs.java`) around a **copy** of the site in `app/src/main/assets/`; prebuilt `dist/qe-bank-debug.apk`. `MainActivity` exposes `window.QEAndroid` (`appVersion()`, `isVolumeNav()`, `setVolumeNav()`) and turns volume ▼/▲ into `QE.hwNav(±1)` on question pages (`dispatchKeyEvent`, `MainActivity.java:227`).
- `docs/UX-AUDIT.md` — design rationale + roadmap (R1–R4).

## 5. Rules For Editing This Code
- **Zero dependencies.** No framework, bundler, `package.json`, CDN, fetched font.
- **Plain `<script>` tags only — no ES `import`/`export`.** Anything needing a server breaks the `file://` offline guarantee.
- **Relative paths only** — the site runs at `/qe/` on Pages, at `/` locally, and from `file:///android_asset/`.
- **Never hand-edit generated files** (`data/*.data.js`, `data/_counts.js`, `data/_topics.js`, `data/_lessons.js`, `data/liste cours/_curriculum.js`, `qe-analysis/_analysis.js`). Edit the source, run the `tools/build-*.js`, commit both.
- **Escape every data-derived value before `innerHTML`** with `escapeHtml()` (`app.js:5021`) — medical text contains `<`, `>`, `&`. Toasts are safe (`textContent`).
- **All state in `localStorage` under `qe:`**, only via the `LS` helper (`app.js:33`). New fields must be optional — old records lack them. Keys: `answers.<slug>` (`{ qIdx: { picked, checked, correct, partial, unknown, ts, tMs, n } }`), `progress.<slug>`, `current.<slug>`, `exam.<slug>.<i>`, `activity`, `lessonFilter.<slug>`, plus UI singletons (`theme`, `mode`, `focusMode`, `autoAdvance`, `visibleModules`, …).
- **Adding a module** = `.txt` under `data/<sem>/` + entry in `modules.js` (with `cur`) + copy a `modules/<slug>.html` + rebuild (`build-data.js`, `build-lessons.js`).
- **New root page or asset → add it to the `cp` allow-list in `deploy.yml`** ("Stage site" step), or it won't deploy. Add it to `sw.js` `SHELL` if it should work offline.
- **Android changes:** bump `versionCode` + `versionName` in `android/app/build.gradle`; never change the signing key. The in-app update button needs all three to hold for every release: asset named exactly `qe-bank-debug.apk`, signed with `android/qe-debug.keystore`, higher `versionCode` than the last one.
- **Touch screens:** anything placed next to Prev / Check / Next gets mis-tapped. Keep frequent buttons in `.ctl-nav`, everything else in `.ctl-more`; destructive buttons need a second tap on touch (`resetFromButton`, `app.js:3644`).

## 6. Fragile Bits & Landmines
- **The parser is extracted by regex.** `tools/parser-bridge.js:20` grabs `function parseQuestionsFile(text) {` … up to the first `\n  }\n`. Keep that exact signature, its two-space-indented closing brace, and no other `\n  }\n`-shaped line inside it (`app.js:1689`). _Symptom: "parseQuestionsFile not found" or garbage bakes._
- **`.txt` parsing is heuristic.** Headers (`# <exam> Q<n> - <topic>`) only count after the first `---`/`===` separator and right after a boundary (`app.js:1797`, `isLikelyHeader` `app.js:1716`). A line ending in `?`, `!` or `:` is never a header.
- **Corrections attach by exact `exam` + `qn` match, else silently vanish** (`app.js:1758`). `Juin2025` ≠ `Juin 2025`. Run `check-data.js`.
- **"Unknown correction" is excluded from accuracy on purpose** (`rec.unknown`). Don't "fix" it.
- **`BAREME` (`app.js:156`) is the official FMPM /20 curve** for 50/40/30/20-question papers. Real published values — don't recompute.
- **Exam-review keys:** `handleGlobalKeys` runs first, so single letters `m s l z f p` are taken; review navigation uses arrows + `J/K/N`. Viewer: `C` = lesson filter, `L` = theme.
- **Lesson mapping is only as good as the topics.** Catch-all topics ("Néphrologie pédiatrique") map to several lessons, so the same 47 questions show under each. Fix in `lesson-aliases.json`, not in code. Filter keys are stored as indexes (`l3`, `g0`) — reordering curriculum lessons changes what a saved filter points to (stale keys are dropped, wrong-but-valid ones aren't).
- **`modules.js` is eval'd in a fake `window`** (`parser-bridge.js:28`): keep it a plain assignment.
- **`.nojekyll` is load-bearing.** Without it GitHub Pages hides `_`-prefixed files → dashboard counts and analytics break.
- **The Android app bundles a frozen copy of the site.** `android/app/src/main/assets/` is synced by hand (`android/README.md` copy steps). It drifts silently: `data.html` was already stale once. Re-run the copy steps before every APK build.
- **Android signing key is committed on purpose** (`android/qe-debug.keystore`, owner's choice from 1.3) so every APK updates in place. Changing it forces users to uninstall = lose all progress (`localStorage` lives in the app). Builds ≤ 1.2 used throwaway machine keys.
- **Android-only tweaks are injected, not forked:** `MainActivity` prepends a focus-mode default to `assets/app.js` as it's served, phones only (`MainActivity.java:52`). Back closes `.overlay` elements via JS before navigating. PDFs/`.docx` open in an external viewer through `FileProvider` (a WebView can't show them) — new doc types need `AssetDocs.opensExternally()`/`mimeFor()`.
- **`html.touch-ui`** (set in `app.js:550` when `window.QEAndroid` exists or the pointer is coarse) drives the touch layout. The controls' `.ctl-nav` / `.ctl-more` wrappers are `display: contents` on desktop (layout unchanged) and real rows on touch — don't drop them. `#btn-focus` is hidden on touch on purpose (owner mis-tapped it next to Next); focus mode there = floating ✕ Focus / Settings.
- **Volume buttons:** swallowed only on `modules/*.html` while the setting is on; elsewhere they still change the volume. The setting lives in Android `SharedPreferences` (not `localStorage`) because `dispatchKeyEvent` must decide synchronously. Key repeats are ignored so holding the button doesn't race through questions.
- **Hard-won fix — exam timer:** reopening an exam from `?exam=N` (reload, Back) never set `examStartT`, so the banner showed minutes since 1970 (`29887968:00`). It's now initialised from the session's `startedAt`. Grading always used `startedAt`, so no saved data was wrong.
- **CSS class collision:** the generic `.empty` (60 px padding) also matched the dashboard's `.sp.empty` sparkline bars and widened the page on phones. Watch generic class names.
- **Service worker** only runs on http(s). Changing caching → bump `CACHE` in `sw.js`.
- **Skip on cleanup — looks dead, isn't:** `.q-chip.flagged` CSS and `resetTrainingExamRange` (`app.js:74`) are reserved for the bookmark feature (R1).
- **Duplicates to know about:** the curriculum file exists in `curriculum data/`, `data/liste cours/` (the one the tools read) and an older S5–S10 copy in `data/`. `data/to add/` holds answer-sheet photos not yet typed in. `anki/`, `issues/`, `curriculum data/idea.txt` are notes, not code.

## 7. Current State
- **Last shipped (Android 1.4, website same day):** volume ▼/▲ move between questions in the app (▼ reveals the correction first, then goes on; Settings switch); in-app **⬇ Mettre à jour l'app** button; touch layout against mis-taps (nav row apart from secondary actions, no 🎯 button on touch, two-tap Reset); exam timer fix. Before that: lesson filter inside each module (`C` / 🏷: curriculum lessons, per-lesson count + accuracy, `tools/build-lessons.js` + `lesson-aliases.json`); 🎯 Focus + ▶ Auto buttons in the question controls; tablet/phone layout pass; Android 1.3 (focus default on phones only, Back closes panels, dark launch, fixed committed signing key).
- **Working on now:** releasing Android 1.4 (`android-v1.4.0`, see `RELEASE.md`); then the owner confirms the app works and 1.4 becomes the known-good baseline.
- **Next up** (roadmap in `docs/UX-AUDIT.md`):
  1. **R4 — export / import progress** as one JSON of all `qe:*` keys (backup, move devices, survive an app reinstall).
  2. **R1 — bookmark / mark-difficult + review queue** (wire the dormant `.flagged` chip).
  3. **R2 — global question/topic search** in the command palette.

## 8. Update Protocol (Verbatim)
> **For the AI Assistant:** When asked to "Update CONTEXT.md":
> 1. Re-run Phase 0 — check for new or changed `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.github/` files, merge what's new, and re-run Phase 3 so each of them still points to `CONTEXT.md`.
> 2. Re-scan the tree, manifests, and `.github/workflows/` for drift.
> 3. Read our recent conversation for new decisions, fragile bits discovered, or shifted goals.
> 4. Refresh the `_Last synced_` line with today's date and current commit SHA.
> 5. Rewrite — do not append. One clean source of truth. Preserve still-true content, revise the rest.
> 6. Keep §1 and §2 in plain English. Keep the file under ~200 lines.
