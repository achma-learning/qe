#!/usr/bin/env node
/* Validates (and optionally merges into) a module's per-question
 * classification: data/liste cours/classification/<slug>.json.
 *
 *   node tools/classify-check.js <slug>                    # validate
 *   node tools/classify-check.js <slug> --merge a.json …   # merge qe-classifier
 *                                                          # fragments, then validate
 *   node tools/classify-check.js <slug> --flags            # also list flagged questions
 *
 * Checks: every question of the module has an entry, no unknown keys, every
 * cours resolves to a lesson / sub-module of the module, ≤ 2 cours each,
 * clinical cases are consecutive questions of one exam sharing their first
 * cours (unless flagged case_override). Prints the count per cours so empty
 * or overloaded cours stand out. Exit 1 on errors.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, loadParser, loadModules } = require('./parser-bridge');
const { CLASS_DIR, loadCurriculum, lessonGroups, findModuleNode, makeResolver, qKey, loadClassification } = require('./curriculum');

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || slug.startsWith('--')) { console.error('usage: node tools/classify-check.js <slug> [--merge frag.json …] [--flags]'); process.exit(1); }
const mi = args.indexOf('--merge');
const fragments = mi >= 0 ? args.slice(mi + 1).filter(a => !a.startsWith('--')) : [];
const SHOW_FLAGS = args.includes('--flags');

const m = loadModules().find(x => x.slug === slug);
if (!m) { console.error(`unknown module slug "${slug}"`); process.exit(1); }
const modNode = findModuleNode(loadCurriculum(), m);
if (!modNode) { console.error(`${slug}: curriculum module "${m.cur}" not found`); process.exit(1); }
const groups = lessonGroups(modNode);
const lessons = groups.flatMap(g => g.lessons);
const resolve = makeResolver(groups);
const { questions } = loadParser()(fs.readFileSync(path.join(ROOT, m.file), 'utf8'));
const pos = new Map(questions.map((q, i) => [qKey(q), i]));

const FILE = path.join(CLASS_DIR, `${slug}.json`);
let cls = loadClassification(slug) || { module: modNode.text, q: {} };

if (fragments.length) {
  let added = 0, replaced = 0;
  for (const f of fragments) {
    const frag = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [k, e] of Object.entries(frag.q || frag)) {
      if (cls.q[k]) replaced++; else added++;
      cls.q[k] = e;
    }
  }
  // Keep the file in question order so diffs stay readable.
  const ordered = {};
  Object.keys(cls.q).sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9)).forEach(k => { ordered[k] = cls.q[k]; });
  cls = { module: modNode.text, q: ordered };
  fs.mkdirSync(CLASS_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cls, null, 1) + '\n');
  console.log(`merged ${fragments.length} fragment(s) into ${path.relative(ROOT, FILE)}: +${added} new, ${replaced} replaced`);
}

const errors = [], warnings = [];
const perTarget = new Map();
const cases = new Map();
const flagged = [];
for (const [k, e] of Object.entries(cls.q || {})) {
  if (!pos.has(k)) { errors.push(`${k}: no such question in ${m.file}`); continue; }
  const c = (e && e.c) || [];
  if (!c.length) errors.push(`${k}: no cours`);
  if (c.length > 2) errors.push(`${k}: ${c.length} cours (max 2)`);
  c.forEach(name => {
    const x = resolve(name);
    if (x === null) errors.push(`${k}: "${name}" is neither a cours nor a sous-module of "${modNode.text}"`);
    else perTarget.set(x, (perTarget.get(x) || 0) + 1);
  });
  if (e.case) { if (!cases.has(e.case)) cases.set(e.case, []); cases.get(e.case).push(k); }
  if ((e.flags && e.flags.length) || e.conf === 'low') flagged.push(`${k}  [${(e.flags || []).concat(e.conf === 'low' ? ['low'] : []).join(',')}]  ${c.join(' + ')}${e.why ? '  — ' + e.why : ''}`);
}
for (const [label, keys] of cases) {
  const idx = keys.map(k => pos.get(k)).sort((a, b) => a - b);
  const exams = new Set(idx.map(i => questions[i].exam));
  if (exams.size > 1 || idx.some((v, j) => j && v !== idx[j - 1] + 1)) errors.push(`case ${label}: members are not consecutive questions of one exam (${keys.join(', ')})`);
  if (keys.length < 2) warnings.push(`case ${label}: only one question`);
  const main = cls.q[questions[idx[0]].exam + '#' + questions[idx[0]].qn].c[0];
  keys.forEach(k => {
    const e = cls.q[k];
    if (e.c[0] !== main && !(e.flags || []).includes('case_override')) warnings.push(`case ${label}: ${k} → "${e.c[0]}" differs from the case's "${main}" (flag case_override if intended)`);
  });
}
const missing = questions.filter(q => !(cls.q || {})[qKey(q)]);

const n = questions.length - missing.length;
console.log(`${slug}: ${n}/${questions.length} questions classified (${(100 * n / questions.length).toFixed(1)}%) · ${cases.size} cases · ${flagged.length} flagged`);
console.log('per cours:');
groups.forEach((g, gi) => {
  if (g.name) console.log(`  ## ${g.name}${perTarget.get(-(gi + 1)) ? `  (whole group: ${perTarget.get(-(gi + 1))})` : ''}`);
  g.lessons.forEach(l => { const c = perTarget.get(lessons.indexOf(l)) || 0; console.log(`    ${String(c).padStart(4)}  ${l}${c ? '' : '   ← empty'}`); });
});
if (missing.length) console.log(`missing (${missing.length}): ${missing.slice(0, 15).map(qKey).join(', ')}${missing.length > 15 ? ' …' : ''}`);
if (SHOW_FLAGS && flagged.length) console.log('flagged:\n  ' + flagged.join('\n  '));
warnings.forEach(w => console.log('warn: ' + w));
errors.forEach(e => console.log('ERROR: ' + e));
process.exit(errors.length ? 1 : 0);
