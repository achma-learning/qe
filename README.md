# qe — MCQ Question Bank

> Cram for med-school exams by blitzing ~15,000 real past-exam questions — all keyboard, all offline, no login.

_TODO: add a screenshot or GIF showing the dashboard → answering a question → instant correction_

## What it is

`qe` turns years of past medical-school exam papers (saved as plain `.txt` files) into a fast multiple-choice trainer. Pick your answers, get instant correction, and let it track the topics you keep getting wrong. It ships with 22 modules — 15,442 questions across 313 exams, semesters 5 to 10 — but it'll happily run on any questions in the same text format.

The one weird thing: **zero dependencies, no build step, no server.** No npm, no framework. Download the repo as a ZIP, double-click `index.html`, and it runs offline — questions and all. Your progress lives in your browser and never leaves it.

## Install & run

Nothing to install. Pick one:

```bash
# Option 1 — just open it (fully offline)
# Download the repo as a ZIP, unzip, and double-click index.html

# Option 2 — local server (nicer if you're editing the question files)
python3 -m http.server 8000
# then open http://localhost:8000/
```

Edited a question `.txt` (or the parser) and want it baked back into the offline bundle? That's the only step that needs Node:

```bash
node tools/build-data.js
```

No environment variables, no API keys, no accounts. The app never touches the network.

## Usage

Open `index.html` and you land on the **dashboard** — every module grouped by semester. Type to search, or press a number to jump, then `Enter` to open one. Inside a module:

- `1`–`5` — toggle answer options
- `Space` / `Enter` — check your answer (press again to move on)
- `←` `→` — previous / next question
- `Z` — focus mode (everything but the question vanishes)
- `W` (on the dashboard) — weakness analysis: accuracy per topic, weakest first, with a jump straight to your first wrong answer

It's keyboard-first by design. The one shortcut worth memorising: **`Ctrl`/`Cmd` + `K`** opens a command palette that fuzzy-jumps to any module or runs any command. Press `?` anywhere for the full key map.

Two ways to study: **Training** (correction after every question) and **Exam** (answer a full set, then get a /20 grade on the real FMPM scale, plus a downloadable list of what you missed).

## What's new

Most recent shipped change: **exam answer-sheet view with FMPM /20 grading, and a per-module error report you can download.**

## Why I built this

I had years of past exam questions rotting in text files and no decent way to drill them — every quiz app wanted an account, a subscription, or wifi I didn't have. So I built the dumbest thing that works: one folder you open offline, drive entirely from the keyboard, that quietly remembers what you're bad at.

## License

No `LICENSE` file — this is a personal study project, so treat it as all-rights-reserved. The exam questions belong to their original authors (e-qe.online and the exam writers), not me.

## See also

- [`CONTEXT.md`](./CONTEXT.md) — the orientation file for AI assistants joining the project
- [`docs/UX-AUDIT.md`](./docs/UX-AUDIT.md) — design rationale, architecture notes, and what's on the roadmap
