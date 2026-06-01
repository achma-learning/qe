# qe — MCQ Question Bank — AI Context File
_Last synced: 2026-05-31 @ 7ddd6e1_

## 1. What This Is (Plain English)
- **In one sentence:** A no-install website that drills you on ~15,000 past medical-school exam multiple-choice questions, entirely from the keyboard and fully offline.
- **Why it exists:** The owner is a med student with years of past exam papers saved as plain `.txt` dumps. This turns those raw files into a fast trainer — pick answers, get instant correction, track progress, and see which topics you're weak on — without a login, an internet connection, or any app store.
- **Who uses it:** Just the owner (and probably classmates). It's a personal study tool; all the question data lives right in the repo.
- **Vibe:** Polished personal tool. Heavily iterated (command palette, learning analytics, focus mode, pomodoro, exam mode with real /20 grading) but deliberately framework-free and offline-first. The whole appeal is that it loads instantly and works from a ZIP.

> Context clues: content is French and the grading uses the **FMPM** answer-sheet and grade curves (`assets/app.js:154`, `:178`) — i.e. Moroccan medical-faculty exams, originally from e-qe.online (linked via optional `(Correction collective) : https://...` hint lines).

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
- **Live site = GitHub Actions → Pages** (Settings → Pages → Source = "GitHub Actions"): `.github/workflows/deploy.yml` bakes `data/*` and deploys the site on every push to `main`, so editing a `.txt` (even on github.com) publishes itself. Live at `https://achma-learning.github.io/qe/`; works at that `/qe/` subpath thanks to the app's all-relative paths. The workflow also best-effort commits the baked data back (needs Actions read/write) for the offline ZIP.
- **Installable / offline PWA:** `sw.js` + `manifest.webmanifest` make the online site installable and work offline; registered from `app.js`, guarded to http(s) (the `file://` copy is offline regardless).
- **Required env vars:** _None._ The app makes no network calls and needs no keys.

## 3. Tech Stack
- **Language + runtime:** Vanilla JavaScript (browser ES + Node for the one build script). No TypeScript. No declared runtime version — there is no `package.json`, lockfile, or `.nvmrc`. HTML5 + CSS3.
- **Framework / key libraries:** **None.** Zero dependencies, no bundler, no package manager, no CDN. This is a hard constraint, not an accident (see §5).
- **What kind of project:** Static multi-page web app + installable offline PWA (one dashboard + one viewer page per module), plus Node CLI tools (build + validate).
- **External services:** None at runtime. Content was sourced from e-qe.online; the app only ever *links out* to those exam pages when a URL hint line is present.

## 4. Code Map (The Important Files Only)
- `index.html` — **open this first.** The dashboard. Loads `modules.js`, `_counts.js`, `_topics.js`, `app.js`, then calls `QE.bootDashboard()`.
- `report.html` — root-level "AI report" page (`QE.bootReport()`): pick modules (multi-select), collects every wrong/partial answer via `collectModuleReport`, builds one Markdown prompt for an AI, copy/download. Lazy-loads each module's `.data.js` via `loadModuleData(slug, '')`.
- `assets/app.js` — **the monolith (~3,300 lines).** The entire app: `.txt` parser, dashboard, viewer, keyboard layer, command palette, analytics engine, exam grading, focus mode, pomodoro, report export. Everything lives in one IIFE exposing `window.QE.bootDashboard` / `bootViewer`.
- `assets/modules.js` — hand-maintained **manifest**: `window.QE_MODULES = [{ sem, slug, name, file }]` + `QE_SEMESTERS` labels. The source of truth for which modules exist and where their `.txt` lives.
- `assets/style.css` — all styling (~855 lines): dark/light themes, command palette, focus mode, "dynamic island" timer, accessibility (`:focus-visible`, `prefers-reduced-motion`).
- `tools/build-data.js` — bakes each `.txt` → `data/<slug>.data.js` and writes `_counts.js` / `_topics.js`.
- `tools/check-data.js` — validator: parses every `.txt` with the real parser and warns about silent mistakes (orphan corrections, too-few-options, pre-separator questions). Run before baking.
- `tools/parser-bridge.js` — shared loader that lifts `parseQuestionsFile` + the module manifest out of `app.js`/`modules.js` so the build and validator never drift from the app (see §6).
- `modules/<slug>.html` — one viewer page per module. Carries `<div id="qe-root" data-module="<slug>">`, loads that module's `.data.js`, calls `QE.bootViewer()`. All 22 are near-identical.
- `data/<sem>/<module>.txt` — **the only hand-edited data.** Source question files (semesters s5–s10).
- `data/<slug>.data.js` — auto-generated baked payload (`window.QE_DATA = {...}`). **Do not edit.**
- `data/_counts.js` / `data/_topics.js` — auto-generated indexes for dashboard counts + weakness analysis. **Do not edit.**
- `docs/UX-AUDIT.md` — the design/architecture rationale and feature roadmap. Good background; this file (§7) tracks the live state.
- `how-to-add-new-exam.md` — human-facing guide for adding/editing exams: the `.txt` format, the strict-vs-forgiving rules, and the validator.
- `.github/workflows/deploy.yml` — CI: on PRs validates `.txt` (`--strict`); on push to `main` bakes `data/*`, deploys the site to GitHub Pages, and best-effort commits the baked data back for the offline copy. **Stages files by an explicit allow-list** (`cp index.html report.html manifest.webmanifest sw.js icon.svg .nojekyll …`) — **any new root HTML/asset must be added there or it won't deploy.**
- `manifest.webmanifest` + `sw.js` + `icon.svg` — PWA: make the online site installable and offline-capable (service worker: network-first for pages, stale-while-revalidate for assets/data). Registered from `app.js`.
- `.nojekyll` — disables Jekyll (which hides `_`-prefixed files like `data/_counts.js` / `_topics.js`). Staged into the deploy artifact and kept at the repo root as a safety net for any branch-based serving. **Don't delete.**

**Scale:** 22 modules · 15,442 questions · 313 exams (summed from `data/_counts.js`).

**Two run modes** (toggled with the `mode` key, persisted as `qe:mode`): **Training** (instant per-question correction) and **Exam** (answer a full set, correction + /20 grade at the end). The viewer also has cyclable **loadout presets** (`PRESETS`, `app.js:583` — Default / Velocity / Exam / Study / Lightning) that just preset the pomodoro work/break minutes; cycle with `T` / `8`.

**Keyboard is the whole point.** The full key map lives in `README.md` (§"Keyboard") and the in-app help (`?`). The discovery surface is the command palette (`Ctrl`/`Cmd`+`K`) — a dependency-free fuzzy launcher (`showCommandPalette`, `app.js:1389`) that jumps to any module or runs any command.

## 5. Rules For Editing This Code
- **Stay zero-dependency.** No framework, no bundler, no `package.json`. The point is that it loads instantly and runs from a ZIP.
- **Plain `<script>` tags only — no ES module `import`/`export`.** Anything that needs a server or build step breaks the `file://` offline guarantee.
- **Never hand-edit generated files** (`data/*.data.js`, `data/_counts.js`, `data/_topics.js`). Edit the `.txt` source, then run `node tools/build-data.js` and commit the result.
- **Adding a module** = (1) drop a `.txt` under `data/<sem>/`, (2) add an entry to `assets/modules.js`, (3) create `modules/<slug>.html` (copy an existing one, change the title, `data-module`, and the `.data.js` path), (4) rebuild.
- **All state is `localStorage` under the `qe:` prefix** (`assets/app.js:31`, accessed only via the `LS` helper). New keys must be backward-compatible — older records simply lack new fields and must degrade gracefully (this is how analytics was added without a migration). The live schema:
  - `answers.<slug>` → `{ qIdx: { picked, checked, correct, partial, unknown, ts, tMs, n } }` (per-question result; `ts`/`tMs`/`n` = last-seen, time-on-task, review count).
  - `progress.<slug>`, `current.<slug>` (cursor), `exam.<slug>.<examIndex>` (per-exam session).
  - `activity` → `{ 'YYYY-MM-DD': { answered, correct, ms } }` (bounded ~400 days; powers streaks/trend).
  - UI/config singletons: `theme`, `mode`, `presetIndex`, `autoAdvance`, `sidebarHidden`, `multiSelect`, `focusMode`, `lastModule`, `pomoMinutes`, `pomo.*`, `showCorrectionOnCopy`, `analysis.*`.
- **No network calls, no CDNs, no fetched fonts.** Preserve the offline guarantee. Everything stays inline ES / SVG / CSS.

## 6. Fragile Bits & Landmines
- **The parser is extracted by regex — don't reformat it.** `tools/parser-bridge.js:20` slurps `parseQuestionsFile` out of `app.js` with `/function parseQuestionsFile\(text\) \{[\s\S]*?\n  \}\n/`. That function (`assets/app.js:1499–1625`) **must** keep the exact signature `function parseQuestionsFile(text) {` and close with a two-space-indented `}` (i.e. `\n  }\n`). Renaming it, changing its indentation, or adding another `\n  }\n`-shaped block inside it silently breaks the build. _Symptom if broken: build throws "parseQuestionsFile not found" or bakes garbage._
- **`.txt` parsing is heuristic and format-sensitive.** Headers (`<exam> Q<n> - <topic>`) are only detected **after the first `---`/`===` separator** and only when the previous line was a boundary (`isLikelyHeader`, `app.js:1522`). Stray separators, colons, or `?`/`!` endings change what counts as a header. Eyeball the question count after editing a `.txt`.
- **"Unknown correction" is excluded from accuracy on purpose.** Questions without a `Correction officielle - <exam> Q<n> = <letters>` line get `hasCorrection:false`, and the viewer marks answers `rec.unknown` so they don't pollute accuracy (`app.js:2157`). This is a deliberate honesty call — **don't "fix" it** to count them.
- **Corrections bind by an exact `exam`+`qn` match and silently drop otherwise** (`app.js:1562`). A `Correction officielle - …` line whose exam name or number doesn't match its question — even by one space (`Juin2025` vs `Juin 2025`) — just doesn't attach; the question then shows "no official answer" with no error anywhere. **Run `node tools/check-data.js`** after editing any `.txt`; it exists to catch exactly this.
- **`BAREME` grade tables are hard-coded official curves.** `app.js:154` holds the FMPM /20 conversion for 50/40/30/20-question papers; other sizes are scaled onto the /50 curve. These are real published values — don't recompute or "simplify" them.
- **`localStorage` ~5 MB ceiling.** Answer maps and the bounded ~400-day `qe:activity` log stay small. If a future feature stores full per-attempt history, move **that feature** to IndexedDB — don't migrate everything.
- **Looks-dead-but-isn't (skip on cleanup):** the `.q-chip.flagged` CSS with nothing setting it, and `resetTrainingExamRange` (`app.js:72`, unused) are both reserved for the planned bookmark/review feature (R1 in `docs/UX-AUDIT.md`). Leave them.
- **`modules.js` is eval'd in a fake `window` at load time** (`tools/parser-bridge.js:28`). Keep it a plain `window.QE_MODULES = [...]` assignment — no imports, no DOM access — or the tools can't read it.
- **GitHub Pages runs Jekyll, which hides `_`-prefixed files.** `.nojekyll` (staged into the deploy artifact and at the repo root) is load-bearing: without it `data/_counts.js` / `_topics.js` 404 → dashboard counts + weakness analysis break. Don't delete it.
- **Service worker caches aggressively.** `sw.js` is network-first for navigations (only caching `res.ok`), stale-while-revalidate for assets/data, so a deploy shows up within a reload or two online. If you change caching behaviour, bump `CACHE` in `sw.js` to evict old entries. It runs only on http(s), never `file://`.
- **Escape every data-derived value before `innerHTML`.** All rendering uses `innerHTML` template strings, so any field from question data or `localStorage` (`q.text`, `q.exam`, `q.topic`, `module.name`, `grp.name`, `grp.url`, the search box) must go through `escapeHtml()` — real medical text contains `<`/`>`/`&`. Exception: `computeReminders()` returns intentional `<b>…</b>` HTML with its dynamic parts already escaped at the source, so it's injected raw on purpose. Toasts are safe (they use `.textContent`).

## 7. Current State
- **Last shipped:** Smarter **AI report** (`report.html`): the generated prompt/.txt now leads with a computed **statistical analysis** (totals, wrong-vs-partial, per-module, per-topic frequency ranking), and instructs the AI to **classify each error** (🧠 connaissance / 🔗 raisonnement / 🪤 piège QCM) and surface **notions à forte rentabilité pédagogique**. On-page stats panel mirrors it. Also: offline-safe clipboard (`copyText`/`execCopy`), and the duplicate top-bar Report link is hidden on report.html.
- **Earlier:** New **`report.html`** ("AI report" page) — multi-select modules → one Markdown prompt built from your wrong/partial answers (with official corrections), copy-to-clipboard + .txt download; reuses `collectModuleReport`. Plus a **mobile/tablet responsive pass** in `style.css` (topbar wraps, single-column viewer/grid, ≥38–42px tap targets, near-fullscreen overlays, `hover:none` lift fixes). Added `report.html` to the deploy allow-list + SW shell (`CACHE` → `qe-v3`).
- **Before that:** Bug-fix pass — **consistent HTML-escaping** of all data-derived fields (`q.exam`, `q.topic`, `module.name`, `grp.name`, `grp.url`, search input) that were escaped in some render paths but raw in others; medical text and module names contain `<`/`>`/`&`, so a hand-added topic like `IRC <30` would have broken rendering. Also: SW now only caches successful navigations (a 404 can't get stuck as the offline page) + precaches `icon.svg` (`CACHE` bumped to `qe-v2`); `pctOf()` guards exam-score `%` against 0-question groups (`NaN%`); the viewer's offline-load error is now user-facing instead of telling web users to run a Node command.
- **Before that:** installable offline PWA (`sw.js` + `manifest.webmanifest`) + GitHub Actions → Pages deploy (`deploy.yml`); fixed 5 `Correction proposée` lines that silently swallowed option E; strengthened `check-data.js`.
- **Recently before that:** `how-to-add-new-exam.md` + the `check-data.js` validator and `tools/parser-bridge.js`; exam answer-sheet + FMPM /20 grade + error report (PR #9); command palette, analytics, focus mode (PR #8); the docs pass.
- **Working on now:** nothing active — authoring workflow, data fixes, and the PWA/deploy just landed.
- **Next up** (roadmap in `docs/UX-AUDIT.md`, pick ≤3):
  1. **R1 — Bookmark / mark-difficult + review queue** (wire the dormant `.flagged` chip; keys `B`/`X`).
  2. **R2 — Global question/topic search** inside the command palette (currently matches modules only).
  3. **R4 — Export/import progress** as one JSON blob of all `qe:*` keys (backup + move between devices).

## 8. Update Protocol (Verbatim)
> **For the AI Assistant:** When asked to "Update CONTEXT.md":
> 1. Re-run Phase 0 — check for new `GEMINI.md` / `CLAUDE.md` / `.github/` files.
> 2. Re-scan the tree, manifests, and `.github/workflows/` for drift.
> 3. Read our recent conversation for new decisions, fragile bits discovered, or shifted goals.
> 4. Refresh the `_Last synced_` line with today's date and current commit SHA.
> 5. Rewrite — do not append. One clean source of truth. Preserve still-true content, revise the rest.
> 6. Keep §1 and §2 in plain English. Keep the file under ~350 lines.
