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

const REPORT = process.argv.includes('--report');
const CUR_DIR = path.join(ROOT, 'data', 'liste cours');
const ALIASES_FILE = path.join(CUR_DIR, 'lesson-aliases.json');

// ----- curriculum -----------------------------------------------------------
// Same indentation-driven outline parser as the curriculum page (bootCurriculum).
function parseOutline(raw) {
  const out = [];
  const stack = [{ indent: -1, node: { children: out } }];
  (raw || '').split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const m = line.match(/^(\s*)[-+*•·]\s+(.*)$/);
    let indent, text;
    if (m) { indent = m[1].length; text = m[2].trim(); }
    else {
      const t = line.trim();
      if (/^s\d{1,2}$/i.test(t)) { stack.length = 1; out.push({ sem: t.toLowerCase(), text: t, children: [] }); stack.push({ indent: -1, node: out[out.length - 1] }); return; }
      indent = (line.match(/^\s*/)[0] || '').length;
      text = t;
    }
    if (!text || text.charAt(0) === '#') return;
    while (stack.length > 2 && indent <= stack[stack.length - 1].indent) stack.pop();
    const node = { text, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  });
  return out; // [{ sem:'s1', children:[module…] }]
}

function loadCurriculum() {
  const complete = path.join(CUR_DIR, 'curriculum_FMPM_S1-S10.txt');
  let raw = '';
  if (fs.existsSync(complete)) raw = fs.readFileSync(complete, 'utf8');
  else {
    for (let i = 1; i <= 10; i++) {
      const f = path.join(CUR_DIR, `s${i} liste cours.txt`);
      if (fs.existsSync(f)) raw += '\n' + fs.readFileSync(f, 'utf8');
    }
  }
  const bySem = {};
  parseOutline(raw).forEach(s => { if (s.sem) bySem[s.sem] = s.children; });
  return bySem;
}

// Flatten a curriculum module into ordered groups of lessons. A module whose
// children are all leaves is one unnamed group; otherwise each sub-module is a
// group (leaves directly under the module go into an unnamed group).
function lessonGroups(modNode) {
  const groups = [];
  let loose = null;
  const leaves = (n) => n.children.length ? n.children.flatMap(leaves) : [n.text];
  modNode.children.forEach(ch => {
    if (ch.children.length) groups.push({ name: ch.text, lessons: leaves(ch) });
    else { if (!loose) { loose = { name: '', lessons: [] }; groups.push(loose); } loose.lessons.push(ch.text); }
  });
  return groups;
}

// ----- fuzzy matcher --------------------------------------------------------
const STOP = new Set(('le la les l de des du d un une et ou a au aux en chez sur par pour dans ' +
  'avec son sa ses leur leurs cas devant partie + -').split(' '));
const deaccent = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => deaccent(String(s).toLowerCase()).replace(/[’'`]/g, ' ').replace(/œ/g, 'oe');
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

for (const m of mods) {
  const semMods = cur[m.sem] || [];
  const modNode = m.cur && semMods.find(n => norm(n.text) === norm(m.cur));
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
  const resolve = (name) => {
    const li = lessons.findIndex(l => norm(l) === norm(name));
    if (li >= 0) return li;
    const gi = groupNames.findIndex(g => g && norm(g) === norm(name));
    if (gi >= 0) return -(gi + 1);
    console.warn(`! ${m.slug}: alias target "${name}" is neither a lesson nor a sub-module of "${modNode.text}"`);
    return null;
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
}

const out = '/* auto-generated by tools/build-lessons.js — do not edit */\n'
  + 'window.QE_LESSONS = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', '_lessons.js'), out);

if (REPORT) console.log(report.join('\n'));
console.log(`Wrote data/_lessons.js — ${Object.keys(payload).length} modules · `
  + `${mappedT}/${totT} topics · ${mappedQ}/${totQ} questions mapped to a curriculum lesson`);
