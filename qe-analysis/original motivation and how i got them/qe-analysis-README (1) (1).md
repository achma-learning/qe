# qe-analysis

A Claude skill that turns a corpus of past exam questions (QEs — *questions d'examen*) into a high-yield, ranked, deduplicated study document — cross-matched against the year's official lesson program and exported in your chosen format (`.txt`, `.docx`, or `.pdf`).

> **Truly domain-agnostic.** Built for any medical specialty (anapath, cardio, gastro, traumato, gynéco, pharmaco, histo, anatomie, médecine interne…), but works equally for legal exams (droit civil, pénal), engineering, history, sciences, or any other field that uses topic-tagged past-paper banks. The skill **adapts to the subject** rather than imposing a medical template on every input.

---

## Design philosophy

The skill is a **procedural framework**, not a content library. Like a smart tool dispatcher (think DeepSeek-style intelligent tool selection), the skill provides :

- Generic scripts for parsing, matching, and rendering
- A pluggable synonyms system — load an existing domain file, extend it, or build one from scratch
- A flexible aide-mémoire structure that Claude labels appropriately for each subject

Claude (the LLM running the skill) brings the domain intelligence :
- Identifies what subject the question bank covers
- Picks or builds the optimal synonyms vocabulary
- Decides the right cheatsheet structure for that field
- Synthesizes the high-yield content with domain-appropriate framing

---

## What it produces

| Section | Content |
|---|---|
| **PARTIE 1** | Lessons ranked by frequency (descending) — table view |
| **PARTIE 2** | Statistics : average questions per topic per exam, % of an exam per lesson |
| **PARTIE 3** | Deduplicated high-yield Q&A per topic, in strict rank order (1→N) |
| **PARTIE 4** | Topics **HORS programme** (cours annulé) — with a mandatory disclaimer |
| **Aide-mémoire** | Cross-cutting cheatsheet — slot labels adapt to the domain |

**Recommended deduplication strategy** : if a question appears across 4 sessions, it's listed *once* with all distinct correct answers merged and all wrong-but-tempting traps (`⚠`) surfaced. Pitfalls are the highest-value content for exam prep.

---

## Quick example — medical use case

> *— I have my Anapath QE file with 8 years of past papers, can you build me a high-yield revision document ?*

Claude triggers the skill and :

1. **Identifies the domain** : *Anatomopathologie* (from filename + topic distribution)
2. **Asks for the 5 inputs** :
   - 📄 Question bank `.txt`
   - 📚 Official course PDF *(optional)*
   - 📋 List of this year's official lessons (with professors)
   - 🔗 Direct link per lesson (Google Drive, Slides…)
   - 📎 Supplementary resources *(optional)*
3. **Loads the right synonyms file** : merges `medical_general_fr.json` + `medical_acronyms_fr.json`
4. **Parses + matches + flags ambiguous matches** for user confirmation
5. **Synthesizes deduplicated content** with `⚠ FAUX` traps explicit
6. **Picks the aide-mémoire labels** appropriate for anapath (OMS classifications, IHC markers, pitfalls, carcinogenic sequences)
7. **Asks for the output format** — `.txt`, `.docx`, `.pdf`, or all three
8. **Generates the file(s)**

---

## Quick example — non-medical use case

> *— I have past papers for Droit civil concours, can you do the same ?*

Same workflow. Claude :

1. **Identifies the domain** : *Droit civil*
2. **Loads `legal_fr.json`** as the synonyms file
3. **Adapts the aide-mémoire slot labels** :
   - `classifications` → *Classifications des infractions*
   - `markers` → *Éléments constitutifs / Conditions d'application*
   - `pitfalls` → *Confusions classiques (RC délictuelle vs contractuelle, etc.)*
   - `sequences` → *Chaîne causale de la responsabilité*
4. **Synthesizes content with legal framing** : `📖` lines now read like `Code civil art. 1240 ; Cass. civ. 2e, 17 mars 2011`

Same skill, completely different output. **The skill never assumed medical.**

---

## The strict ranking block format

Every lesson in PARTIE 3 uses this exact header :

```
═══════════════════════════════════════════════════════════════════
[RANG 1] CANCER DU SEIN
Pr. Rais • ~6.79 Q/examen
📖 Classification OMS 2019 des tumeurs du sein
📎 Cours officiel : Ouvrir le cours officiel ↗
═══════════════════════════════════════════════════════════════════
```

In `.txt` the `📎` line shows the actual URL. In `.docx`/`.pdf`, "Ouvrir le cours officiel ↗" is a clickable hyperlink.

Below the header :

```
* Le grade SBR — 3 critères UNIQUEMENT :
-Différenciation glandulaire
-Atypies cytonucléaires
-Index mitotique
-⚠ NE FONT PAS PARTIE du SBR : stroma-réaction, emboles, localisation
📋 Vu : N2017 Q5, N2019 Q12, R2023 Q3 (3×)
```

---

## The HORS programme disclaimer

For any topic in the question bank that doesn't match an official lesson this year, the skill places it in PARTIE 4 with a mandatory disclaimer :

> ⚠ **DISCLAIMER** — These lessons are NOT in the 2026 exam program.
> *Cours annulé — NOT officially scheduled.*
> **USE AT YOUR OWN RISK — BUT GOOD TO KNOW.**

Rendered as a red-bordered danger box in `.docx`/`.pdf`.

---

## Architecture

```
qe-analysis/
├── SKILL.md                          # Domain-agnostic workflow (entry point)
│
├── references/
│   ├── domain_adaptation_guide.md   # REASONING guide — how to adapt to a new domain
│   ├── output_format_template.md    # The exact output document structure
│   ├── content_schema.md            # JSON schema for content.json (renderer contract)
│   ├── parsing_patterns.md          # Question-bank file formats (Format A/B/C/D)
│   └── synonym_examples/            # Starter synonym files (domain-specific)
│       ├── medical_general_fr.json
│       ├── medical_acronyms_fr.json
│       ├── legal_fr.json
│       └── engineering_en.json
│
└── scripts/
    ├── analyze_questions.py         # Parse the question bank → analysis.json
    ├── match_lessons.py             # Cross-match (--synonyms <file>, fully pluggable)
    ├── generate_txt.py              # Render .txt from content.json
    ├── generate_docx.js             # Render .docx (Node.js + docx package)
    └── generate_pdf.py              # Convert .docx → .pdf via LibreOffice
```

### The 7-step pipeline

```
Step 0 :  Identify the domain  ─────► (Claude decides)
                                       │
Step 1 :  Parse question bank  ──────► analyze_questions.py ──► analysis.json
                                       │
Step 2 :  Gather 5 inputs from user
                                       │
Step 3 :  Decide synonyms strategy  ──► (Claude picks/builds synonyms.json)
                                       │
Step 4 :  Cross-match topics  ──────► match_lessons.py --synonyms ──► matched.json
                                       │
Step 5 :  Synthesize per-topic content (Claude reads raw QEs + sources)
                                       │
Step 6 :  Pick aide-mémoire structure  ──► (Claude labels slots for THIS domain)
                                       │
Step 7 :  Pick format + render  ─────► generate_{txt,docx,pdf} ──► final document
```

The scripts are **domain-neutral**. Claude provides the domain intelligence at each decision point.

---

## Scripts — usage details

### `analyze_questions.py`

```bash
python3 scripts/analyze_questions.py <question_bank.txt> --output analysis.json
```

Auto-detects the file format (FMPM-style headers `# Normal 2017 Q1 - topic`, markdown headers, CSV). Emits stats + raw question text per topic. Domain-neutral.

### `match_lessons.py`

```bash
python3 scripts/match_lessons.py analysis.json lessons.json \
    --synonyms /tmp/synonyms.json \
    --output matched.json
```

**Now accepts an optional `--synonyms <file>` argument.** The synonyms file is a JSON with the schema :

```json
{
  "domain": "<label>",
  "noise_words": ["word1", "word2"],
  "synonyms": [
    ["term_a", "term_a_variant", "term_a_acronym"],
    ["term_b", "term_b_synonym"]
  ]
}
```

Without a synonyms file, the matcher falls back to pure normalization + Jaccard scoring (works decently but misses domain-specific synonyms).

Matches above 0.75 are auto-accepted. Below 0.90 they're flagged as **ambiguous** — the skill asks you to confirm.

### `generate_txt.py` / `generate_docx.js` / `generate_pdf.py`

All three consume the same `content.json` (Claude-written) and produce the final document. Schema in `references/content_schema.md`. The renderers are completely domain-neutral — they just print whatever JSON they get.

---

## Starter synonym files included

| File | Coverage |
|---|---|
| `medical_general_fr.json` | Broad French medical vocabulary — organs, specialties, generic terms |
| `medical_acronyms_fr.json` | French medical acronyms — SCA, IDM, RGO, MICI, GEU, VIH, IRA, AVK, etc. |
| `legal_fr.json` | French legal vocabulary — droit civil, pénal, contrats, RC |
| `engineering_en.json` | Generic engineering vocabulary in English — stress, strain, moment, beam |

You can extend any of these, combine them, or create new ones for domains we don't ship.

---

## Why deduplication (recommended strategy)

The skill recommends Option B (dedup + corrections regroupées + FAUX explicites) because :

- **Repeated questions = priority signals.** A question that appears in 4 sessions is the prof's priority for next year, not 4 separate items to memorize.
- **FAUX traps are the real teaching value.** What students fail on isn't the correct answer — it's the wrong-but-tempting distractor. Surfacing these explicitly with `⚠` gives concrete elimination signals during the exam.
- **Compact without losing distinct wordings.** Different sessions phrase the same concept differently. Merging into one entry preserves all distinct true facts and all distinct traps, without listing the question 4 times.
- **Citations preserve auditability.** Optional `📋 Vu : N2017 Q5, R2024 Q3 (2×)` lines tell you exactly where each fact came from.

---

## Installation

Drop `qe-analysis.skill` into Claude's skills folder. Next time you upload a question bank and ask Claude to analyze it, the skill triggers automatically. The first thing Claude does is identify the domain — if it's clear from the filename or contents, it proceeds; if not, it asks.

---

## Dependencies

- **Python 3** standard library only (no pip installs needed)
- **Node.js + `docx` npm package** for `generate_docx.js` — already in Claude's environment
- **LibreOffice headless** for `generate_pdf.py` — already available

---

## What this skill is NOT

- ❌ A medical-only tool. It works for any domain.
- ❌ A grader for individual MCQs. It's for **corpus-level analysis** of many past exams.
- ❌ A content generator that invents medical/legal facts. Claude reads YOUR question bank and YOUR official sources and synthesizes from those.
- ❌ A black box that imposes a fixed structure on every domain. The aide-mémoire slot labels, the `📖` source line wording, and the content framing all adapt per subject.

---

## Credits

Originally built for FMPM 2026 concours preparation (anatomopathologie). Refactored to be truly domain-agnostic — the skill now encodes a *workflow* and a *renderer*, with all domain-specific intelligence provided by Claude at run-time.
