# qe — MCQ Question Bank

A keyboard-driven, static MCQ trainer built directly on top of the `data/*.txt`
question files.

## Run it

It's pure static HTML/CSS/JS — no build step. But `fetch()` on the question
files needs an HTTP origin, so serve the folder instead of opening `file://`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Files

- `index.html` — dashboard listing every module, grouped by semester
- `modules/<slug>.html` — one viewer page per `.txt` module
- `assets/modules.js` — manifest mapping slugs → `.txt` files
- `assets/app.js` — parser, viewer, keyboard layer, pomodoro, overlays
- `assets/style.css` — dark/light theme, dynamic island timer, etc.
- `data/<semester>/<module>.txt` — source question files

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

