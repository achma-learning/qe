# qe — MCQ Question Bank

A keyboard-driven, static MCQ trainer built directly on top of the `data/*.txt`
question files.

## Run it

Pure static HTML/CSS/JS — no install, no build step at use time. Three ways:

### 1. Offline — open `index.html` directly (download as ZIP)

The build step (already run, committed) bakes every `.txt` into
`data/<slug>.data.js`, loaded via plain `<script>` tags so it works on
`file://`. Just unzip the repo and double-click `index.html`.

### 2. Local HTTP server (recommended for dev)

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

This path also falls back to live-parsing the original `.txt` files via
`fetch()` if the baked data is missing, so you can edit a `.txt` and
reload without rebuilding.

### 3. Rebuild the offline bundle after editing `.txt` or the parser

```sh
node tools/build-data.js
```

Regenerates `data/*.data.js` and `data/_counts.js`.

## Files

- `index.html` — dashboard listing every module, grouped by semester
- `modules/<slug>.html` — one viewer page per `.txt` module
- `assets/modules.js` — manifest mapping slugs → `.txt` files
- `assets/app.js` — parser, viewer, keyboard layer, command palette, analytics
  engine (streaks/reminders), focus mode, pomodoro, overlays
- `assets/style.css` — dark/light theme, command palette, focus mode, study
  coach, dynamic island timer, accessibility (focus-visible, reduced-motion)
- `data/<semester>/<module>.txt` — source question files
- `data/<slug>.data.js` — baked offline payload (run `tools/build-data.js`)
- `data/_counts.js` — question + exam counts surfaced on the dashboard
- `tools/build-data.js` — Node script: parses every `.txt` → `data/*.data.js`

## Keyboard (the whole point)

Everywhere:
- `Ctrl`/`Cmd`+`K` **command palette** — fuzzy-jump to any module or run any
  command (theme, focus, analysis, mode, pomodoro…) from anywhere
- `Z` focus mode (distraction-free) · `L` theme · `F` fullscreen · `?` help · `Esc` close

Dashboard:
- `1`–`9` jump · `↑↓←→` / `hjkl` focus · `Enter` open
- `/` search · `C` continue · `W` analytics & weakness analysis · `M` switcher

Viewer:
- `1`–`5` toggle option · `Space`/`Enter` check / continue · `R` reset (×2)
- `←→↑↓` / `N J K` prev/next · `G` goto Q# · `0`/`D` dashboard (×2)
- `T` / `8` cycle loadout · `Shift+T` table · `A` auto-advance toggle
- `P` pomodoro · `F` fullscreen (×2 to exit) · `H` sidebar
- `V` copy prompt · `Shift+V` AI menu · `Alt+C` copy AI-ready prompt
- `M` / `9` module switcher · `Shift+S` / `6` settings · `Esc` close

State (progress, theme, loadout, pomodoro, focus mode, daily activity) persists in
`localStorage`.

## Learning analytics (100 % local, offline)

A small local engine turns your answers into guidance — no account, no network:

- **Streaks & trends** — a daily activity log (`qe:activity`) powers the 🔥 streak
  counter and the 14-day sparkline on the dashboard.
- **Weakness analysis** (`W`) — accuracy per **topic** and per **module**, lowest
  first, with a **Strengths** tab and "seen N days ago" recency. Jumps straight to
  the first wrong question.
- **Personalised reminders** — natural-language nudges on the dashboard
  ("You're struggling with Cardiology (58 %)", "You haven't reviewed Hypertension
  in 14 days", "Strongest area: …"), each deep-linking into the relevant module.
- Per-question **time-to-answer** and **review frequency** are recorded on each
  answer record (`tMs`, `n`, `ts`) for future spaced-repetition features.

Topic labels come from the existing `# <exam> Q<n> - <topic>` headers, baked into
`data/_topics.js` at build time.

## TODO / future

1. PDF backups per exam
2. Link-out to the original e-qe.online exam page (already wired when the
   `// <exam> (Correction officielle) : https://...` hint line is present)
3. Per-exam "real exam" mode (full set, correction at the end)
4. Theme-based browsing (re-mix questions across exams by topic tag)

