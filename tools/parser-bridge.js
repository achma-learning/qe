'use strict';
/**
 * Shared bridge between the browser app and the Node tools.
 *
 * The parser (`parseQuestionsFile`) lives in `assets/app.js` so the website can
 * run with no build step. These tools lift that exact function out by regex so
 * the build (build-data.js) and the validator (check-data.js) always agree with
 * what the site actually does — one parser, zero drift.
 *
 * ⚠️ Keep `parseQuestionsFile`'s signature `function parseQuestionsFile(text) {`
 *    and its two-space-indented closing `}` stable, or the regex below misses it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadParser() {
  const code = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
  const m = code.match(/function parseQuestionsFile\(text\) \{[\s\S]*?\n  \}\n/);
  if (!m) throw new Error('parseQuestionsFile not found in assets/app.js');
  return new Function(m[0] + '\nreturn parseQuestionsFile;')();
}

function loadModules() {
  const code = fs.readFileSync(path.join(ROOT, 'assets', 'modules.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', code)(sandbox.window);
  return sandbox.window.QE_MODULES || [];
}

module.exports = { ROOT, loadParser, loadModules };
