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
- `assets/app.js` — parser, viewer, keyboard layer, pomodoro, overlays
- `assets/style.css` — dark/light theme, dynamic island timer, etc.
- `data/<semester>/<module>.txt` — source question files
- `data/<slug>.data.js` — baked offline payload (run `tools/build-data.js`)
- `data/_counts.js` — question + exam counts surfaced on the dashboard
- `tools/build-data.js` — Node script: parses every `.txt` → `data/*.data.js`

## Keyboard (the whole point)

Dashboard:
- `1`–`9` jump · `↑↓←→` / `hjkl` focus · `Enter` open
- `/` search · `M` switcher · `L` theme · `?` help

Viewer:
- `1`–`5` toggle option · `Space`/`Enter` check / continue · `R` reset (×2)
- `←→↑↓` / `N J K` prev/next · `G` goto Q# · `0`/`D` dashboard (×2)
- `T` / `8` cycle loadout · `Shift+T` table · `A` auto-advance toggle
- `P` pomodoro · `F` fullscreen (×2 to exit) · `H` sidebar · `L` theme
- `V` copy prompt · `Shift+V` AI menu · `Alt+C` copy AI-ready prompt
- `M` / `9` module switcher · `Shift+S` / `6` settings · `?` help · `Esc` close

State (progress, theme, loadout, pomodoro) persists in `localStorage`.

## TODO / future

1. PDF backups per exam
2. Link-out to the original e-qe.online exam page (already wired when the
   `// <exam> (Correction officielle) : https://...` hint line is present)
3. Per-exam "real exam" mode (full set, correction at the end)
4. Theme-based browsing (re-mix questions across exams by topic tag)

