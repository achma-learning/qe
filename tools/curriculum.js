'use strict';
/* Shared curriculum helpers for the Node tools (build-lessons, classify-prep,
 * classify-check): parse the FMPM outline, flatten a module into lesson
 * groups, and the accent-insensitive `norm` used to compare names. */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./parser-bridge');

const CUR_DIR = path.join(ROOT, 'data', 'liste cours');
const CLASS_DIR = path.join(CUR_DIR, 'classification');

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

const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => deaccent(String(s).toLowerCase()).replace(/[’'`]/g, ' ').replace(/œ/g, 'oe');

// The curriculum module a QE_MODULES entry points to (via its `cur`), or null.
function findModuleNode(cur, m) {
  const semMods = cur[m.sem] || [];
  return (m.cur && semMods.find(n => norm(n.text) === norm(m.cur))) || null;
}

// A name → lesson index (≥ 0) or whole sub-module, encoded -(groupIndex + 1); null if neither.
function makeResolver(groups) {
  const lessons = groups.flatMap(g => g.lessons);
  return (name) => {
    const li = lessons.findIndex(l => norm(l) === norm(name));
    if (li >= 0) return li;
    const gi = groups.findIndex(g => g.name && norm(g.name) === norm(name));
    if (gi >= 0) return -(gi + 1);
    return null;
  };
}

// Question key used by the classification files: "<exam>#<qn>".
const qKey = (q) => `${q.exam}#${q.qn}`;

function loadClassification(slug) {
  const f = path.join(CLASS_DIR, `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

module.exports = {
  CUR_DIR, CLASS_DIR, parseOutline, loadCurriculum, lessonGroups, deaccent, norm,
  findModuleNode, makeResolver, qKey, loadClassification,
};
