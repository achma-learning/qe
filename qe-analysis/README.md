# qe-analysis — high-yield study documents

Drop a **PDF / Word / .txt** high-yield analysis document into your module's
folder below. It then shows up on **high-yield.html** automatically.

## How to add one
1. Build the document with the `qe-analysis` Claude skill (PDF, .docx or .txt).
2. Put the file in `qe-analysis/<slug>/` for that module (any filename).
3. Commit/push (or upload via github.com). CI runs `node tools/build-analysis.js`,
   which scans these folders and regenerates `_analysis.js` — the page reads that.
   To preview locally: `node tools/build-analysis.js` then open high-yield.html.

PDF and .txt get an inline preview on the page; Word (.docx) is offered as a download.

## Folder → module map
| Folder (`slug`) | Module | Semester |
|---|---|---|
| `s5-anatomie-pathologique` | Anatomie Pathologique | s5 |
| `s5-parasito-maladie-infectieuse` | Parasito - Maladie Infectieuse | s5 |
| `s5-pharmacologie` | Pharmacologie | s5 |
| `s5-radiologie` | Radiologie | s5 |
| `s6-cardio-ccv` | Cardio - CCV | s6 |
| `s6-gastro-viscerale` | Gastro - Viscérale | s6 |
| `s6-pneumo-chir-thoracique` | Pneumo - Chir Thoracique | s6 |
| `s7-glandes-endocrines-revetement` | Glandes Endocrines & Revêtement Cutané | s7 |
| `s7-hematologie-oncologie` | Hématologie - Oncologie | s7 |
| `s7-maladie-enfant` | Maladie De L'Enfant | s7 |
| `s7-neuro-neurochir` | Neuro - Neurochir | s7 |
| `s8-anapath-2` | Anapath 2 | s8 |
| `s8-appareil-locomoteur` | Appareil Locomoteur | s8 |
| `s8-immuno-genetique-med-interne` | Immuno - Génétique - Med Interne | s8 |
| `s9-gyneco-obstetricale` | Gynéco - Obstétricale | s9 |
| `s9-orl-ophtalmo-maxillo` | ORL - Ophtalmo - Maxillo | s9 |
| `s9-sante-mentale` | Santé Mentale | s9 |
| `s9-urgence-rea-soins-palliatifs` | Urgence - Réa - Soins Palliatifs - Plastique | s9 |
| `s10-med-legal-ethique` | Med Légal - Éthique - Travail - Déontologie | s10 |
| `s10-nephro-uro` | Néphrologie - Uro | s10 |
| `s10-sante-publique` | Santé Publique | s10 |
| `s10-synthese-therapeutique` | Synthèse Thérapeutique | s10 |

_`_analysis.js` is auto-generated — do not edit by hand._
