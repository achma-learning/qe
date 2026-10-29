# data/liste cours — curriculum source files

These are the source outlines shown on **curriculum.html** (the "Curriculum"
nav link). One file per semester plus a complete file.

## Files
- `s1 liste cours.txt` … `s10 liste cours.txt` — one semester each.
- `curriculum_FMPM_S1-S10.txt` — the complete program (the "Download Complete
  Curriculum" button links to this one).
- `_curriculum.js` — **auto-generated** by `tools/build-curriculum.js`. Do not edit.

A semester file may be absent (e.g. `s4`) — the page renders a
"Curriculum non disponible" placeholder for it and disables its download.

## Format
Plain UTF-8 text. First line is the semester tag (`S1`). Every other line is a
`-` bullet whose **indentation** sets the level (2 spaces per level):

```
S1
- Module
  - Sub-module          (optional level)
    - Course
  - Course              (a module can hold courses directly, no sub-module)
- Another module
  - Course
```

- Hierarchy is inferred from indentation, so any depth works.
- Blank lines are ignored (use them to space modules apart).
- A line starting with `#` is treated as professor/metadata and is **never
  shown** — keep professors/authors/volumes out of the displayed content.

## Lesson filter (`lesson-aliases.json` → `data/_lessons.js`)
The module viewer's "Filtrer par cours" (🏷 button / `C` key) uses these same
files: `tools/build-lessons.js` maps every question topic onto a lesson of the
module named by `cur` in `assets/modules.js`, and writes `data/_lessons.js`.
`lesson-aliases.json` holds the hand-made fixes (abbreviations, catch-all
topics). Run `node tools/build-lessons.js --report` to see every topic and
where it was mapped.

## Per-question classification (`classification/<slug>.json`)
The topic mapping above is a guess from one free-text tag. A module can also
be classified **question by question**, by reading each one. That
classification wins over the topic guess, and questions it doesn't list keep
the guess:
```json
{ "module": "Pathologie cardiovasculaire",
  "q": {
    "Ratt 2025#9":  { "c": ["La maladie veineuse thrombo-embolique"], "flags": ["tag_mismatch"], "why": "Signe de Homans = TVP" },
    "Ratt 2025#23": { "c": ["Fibrillation atriale"], "case": "Ratt 2025#23-25" } } }
```
- Each key is `<exam>#<qn>`.
- `c` holds 1–2 cours (or sous-module) names, written exactly as in the curriculum. The file stores names, not indexes, so reordering the curriculum is safe.
- `case` links the questions of one split clinical case.
- `flags`, `conf` and `why` are review notes, and the build ignores them.

Workflow:
```sh
node tools/classify-prep.js <slug> --out <dir>    # worksheets: cours list + questions, ~150 per chunk
#   → one qe-classifier agent per chunk (.claude/agents/qe-classifier.md) → <dir>/<slug>/out-NN.json
node tools/classify-check.js <slug> --merge <dir>/<slug>/out-*.json   # merge + validate
node tools/classify-check.js <slug> --flags       # coverage, count per cours, flagged questions
node tools/build-lessons.js                       # bakes it into data/_lessons.js (QE_LESSONS[slug].qs)
```
After new exams are added, `classify-prep.js <slug> --only-missing` makes worksheets for just the new questions.

## Rebuild after editing
```sh
node tools/build-curriculum.js   # bakes *.txt → _curriculum.js
node tools/build-lessons.js      # re-maps question topics → lessons (data/_lessons.js)
```
Commit the regenerated `_curriculum.js` (offline mode reads it). CI also runs
this on push to `main`, so editing a `.txt` on github.com publishes itself.
