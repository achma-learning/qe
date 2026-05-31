# qe — MCQ Question Bank — AI Context File
_Last synced: 2026-05-31 @ c3a7004_

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
  Over HTTP it can also live-parse the original `.txt` via `fetch()` if a baked data file is missing, so you can edit a `.txt` and just reload.
- **Run offline:** Double-click `index.html`. Works on `file://` because the questions are pre-baked into `data/<slug>.data.js` and loaded with plain `<script>` tags.
- **Rebuild data (after editing any `.txt` or the parser):**
  ```sh
  node tools/build-data.js
  ```
  Regenerates `data/*.data.js`, `data/_counts.js`, `data/_topics.js`. Commit the regenerated files — offline mode reads them.
- **Required env vars:** _None._ The app makes no network calls and needs no keys.

## 3. Tech Stack
- **Language + runtime:** Vanilla JavaScript (browser ES + Node for the one build script). No TypeScript. No declared runtime version — there is no `package.json`, lockfile, or `.nvmrc`. HTML5 + CSS3.
- **Framework / key libraries:** **None.** Zero dependencies, no bundler, no package manager, no CDN. This is a hard constraint, not an accident (see §5).
- **What kind of project:** Static multi-page web app (one dashboard + one viewer page per module) plus a single Node CLI build script.
- **External services:** None at runtime. Content was sourced from e-qe.online; the app only ever *links out* to those exam pages when a URL hint line is present.

## 4. Code Map (The Important Files Only)
- `index.html` — **open this first.** The dashboard. Loads `modules.js`, `_counts.js`, `_topics.js`, `app.js`, then calls `QE.bootDashboard()`.
- `assets/app.js` — **the monolith (~3,300 lines).** The entire app: `.txt` parser, dashboard, viewer, keyboard layer, command palette, analytics engine, exam grading, focus mode, pomodoro, report export. Everything lives in one IIFE exposing `window.QE.bootDashboard` / `bootViewer`.
- `assets/modules.js` — hand-maintained **manifest**: `window.QE_MODULES = [{ sem, slug, name, file }]` + `QE_SEMESTERS` labels. The source of truth for which modules exist and where their `.txt` lives.
- `assets/style.css` — all styling (~855 lines): dark/light themes, command palette, focus mode, "dynamic island" timer, accessibility (`:focus-visible`, `prefers-reduced-motion`).
- `tools/build-data.js` — Node script that bakes each `.txt` → `data/<slug>.data.js` and writes `_counts.js` / `_topics.js`. **Watch out:** it pulls `parseQuestionsFile` out of `app.js` by regex (see §6).
- `modules/<slug>.html` — one viewer page per module. Carries `<div id="qe-root" data-module="<slug>">`, loads that module's `.data.js`, calls `QE.bootViewer()`. All 22 are near-identical.
- `data/<sem>/<module>.txt` — **the only hand-edited data.** Source question files (semesters s5–s10).
- `data/<slug>.data.js` — auto-generated baked payload (`window.QE_DATA = {...}`). **Do not edit.**
- `data/_counts.js` / `data/_topics.js` — auto-generated indexes for dashboard counts + weakness analysis. **Do not edit.**
- `docs/UX-AUDIT.md` — the design/architecture rationale and feature roadmap. Good background; this file (§7) tracks the live state.

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
- **The parser is extracted by regex — don't reformat it.** `tools/build-data.js:20` slurps `parseQuestionsFile` out of `app.js` with `/function parseQuestionsFile\(text\) \{[\s\S]*?\n  \}\n/`. That function (`assets/app.js:1499–1625`) **must** keep the exact signature `function parseQuestionsFile(text) {` and close with a two-space-indented `}` (i.e. `\n  }\n`). Renaming it, changing its indentation, or adding another `\n  }\n`-shaped block inside it silently breaks the build. _Symptom if broken: build throws "parseQuestionsFile not found" or bakes garbage._
- **`.txt` parsing is heuristic and format-sensitive.** Headers (`<exam> Q<n> - <topic>`) are only detected **after the first `---`/`===` separator** and only when the previous line was a boundary (`isLikelyHeader`, `app.js:1522`). Stray separators, colons, or `?`/`!` endings change what counts as a header. Eyeball the question count after editing a `.txt`.
- **"Unknown correction" is excluded from accuracy on purpose.** Questions without a `Correction officielle - <exam> Q<n> = <letters>` line get `hasCorrection:false`, and the viewer marks answers `rec.unknown` so they don't pollute accuracy (`app.js:2157`). This is a deliberate honesty call — **don't "fix" it** to count them.
- **`BAREME` grade tables are hard-coded official curves.** `app.js:154` holds the FMPM /20 conversion for 50/40/30/20-question papers; other sizes are scaled onto the /50 curve. These are real published values — don't recompute or "simplify" them.
- **`localStorage` ~5 MB ceiling.** Answer maps and the bounded ~400-day `qe:activity` log stay small. If a future feature stores full per-attempt history, move **that feature** to IndexedDB — don't migrate everything.
- **Looks-dead-but-isn't (skip on cleanup):** the `.q-chip.flagged` CSS with nothing setting it, and `resetTrainingExamRange` (`app.js:72`, unused) are both reserved for the planned bookmark/review feature (R1 in `docs/UX-AUDIT.md`). Leave them.
- **`modules.js` is eval'd in a fake `window` at build time** (`build-data.js:25`). Keep it a plain `window.QE_MODULES = [...]` assignment — no imports, no DOM access — or the build can't read it.

## 7. Current State
- **Last shipped:** Exam answer-sheet view + FMPM /20 grading, downloadable per-module error report, loadout sync, dashboard "continue/home" ordering (commit `578e809`, merged via PR #9).
- **Recently before that:** Command palette (`Ctrl`/`Cmd`+`K`), 100%-local learning analytics (streaks, 14-day trend, weakness/strength + recency reminders), focus mode (`Z`), readability/a11y polish (PR #8).
- **Working on now:** This documentation pass (`CONTEXT.md`).
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
