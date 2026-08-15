#!/usr/bin/env node
'use strict';
/**
 * Find every question with NO recorded answer and build a ready-to-paste AI
 * prompt that asks for the missing corrections *in the exact format the parser
 * accepts*, so the reply can be pasted straight back into the .txt.
 *
 * Usage:
 *   node tools/missing-corrections.js                 # how many, per module
 *   node tools/missing-corrections.js nephro          # only matching modules
 *   node tools/missing-corrections.js --prompt        # print the AI prompt
 *   node tools/missing-corrections.js --prompt --out prompt.txt
 *   node tools/missing-corrections.js --prompt --limit 25   # split big batches
 *
 * Why "Correction probable" and not "Correction officielle": an AI's answer is
 * an estimate, not the faculty's answer key. The parser already understands
 * `Correction probable - …`, flags those questions `isProbable`, and the viewer
 * badges them "≈ probable". Keeping AI answers on that line means an estimate
 * can never be mistaken for an official correction later.
 *
 * After pasting the reply back into the .txt, run:
 *   node tools/check-data.js     # catches a name/number that doesn't attach
 *   node tools/build-data.js     # bake it in
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadParser, loadModules } = require('./parser-bridge');

const TTY = process.stdout.isTTY;
const c = (code, s) => TTY ? `\x1b[${code}m${s}\x1b[0m` : s;
const green = s => c('32', s), yellow = s => c('33', s);
const dim = s => c('2', s), bold = s => c('1', s);

// The format contract handed to the AI. Mirrors how-to-add-new-exam.md — the
// exam name and Q number must match the question header *exactly* or the answer
// silently fails to attach (the #1 mistake the validator exists to catch).
function promptFor(blocks, total) {
  const p = [];
  p.push(`Rôle : Agis comme un Professeur agrégé de médecine. Pour chacun des ${total} QCM ci-dessous, détermine la (ou les) réponse(s) correcte(s).`);
  p.push('');
  p.push(`### Ce que je veux en sortie`);
  p.push(`Uniquement des lignes de correction, une par question, dans CE format exact — rien d'autre, pas de commentaire, pas de bloc de code :`);
  p.push('');
  p.push(`    Correction probable - <Examen> Q<numéro> = <lettres>`);
  p.push('');
  p.push(`### Règles de format (impératives)`);
  p.push(`1. Recopie « <Examen> » et « Q<numéro> » **exactement** comme dans l'en-tête de la question (mêmes espaces, majuscules, accents). Un seul caractère de différence et la réponse ne sera pas rattachée.`);
  p.push(`2. Les lettres sont en majuscules, séparées par un espace quand il y en a plusieurs : \`= A\` ou \`= A C\` ou \`= B C E\`.`);
  p.push(`3. N'utilise que les lettres qui existent dans les propositions de cette question.`);
  p.push(`4. Une ligne par question, dans le même ordre que ci-dessous. N'en omets aucune : si tu hésites, donne quand même ta meilleure estimation.`);
  p.push(`5. N'écris jamais « Correction officielle » — ces réponses sont des estimations.`);
  p.push('');
  p.push(`### Questions`);
  p.push('');
  p.push(blocks.join('\n'));
  return p.join('\n');
}

function questionBlock(q) {
  const opts = (q.options || []).map(o => `${o.letter}] ${o.text}`).join('\n');
  return [
    `${q.exam} Q${q.qn}${q.topic ? ' - ' + q.topic : ''}`,
    '',
    String(q.text || '').trim(),
    '',
    opts,
    '',
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const wantPrompt = args.includes('--prompt');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : 0;
  const skip = new Set([outFile, limIdx >= 0 ? args[limIdx + 1] : null]);
  const filter = (args.find(a => !a.startsWith('-') && !skip.has(a)) || '').toLowerCase();

  const parse = loadParser();
  let modules = loadModules();
  if (filter) modules = modules.filter(m => (m.slug + ' ' + m.file).toLowerCase().includes(filter));
  if (modules.length === 0) { console.error(`No modules match "${filter}".`); process.exit(2); }

  const found = [];   // { mod, q }
  const perModule = [];
  for (const mod of modules) {
    const srcPath = path.join(ROOT, mod.file);
    if (!fs.existsSync(srcPath)) { console.warn(`! missing ${mod.file}`); continue; }
    const parsed = parse(fs.readFileSync(srcPath, 'utf8'));
    const missing = (parsed.questions || []).filter(q => !q.hasCorrection);
    const probable = (parsed.questions || []).filter(q => q.isProbable).length;
    perModule.push({ mod, missing: missing.length, probable, total: (parsed.questions || []).length });
    missing.forEach(q => found.push({ mod, q }));
  }

  console.log(`\nScanned ${modules.length} module(s)…\n`);
  for (const r of perModule) {
    if (!r.missing) {
      console.log(`${green('✓')} ${bold(r.mod.slug.padEnd(38))} ${dim(`${r.total} Q · all answered${r.probable ? ` · ${r.probable} probable` : ''}`)}`);
    } else {
      console.log(`${yellow('▲')} ${bold(r.mod.slug.padEnd(38))} ${yellow(`${r.missing} without any correction`)} ${dim(`· ${r.total} Q${r.probable ? ` · ${r.probable} probable` : ''}`)}`);
    }
  }

  console.log('');
  if (found.length === 0) {
    console.log(`${green('✓ Nothing to do')} — every question has a correction.\n`);
    console.log(dim('  Re-run this after adding an exam whose answer key you don\'t have yet.\n'));
    return;
  }

  const batch = limit > 0 ? found.slice(0, limit) : found;
  console.log(bold(`${found.length} question(s) need an answer`) + (limit > 0 && found.length > limit ? dim(` — prompting for the first ${batch.length}`) : ''));

  if (!wantPrompt) {
    console.log(dim(`\n  Add --prompt to print the AI prompt (--out <file> to save it).\n`));
    return;
  }

  const text = promptFor(batch.map(f => questionBlock(f.q)), batch.length);
  if (outFile) {
    fs.writeFileSync(path.resolve(process.cwd(), outFile), text);
    console.log(`\n${green('⬇')} Prompt written to ${outFile} (${text.length} chars)\n`);
  } else {
    console.log('\n' + '─'.repeat(70) + '\n');
    console.log(text);
    console.log('\n' + '─'.repeat(70));
  }
  console.log(dim(`\n  Paste the reply back under the matching questions, then run:`));
  console.log(dim(`    node tools/check-data.js && node tools/build-data.js\n`));
}

main();
