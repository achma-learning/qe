# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project does **not** strictly follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html): the **Android app** is versioned `major.minor` (`versionName` in `android/app/build.gradle`, tags `android-v*`); the **website** has no version number and ships on every push to `main`, so its changes appear as dated sections.

**How to read this:**
- Newest first. Dates are commit dates. The whole history is here; search it (`Ctrl+F`) for an error message, a file name or a feature.
- `(a3f291)` is a short SHA — `git show a3f291` to see the diff.
- Entries explain symptom + cause, not just "fixed."
- Last known-good commit: search for `✅`. The first hit from the top is the newest version or change that was checked and worked.
- Android versions and website dates are interleaved newest first. _Correction 2026-10-29: the first rebuild grouped all Android versions on top; reordered by date._
- Noise skipped: the CI bot's `Rebuild baked data + analysis manifest [skip ci]` commits, `Stamp CONTEXT.md last-synced SHA` commits, merge commits, and the `Create a` / `Delete data/sX/a` placeholder commits used to make folders on github.com.

---

## [Unreleased]

_Nothing yet._

---

## [android v1.4] — 2026-10-29

### Added
- **Volume buttons turn questions** like pages in a reader (ReadEra-style): ▼ first reveals the correction of an answered question, then goes to the next; ▲ goes back. Question pages only, key repeats ignored, switch in Settings. `(bd3f737)`
- **⬇ Mettre à jour l'app** (dashboard, Settings, command palette): opens the newest release APK in the browser; opening it updates in place and keeps progress. Still no INTERNET permission. `(bd3f737)`
- Settings: 🎯 Focus mode and 📱 Volume buttons switches, installed version shown. `(bd3f737)`
- Bundles the website as of `bd3f737` (touch layout, exam timer fix — see the website section below). `(bd3f737)`

### Changed
- Touch layout: Prev / Check / Next on their own big row; Reset, Auto, 🏷… in a smaller row well below, out of a thumb's way. `(bd3f737)`
- Reset / Clear need a second tap within 1.5 s on touch screens — one mis-tap next to Next used to wipe the answer. `(bd3f737)`

### Removed
- 🎯 Focus button in the question controls on touch screens (added in 1.3) — it got hit by mistake while going to the next question. Leave focus mode with the floating ✕ Focus; turn it on in Settings. `(bd3f737)`

### Fixed
- Tapping a web link with no browser installed could crash the app — `ActivityNotFoundException` not caught; now a toast. `(bd3f737)`

---

## 2026-10-29 — website: touch layout + exam timer

### Changed
- `html.touch-ui` (phones, tablets, the app): big Prev / Check / Next row apart from secondary actions, no 🎯 Focus button, two-tap Reset/Clear. Mouse/desktop layout unchanged. `(bd3f737)`
- Settings: 🎯 Focus mode switch (also `Z`). `(bd3f737)`

### Fixed
- Exam banner showed `29887968:00` (minutes since 1970) after reopening an exam from its link (reload, Back) — `examStartT` never set on the `?exam=N` path. Grading was unaffected (uses `startedAt`). `(bd3f737)`
- Floating ✕ Focus covered the topic tag / dashboard intro on phones — no room reserved for it. `(bd3f737)`

---

## 2026-10-29 — docs: CONTEXT, CHANGELOG, README, RELEASE

### Added
- `CHANGELOG.md` (this file, full rebuild from the first commit), a rewritten `CONTEXT.md`, a refreshed `README.md` with a real screenshot, and `RELEASE.md`. `(5cfb37a, 62786d7, b9142bc)`
- _Correction 2026-10-29: this entry sat under `[Unreleased]`; docs ship outside every version, so it moved here._

---

## [android v1.3] — 2026-10-29 — tag android-v1.3.0 (c98b689) ✅ known good

### Added
- 🎯 Focus and ▶ Auto buttons in the question controls; both stay visible in focus mode, so a phone needs no keyboard. `(132ab9a)`
- Bundles the website as of `132ab9a`: lesson filter (`C` / 🏷), refreshed Data page, responsive fixes (see the 2026-10-29 website section). `(132ab9a)`

### Changed
- **Breaking:** 1.3 can't install over 1.2 ("App not installed") — 1.2 and earlier used throwaway build-machine keys. Uninstall first (clears saved progress). `(132ab9a, 30f8eb8)`
- Every build now signs with the committed `android/qe-debug.keystore`, so later APKs update in place. Owner's choice (sideload-only app); APK re-signed, still versionCode 4. `(30f8eb8)`
- Focus mode is the default on phones only; tablets (smallest width ≥ 600 dp) keep the sidebar layout. `(132ab9a)`
- Back closes an open panel (filter, settings, palette, help) before leaving the page. `(132ab9a)`
- Window, status bar and nav bar use the site's dark `#0B1020` — no white flash at launch. `(132ab9a)`

### Fixed
- App's Data page was missing links added since 1.2 — the bundled `data.html` copy was never re-synced. `(132ab9a)`

---

## 2026-10-29 — website: lesson filter + tablet/phone pass

### Added
- **Lesson filter** inside each module (`C` / 🏷, training mode): pick curriculum lessons or sub-modules, see count + accuracy per lesson; `Shift+C` clears. `(132ab9a)`
- `tools/build-lessons.js` + `data/liste cours/lesson-aliases.json` map question topics → lessons (15,383 / 15,542 questions); bakes `data/_lessons.js`, run in CI. `(132ab9a)`
- 🎯 Focus toggle in the question controls; ▶ Auto no longer hidden in focus mode. `(132ab9a)`

### Changed
- Architectural: `assets/modules.js` entries gain `cur` (module name in the curriculum); every `modules/<slug>.html` loads `data/_lessons.js`; `sw.js` cache → `qe-v9`. `(132ab9a)`

### Fixed
- Top bar ran off the right edge on portrait tablets — it only wrapped below 600 px; now wraps ≤ 1100 px. `(132ab9a)`
- Stacked sidebar on tablets spread question chips over 5 huge columns — fixed column count; now auto-fills. `(132ab9a)`
- Dashboard scrolled sideways on phones (641 px wide at 390 px) — generic `.empty` padding (60 px) also hit the sparkline's `.sp.empty` bars. `(132ab9a)`

---

## 2026-10-11 → 2026-10-17 — Data page links

### Added
- Data page: S-ECN 1.0.7 (PC zip + Android apk), S-ECN Codex links, FMPM playlist archive, Osmosis Prime archive (closes #48). `(945a7a5, bdc3f37, 16def81)`

### Changed
- Architectural: Data page links moved from `app.js` into `data.html` as `window.QE_DATA_LINKS`; `bootData()` just renders them. `(9838f83)`
- Service worker: assets/data now network-first with a 3 s cache fallback (was stale-while-revalidate); `CACHE` → `qe-v8`. `(9838f83)`

### Fixed
- New links only appeared on the second reload after a deploy — stale-while-revalidate served the previous `app.js` once. `(9838f83)`

---

## [android v1.2] — 2026-09-07 — tag android-v20260909-100947 (c9591ee) ✅ known good

### Added
- High-yield PDFs/`.docx` bundled in the APK and opened in the device's viewer via `FileProvider` (a WebView can't render them). `(16572ce)`

### Fixed
- High-yield "Ouvrir ↗" dead-ended with `net::ERR_FILE_NOT_FOUND` and "Aperçu" showed a blank pane in the app — WebView has no PDF/Office viewer. "Aperçu" now shows an explanation page. `(16572ce)`

---

## [android v1.1] — 2026-09-06 — tag android-v20260906-195533 (26c25a5) ✅ known good

### Changed
- Focus mode on by default at first launch to use the phone screen; seeded by injecting one line into `app.js` as it's served, so the bundled copy stays an unmodified `cp`. `(769f3d4)`

---

## [android v1.0] — 2026-09-06 — tag android-v20260906-171508 (62fcfdf) ✅ known good

### Added
- Android app (`online.qe.mcqbank`): offline WebView wrapper around a bundled copy of the site, no network permission, external links open in the browser. `(bcb8124)`
- Manual GitHub workflow publishing `android/dist/qe-bank-debug.apk` as a Release (`release-apk.yml`); README download link via `releases/latest/download/qe-bank-debug.apk`. `(798c748, da0e995)`

---

## 2026-09-06 — planner

### Added
- `planner.html`: activity calendar, module × semester heatmap, daily study scheduler, data-health view, CSV export. `(bcb8124)`

---

## 2026-08-15 → 2026-08-20 — bug hunt + Data page

### Added
- `data.html` "Data — liens utiles": archives, drives, The Collection 22 linktree, YouTube channels & playlists. `(3690997, 2b4f222, 3800c13)`
- Playlist page: full S2–S10 video backup link. `(d67e9d4)`
- `tools/missing-corrections.js`: lists questions without an answer and builds a paste-ready AI prompt (`Correction probable` format). `(c700056)`

### Changed
- Playlist page: dropped the "(Teams)" label from S9 modules. `(7242a32)`

### Fixed
- Pressing `1`–`5` after closing the Ask-AI menu opened new AI tabs (several per keypress) — duplicate keydown listener never unbound. `(c700056)`
- Weakness analysis always said "No answers yet" on module pages and its links 404'd (`modules/modules/…`) — viewer pages didn't load `_topics.js`; hrefs not relative. `(c700056)`
- Playlist page couldn't open offline in the installed PWA — missing from the service-worker shell. `(c700056)`
- Pomodoro stuck at `0:00` with an empty ring on every load — a session that expired while closed stayed `running`. `(c700056)`

---

## 2026-06-12 → 2026-07-06 — content drops

### Added
- High-yield: "Ressources complémentaires" section. `(0bed569)`
- `playlist-fmpm.html`: S1–S10 YouTube/Teams playlist links from the FMPM PDF; added to the deploy staging list. `(b1a8a22, be1dd98, 599b6b0)`
- New exams: S7 Neuro-Neurochir and Hématologie-Oncologie session **2026 normale**. `(2c1f7ff, cf5aa9a, 57833d5)`
- High-yield analysis docs (PDF + `.docx`) for cardio, gastro, pneumo, pharmacologie, anapath, parasito/infectieux; later re-exported smaller. `(eefef3f, d507ab2, c65719e, 2a2c7cf, 1894ffb, 62d60a6, 0bc7db9, 5f06c88)`
- Source material: FMPM playlist PDFs, answer-sheet photos in `data/to add/` (not yet typed in), Anki idea notes. `(95dd598, 0deda88, 5e0acf8)`

### Fixed
- S9 playlist module names took the accent colour meant for the "(Teams)" tag. `(871cf03)`

---

## 2026-06-06 → 2026-06-07 — curriculum page + answers for every question

### Added
- `curriculum.html`: FMPM S1–S10 program as collapsible Module → Sub-module → Course trees, per-semester `.txt` download; baked by `tools/build-curriculum.js`. `(e6cc226, a73da83, 061ba34)`
- **"Correction probable"** — best-estimate answers for the 1,470 questions with no official key, shown with a "≈ probable" badge so they're never mistaken for the official answer. `(756d833)`
- Exam correction screen: previous/next exam footer. `(f9696b7)`
- High-yield: both "Open" and "Download" for every analysis doc. `(60f8972)`

### Changed
- 350 questions re-tagged from "Questions inclassifiables" to their most probable lesson (6 left as-is: they belong to another module). `(7034f94)`
- Architectural: curriculum sources moved into `data/liste cours/` and `curriculum data/` (from `New folder/` and `issues/`). `(6df8ad4)`

### Fixed
- S4 showed "Curriculum non disponible" after its `.txt` was added — page only read the stale bake; now re-reads the live `.txt` on a server. `(b606bd2)`

---

## 2026-06-01 → 2026-06-05 — AI report, high-yield page, review navigation

### Added
- `report.html`: pick modules → one Markdown AI prompt from all wrong/partial answers, with error stats, typology, high-yield notions and an on-page revision plan. `(7ddd6e1, 824b13e, 602e828, 62d64c0)`
- `high-yield.html` + `qe-analysis/<slug>/` folders + `tools/build-analysis.js` manifest; analysis docs for 15+ modules uploaded over the following days. `(84ae940, 9defa10, f219114, be9bb5a, fcb3649, 2869282, 584928b, 7679d8b, e09abd9, 74e1e3a, fda9504, 2beaf78)`
- Exam picker arrow-key navigation; dashboard "visible modules" toggle; per-question 📋 copy in exam review. `(0bc63de)`
- Exam correction screen: card navigation (`↑↓`/`J`/`K`) and `Alt+C` prompt copy for the hovered card. `(6d1f2d8)`
- Mobile/tablet responsive pass. `(7ddd6e1)`

### Fixed
- Exam-mode auto-advance countdown never reset between questions — `startTimer()` only lived in the training render; new `syncTimer()`. `(7f85027)`
- Copy-prompt threw on `file://` — `navigator.clipboard` unavailable in non-secure contexts; textarea fallback. `(66e5886)`
- Report kept showing wiped errors after a module reset (back button / other tab) — page restored from bfcache never re-ran. `(f0cf362)`

---

## 2026-05-31 — power features, CI, PWA

### Added
- Command palette (`Ctrl/⌘+K`), local learning analytics, focus mode (`Z`). `(5f66cce)`
- Exam answer sheet + official FMPM /20 grade (`BAREME`), per-module error report `.txt`, loadout ↔ pomodoro sync, home ordering. `(578e809)`
- Installable offline PWA (`sw.js` + `manifest.webmanifest`). `(5da5175)`
- `tools/check-data.js` validator + `how-to-add-new-exam.md`; `CONTEXT.md` and a human README. `(fba07c6, 4f9a690, df883d2)`
- CI: bakes data on push, commits it back, validates PRs with `--strict`; `.nojekyll` so Pages serves `_`-prefixed files. `(7e212ef, 3b68e34)`

### Changed
- Architectural: deployment switched to branch-based Pages, then back to GitHub Actions → Pages (`deploy.yml`). `(2836346, 2d7ea23)`

### Fixed
- 5 S9 answers ignored and glued onto option E — lines said `Correction proposée -`, parser only knows `Correction officielle -`; validator now flags it. `(63f8ebd)`
- Live site stopped updating after PRs #11/#12 — workflow swapped to one that only baked data, while Pages expected an Actions deploy. `(2d7ea23)`
- Names/questions containing `&`, `<`, `>` could break rendering — escaped in some paths only; now escaped everywhere. Plus SW caching and `NaN%` guards. `(c399c7a)`

### Security
- Consistent HTML-escaping of every data-derived value before `innerHTML` (exam names, topics, URLs) — closes markup injection from hand-edited `.txt`. `(c399c7a)`

---

## 2026-05-24 → 2026-05-25 — first trainer

### Added
- Keyboard-driven MCQ trainer over `data/*.txt`: dashboard by semester, per-module viewer, instant correction. `(e478428)`
- Works offline from a ZIP: questions pre-baked into `data/<slug>.data.js`, loaded with `<script>` tags. `(ec503de)`
- Exam mode (full paper, then correction). `(c13540b)`
- Reset progress per module/exam; collapsible exam groups; dashboard global stats + hover prefetch; weakness analysis per topic with jump to first wrong. `(4a8b543, d14b124, 0ee4f7a, a8be061)`

### Fixed
- Current-question chip lost its highlight once answered — `.correct`/`.wrong` CSS came after `.current`; now a ring that always wins. `(c13540b)`
- Exam tiles rendered twice and the ↗ link could start an exam — invalid nested `<a>`; plus stale timer firing mid-exam and `?exam=N` crash on an out-of-range cursor. `(e6bba3d)`

---

## 2026-05-24 — the first commit
- Project started: empty README, then the S5–S10 question `.txt` files uploaded through github.com. `(e13d884, 5542b30, c13dbd0, aafcf2d, 9e5c30c, 070bae7, ee14107)`

---

[Unreleased]: https://github.com/achma-learning/qe/compare/android-v1.3.0...HEAD
[android v1.3]: https://github.com/achma-learning/qe/compare/android-v20260909-100947...android-v1.3.0
[android v1.2]: https://github.com/achma-learning/qe/compare/android-v20260906-195533...android-v20260909-100947
[android v1.1]: https://github.com/achma-learning/qe/compare/android-v20260906-171508...android-v20260906-195533
[android v1.0]: https://github.com/achma-learning/qe/releases/tag/android-v20260906-171508
