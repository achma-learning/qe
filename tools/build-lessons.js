#!/usr/bin/env node
/* Maps every question topic onto a lesson of the FMPM curriculum and bakes the
 * result into `data/_lessons.js` (window.QE_LESSONS). The module viewer uses it
 * for the "Filtrer par cours" lesson filter (C key / 🏷 button).
 *
 * Inputs:
 *   - assets/modules.js           → each module's `cur` = its name in the curriculum
 *   - data/liste cours/curriculum_FMPM_S1-S10.txt (falls back to the per-semester files)
 *   - data/<sem>/<module>.txt     → the question topics (`# <exam> Q<n> - <topic>`)
 *   - data/liste cours/lesson-aliases.json → hand-made topic → lesson fixes for
 *     the topics the fuzzy matcher can't place (abbreviations like "RAA", "mvte"…)
 *   - data/liste cours/classification/<slug>.json → per-question cours, read
 *     question by question (tools/classify-prep.js / classify-check.js). Baked as
 *     QE_LESSONS[slug].qs and preferred over the topic guess by the viewer.
 *
 * A topic that matches no lesson keeps its own name and shows under "Autres
 * thèmes" in the filter, so no question ever becomes unreachable.
 *
 *   node tools/build-lessons.js            # bake
 *   node tools/build-lessons.js --report   # also list every unmatched topic + fuzzy matches
 *
 * Do NOT hand-edit the output — edit the curriculum / aliases and re-run this.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, loadParser, loadModules } = require('./parser-bridge');

const { CUR_DIR, loadCurriculum, lessonGroups, norm, findModuleNode, makeResolver, qKey, loadClassification } = require('./curriculum');

const REPORT = process.argv.includes('--report');
const ALIASES_FILE = path.join(CUR_DIR, 'lesson-aliases.json');

// ----- fuzzy matcher --------------------------------------------------------
const STOP = new Set(('le la les l de des du d un une et ou a au aux en chez sur par pour dans ' +
  'avec son sa ses leur leurs cas devant partie + -').split(' '));
const stem = (w) => { w = w.replace(/(es|s|x)$/, '').replace(/(?<=..)e$/, ''); return w.length > 7 ? w.slice(0, 7) : w; };
function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w)).map(stem);
}
// Acronyms a lesson answers to: initials of its words ("Rhumatisme articulaire
// aigu" → raa, "maladie veineuse thrombo-embolique" → mvte) + any (PAREN) or
// ALL-CAPS word in it ("Bronchopneumopathie … (BPCO)", "SCA ST+").
function acronyms(lesson) {
  const out = new Set();
  const words = norm(lesson.replace(/\(.*?\)/g, ' ')).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
  if (words.length >= 2) out.add(words.map(w => w[0]).join(''));
  (lesson.match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || []).forEach(a => out.add(norm(a)));
  return out;
}

function score(topic, lesson) {
  const nt = norm(topic).replace(/[^a-z0-9]+/g, ' ').trim();
  const nl = norm(lesson).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!nt) return 0;
  if (nt === nl) return 1;
  const compact = nt.replace(/ /g, '');
  if (/^[a-z0-9]{2,7}$/.test(compact) && acronyms(lesson).has(compact)) return 0.95;
  const paren = (topic.match(/\(([A-Z][A-Z0-9]{1,7})\)/) || [])[1];   // "… (SDRA)"
  if (paren && acronyms(lesson).has(norm(paren))) return 0.95;
  const A = new Set(tokens(topic)), B = new Set(tokens(lesson));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  const dice = (2 * inter) / (A.size + B.size);
  const cover = inter / A.size;            // how much of the topic the lesson explains
  return Math.max(dice, cover * 0.85);
}

const THRESHOLD = 0.6;

// ----- main -----------------------------------------------------------------
const parse = loadParser();
const mods = loadModules();
const cur = loadCurriculum();
let aliases = {};
try { aliases = JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf8')); } catch (e) {
  if (fs.existsSync(ALIASES_FILE)) { console.error('lesson-aliases.json: ' + e.message); process.exit(1); }
}

const payload = {};
let totQ = 0, mappedQ = 0, totT = 0, mappedT = 0;
const report = [];
const unmapped = [];
let totCls = 0;
const clsReport = [];

for (const m of mods) {
  const modNode = findModuleNode(cur, m);
  if (!modNode) { console.warn(`! ${m.slug}: curriculum module "${m.cur || '(no cur)'}" not found in ${m.sem.toUpperCase()}`); continue; }
  const groups = lessonGroups(modNode);
  const lessons = groups.flatMap(g => g.lessons);
  const modAliases = aliases[m.slug] || {};

  const text = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  const { questions } = parse(text);
  const counts = new Map();
  questions.forEach(q => { const t = (q.topic || '').trim(); if (t) counts.set(t, (counts.get(t) || 0) + 1); });

  // raw topic → list of targets: a lesson index (≥ 0) or a whole sub-module,
  // encoded as -(groupIndex + 1). A broad topic ("Les anémies") can hit several.
  const topicMap = {};
  const groupNames = groups.map(g => g.name);
  const resolveName = makeResolver(groups);
  const resolve = (name, what = 'alias target') => {
    const x = resolveName(name);
    if (x === null) console.warn(`! ${m.slug}: ${what} "${name}" is neither a lesson nor a sub-module of "${modNode.text}"`);
    return x;
  };
  // Best lesson(s) for one topic string. Ties keep every tied lesson, so a
  // one-word topic like "Les leucémies" lands on all three leukaemia lessons.
  const fuzzy = (t) => {
    let best = 0, hits = [];
    lessons.forEach((l, i) => {
      const sc = score(t, l);
      if (sc > best + 1e-9) { best = sc; hits = [i]; }
      else if (Math.abs(sc - best) <= 1e-9 && sc > 0) hits.push(i);
    });
    return { best, hits: best >= THRESHOLD ? hits : [] };
  };
  for (const [t, n] of counts) {
    totT++; totQ += n;
    let targets = [], how;
    if (Object.prototype.hasOwnProperty.call(modAliases, t)) {
      const a = modAliases[t];
      targets = (a === null ? [] : Array.isArray(a) ? a : [a]).map(resolve).filter(x => x !== null);
      how = 'alias';
    } else {
      // "A + B" → match each part on its own.
      const parts = t.split(/\s\+\s/).map(x => x.trim()).filter(Boolean);
      let lo = 1;
      parts.forEach(pt => { const r = fuzzy(pt); lo = Math.min(lo, r.best); r.hits.forEach(i => { if (!targets.includes(i)) targets.push(i); }); });
      how = targets.length ? `fuzzy ${lo.toFixed(2)}` : `none ${lo.toFixed(2)}`;
    }
    if (targets.length) { topicMap[t] = targets; mappedT++; mappedQ += n; }
    else unmapped.push(`${m.slug}  ${n}  ${t}`);
    if (REPORT && how !== 'alias') {
      const names = targets.map(x => x >= 0 ? lessons[x] : '[' + groupNames[-x - 1] + ']').join('  |  ');
      report.push(`${m.slug.padEnd(34)} ${how.padEnd(11)} ${String(n).padStart(4)}  ${t}${names ? '  →  ' + names : ''}`);
    }
  }

  // Per-question classification (data/liste cours/classification/<slug>.json):
  // "<exam>#<qn>" → lesson targets, read question by question. It wins over the
  // topic guess above; questions it doesn't list keep the topic mapping.
  let qs = null;
  const cls = loadClassification(m.slug);
  if (cls) {
    qs = {};
    const keys = new Set(questions.map(qKey));
    let n = 0;
    for (const [k, e] of Object.entries(cls.q || {})) {
      if (!keys.has(k)) { console.warn(`! ${m.slug}: classified question "${k}" not found in ${m.file}`); continue; }
      const targets = (e.c || []).map(c => resolve(c, `cours of ${k}`)).filter(x => x !== null);
      if (targets.length) { qs[k] = targets; n++; }
    }
    totCls += n;
    clsReport.push(`${m.slug}: ${n}/${questions.length} questions classified`);
  }

  // Lesson index → group index, so the client can show sub-module headers.
  let gi = 0, acc = 0;
  const lessonGroup = lessons.map((_, i) => { while (i >= acc + groups[gi].lessons.length) { acc += groups[gi].lessons.length; gi++; } return gi; });
  payload[m.slug] = {
    cur: modNode.text,
    groups: groups.map(g => g.name),
    lessons,
    lessonGroup,
    topics: topicMap,
  };
  if (qs) payload[m.slug].qs = qs;
}

const out = '/* auto-generated by tools/build-lessons.js — do not edit */\n'
  + 'window.QE_LESSONS = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', '_lessons.js'), out);

if (REPORT) console.log(report.join('\n'));
console.log(`Wrote data/_lessons.js — ${Object.keys(payload).length} modules · `
  + `${mappedT}/${totT} topics · ${mappedQ}/${totQ} questions mapped to a curriculum lesson`
  + ` · ${totCls}/${totQ} classified question by question`);
if (clsReport.length) console.log('  ' + clsReport.join('\n  '));
