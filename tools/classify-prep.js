#!/usr/bin/env node
/* Writes the worksheets used to classify a module's questions by cours, one
 * question at a time (see .claude/agents/qe-classifier.md).
 *
 * Each worksheet holds the module's cours list (from the curriculum) and a
 * chunk of its questions — whole exams only, ~150 questions per chunk — with
 * the stem, the options, the current topic guess, and "CAS?" markers on the
 * runs of questions that look like one clinical case split over several
 * questions (same exam, consecutive Q, same topic or a follow-up stem with no
 * context of its own). The classifier confirms or splits those runs.
 *
 *   node tools/classify-prep.js <slug> [--out <dir>] [--size 150] [--only-missing]
 *
 * --only-missing skips questions already in classification/<slug>.json (e.g.
 * after new exams were added). Writes <out>/<slug>/chunk-01.txt … (default
 * out: <os tmpdir>/qe-classify). Read-only for the repo.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, loadParser, loadModules } = require('./parser-bridge');
const { CLASS_DIR, loadCurriculum, lessonGroups, findModuleNode, qKey, loadClassification } = require('./curriculum');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const slug = args.find((a, i) => !a.startsWith('--') && !['--out', '--size'].includes(args[i - 1]));
if (!slug) { console.error('usage: node tools/classify-prep.js <slug> [--out <dir>] [--size 150] [--only-missing]'); process.exit(1); }
const OUT = path.join(opt('--out', path.join(os.tmpdir(), 'qe-classify')), slug);
const SIZE = parseInt(opt('--size', '150'), 10);
const ONLY_MISSING = args.includes('--only-missing');

const m = loadModules().find(x => x.slug === slug);
if (!m) { console.error(`unknown module slug "${slug}"`); process.exit(1); }
const modNode = findModuleNode(loadCurriculum(), m);
if (!modNode) { console.error(`${slug}: curriculum module "${m.cur}" not found in ${m.sem.toUpperCase()}`); process.exit(1); }
const groups = lessonGroups(modNode);
const lessons = groups.flatMap(g => g.lessons);

// The current topic → lesson guess (data/_lessons.js), shown as a hint only.
let guessInfo = null;
try {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'data', '_lessons.js'), 'utf8'))(w);
  guessInfo = (w.QE_LESSONS || {})[slug] || null;
} catch (e) { /* no hint */ }
const guess = (q) => {
  const t = (q.topic || '').trim();
  const ts = guessInfo && guessInfo.topics[t];
  if (!ts || !ts.length) return '—';
  return ts.map(x => x >= 0 ? guessInfo.lessons[x] : '[' + guessInfo.groups[-x - 1] + ']').join(' | ');
};

const { questions } = loadParser()(fs.readFileSync(path.join(ROOT, m.file), 'utf8'));
const done = ONLY_MISSING ? new Set(Object.keys((loadClassification(slug) || {}).q || {})) : new Set();

// ----- candidate clinical cases ---------------------------------------------
// A follow-up question that can't stand alone: short, no patient described,
// and phrased as a continuation ("Pour confirmer…", "Le diagnostic…", "Votre CAT…").
// Only stems that point back at a patient already described count: a short
// generic stem ("La claudication intermittente :") is a new question, not a follow-up.
const BACKREF = /\b(ce|cette|cet|ces) (patient|patiente|malade|enfant|nourrisson|nouveau-n[ée]|homme|femme|monsieur|madame|diagnostic|tableau|cas|stade)\b|\bchez (lui|elle)\b|\bvotre (diagnostic|conduite|attitude|prise en charge|patient|patiente)|\bdans ce (cas|contexte)\b|^(pour (confirmer|compl[ée]ter|pr[ée]ciser)|le diagnostic (le plus probable|à retenir|retenu)|suite\b|la suite)/i;
const PATIENT = /\b\d+\s*(ans|mois|jours)\b|\bpatient|\bpatiente|\benfant|\bnourrisson|\bhomme|\bfemme|\bmonsieur|\bmadame|\bmr\b|\bmme\b|cas clinique/i;
const isFollowUp = (q) => BACKREF.test(q.text.trim()) && !/\b\d+\s*(ans|mois)\b/i.test(q.text);

const caseOf = new Map(); // question index → case label "exam#first-last"
for (let i = 0; i < questions.length;) {
  const a = questions[i];
  let j = i + 1;
  while (j < questions.length) {
    const prev = questions[j - 1], q = questions[j];
    if (q.exam !== a.exam || q.qn !== prev.qn + 1) break;
    if (!isFollowUp(q)) break;
    j++;
  }
  if (j - i > 1 && PATIENT.test(a.text)) {
    const label = `${a.exam}#${a.qn}-${questions[j - 1].qn}`;
    for (let k = i; k < j; k++) caseOf.set(k, label);
  }
  i = j;
}

// ----- worksheets ------------------------------------------------------------
const header = [];
header.push(`MODULE: ${m.name}  (slug ${slug}, ${m.sem.toUpperCase()}, curriculum: "${modNode.text}")`);
header.push('');
header.push('COURS — use these names exactly (a sub-module name = the whole group, only when no single cours fits):');
groups.forEach(g => {
  if (g.name) header.push(`  ## ${g.name}`);
  g.lessons.forEach(l => header.push(`    - ${l}`));
});
header.push('');
// Settled curriculum notes (classification/_hints.json): what an ambiguous cours covers.
let hints = [];
try { hints = JSON.parse(fs.readFileSync(path.join(CLASS_DIR, '_hints.json'), 'utf8'))[slug] || []; } catch (e) { /* none */ }
if (hints.length) header.push('NOTES — follow these:', ...hints.map(h => `  - ${h}`), '');

// Group by exam, keep file order, then pack whole exams into chunks of ~SIZE.
const exams = [];
questions.forEach((q, i) => {
  if (done.has(qKey(q))) return;
  let e = exams[exams.length - 1];
  if (!e || e.name !== q.exam) { e = { name: q.exam, idx: [] }; exams.push(e); }
  e.idx.push(i);
});
const chunks = [];
exams.forEach(e => {
  let c = chunks[chunks.length - 1];
  if (!c || (c.n + e.idx.length > SIZE && c.n > 0)) { c = { exams: [], n: 0 }; chunks.push(c); }
  c.exams.push(e); c.n += e.idx.length;
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
chunks.forEach((c, ci) => {
  const lines = header.slice();
  lines.push(`QUESTIONS — chunk ${ci + 1}/${chunks.length}, ${c.n} questions (${c.exams.map(e => e.name).join(', ')})`);
  c.exams.forEach(e => {
    lines.push('', `==================== ${e.name} ====================`);
    e.idx.forEach(i => {
      const q = questions[i];
      const cs = caseOf.get(i);
      lines.push('');
      lines.push(`[${qKey(q)}]${cs ? `  CAS? ${cs}` : ''}`);
      lines.push(`topic: ${q.topic || '—'}   ·   guess: ${guess(q)}`);
      lines.push(q.text.replace(/\s+/g, ' ').trim());
      q.options.forEach(o => lines.push(`  ${o.letter}] ${o.text.replace(/\s+/g, ' ').trim()}`));
      if (q.correct && q.correct.length) lines.push(`  ✓ ${q.correct.join(',')}`);
    });
  });
  fs.writeFileSync(path.join(OUT, `chunk-${String(ci + 1).padStart(2, '0')}.txt`), lines.join('\n') + '\n');
});

const nCase = new Set(caseOf.values()).size;
console.log(`${slug}: ${chunks.reduce((s, c) => s + c.n, 0)} questions → ${chunks.length} chunk(s) in ${OUT}`);
console.log(`  ${lessons.length} cours in ${groups.length} group(s) · ${nCase} candidate case(s) covering ${caseOf.size} questions`);
