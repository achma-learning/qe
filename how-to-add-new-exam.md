# How to add a new exam

You add exams by **editing the plain `.txt` files** in the `data/sX/` folders — exactly like you guessed. No app, no database. This guide shows the exact format, the few rules that actually matter, and a one-command check so a stray space never silently eats a question.

---

## TL;DR (3 steps)

1. Open the right file, e.g. `data/s6/Cardio - Ccv.txt`, and paste your new exam at the **bottom** (format below).
2. Run the checker: **`node tools/check-data.js`** → fix anything it flags.
3. Rebuild + refresh: **`node tools/build-data.js`**, then reload the page.

That's it. Steps 2 and 3 need [Node](https://nodejs.org) installed.

---

## Where the files are

```
data/
  s5/  Anatomie Pathologique.txt   Pharmacologie.txt   …
  s6/  Cardio - Ccv.txt            Gastro - Viscérale.txt   …
  …
```

Each `.txt` is **one module** and holds **many exams**. To add an exam to a module, edit that module's `.txt`. (To add a brand-new *module*, see the last section.)

---

## The format (copy this template)

Paste this at the end of the file and edit it. The `---` line, the question, its options, and the correction are the whole pattern — repeat per question.

```text
---

Juin 2025 (Correction officielle) : https://www.e-qe.online/exam/xxxxxxxx

Juin 2025 Q1 - Cardiologie

Patient de 60 ans, douleur thoracique depuis 2 heures. Le diagnostic
le plus probable est :

A] Syndrome coronarien aigu
B] Péricardite
C] Embolie pulmonaire
D] Dissection aortique
E] Reflux gastro-œsophagien

Correction officielle - Juin 2025 Q1 - Cardiologie = A

Juin 2025 Q2 - Cardiologie

Deuxième question…

A] …
B] …

Correction officielle - Juin 2025 Q2 - Cardiologie = B C
```

Piece by piece:

- **`---`** — a line of three or more dashes. Starts a new exam block.
- **URL line** *(optional)* — `<Exam> (Correction officielle) : https://…`. Lets the app link out to the official correction. `(Correction collective)` works too.
- **Question header** — `<Exam> Q<number> - <Topic>`. The `- <Topic>` part is optional (topics power the weakness analysis, so they're worth adding).
- **Question text** — one or more lines, right under the header.
- **Options** — one per line, starting with `A]` `B]` `C]` … (`A.` or `A)` also work). Up to `E`.
- **Correction** *(optional)* — `Correction officielle - <Exam> Q<number> = <letters>`. List every correct letter: `A`, or `A C`, or `ACE` — all fine.

A question with **no** correction line still works; it just won't count toward your accuracy (the app marks it "no official answer" on purpose).

---

## The 4 rules that actually matter

Most things are forgiving (see below), but these will bite:

1. **The correction's exam name + Q number must match the question's *exactly*** — same spelling, capitals, and spaces. `Correction officielle - Juin2025 Q1` (missing space) will **not** attach to `Juin 2025 Q1`. The answer just vanishes with no error. ← this is the #1 mistake.
2. **There must be a `---` (or a URL line) above your first question** in the file. Existing files already have one, so this only matters if you start a fresh file.
3. **Each option starts at the very start of the line:** `A]` — not `A ]` (no space before the bracket), and no spaces before the `A`.
4. **The header needs a capital `Q` then the number:** `Q1`, `Q12` (a space like `Q 1` is okay).

---

## Will a space break it? (forgiving vs strict)

**Forgiving — go ahead:**
- Leading/trailing spaces on any line (trimmed automatically).
- Blank lines between things — any number, anywhere.
- Spaces around `=`, `-`, and `Q` (`Q1`, `Q 1`, ` = A C ` all fine).
- Writing correct answers as `ACE`, `A C E`, or `A, C, E`.
- Decorative stuff at the top of the file (the title and the "= 50 Questions" tallies) — the app ignores everything above the first `---`.

**Strict — see the 4 rules above:** the correction's exam name/number match, the `---` before the first question, the option-line start, and the `Q<number>` in the header.

You don't have to memorise this — the checker catches all of it.

---

## Check it before you ship

```bash
node tools/check-data.js            # check everything
node tools/check-data.js cardio     # just files matching "cardio"
```

It parses your files with the **same parser the website uses** and flags the silent mistakes:

| Warning | What it means | Fix |
|---|---|---|
| **orphan correction** (line N) | A `Correction officielle …` line didn't attach to any question | Make the exam name + Q number match the question's header exactly |
| **too few options** | A question has < 2 options — an option line didn't parse | Make sure each starts with `A]` `B]` … at the line start |
| **question before the first "---"** | Text above the first separator is ignored | Add a `---` line above your first question |
| **duplicate question** | Two questions share the same exam + Q number | Renumber one of them |

`✓ all clear` means you're good to build.

---

## See your changes

```bash
node tools/build-data.js
```

Then **refresh the page.** This step is required: the site loads the pre-baked `data/<module>.data.js` files (so it works offline), **not** the raw `.txt`. If you skip the rebuild, nothing changes on screen.

If you're pushing to GitHub, commit **both** the edited `.txt` **and** the regenerated `data/*.data.js` / `data/_counts.js` / `data/_topics.js`.

---

## Adding a whole new module (new subject)

Adding an exam to an existing subject is the common case (above). To add a *new subject* (a new `.txt`), there are three extra wiring steps:

1. Create `data/sX/Your Subject.txt` with your exams (same format).
2. Add one line to `assets/modules.js` — `{ sem, slug, name, file }` — matching the pattern of the entries already there.
3. Create `modules/<slug>.html` by copying an existing one and changing the title, the `data-module="<slug>"`, and the `data/<slug>.data.js` path.

Then run `node tools/check-data.js` and `node tools/build-data.js` as usual. (More detail in [`CONTEXT.md`](./CONTEXT.md).)
