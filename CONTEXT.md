# qe — MCQ Question Bank — AI Context File
_Last synced: 2026-06-03 @ 6d1f2d8_

## 1. What This Is (Plain English)
- **In one sentence:** A no-install website that drills you on ~15,000 past medical-school exam multiple-choice questions, entirely from the keyboard and fully offline.
- **Why it exists:** The owner is a med student with years of past exam papers saved as plain `.txt` dumps. This turns those raw files into a fast trainer — pick answers, get instant correction, track progress, and see which topics you're weak on — without a login, an internet connection, or any app store.
- **Who uses it:** Just the owner (and probably classmates). It's a personal study tool; all the question data lives right in the repo.
- **Vibe:** Polished personal tool. Heavily iterated (command palette, learning analytics, focus mode, pomodoro, exam mode with real /20 grading, AI-prompt export) but deliberately framework-free and offline-first. The whole appeal is that it loads instantly and works from a ZIP.

> Context clues: content is French and the grading uses the **FMPM** answer-sheet and grade curves (`assets/app.js:156`, `:165`) — i.e. Moroccan medical-faculty exams, originally from e-qe.online (linked via optional `(Correction collective) : https://...` hint lines).

## 2. How To Run It
- **Setup once:** Nothing. No `npm install`, no dependencies, no env file. (Node.js is only needed if you rebuild the data — see below.)
- **Run dev (recommended):**
  ```sh
  python3 -m http.server 8000
  # then open http://localhost:8000/
  ```
  Note: the viewer loads the **baked** `data/<slug>.data.js` (always present), so editing a `.txt` shows nothing until you rebuild (below). The `fetch()` live-parse only kicks in if a `.data.js` is missing/404s.
- **Run offline:** Double-click `index.html`. Works on `file://` because the questions are pre-baked into `data/<slug>.data.js` and loaded with plain `<script>` tags.
- **Add / edit exams:** edit the `.txt` under `data/<sem>/`, then validate and rebuild:
  ```sh
  node tools/check-data.js     # flags silent mistakes (orphan corrections, bad options)
  node tools/build-data.js     # bakes .txt → data/*.data.js (+ _counts.js, _topics.js)
  ```
  Commit the regenerated `data/*` files — offline mode reads them. Full guide: `how-to-add-new-exam.md`.
- **Add a high-yield analysis doc:** drop a PDF/Word/txt into `qe-analysis/<slug>/`, then run `node tools/build-analysis.js` (regenerates `qe-analysis/_analysis.js`). Pushing to `main` does this automatically in CI. The doc then shows on `high-yield.html`.
- **Live site = GitHub Actions → Pages** (Settings → Pages → Source = "GitHub Actions"): `.github/workflows/deploy.yml` bakes `data/*` + the analysis manifest and deploys the site on every push to `main`, so editing a `.txt` (even on github.com) publishes itself. Live at `https://achma-learning.github.io/qe/`; works at that `/qe/` subpath thanks to the app's all-relative paths. The workflow also best-effort commits the baked files back (needs Actions read/write) for the offline ZIP.
- **Installable / offline PWA:** `sw.js` + `manifest.webmanifest` make the online site installable and work offline; registered from `app.js`, guarded to http(s) (the `file://` copy is offline regardless).
- **Required env vars:** _None._ The app makes no network calls and needs no keys.

## 3. Tech Stack
- **Language + runtime:** Vanilla JavaScript (browser ES + Node for the build scripts). No TypeScript. No declared runtime version — there is no `package.json`, lockfile, or `.nvmrc`; CI pins Node 20 (`deploy.yml:44`). HTML5 + CSS3.
- **Framework / key libraries:** **None.** Zero dependencies, no bundler, no package manager, no CDN. This is a hard constraint, not an accident (see §5).
- **What kind of project:** Static multi-page web app + installable offline PWA (one dashboard + one viewer page per module, plus `report.html` + `high-yield.html`), plus Node CLI tools (build + validate).
- **External services:** None at runtime. Content was sourced from e-qe.online; the app only ever *links out* to those exam pages when a URL hint line is present.

## 4. Code Map (The Important Files Only)
- `index.html` — **open this first.** The dashboard. Loads `modules.js`, `_counts.js`, `_topics.js`, `app.js`, then calls `QE.bootDashboard()`.
- `report.html` — root-level "AI report" page (`QE.bootReport()`): pick modules (multi-select), collect every wrong/partial answer via `collectModuleReport`, build one Markdown prompt for an AI, copy/download. Lazy-loads each module's `.data.js`.
- `high-yield.html` — root-level document browser (`QE.bootHighYield()`, `app.js:3949`): lists every module (no quiz) and links/previews its high-yield analysis doc (PDF/Word/txt) from `qe-analysis/<slug>/`. Reads `window.QE_ANALYSIS` (baked by `tools/build-analysis.js`).
- `qe-analysis/<slug>/` — drop a PDF/Word/txt high-yield doc here (from the user's external `qe-analysis` Claude skill). `qe-analysis/_analysis.js` is the auto-generated manifest (`window.QE_ANALYSIS`). `qe-analysis/README.md` maps slug→module. **Currently populated:** `s8-anapath-2`, `s7-hematologie-oncologie`.
- `tools/build-analysis.js` — scans `qe-analysis/<slug>/` for docs → regenerates `_analysis.js` (and ensures each module folder exists). Run in CI alongside `build-data.js`.
- `assets/app.js` — **the monolith (~4,080 lines).** The entire app in one IIFE exposing `window.QE.{bootDashboard,bootViewer,bootReport,bootHighYield}`: `.txt` parser, dashboard, viewer, keyboard layer, command palette, analytics engine, exam grading, focus mode, pomodoro, report export. Boot fns near the bottom; section banners (`// ===== … =====`) split it.
- `assets/modules.js` — hand-maintained **manifest**: `window.QE_MODULES = [{ sem, slug, name, file }]` + `QE_SEMESTERS` labels. The source of truth for which modules exist and where their `.txt` lives.
- `assets/style.css` — all styling (~1,080 lines): dark/light themes, command palette, focus mode, "dynamic island" timer, review cards, accessibility (`:focus-visible`, `prefers-reduced-motion`).
- `tools/build-data.js` — bakes each `.txt` → `data/<slug>.data.js` and writes `_counts.js` / `_topics.js`.
- `tools/check-data.js` — validator: parses every `.txt` with the real parser and warns about silent mistakes (orphan corrections, too-few-options, pre-separator questions). Run before baking.
- `tools/parser-bridge.js` — shared loader that lifts `parseQuestionsFile` + the module manifest out of `app.js`/`modules.js` so the build and validator never drift from the app (see §6).
- `modules/<slug>.html` — one viewer page per module. Carries `<div id="qe-root" data-module="<slug>">`, loads that module's `.data.js`, calls `QE.bootViewer()`. All 22 are near-identical.
- `data/<sem>/<module>.txt` — **the only hand-edited data.** Source question files (semesters s5–s10).
- `data/<slug>.data.js` — auto-generated baked payload (`window.QE_DATA = {...}`). **Do not edit.**
- `data/_counts.js` / `data/_topics.js` — auto-generated indexes for dashboard counts + weakness analysis. **Do not edit.**
- `docs/UX-AUDIT.md` — the design/architecture rationale and feature roadmap. Good background; this file (§7) tracks the live state.
- `how-to-add-new-exam.md` — human-facing guide for adding/editing exams: the `.txt` format, the strict-vs-forgiving rules, and the validator.
- `.github/workflows/deploy.yml` — CI: on PRs validates `.txt` (`--strict`); on push to `main` bakes `data/*` + the analysis manifest, deploys to GitHub Pages, and best-effort commits the baked files back. **Stages files by an explicit allow-list** (`cp index.html report.html high-yield.html manifest.webmanifest sw.js icon.svg .nojekyll …` + `cp -r assets data modules qe-analysis`) — **any new root HTML/asset must be added there or it won't deploy.** (Note: the PR-trigger `paths` don't include `qe-analysis/**`, so adding only an analysis doc rebuilds the manifest on merge-to-`main`, not at PR time — fine, since the manifest is committed.)
- `manifest.webmanifest` + `sw.js` + `icon.svg` — PWA: make the online site installable and offline-capable (service worker: network-first for pages, stale-while-revalidate for assets/data). Registered from `app.js`.
- `.nojekyll` — disables Jekyll (which hides `_`-prefixed files like `data/_counts.js` / `_topics.js`). Staged into the deploy artifact and kept at the repo root. **Don't delete.**

**Scale:** 22 modules · 15,442 questions · 313 exams (summed from `data/_counts.js`).

**Two run modes** (toggled with the `mode` pill, persisted as `qe:mode`): **Training** (instant per-question correction) and **Exam** (answer a full set → correction + /20 grade + a per-card AI correction prompt at the end). The viewer also has cyclable **loadout presets** (`PRESETS`, `app.js:612` — Default / Velocity / Exam / Study / Lightning) that preset the pomodoro work/break minutes; cycle with `T` / `8`.

**Keyboard is the whole point.** The full key map lives in `README.md` and the in-app help (`?`). The discovery surface is the command palette (`Ctrl`/`Cmd`+`K`) — a dependency-free fuzzy launcher (`showCommandPalette`, `app.js:1484`) that jumps to any module or runs any command.

## 5. Rules For Editing This Code
- **Stay zero-dependency.** No framework, no bundler, no `package.json`. The point is that it loads instantly and runs from a ZIP.
- **Plain `<script>` tags only — no ES module `import`/`export`.** Anything that needs a server or build step breaks the `file://` offline guarantee.
- **Never hand-edit generated files** (`data/*.data.js`, `data/_counts.js`, `data/_topics.js`, `qe-analysis/_analysis.js`). Edit the source, then run the matching `tools/build-*.js` and commit the result.
- **Adding a module** = (1) drop a `.txt` under `data/<sem>/`, (2) add an entry to `assets/modules.js`, (3) create `modules/<slug>.html` (copy an existing one, change the title, `data-module`, and the `.data.js` path), (4) rebuild.
- **All state is `localStorage` under the `qe:` prefix** (`assets/app.js:33`, accessed only via the `LS` helper). New keys must be backward-compatible — older records simply lack new fields and must degrade gracefully (this is how analytics was added without a migration). The live schema:
  - `answers.<slug>` → `{ qIdx: { picked, checked, correct, partial, unknown, ts, tMs, n } }` (per-question result; `ts`/`tMs`/`n` = last-seen, time-on-task, review count).
  - `progress.<slug>`, `current.<slug>` (cursor), `exam.<slug>.<examIndex>` (per-exam session: `{ picked, cur, submitted, submittedAt, durationSec }`).
  - `activity` → `{ 'YYYY-MM-DD': { answered, correct, ms } }` (bounded ~400 days; powers streaks/trend).
  - UI/config singletons: `theme`, `mode`, `presetIndex`, `autoAdvance`, `sidebarHidden`, `multiSelect`, `focusMode`, `lastModule`, `pomoMinutes`, `pomo.*`, `showCorrectionOnCopy`, `analysis.*`, `examOpen.<slug>`, `visibleModules` (array of slugs shown on the dashboard; absent ⇒ all visible).
- **No network calls, no CDNs, no fetched fonts.** Preserve the offline guarantee. Everything stays inline ES / SVG / CSS.
- **Escape every data-derived value before `innerHTML`** (see §6).

## 6. Fragile Bits & Landmines
- **The parser is extracted by regex — don't reformat it.** `tools/parser-bridge.js:20` slurps `parseQuestionsFile` out of `app.js` with `/function parseQuestionsFile\(text\) \{[\s\S]*?\n  \}\n/`. That function (`assets/app.js:1594–1720`) **must** keep the exact signature `function parseQuestionsFile(text) {` and close with a two-space-indented `}` (i.e. `\n  }\n`). Renaming it, changing its indentation, or adding another `\n  }\n`-shaped block inside it silently breaks the build. _Symptom if broken: "parseQuestionsFile not found" or garbage bakes._
- **`.txt` parsing is heuristic and format-sensitive.** Headers (`<exam> Q<n> - <topic>`) are only detected **after the first `---`/`===` separator** and only when the previous line was a boundary (`isLikelyHeader`, `app.js:1617`; the guard is `app.js:1678`). Stray separators, colons, or `?`/`!` endings change what counts as a header. Eyeball the question count after editing a `.txt`.
- **"Unknown correction" is excluded from accuracy on purpose.** Questions without a `Correction officielle - <exam> Q<n> = <letters>` line get `hasCorrection:false` (`app.js:1688`); the viewer marks answers `rec.unknown` so they don't pollute accuracy (`app.js:2310`). Deliberate honesty call — **don't "fix" it** to count them.
- **Corrections bind by an exact `exam`+`qn` match and silently drop otherwise** (`app.js:1657`). A `Correction officielle - …` line whose exam name or number doesn't match its question — even by one space (`Juin2025` vs `Juin 2025`) — just doesn't attach; the question then shows "no official answer" with no error anywhere. **Run `node tools/check-data.js`** after editing any `.txt`; it exists to catch exactly this.
- **`BAREME` grade tables are hard-coded official curves.** `app.js:156` holds the FMPM /20 conversion for 50/40/30/20-question papers; other sizes are scaled onto the /50 curve. These are real published values — don't recompute or "simplify" them.
- **Exam-review key handler runs `handleGlobalKeys` first** (`app.js`, `viewMode === 'exam-review'` branch). Single-letter globals (`m s l z f p`) win there, which is why the review card navigation uses arrows + `J/K/N` (never `p` for "prev"). Add review keys around that ordering, not over it.
- **`localStorage` ~5 MB ceiling.** Answer maps + the bounded ~400-day `qe:activity` log stay small. If a future feature stores full per-attempt history, move **that feature** to IndexedDB — don't migrate everything.
- **Looks-dead-but-isn't (skip on cleanup):** the `.q-chip.flagged` CSS with nothing setting it, and `resetTrainingExamRange` (`app.js:74`, unused) are both reserved for the planned bookmark/review feature (R1 in `docs/UX-AUDIT.md`). Leave them.
- **`modules.js` is eval'd in a fake `window` at load time** (`tools/parser-bridge.js:28`). Keep it a plain `window.QE_MODULES = [...]` assignment — no imports, no DOM access — or the tools can't read it.
- **GitHub Pages runs Jekyll, which hides `_`-prefixed files.** `.nojekyll` (staged into the deploy artifact and at the repo root) is load-bearing: without it `data/_counts.js` / `_topics.js` 404 → dashboard counts + weakness analysis break. Don't delete it.
- **Service worker caches aggressively.** `sw.js` is network-first for navigations (only caching `res.ok`), stale-while-revalidate for assets/data, so a deploy shows up within a reload or two online. If you change caching behaviour, bump `CACHE` in `sw.js` to evict old entries. Runs only on http(s), never `file://`.
- **Escape every data-derived value before `innerHTML`.** All rendering uses `innerHTML` template strings, so any field from question data or `localStorage` (`q.text`, `q.exam`, `q.topic`, `module.name`, `grp.name`, `grp.url`, the search box, analysis file names) must go through `escapeHtml()` (`app.js:4041`) — real medical text contains `<`/`>`/`&`. Exception: `computeReminders()` returns intentional `<b>…</b>` HTML with its dynamic parts already escaped at the source. Toasts are safe (they use `.textContent`).

## 7. Current State
- **Last shipped:** **Exam-correction (review) navigation + `Alt+C` prompt copy.** On the results screen, `↑↓` / `←→` / `J` `K` / `N` move a focus cursor across the *visible* review cards (mirrors the dashboard/exam-picker focus model), syncing `idx` + the sidebar's "current" chip. `Alt+C` copies the full « Professeur agrégé » correction prompt (énoncé + ma réponse + correction officielle + mission) for whichever card the **mouse is hovering**, falling back to the keyboard-focused card; `Enter` does the same. The per-card 📋 button and `Alt+C` now share one `copyReviewItemEl()`; switching filters clears stale focus. New `.review-item.focused` outline mirrors `.card.focused`. Verified end-to-end in a headless browser.
- **Earlier:** PR #22 — exam-**picker** arrow-key navigation (`focusExamTile`), a dashboard **"visible modules"** toggle (`qe:visibleModules`), and the per-question **📋 copy in exam review** (`buildExamReviewPrompt`) this session's `Alt+C` builds on.
- **Earlier:** Auto-advance timer fix — the per-question countdown resets on every question change (exam *and* training) via a `syncTimer()` guard (`app.js:3262`), instead of restarting on every re-render.
- **Earlier:** `high-yield.html` page + `qe-analysis/<slug>/` folders + `tools/build-analysis.js` (manifest baker, wired into CI). Topbar gained **Report** + **High-Yield** nav links. **Content drops since:** high-yield docs now exist for `s8-anapath-2` and `s7-hematologie-oncologie` (2/22 modules).
- **Earlier:** Smarter **AI report** (`report.html`) — multi-select modules → one Markdown prompt that leads with computed stats (per-module/per-topic frequency) and asks the AI to classify each error (🧠/🔗/🪤); copy-to-clipboard + `.txt` download; offline-safe clipboard (`copyText`/`execCopy`); reset-sync via `pageshow`/`storage` listeners; mobile/tablet responsive pass.
- **Earlier:** Installable offline PWA (`sw.js` + `manifest.webmanifest`) + GitHub Actions → Pages deploy; consistent HTML-escaping pass; `check-data.js` validator + `tools/parser-bridge.js`; exam answer-sheet + FMPM /20 grade; command palette, analytics, focus mode.
- **Working on now:** nothing active in code — high-yield content drops land via CI; the review-mode keyboard polish just shipped.
- **Next up** (roadmap in `docs/UX-AUDIT.md`, pick ≤3):
  1. **R1 — Bookmark / mark-difficult + review queue** (wire the dormant `.flagged` chip; keys `B`/`X`).
  2. **R2 — Global question/topic search** inside the command palette (currently matches modules only).
  3. **R4 — Export/import progress** as one JSON blob of all `qe:*` keys (backup + move between devices).

## 8. Update Protocol (Verbatim)
> **For the AI Assistant:** When asked to "Update CONTEXT.md":
> 1. Re-run Phase 0 — check for new `GEMINI.md` / `CLAUDE.md` / `AGENTS.md` / `.github/` files.
> 2. Re-scan the tree, manifests, and `.github/workflows/` for drift.
> 3. Read our recent conversation for new decisions, fragile bits discovered, or shifted goals.
> 4. Refresh the `_Last synced_` line with today's date and current commit SHA.
> 5. Rewrite — do not append. One clean source of truth. Preserve still-true content, revise the rest.
> 6. Keep §1 and §2 in plain English. Keep the file under ~350 lines.
