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

## Rebuild after editing
```sh
node tools/build-curriculum.js   # bakes *.txt → _curriculum.js
```
Commit the regenerated `_curriculum.js` (offline mode reads it). CI also runs
this on push to `main`, so editing a `.txt` on github.com publishes itself.
