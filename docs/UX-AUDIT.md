# QE Bank — UX Audit, Architecture & Roadmap

_Audit of the keyboard-driven, offline-first MCQ trainer at `achma-learning/qe`._
_Guiding order of preference: **Simplicity > Complexity · Speed > Visual effects ·
Keyboard > Mouse · Offline > Cloud · Learning effectiveness > Feature count.**_

---

## 0. TL;DR

This repo is already a strong, fast, offline-first, keyboard-first trainer
(~15,442 questions / 22 modules, one ~750 KB data file loaded per page). It does
**not** need a rewrite or a framework. The gaps versus the brief were a handful of
**power-user and analytics** features. The highest-impact ones are now implemented
in this branch:

1. **Command palette** (`Ctrl`/`Cmd`+`K`) — global fuzzy launcher.
2. **Learning analytics** — daily streaks, 14-day trend, per-topic recency,
   Strengths tab, and natural-language reminders.
3. **Focus mode** (`Z`) + readability/accessibility polish.

Everything stays 100 % static and offline (plain `<script>` tags, `localStorage`).

---

## 1. Complete UX audit

### What's already excellent (keep, don't touch)
- **Offline architecture** — `.txt` baked to `data/<slug>.data.js`, loaded via
  `<script>` so it runs from `file://`. Live-parse `fetch()` fallback for dev.
- **Performance** — only one module's payload loads per viewer page; dashboard
  prefetches a module's data on hover/focus. Memory stays low.
- **Keyboard coverage** — dashboard + viewer + overlays are fully drivable.
- **Honest scoring** — questions with no official correction are excluded from
  accuracy (`rec.unknown`). This is a subtle, correct call.
- **Two modes** — Training (instant correction) and Exam (full set, end review).

### Issues found & dispositions

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| 1 | No command palette despite "keyboard-first" goal | High | **Fixed** — `Ctrl/Cmd+K` |
| 2 | Analytics showed only weaknesses; no strengths/trends/streaks | High | **Fixed** — coach panel + Strengths tab |
| 3 | No "not reviewed recently / forgotten" signal | High | **Fixed** — per-answer `ts` → recency reminders |
| 4 | No time-on-task or review-frequency capture | Med | **Fixed** — `tMs`, `n` on each record |
| 5 | No true distraction-free mode (only sidebar-hide) | Med | **Fixed** — focus mode (`Z`) |
| 6 | Long question lines run edge-to-edge on wide screens | Med | **Fixed** — `.qtext { max-width: 72ch }` |
| 7 | No visible keyboard-focus ring; motion not reduced for a11y | Med | **Fixed** — `:focus-visible` + `prefers-reduced-motion` |
| 8 | Global search filters **modules only**, never questions/topics | Med | **Roadmap** (R2) |
| 9 | `.q-chip.flagged` CSS exists but nothing sets it (dead code) | Low | **Roadmap** (R1 — bookmark/difficult) |
| 10 | `resetTrainingExamRange` defined but unused | Low | Leave (harmless); remove if R1 lands |
| 11 | Help overlay is long; discoverability of new keys | Low | Mitigated — palette is now the discovery surface |

### Information hierarchy / readability
- Dashboard hero is good; the new **study-coach** row sits between hero and the
  module grid so "what should I do next" is answered before the long grid.
- Capped reading measure + antialiasing improve long-prompt legibility.
- Focus mode strips the top bar, sidebar, and non-essential controls — only the
  question, options, and minimal nav remain.

---

## 2. Architecture recommendations

**Keep the no-framework, no-bundler stance.** It's the reason this loads instantly
and works from a ZIP. Recommendations are evolutionary, not structural:

1. **Storage schema (current + added).** All under the `qe:` prefix in
   `localStorage`:
   - `answers.<slug>`: `{ qIdx: { picked, checked, correct, partial, unknown,
     ts, tMs, n } }` — `ts/tMs/n` added for recency, time-on-task, review count.
   - `progress.<slug>`, `current.<slug>`, `exam.<slug>.<ei>` — unchanged.
   - `activity`: `{ 'YYYY-MM-DD': { answered, correct, ms } }` — **new**, bounded
     to ~400 days, powers streaks/trends.
   - All additions are **backward-compatible** (older records simply lack the new
     fields and degrade gracefully).
2. **Analytics is a pure read-layer.** `computeGlobalStats`, `computeWeaknesses`,
   `computeActivity`, `computeReminders` only *read* `localStorage` + the baked
   `QE_TOPICS` index. Cheap to recompute on render at this scale; no caching or
   reactive layer needed.
3. **Watch the `localStorage` ceiling (~5 MB).** Answer maps are small (a few
   hundred KB even fully completed). The `activity` log is tiny. If a future
   feature stores per-attempt history, migrate **that feature** to IndexedDB
   rather than moving everything.
4. **Single source of truth for the parser.** `tools/build-data.js` extracts
   `parseQuestionsFile` from `app.js` by regex — keep that function's signature
   and closing brace shape stable (it still is).

---

## 3. Feature roadmap (ranked by impact)

**Shipped in this branch**
- ✅ Command palette (`Ctrl/Cmd+K`)
- ✅ Streaks + 14-day trend + study-coach reminders
- ✅ Strengths tab + topic recency ("seen N days ago")
- ✅ Time-on-task / review-frequency capture
- ✅ Focus mode + readability + a11y (focus-visible, reduced-motion)

**R1 — Bookmark + Mark-difficult + Review mode** _(high learning value)_
Wire the dormant `.flagged` chip. Add `qe:flags.<slug> = { qIdx: 'star'|'hard' }`,
keys `B` / `X`, sidebar markers, palette entries, and a **Review queue** that
re-quizzes flagged + recently-wrong questions across exams. _(Not selected for
this pass; lowest-risk next increment.)_

**R2 — Global question/topic search in the palette**
Extend the palette so a query also matches **topics** and (on a viewer) jumps to
matching questions, not just modules.

**R3 — Spaced-repetition "due" queue**
We already store `ts`, `tMs`, `n`. Add a light SM-2-style `due` date per wrong
question and a "Due today (N)" entry on the dashboard.

**R4 — Export / import progress**
One JSON blob of all `qe:*` keys → download/upload. Critical for a device-bound,
offline tool (backup + move between machines). ~40 lines, no deps.

**R5 — Cross-module "Theme browser"** (already a README TODO)
Re-mix questions by topic tag across exams using `QE_TOPICS`.

---

## 4. Implementation notes for shipped work

- **Command palette** — `showCommandPalette()` builds a context-aware item list
  (`buildPaletteItems`) of commands + all modules (+ viewer actions), scored by a
  dependency-free `fuzzyScore` (subsequence match, word-start/streak bonuses).
  It reuses the existing overlay system; a new `overlay._qeOwnsTyping` flag tells
  `handleOverlayKeys` to let unmatched keys type into the input instead of firing
  digit shortcuts.
- **Analytics** — `logActivity(correct, ms)` writes the daily record on first
  check (training) and on exam submit; `computeActivity()` derives current/longest
  streak + 14-day series; `computeReminders()` joins weakness slices + recency +
  streak into ranked NL strings with deep-links.
- **Focus mode** — a single `html.focus-mode` class toggled by `Z` / palette, with
  a floating "✕ Focus" exit button rendered outside the (hidden) top bar.

## 5. Offline guarantee

No change to the offline model. No network calls, no CDNs, no fonts fetched, no
build step at use time. Everything added is plain ES, inline SVG/CSS, and
`localStorage`. The app still works by unzipping and double-clicking `index.html`.
