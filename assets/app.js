/* QE Bank — keyboard-driven MCQ trainer
   ============================================================
   Shortcuts:
     1..5            select option (toggle in multi-select mode)
     Space / Enter   check answer / continue
     ← → ↑ ↓         prev / next question
     N / J           next   |   P / K   prev          (vim-ish)
     R               reset current question
     T / 8           cycle timer loadout (long-press = table)
     Shift+T         show loadout table
     A / Shift+A     toggle auto-advance
     H               toggle sidebar
     F               fullscreen (press twice to exit)
     P               start/pause pomodoro
     M / 9           module switcher
     V               copy question prompt
     Shift+V         AI service menu (ChatGPT/Claude/Gemini/Perplexity)
     Alt+C           copy AI-ready prompt (with correction if revealed)
                     in exam review: ↑↓/JK move across correction cards;
                     Alt+C copies the hovered (or focused) card's prompt
     S / 6           settings panel
     Shift+S         settings panel
     D / 0           dashboard (press 0 twice to confirm on viewer)
     ?               help overlay
     L               toggle light/dark theme
     Esc             close overlay
   ============================================================ */

(() => {
  'use strict';

  // ===== Storage helpers =====
  const LS = {
    get(k, def) {
      try { const v = localStorage.getItem('qe:' + k); return v === null ? def : JSON.parse(v); }
      catch { return def; }
    },
    set(k, v) {
      try { localStorage.setItem('qe:' + k, JSON.stringify(v)); } catch {}
    },
    del(k) { try { localStorage.removeItem('qe:' + k); } catch {} },
    // Iterate over every qe:* key and remove the ones matching the predicate.
    delMatching(pred) {
      try {
        const toDel = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('qe:') && pred(k.slice(3))) toDel.push(k);
        }
        toDel.forEach(k => localStorage.removeItem(k));
        return toDel.length;
      } catch { return 0; }
    },
  };

  // ===== Progress reset helpers =====
  // Wipe every storage entry tied to a module: training answers + per-exam
  // sessions + cursor + cached progress summary.
  function resetModuleProgress(slug) {
    const n = LS.delMatching(key =>
      key === `answers.${slug}` ||
      key === `current.${slug}` ||
      key === `progress.${slug}` ||
      key.startsWith(`exam.${slug}.`)
    );
    return n;
  }
  // Wipe just one exam's session (used in the exam picker / review screen).
  function resetExamProgress(slug, ei) {
    LS.del(`exam.${slug}.${ei}`);
  }
  // Wipe training-mode answers for a specific exam range only. The training
  // 'current' cursor is left alone; the user can keep where they were.
  function resetTrainingExamRange(slug, startIdx, count) {
    const ans = LS.get(`answers.${slug}`, {});
    let removed = 0;
    for (let i = startIdx; i < startIdx + count; i++) {
      if (ans[i] !== undefined) { delete ans[i]; removed++; }
    }
    LS.set(`answers.${slug}`, ans);
    // Recompute progress summary
    const total = LS.get(`progress.${slug}`, { total: 0 }).total || 0;
    const checked = Object.values(ans).filter(a => a.checked).length;
    const correct = Object.values(ans).filter(a => a.checked && a.correct).length;
    LS.set(`progress.${slug}`, { total, answered: checked, correct });
    return removed;
  }

  // ===== Global stats =====
  // Aggregates every qe:progress.* + qe:answers.* + qe:exam.*.* into a single
  // summary used by the dashboard. Cheap enough to recompute on every render
  // (≤22 modules, all keys in localStorage).
  function computeGlobalStats() {
    const mods = window.QE_MODULES || [];
    const counts = window.QE_COUNTS || {};
    let totalQuestions = 0, totalAnswered = 0, totalCorrect = 0;
    let totalPartial = 0, totalWrong = 0;
    let modulesTouched = 0, examSessions = 0, examsSubmitted = 0;
    const perModule = [];
    for (const m of mods) {
      const prog = LS.get(`progress.${m.slug}`, null);
      const cnt = counts[m.slug];
      const total = (prog && prog.total) || (cnt && cnt.questions) || 0;
      totalQuestions += total;
      const ans = LS.get(`answers.${m.slug}`, {});
      let answered = 0, correct = 0, partial = 0, wrong = 0;
      for (const rec of Object.values(ans)) {
        if (!rec || !rec.checked) continue;
        // Questions without an official correction can't be graded — leave
        // them out of every metric so accuracy stays honest.
        if (rec.unknown) continue;
        answered++;
        if (rec.correct) correct++;
        else if (rec.partial) partial++;
        else wrong++;
      }
      if (answered > 0) modulesTouched++;
      totalAnswered += answered;
      totalCorrect += correct;
      totalPartial += partial;
      totalWrong += wrong;
      perModule.push({
        slug: m.slug, name: m.name, sem: m.sem, total, answered, correct, partial, wrong,
        accuracy: answered > 0 ? (correct + partial * 0.5) / answered : 0,
      });
    }
    // Exam sessions across all modules
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('qe:exam.')) continue;
        examSessions++;
        try {
          const v = JSON.parse(localStorage.getItem(k));
          if (v && v.submitted) examsSubmitted++;
        } catch {}
      }
    } catch {}
    const accuracy = totalAnswered > 0
      ? Math.round((totalCorrect * 100) / totalAnswered)
      : 0;
    return {
      totalQuestions, totalAnswered, totalCorrect, totalPartial, totalWrong,
      modulesTouched, totalModules: mods.length,
      examSessions, examsSubmitted, accuracy, perModule,
    };
  }

  // =====================================================================
  // ===== FMPM grading barème (note /20 from # of fully-correct QCM) =====
  // =====================================================================
  // Lookup tables transcribed from the official "Barème de correction des QCM".
  // Index = number of correct answers, value = grade /20. Columns exist for
  // 50 / 40 / 30 / 20-question papers; index 0 maps to 0. Validation = ≥ 10/20
  // (e.g. 30/50 → 10.00, the highlighted threshold on the sheet).
  const BAREME = {
    50: [0,0.10,0.20,0.35,0.55,0.75,0.95,1.15,1.40,1.70,2.00,2.40,2.80,3.15,3.45,3.75,4.25,4.75,5.25,5.75,6.25,6.75,7.25,7.60,7.80,8.00,8.40,8.80,9.20,9.60,10.00,10.40,10.80,11.25,11.75,12.25,12.65,13.05,13.44,13.85,14.25,14.75,15.25,15.80,16.40,17.00,17.60,18.20,18.80,19.40,20.00],
    40: [0,0.14,0.29,0.49,0.77,1.05,1.33,1.61,1.97,2.39,2.81,3.37,3.93,4.42,4.84,5.27,5.97,6.67,7.37,8.07,8.77,9.48,10.18,10.67,10.95,11.23,11.80,12.36,12.92,13.47,14.03,14.60,15.16,15.79,16.49,17.20,17.76,18.31,18.87,19.43,20.00],
    30: [0,0.20,0.41,0.70,1.10,1.50,1.90,2.30,2.80,3.40,4.00,4.80,5.60,6.30,6.90,7.51,8.50,9.50,10.50,11.50,12.50,13.51,14.50,15.21,15.60,16.00,16.81,17.61,18.40,19.20,20.00],
    20: [0,0.32,0.65,1.11,1.76,2.40,3.03,3.67,4.48,5.44,6.40,7.67,8.96,10.08,11.04,12.01,13.60,15.20,16.80,18.40,20.00],
  };
  // Grade /20 for `correct` good answers out of `total` questions. Standard
  // paper sizes use the matching column; any other size is scaled onto the /50
  // curve (so 49/48/40… exams still get a sensible, monotonic note).
  function examGrade(correct, total) {
    if (!total || total <= 0) return 0;
    const c = Math.max(0, Math.min(total, correct | 0));
    const table = BAREME[total];
    if (table) return table[c] || 0;
    const t50 = BAREME[50];
    const c50 = Math.max(0, Math.min(50, Math.round((c / total) * 50)));
    return t50[c50] || 0;
  }
  // Minimum number of correct answers needed to reach 10/20 (validation).
  function examPassThreshold(total) {
    for (let c = 0; c <= total; c++) if (examGrade(c, total) >= 10) return c;
    return total;
  }

  // Build a bubble-sheet style correction grid that mirrors the FMPM answer
  // sheet ("Élément de réponse" / CORRECTION): rows Q1..Qn, columns A–E, the
  // official answers marked in green and the candidate's wrong picks in red.
  function buildExamAnswerSheet(grp, sess, info) {
    const LETTERS = ['A', 'B', 'C', 'D', 'E'];
    const N = grp.questions.length;
    const mid = Math.ceil(N / 2);
    const picksOf = (j) => new Set((sess.picked && sess.picked[j]) || []);
    const cellFor = (q, j, letter) => {
      const opt = (q.options || []).find(o => o.letter === letter);
      if (!opt) return `<td class="as-cell na"></td>`;
      const hasCorr = (q.correct || []).length > 0;
      const correct = (q.correct || []).includes(letter);
      const picked = picksOf(j).has(letter);
      let cls = 'as-cell', mark = '';
      if (!hasCorr) { if (picked) { cls += ' picked'; mark = '•'; } }   // no official correction
      else if (correct && picked) { cls += ' got'; mark = '✓'; }
      else if (correct && !picked) { cls += ' missed'; mark = '✓'; }
      else if (!correct && picked) { cls += ' wrong'; mark = '✗'; }
      const tip = `Q${q.qn} ${letter}${correct ? ' — bonne réponse' : ''}${picked ? ' — votre choix' : ''}`;
      return `<td class="${cls}" title="${escapeHtml(tip)}">${mark}</td>`;
    };
    const rowFor = (j) => {
      const q = grp.questions[j];
      return `<tr><td class="as-qn">Q${q.qn}</td>${LETTERS.map(L => cellFor(q, j, L)).join('')}</tr>`;
    };
    const head = `<tr><th class="as-qn"></th>${LETTERS.map(L => `<th>${L}</th>`).join('')}</tr>`;
    const colTable = (from, to) => `
      <table class="as-table">
        <thead>${head}</thead>
        <tbody>${Array.from({ length: Math.max(0, to - from) }, (_, k) => rowFor(from + k)).join('')}</tbody>
      </table>`;
    return `
      <div class="answer-sheet">
        <div class="as-paper">
          <div class="as-head">
            <div class="as-univ">
              <b>Université Cadi Ayyad</b><br>
              Faculté de Médecine et de Pharmacie de Marrakech
            </div>
            <div class="as-fields">
              <div><span>Module :</span> ${escapeHtml(info.module || '')}</div>
              <div><span>Niveau :</span> ${escapeHtml(info.niveau || '')}</div>
              <div><span>Session :</span> ${escapeHtml(info.session || '')}</div>
            </div>
            <div class="as-stamp">CORRECTION</div>
          </div>
          <div class="as-grids">
            <div class="as-col">${colTable(0, mid)}</div>
            ${mid < N ? `<div class="as-col">${colTable(mid, N)}</div>` : ''}
          </div>
          <div class="as-legend">
            <span class="lg got">✓ Bonne réponse cochée</span>
            <span class="lg missed">✓ Bonne réponse (non cochée)</span>
            <span class="lg wrong">✗ Votre choix erroné</span>
          </div>
        </div>
      </div>`;
  }

  // =====================================================================
  // ===== Per-module error report (downloadable .txt) ===================
  // =====================================================================
  // Lazily pull a module's baked data, gather every wrong/partial answer across
  // training + exam sessions, and offer a downloadable error log. Lives at
  // module scope so the dashboard can surface it per card.
  let dashboardRefresh = null;     // set by bootDashboard so report-reset can refresh cards
  const _dataCache = {};
  function loadModuleData(slug, basePath) {
    return new Promise((resolve, reject) => {
      if (_dataCache[slug]) { resolve(_dataCache[slug]); return; }
      if (window.QE_DATA && window.QE_DATA.slug === slug) {
        _dataCache[slug] = window.QE_DATA; resolve(window.QE_DATA); return;
      }
      const s = document.createElement('script');
      s.src = (basePath || '') + 'data/' + slug + '.data.js';
      s.onload = () => {
        if (window.QE_DATA && window.QE_DATA.slug === slug) {
          _dataCache[slug] = window.QE_DATA; resolve(window.QE_DATA);
        } else {
          reject(new Error('Données chargées mais identifiant inattendu.'));
        }
      };
      s.onerror = () => reject(new Error('Échec du chargement de ' + s.src));
      document.head.appendChild(s);
    });
  }

  // Same grading rules as the viewer's evaluate()/evaluateExamLocal().
  function gradePick(correctArr, pickedArr) {
    const correct = new Set(correctArr || []);
    const got = new Set(pickedArr || []);
    if (correct.size === 0) return got.size ? 'unknown' : 'skipped';
    if (got.size === 0) return 'skipped';
    let allRight = true, anyWrong = false;
    for (const c of correct) if (!got.has(c)) allRight = false;
    for (const g of got) if (!correct.has(g)) { anyWrong = true; allRight = false; }
    if (allRight && !anyWrong) return 'correct';
    if (!anyWrong) return 'partial';
    return 'wrong';
  }

  // Collect every wrong/partial answer for a module across training + exams.
  function collectModuleReport(slug, data) {
    const questions = data.questions || [];
    const exams = data.exams || [];
    const examStarts = [];
    { let acc = 0; for (const g of exams) { examStarts.push(acc); acc += g.questions.length; } }
    const items = [];

    // Training-mode answers (qIdx = flat index into questions[]).
    const ans = LS.get(`answers.${slug}`, {});
    for (const [qIdxStr, rec] of Object.entries(ans)) {
      if (!rec || !rec.checked) continue;
      const qIdx = parseInt(qIdxStr, 10);
      const q = questions[qIdx];
      if (!q) continue;
      const verdict = gradePick(q.correct, rec.picked);
      if (verdict === 'wrong' || verdict === 'partial') {
        items.push({
          qIdx, source: 'Entraînement', verdict,
          exam: q.exam, qn: q.qn, topic: q.topic, text: q.text,
          options: q.options || [], correct: q.correct || [], picked: rec.picked || [],
        });
      }
    }
    // Exam sessions (picked keyed by local index within the exam group).
    for (let ei = 0; ei < exams.length; ei++) {
      const sess = LS.get(`exam.${slug}.${ei}`, null);
      if (!sess || !sess.picked) continue;
      const grp = exams[ei];
      for (const [liStr, pickedArr] of Object.entries(sess.picked)) {
        const li = parseInt(liStr, 10);
        const q = grp.questions[li];
        if (!q) continue;
        const verdict = gradePick(q.correct, pickedArr);
        if (verdict === 'wrong' || verdict === 'partial') {
          items.push({
            qIdx: (examStarts[ei] || 0) + li,
            source: `Examen : ${grp.name}${sess.submitted ? ' (soumis)' : ' (brouillon)'}`,
            verdict,
            exam: q.exam, qn: q.qn, topic: q.topic, text: q.text,
            options: q.options || [], correct: q.correct || [], picked: pickedArr || [],
          });
        }
      }
    }
    items.sort((a, b) => a.qIdx - b.qIdx || String(a.source).localeCompare(String(b.source)));
    return items;
  }

  // Render the human-readable .txt body: each false question with its full
  // statement, the official correction, and the user's own selection.
  function buildReportText(module, items) {
    const out = [];
    const sep = '═'.repeat(64);
    const sub = '─'.repeat(64);
    const now = new Date();
    const nWrong = items.filter(i => i.verdict === 'wrong').length;
    const nPart = items.filter(i => i.verdict === 'partial').length;
    out.push(sep);
    out.push(`  RAPPORT D'ERREURS — ${module.name}`);
    out.push(`  Module : ${module.slug}  (${(module.sem || '').toUpperCase()})`);
    out.push(`  Date   : ${now.toLocaleString('fr-FR')}`);
    out.push(`  Total  : ${items.length} question(s) à revoir — ${nWrong} fausse(s), ${nPart} partielle(s)`);
    out.push(sep);
    out.push('');
    out.push('Légende :  ✓ = bonne réponse (correction officielle)    ✗ = votre choix erroné');
    out.push('');
    if (items.length === 0) {
      out.push('Aucune erreur enregistrée pour ce module. Bravo ! 🎉');
      out.push('');
      return out.join('\n');
    }
    items.forEach((it, i) => {
      const map = {};
      (it.options || []).forEach(o => { map[o.letter] = o.text; });
      const corr = it.correct || [];
      const pick = it.picked || [];
      const corrSet = new Set(corr), pickSet = new Set(pick);
      const fmt = (arr) => arr.length ? arr.map(l => `${l} — ${map[l] || '?'}`).join('  ;  ') : '(aucune)';
      out.push(sub);
      out.push(`#${i + 1}  ·  Q${it.qn}  ·  ${it.exam}${it.topic ? '  ·  ' + it.topic : ''}`);
      out.push(`Verdict : ${it.verdict === 'partial' ? '~ Réponse partielle' : '✗ Réponse fausse'}    |    Source : ${it.source}`);
      out.push('');
      out.push('Énoncé :');
      out.push('  ' + String(it.text || '').split('\n').join('\n  '));
      out.push('');
      out.push('Propositions :');
      (it.options || []).forEach(o => {
        let g = '    ';
        if (corrSet.has(o.letter)) g = '  ✓ ';
        else if (pickSet.has(o.letter)) g = '  ✗ ';
        out.push(`${g}${o.letter}. ${o.text}`);
      });
      out.push('');
      out.push('  ✓ Correction officielle : ' + fmt(corr));
      out.push('  ✗ Votre sélection        : ' + fmt(pick));
      out.push('');
    });
    out.push(sep);
    out.push(`Fin du rapport — ${items.length} question(s) à revoir.`);
    out.push('');
    return out.join('\n');
  }

  function downloadTextFile(filename, text) {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch { return false; }
  }

  // Robust clipboard copy. navigator.clipboard is missing/blocked on file:// and
  // other non-secure contexts, so fall back to a hidden textarea + execCommand.
  // Returns a Promise<boolean> (true = copied). Never throws.
  function execCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
  function copyText(text) {
    return new Promise((resolve) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => resolve(true), () => resolve(execCopy(text)));
        } else {
          resolve(execCopy(text));
        }
      } catch { resolve(execCopy(text)); }
    });
  }

  // Two-step confirm reset bound to a button inside the report overlay.
  function wireReportReset(module, body) {
    const rs = body.querySelector('#rep-reset');
    if (!rs) return;
    let armed = false, t = null;
    rs.addEventListener('click', () => {
      if (armed) {
        clearTimeout(t); armed = false;
        const n = resetModuleProgress(module.slug);
        toast(`🔄 ${module.name} — progression réinitialisée (${n} entrée${n > 1 ? 's' : ''})`, 'ok');
        closeOverlays();
        if (typeof dashboardRefresh === 'function') dashboardRefresh();
      } else {
        armed = true;
        rs.textContent = '⚠️ Confirmer la réinitialisation';
        rs.classList.add('armed');
        toast('⚠️ Cliquez à nouveau pour tout effacer', 'warn');
        t = setTimeout(() => { armed = false; rs.textContent = '↻ Réinitialiser la progression'; rs.classList.remove('armed'); }, 2500);
      }
    });
  }

  function renderReportBody(module, data, body) {
    const items = collectModuleReport(module.slug, data);
    const nWrong = items.filter(i => i.verdict === 'wrong').length;
    const nPart = items.filter(i => i.verdict === 'partial').length;
    const preview = items.slice(0, 6).map(it => `
      <div class="rp-item ${it.verdict}">
        <span class="rp-qn">Q${it.qn}</span>
        <span class="rp-text">${escapeHtml((it.text || '').slice(0, 90))}${(it.text || '').length > 90 ? '…' : ''}</span>
        <span class="rp-corr" title="Correction officielle">✓ ${escapeHtml(it.correct.join(', ') || '—')}</span>
        <span class="rp-pick" title="Votre sélection">✗ ${escapeHtml(it.picked.join(', ') || '—')}</span>
      </div>`).join('');
    body.innerHTML = `
      <div class="report-summary">
        <div class="rs-stat"><b>${items.length}</b><span>à revoir</span></div>
        <div class="rs-stat bad"><b>${nWrong}</b><span>✗ fausses</span></div>
        <div class="rs-stat mid"><b>${nPart}</b><span>~ partielles</span></div>
      </div>
      ${items.length === 0
        ? `<div class="report-empty">Aucune erreur enregistrée pour ce module. 🎉<br><small>Réponds à des questions en mode Entraînement ou Examen, puis reviens ici.</small></div>`
        : `<div class="report-note">Le fichier <code>.txt</code> liste <b>chaque question fausse</b> avec son énoncé, la <b>correction officielle</b> et <b>ta sélection</b>.</div>
           <div class="report-preview">${preview}${items.length > 6 ? `<div class="rp-more">+ ${items.length - 6} autre(s) question(s) dans le fichier…</div>` : ''}</div>`
      }
      <div class="report-actions">
        <button id="rep-download" class="primary"${items.length === 0 ? ' disabled' : ''}>⬇ Télécharger le rapport (.txt)</button>
        <button id="rep-reset" class="rep-danger">↻ Réinitialiser la progression</button>
      </div>
      <div class="esc-hint">Le rapport se télécharge en fichier texte · Esc pour fermer</div>
    `;
    const dl = body.querySelector('#rep-download');
    if (dl && items.length) {
      dl.addEventListener('click', () => {
        const text = buildReportText(module, items);
        const ok = downloadTextFile(`qe-rapport-erreurs-${module.slug}-${localDayStr()}.txt`, text);
        toast(ok ? `⬇ Rapport téléchargé — ${items.length} question(s)` : '⚠️ Téléchargement impossible', ok ? 'ok' : 'warn');
      });
    }
    wireReportReset(module, body);
  }

  function showModuleReport(module, basePath) {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    makeOverlay((panel) => {
      panel.classList.add('report-panel');
      panel.innerHTML = `
        <h3>📄 Rapport d'erreurs — ${escapeHtml(module.name)}</h3>
        <div class="report-body"><div class="report-loading">⏳ Chargement des données du module…</div></div>
      `;
      const body = panel.querySelector('.report-body');
      loadModuleData(module.slug, basePath || '').then(data => {
        renderReportBody(module, data, body);
      }).catch(err => {
        body.innerHTML = `<div class="report-error">⚠️ Impossible de charger les données du module.<br><small>${escapeHtml(err.message)}</small></div>
          <div class="report-actions"><button id="rep-reset" class="rep-danger">↻ Réinitialiser la progression</button></div>`;
        wireReportReset(module, body);
      });
    });
  }

  // Prefetch a module's baked data file so navigating to its viewer is instant.
  // Each data file is ~750KB; one hover saves a full network round-trip.
  const _prefetched = new Set();
  function prefetchData(slug, basePath) {
    if (!slug || _prefetched.has(slug)) return;
    _prefetched.add(slug);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'script';
    link.href = (basePath || '') + 'data/' + slug + '.data.js';
    document.head.appendChild(link);
  }

  // ===== Theme =====
  function applyTheme(t) {
    document.documentElement.classList.toggle('light', t === 'light');
    LS.set('theme', t);
  }
  function toggleTheme() {
    const cur = LS.get('theme', 'dark');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
    toast('🎨 Theme: ' + (LS.get('theme') === 'dark' ? 'dark' : 'light'), 'ok');
  }
  applyTheme(LS.get('theme', 'dark'));

  // ===== Focus mode (distraction-free) =====
  function applyFocus(on) {
    document.documentElement.classList.toggle('focus-mode', !!on);
    LS.set('focusMode', !!on);
  }
  function toggleFocus() {
    const next = !document.documentElement.classList.contains('focus-mode');
    applyFocus(next);
    toast(next ? '🎯 Focus mode ON — just you and the question (Z to exit)' : '🎯 Focus mode OFF', next ? 'ok' : '');
    if (state.viewer) state.viewer.render();
  }
  applyFocus(LS.get('focusMode', false));

  // ===== Activity log / streaks =====
  // One compact record per calendar day in qe:activity:
  //   { 'YYYY-MM-DD': { answered, correct, ms } }
  // Powers the streak counter, the "today" count and the 14-day trend sparkline.
  // Local-date keyed so streaks line up with the user's own midnight.
  function localDayStr(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function logActivity(correct, ms) {
    const a = LS.get('activity', {});
    const key = localDayStr();
    const d = a[key] || { answered: 0, correct: 0, ms: 0 };
    d.answered++;
    if (correct) d.correct++;
    d.ms += Math.max(0, ms || 0);
    a[key] = d;
    // Bound storage: keep the most recent ~400 day-records.
    const keys = Object.keys(a).sort();
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => delete a[k]);
    LS.set('activity', a);
  }
  function computeActivity() {
    const a = LS.get('activity', {});
    const today = a[localDayStr()] || { answered: 0, correct: 0, ms: 0 };
    // Current streak: consecutive days with activity, ending today or yesterday
    // (so the streak survives until midnight even before you study today).
    let streak = 0;
    const cursor = new Date();
    if (!a[localDayStr(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (a[localDayStr(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }
    // Longest streak across the whole log.
    const days = Object.keys(a).sort();
    let longest = 0, run = 0, prev = null;
    for (const k of days) {
      run = (prev && (new Date(k) - new Date(prev)) === 86400000) ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = k;
    }
    // Last 14 days, oldest→newest, for the sparkline.
    const last14 = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const k = localDayStr(dt);
      last14.push({ day: k, answered: (a[k] || {}).answered || 0 });
    }
    let totalMs = 0;
    for (const k of days) totalMs += (a[k].ms || 0);
    return { today, streak, longest, last14, totalMs, activeDays: days.length };
  }

  // ===== Toast =====
  let toastT = null;
  const raf = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16));
  function toast(msg, kind = '') {
    let el = document.getElementById('qe-toast');
    if (!el) { el = document.createElement('div'); el.id = 'qe-toast'; document.body.appendChild(el); }
    el.className = '';
    if (kind) el.classList.add(kind);
    el.textContent = msg;
    raf(() => el.classList.add('show'));
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ===== Timer Presets =====
  const PRESETS = [
    { id: 'default',  emoji: '⭐', name: 'Default',  q: 24, a: 12, desc: 'Daily training' },
    { id: 'velocity', emoji: '🏎️', name: 'Velocity', q: 15, a: 5,  desc: 'Finals crunch' },
    { id: 'exam',     emoji: '📝', name: 'Exam',     q: 40, a: 20, desc: 'Real exam mode' },
    { id: 'study',    emoji: '📚', name: 'Study',    q: 60, a: 30, desc: 'Slow & thorough' },
    { id: 'lightning',emoji: '⚡', name: 'Lightning',q: 8,  a: 3,  desc: 'Speed drills' },
  ];

  // ===== Config / State =====
  const cfg = {
    presetIndex:    LS.get('presetIndex', 0),
    autoAdvance:    LS.get('autoAdvance', false),
    sidebarHidden:  LS.get('sidebarHidden', false),
    multiSelect:    LS.get('multiSelect', true),
    showCorrectionOnCopy: LS.get('showCorrectionOnCopy', true),
    pomoMinutes:    LS.get('pomoMinutes', 25),
  };

  let preset = PRESETS[cfg.presetIndex] || PRESETS[0];

  // Keep the viewer's loadout button (`#btn-loadout`) showing the active preset.
  // The button is rebuilt on every viewer render, but cycling the preset via the
  // T/8 shortcut or the loadout table does NOT re-render the pane — so patch the
  // element in place whenever the preset changes, from wherever it changed.
  function syncLoadoutButton() {
    const btn = document.getElementById('btn-loadout');
    if (btn) {
      btn.textContent = `${preset.emoji} ${preset.q}/${preset.a}`;
      btn.title = `Loadout: ${preset.name} — ${preset.q}s / ${preset.a}s (T)`;
    }
  }

  function cyclePreset() {
    cfg.presetIndex = (cfg.presetIndex + 1) % PRESETS.length;
    preset = PRESETS[cfg.presetIndex];
    LS.set('presetIndex', cfg.presetIndex);
    toast(`${preset.emoji} ${preset.name} — ${preset.q}s / ${preset.a}s — ${preset.desc}`, 'ok');
    syncLoadoutButton();
    if (state.viewer && cfg.autoAdvance) state.viewer.startTimer();
  }

  // ===== Pomodoro =====
  const pomo = {
    total: () => (cfg.pomoMinutes * 60),
    running: false,
    remaining: 0,
    started: 0,
    handle: null,
  };
  function pomoInit() {
    const total = pomo.total();
    const startedAt = LS.get('pomo.startedAt', 0);
    const wasRunning = LS.get('pomo.running', false);
    const paused = LS.get('pomo.paused', 0);
    if (wasRunning && startedAt > 0) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      pomo.remaining = Math.max(0, total - elapsed);
      if (pomo.remaining > 0) { pomo.running = true; pomo.started = startedAt; pomoTick(); }
    } else if (paused > 0) {
      pomo.remaining = paused;
    } else {
      pomo.remaining = total;
    }
    pomoRender();
  }
  function pomoTick() {
    clearInterval(pomo.handle);
    pomo.handle = setInterval(() => {
      pomo.remaining--;
      pomoRender();
      if (pomo.remaining <= 0) { pomoFinish(); }
    }, 1000);
  }
  function pomoToggle() {
    if (pomo.running) {
      pomo.running = false;
      clearInterval(pomo.handle); pomo.handle = null;
      LS.set('pomo.running', false);
      LS.set('pomo.startedAt', 0);
      LS.set('pomo.paused', pomo.remaining);
      pomoRender();
      toast('⏸️ Pomodoro paused', 'warn');
    } else {
      if (pomo.remaining <= 0) pomo.remaining = pomo.total();
      pomo.running = true;
      pomo.started = Date.now() - ((pomo.total() - pomo.remaining) * 1000);
      LS.set('pomo.running', true);
      LS.set('pomo.startedAt', pomo.started);
      LS.set('pomo.paused', 0);
      pomoTick();
      pomoRender();
      toast(`🍅 Pomodoro: ${cfg.pomoMinutes} min started`, 'ok');
    }
  }
  function pomoFinish() {
    clearInterval(pomo.handle); pomo.handle = null;
    pomo.running = false; pomo.remaining = 0;
    LS.set('pomo.running', false);
    LS.set('pomo.startedAt', 0);
    LS.set('pomo.paused', 0);
    pomoRender();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 660; g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(.3, ctx.currentTime + .02);
      o.start();
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .6);
      o.stop(ctx.currentTime + .7);
    } catch {}
    toast('🍅 Pomodoro finished! Take a break.', 'ok');
  }
  function pomoRender() {
    const btn = document.getElementById('qe-pomo');
    if (!btn) return;
    const total = pomo.total();
    const pct = total > 0 ? Math.max(0, (pomo.remaining / total) * 100) : 0;
    const mins = Math.ceil(pomo.remaining / 60);
    const display = pomo.running ? String(mins) : (pomo.remaining === total ? String(cfg.pomoMinutes) : String(mins));
    const ring = btn.querySelector('.ring');
    const text = btn.querySelector('.pomo-text');
    if (ring) ring.style.strokeDashoffset = (100 - pct).toFixed(2);
    if (text) text.textContent = display;
    if (ring) ring.style.stroke = pomo.running ? (pct < 20 ? 'var(--warn)' : 'var(--accent)') : 'var(--text-faint)';
    const m = Math.floor(pomo.remaining / 60), s = String(pomo.remaining % 60).padStart(2, '0');
    btn.title = `Pomodoro — ${m}:${s} ${pomo.running ? '(running, P to pause)' : '(paused, P to start)'}`;
  }

  // ===== Mode (training vs exam) =====
  function getMode() { return LS.get('mode', 'training'); }
  function setMode(m) { LS.set('mode', m); renderModePill(); }

  // ===== Visible-modules preference (dashboard) =====
  // Which modules show on the dashboard (and therefore which the 1–9 jump keys
  // map to). Absent/non-array key => ALL modules visible, so a newly added
  // module appears automatically until the user narrows the set in Settings.
  // When narrowed, it's stored as an array of the visible module slugs.
  function getVisibleModuleSet() {
    const arr = LS.get('visibleModules', null);
    return Array.isArray(arr) ? new Set(arr) : null;   // null => show all
  }
  function toggleMode() {
    const m = getMode() === 'exam' ? 'training' : 'exam';
    setMode(m);
    toast(m === 'exam' ? '📝 Exam mode — full set, correction at the end' : '🎯 Training mode — instant correction per Q', m === 'exam' ? 'warn' : 'ok');
  }
  function renderModePill() {
    const pill = document.getElementById('qe-mode-pill');
    if (!pill) return;
    const m = getMode();
    pill.classList.toggle('exam', m === 'exam');
    pill.querySelector('.label').textContent = m === 'exam' ? 'Exam' : 'Training';
    pill.title = m === 'exam'
      ? 'Mode: Exam (full exam, correction at end). Click to switch to Training.'
      : 'Mode: Training (question-by-question, instant correction). Click to switch to Exam.';
  }

  // ===== Top bar (shared) =====
  function buildTopbar(opts = {}) {
    const top = document.createElement('div');
    top.className = 'topbar';
    const navBase = (opts.indexHref || 'index.html').replace('index.html', '');
    const navLinks = [
      { key: 'report',    href: navBase + 'report.html',     label: 'Report',     title: 'AI report — build a prompt from your mistakes' },
      { key: 'highyield', href: navBase + 'high-yield.html', label: 'High-Yield', title: 'Questions à forte rentabilité — analyse par module' },
    ].filter(n => n.key !== opts.active)
     .map(n => `<a class="topbar-link" href="${n.href}" title="${escapeHtml(n.title)}">${n.label}</a>`).join('');
    top.innerHTML = `
      <a class="brand" href="${opts.indexHref || 'index.html'}" title="Dashboard">
        <span class="logo">QE</span>
        <span>MCQ Bank</span>
      </a>
      <div class="crumb">${opts.crumbHtml || ''}</div>
      ${navLinks}
      <div class="spacer"></div>
      ${opts.search ? `<input type="search" id="qe-search" class="search" placeholder="Search modules…  /" autocomplete="off">` : ''}
      ${opts.modePill !== false ? `
        <button id="qe-mode-pill" class="mode-pill" type="button">
          <span class="dot"></span>
          <span class="label">Training</span>
        </button>
      ` : ''}
      <button id="qe-pomo" title="Pomodoro (P)">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <path fill="none" stroke="rgba(127,127,127,.18)" stroke-width="3.4"
                d="M18 2.08a15.9 15.9 0 010 31.83 15.9 15.9 0 010-31.83"/>
          <path class="ring" fill="none" stroke="var(--text-faint)" stroke-width="3.4" stroke-linecap="round"
                stroke-dasharray="100,100" stroke-dashoffset="0"
                style="transition:stroke-dashoffset .8s linear, stroke .3s;"
                d="M18 2.08a15.9 15.9 0 010 31.83 15.9 15.9 0 010-31.83"/>
          <text class="pomo-text" x="18" y="18" fill="currentColor" font-size="11" font-weight="700"
                text-anchor="middle" dominant-baseline="central"
                style="transform:rotate(90deg);transform-origin:50% 50%;">25</text>
        </svg>
      </button>
      <button id="qe-cmdk" class="cmdk-btn" title="Command palette (Ctrl/Cmd + K)"><kbd>⌘</kbd><kbd>K</kbd></button>
      <button id="qe-theme" title="Toggle theme (L)">🌓</button>
      <button id="qe-help" title="Help (?)">⌨️</button>
      <button id="qe-settings" title="Settings (Shift+S)">⚙️</button>
    `;
    document.body.prepend(top);
    document.getElementById('qe-pomo').addEventListener('click', pomoToggle);
    document.getElementById('qe-cmdk').addEventListener('click', showCommandPalette);
    document.getElementById('qe-theme').addEventListener('click', toggleTheme);
    document.getElementById('qe-help').addEventListener('click', showHelp);
    document.getElementById('qe-settings').addEventListener('click', showSettings);
    // Floating "exit focus" affordance — lives outside the (hidden) top bar.
    if (!document.getElementById('qe-focus-exit')) {
      const fx = document.createElement('button');
      fx.id = 'qe-focus-exit';
      fx.className = 'focus-exit';
      fx.textContent = '✕ Focus';
      fx.title = 'Exit focus mode (Z)';
      fx.addEventListener('click', toggleFocus);
      document.body.appendChild(fx);
    }
    const pillEl = document.getElementById('qe-mode-pill');
    if (pillEl) {
      renderModePill();
      pillEl.addEventListener('click', () => {
        toggleMode();
        // On dashboard the pill is a global toggle, nothing else to do.
        // On viewer pages, reload so the viewer reboots in the new mode.
        if (document.querySelector('.viewer, .exam-picker, .review-head')) {
          location.href = location.pathname;
        }
      });
    }
    pomoInit();
  }

  // ===== Overlays =====
  function closeOverlays() {
    document.querySelectorAll('.overlay').forEach(o => o.remove());
  }
  function makeOverlay(buildPanel) {
    closeOverlays();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const panel = document.createElement('div');
    panel.className = 'panel';
    overlay.appendChild(panel);
    buildPanel(panel, overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function showHelp() {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    const k = (s) => s.split(' ').map(x => `<kbd>${x}</kbd>`).join(' ');
    makeOverlay((panel) => {
      panel.innerHTML = `
        <h3>⌨️ Keyboard Shortcuts</h3>
        <div class="group-title">Navigation</div>
        <div class="help-grid">
          <div class="keys"><kbd>Ctrl/⌘</kbd> <kbd>K</kbd></div><div><b>Command palette</b> — jump to any module or run any command</div>
          <div class="keys">${k('1 2 3 4 5')}</div><div>Select option (toggle in multi-select)</div>
          <div class="keys">${k('Space')} / ${k('Enter')}</div><div>Check answer · continue</div>
          <div class="keys">${k('←')} ${k('→')} ${k('↑')} ${k('↓')}</div><div>Prev / next question</div>
          <div class="keys">${k('N')} ${k('J')} / ${k('K')}</div><div>Next / prev (vim-ish)</div>
          <div class="keys">${k('R')}</div><div>Reset current question</div>
          <div class="keys">${k('G')}</div><div>Go to question # (prompt)</div>
          <div class="keys">${k('M')} / ${k('9')}</div><div>Module switcher</div>
          <div class="keys">${k('D')} / ${k('0')}</div><div>Dashboard (press 0 twice on viewer)</div>
          <div class="keys">${k('C')} (dashboard)</div><div>Continue last module where you left off</div>
          <div class="keys">${k('W')} (dashboard)</div><div>📊 Weakness analysis — topic & module accuracy, jump to first wrong</div>
        </div>
        <div class="group-title">Pacing</div>
        <div class="help-grid">
          <div class="keys">${k('T')} / ${k('8')}</div><div>Cycle timer loadout</div>
          <div class="keys">${k('Shift+T')}</div><div>Loadout table</div>
          <div class="keys">${k('A')}</div><div>Toggle auto-advance</div>
          <div class="keys">${k('P')}</div><div>Pomodoro start/pause</div>
        </div>
        <div class="group-title">Tools</div>
        <div class="help-grid">
          <div class="keys">${k('V')}</div><div>Copy question prompt</div>
          <div class="keys">${k('Shift+V')}</div><div>Send to AI (ChatGPT/Claude/Gemini/Perplexity)</div>
          <div class="keys">${k('Alt+C')}</div><div>Copy AI-ready prompt (with correction if revealed)</div>
          <div class="keys">${k('H')}</div><div>Toggle sidebar</div>
          <div class="keys">${k('F')}</div><div>Fullscreen (press F twice to exit)</div>
          <div class="keys">${k('L')}</div><div>Toggle light/dark theme</div>
          <div class="keys">${k('Z')}</div><div>Focus mode (distraction-free)</div>
          <div class="keys">${k('S')} / ${k('Shift+S')} / ${k('6')}</div><div>Settings</div>
          <div class="keys">${k('?')}</div><div>This help</div>
          <div class="keys">${k('Esc')}</div><div>Close overlay · exit exam back to picker</div>
        </div>
        <div class="group-title">Exam mode</div>
        <div class="help-grid">
          <div class="keys"><kbd>Mode pill</kbd></div><div>Toggle Training ↔ Exam (top bar, persisted)</div>
          <div class="keys">${k('1')}–${k('9')} (picker)</div><div>Start that exam</div>
          <div class="keys">${k('Shift+Enter')}</div><div>Submit exam (press twice to confirm)</div>
          <div class="keys">Après soumission</div><div>Note /20 (barème FMPM) · « <i>{examen} validée</i> » si ≥ 10/20 (≥ 30/50) · feuille de correction A–E façon FMPM</div>
          <div class="keys">${k('Esc')} (exam-run)</div><div>Pause and back to picker (progress kept)</div>
          <div class="keys">${k('↑↓←→')} (picker)</div><div>Move focus across exam tiles · <kbd>Enter</kbd> starts the focused one</div>
          <div class="keys">${k('1')}–${k('5')} (review)</div><div>Filter: all / correct / partial / wrong / skipped</div>
          <div class="keys">${k('↑↓')} ${k('J')} ${k('K')} (review)</div><div>Move focus across correction cards · <kbd>Enter</kbd> copies the focused one</div>
          <div class="keys">${k('Alt+C')} (review)</div><div>Copy the correction prompt for the card under the mouse (or the focused one)</div>
          <div class="keys">${k('R')} (review)</div><div>Retake same exam (clears stored answers)</div>
          <div class="keys">📋 on a review card</div><div>Copy a correction prompt — énoncé + your answer + official correction — ready to paste into an AI</div>
          <div class="keys">${k('0')} / ${k('D')} ×2</div><div>Back to dashboard (anywhere)</div>
        </div>
        <div class="group-title">Reports & reset</div>
        <div class="help-grid">
          <div class="keys">📄 on module card</div><div>Download an error report (.txt): every wrong question + official correction + your selection. Has a reset button too.</div>
          <div class="keys">↻ on module card</div><div>Wipe ALL progress for that module (training + every exam). Click ↻ twice to confirm.</div>
          <div class="keys">${k('R')} ×2 (dashboard)</div><div>Same — focus a card with arrows, then press R twice.</div>
          <div class="keys">↻ on exam tile</div><div>Wipe just that exam's session. Click ↻ twice to confirm.</div>
          <div class="keys">${k('R')} (training)</div><div>Reset the CURRENT question only (press R twice).</div>
        </div>
        <div class="esc-hint">Click background or press Esc to close.</div>
      `;
    });
  }

  function showLoadoutTable() {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    makeOverlay((panel) => {
      panel.innerHTML = `
        <h3>⏱️ Timer Loadouts</h3>
        <table>
          <thead><tr><th>#</th><th>Mode</th><th>Q / A</th><th>Goal</th></tr></thead>
          <tbody>
            ${PRESETS.map((p, i) => `
              <tr data-idx="${i}" class="row ${i === cfg.presetIndex ? 'selected' : ''}" style="cursor:pointer">
                <td><kbd>${i + 1}</kbd></td>
                <td><b>${p.emoji} ${p.name}</b></td>
                <td>${p.q}s / ${p.a}s</td>
                <td>${p.desc}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="esc-hint">Click a row or press 1–${PRESETS.length} · Esc to close</div>
      `;
      panel.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('click', () => {
          cfg.presetIndex = parseInt(tr.dataset.idx, 10);
          preset = PRESETS[cfg.presetIndex];
          LS.set('presetIndex', cfg.presetIndex);
          toast(`${preset.emoji} ${preset.name} — ${preset.q}s/${preset.a}s`, 'ok');
          syncLoadoutButton();
          if (state.viewer && cfg.autoAdvance) state.viewer.startTimer();
          closeOverlays();
        });
      });
    });
  }

  function showModuleSwitcher() {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    const mods = window.QE_MODULES || [];
    const sems = window.QE_SEMESTERS || {};
    const cur = (state.viewer && state.viewer.module) ? state.viewer.module.slug : null;
    const indexHref = state.viewer ? '../index.html' : 'index.html';
    const modHref = (m) => state.viewer ? `${m.slug}.html` : `modules/${m.slug}.html`;
    makeOverlay((panel) => {
      const grouped = {};
      mods.forEach(m => { (grouped[m.sem] ||= []).push(m); });
      panel.innerHTML = `
        <h3>📚 Switch Module</h3>
        ${Object.entries(grouped).map(([sem, list]) => `
          <div class="group-title">${sem.toUpperCase()} — ${sems[sem] || ''}</div>
          ${list.map((m, i) => `
            <div class="row ${m.slug === cur ? 'selected' : ''}" data-href="${modHref(m)}">
              <span class="num">${m.sem.replace('s','')}.${i + 1}</span>
              <span class="label">${escapeHtml(m.name)}</span>
              <span class="right">${escapeHtml(m.file.split('/').pop())}</span>
            </div>`).join('')}
        `).join('')}
        <div class="esc-hint">
          <a href="${indexHref}">Back to dashboard</a> · Esc to close
        </div>
      `;
      panel.querySelectorAll('.row[data-href]').forEach(r => {
        r.addEventListener('click', () => { window.location.href = r.dataset.href; });
      });
    });
  }

  function showAIMenu(promptText) {
    if (!promptText) { toast('No question to send', 'warn'); return; }
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    const enc = encodeURIComponent(promptText);
    const svcs = [
      { name: 'ChatGPT',    emoji: '🤖', url: `https://chat.openai.com/?q=${enc}` },
      { name: 'Claude',     emoji: '🧠', url: `https://claude.ai/new?q=${enc}` },
      { name: 'Gemini',     emoji: '💎', url: `https://gemini.google.com/app?q=${enc}` },
      { name: 'Perplexity', emoji: '🔍', url: `https://www.perplexity.ai/?q=${enc}` },
      { name: 'Copy only',  emoji: '📋', url: null },
    ];
    makeOverlay((panel) => {
      panel.innerHTML = `
        <h3>🧠 Ask AI</h3>
        ${svcs.map((s, i) => `
          <div class="row" data-idx="${i}">
            <span class="num">${i + 1}</span>
            <span class="label">${s.emoji} ${s.name}</span>
            <span class="right">${s.url ? 'opens tab' : 'clipboard'}</span>
          </div>`).join('')}
        <div class="esc-hint">Press 1–${svcs.length} · Esc to close</div>
      `;
      const fire = (s) => {
        copyText(promptText);
        if (s.url) window.open(s.url, '_blank');
        else toast('📋 Copied to clipboard', 'ok');
        closeOverlays();
      };
      panel.querySelectorAll('.row[data-idx]').forEach(r => {
        r.addEventListener('click', () => fire(svcs[parseInt(r.dataset.idx, 10)]));
      });
      const num = (e) => {
        if (/^[1-9]$/.test(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (svcs[idx]) { e.preventDefault(); fire(svcs[idx]); document.removeEventListener('keydown', num, true); }
        }
      };
      document.addEventListener('keydown', num, true);
    });
  }

  function showSettings() {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    // Visible-modules checklist (dashboard) — grouped by semester, newest first.
    const mods = window.QE_MODULES || [];
    const sems = window.QE_SEMESTERS || {};
    const visSet = getVisibleModuleSet();   // null => all visible
    const grouped = {};
    mods.forEach(m => { (grouped[m.sem] ||= []).push(m); });
    const semNum = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const modsChecklist = Object.keys(grouped).sort((a, b) => semNum(b) - semNum(a)).map(sem => `
      <div>
        <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--text-dim);margin:4px 0 2px;">${sem.toUpperCase()} — ${escapeHtml(sems[sem] || '')}</div>
        ${grouped[sem].map(m => `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;">
            <input type="checkbox" class="set-mod-vis" data-slug="${escapeHtml(m.slug)}" ${(!visSet || visSet.has(m.slug)) ? 'checked' : ''}>
            <span>${escapeHtml(m.name)}</span>
          </label>`).join('')}
      </div>`).join('');
    makeOverlay((panel) => {
      panel.innerHTML = `
        <h3>⚙️ Settings</h3>
        <div style="display:flex;flex-direction:column;gap:14px;font-size:14px;">
          <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--bg-soft);">
            <div style="font-weight:700;margin-bottom:6px;">Mode</div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:4px;">
              <input type="radio" name="set-mode" value="training" ${getMode() === 'training' ? 'checked' : ''}>
              <span><b>🎯 Training</b> — question by question, instant correction</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="set-mode" value="exam" ${getMode() === 'exam' ? 'checked' : ''}>
              <span><b>📝 Exam</b> — full exam, correction at the end</span>
            </label>
          </div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="set-auto" ${cfg.autoAdvance ? 'checked' : ''}>
            <span><b>Auto-advance</b> — apply current loadout (Q/A timers) — Training only</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="set-multi" ${cfg.multiSelect ? 'checked' : ''}>
            <span><b>Multi-select</b> mode (toggle answers with 1–5)</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="set-corr" ${cfg.showCorrectionOnCopy ? 'checked' : ''}>
            <span><b>Include official correction</b> in copied AI prompt (Alt+C) when revealed</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;">
            <span style="min-width:160px;"><b>Pomodoro</b> duration:</span>
            <input type="number" id="set-pomo" value="${cfg.pomoMinutes}" min="1" max="180" style="width:80px;background:var(--bg-soft);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;">
            <span>minutes</span>
          </label>
          <div>
            <b>Current loadout:</b> ${preset.emoji} ${preset.name} — ${preset.q}s / ${preset.a}s
            <button id="set-cycle" style="margin-left:8px;">Cycle</button>
          </div>
          <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--bg-soft);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <span style="font-weight:700;">📋 Visible modules <span style="font-weight:400;color:var(--text-dim);">— shown on the dashboard · keys <kbd>1</kbd>–<kbd>9</kbd> map to these</span></span>
              <span style="display:flex;gap:6px;">
                <button type="button" id="set-mods-all" style="font-size:12px;">Select all</button>
                <button type="button" id="set-mods-none" style="font-size:12px;">Clear</button>
              </span>
            </div>
            <div id="set-mods-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;">
              ${modsChecklist}
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="set-save" class="primary">Save</button>
            <button id="set-close">Close</button>
          </div>
        </div>
      `;
      const save = () => {
        cfg.autoAdvance = panel.querySelector('#set-auto').checked;
        cfg.multiSelect = panel.querySelector('#set-multi').checked;
        cfg.showCorrectionOnCopy = panel.querySelector('#set-corr').checked;
        const m = parseInt(panel.querySelector('#set-pomo').value, 10);
        if (!isNaN(m) && m > 0 && m <= 180) cfg.pomoMinutes = m;
        const oldMode = getMode();
        const newMode = panel.querySelector('input[name="set-mode"]:checked').value;
        LS.set('mode', newMode);
        LS.set('autoAdvance', cfg.autoAdvance);
        LS.set('multiSelect', cfg.multiSelect);
        LS.set('showCorrectionOnCopy', cfg.showCorrectionOnCopy);
        LS.set('pomoMinutes', cfg.pomoMinutes);
        // Visible modules: store the slug list, or clear the key when ALL are
        // checked so future modules default to visible.
        const boxes = [...panel.querySelectorAll('.set-mod-vis')];
        const checkedSlugs = boxes.filter(b => b.checked).map(b => b.dataset.slug);
        if (boxes.length && checkedSlugs.length === boxes.length) LS.del('visibleModules');
        else LS.set('visibleModules', checkedSlugs);
        if (!pomo.running) { pomo.remaining = pomo.total(); LS.set('pomo.paused', 0); }
        pomoRender();
        renderModePill();
        toast('✓ Settings saved', 'ok');
        closeOverlays();
        if (oldMode !== newMode && document.querySelector('.viewer, .exam-picker, .review-head')) {
          // Viewer needs a reboot to apply the new mode
          location.href = location.pathname;
          return;
        }
        // Refresh the dashboard grid/stats so a changed visible-modules set
        // (and its 1–9 mapping) takes effect immediately.
        if (typeof dashboardRefresh === 'function') dashboardRefresh();
        if (state.viewer) {
          state.viewer.render();
          if (cfg.autoAdvance) state.viewer.startTimer(); else state.viewer.stopTimer();
        }
      };
      panel.querySelector('#set-save').addEventListener('click', save);
      panel.querySelector('#set-close').addEventListener('click', closeOverlays);
      panel.querySelector('#set-cycle').addEventListener('click', cyclePreset);
      panel.querySelector('#set-mods-all').addEventListener('click', () => {
        panel.querySelectorAll('.set-mod-vis').forEach(b => { b.checked = true; });
      });
      panel.querySelector('#set-mods-none').addEventListener('click', () => {
        panel.querySelectorAll('.set-mod-vis').forEach(b => { b.checked = false; });
      });
    });
  }

  // ===== Weakness Analysis =====
  // Aggregate answers from localStorage joined with the baked qIdx→topic index.
  // Returns slices ready to render: per-(module,topic) rows + per-module rows,
  // each carrying first-wrong qIdx so we can jump straight in via ?q=N.
  function computeWeaknesses(opts) {
    const minAnswered = Math.max(1, (opts && opts.minAnswered) || 3);
    const topics = window.QE_TOPICS || {};
    const mods = window.QE_MODULES || [];
    const modBySlug = Object.fromEntries(mods.map(m => [m.slug, m]));
    const rows = [];
    const modRows = [];
    let touchedQuestions = 0, touchedTopics = 0;
    for (const slug of Object.keys(topics)) {
      const m = modBySlug[slug];
      if (!m) continue;
      const ti = topics[slug];
      const ans = LS.get(`answers.${slug}`, {});
      const acc = ti.t.map(() => ({ answered: 0, correct: 0, partial: 0, wrong: 0, firstWrongQ: -1, lastTs: 0 }));
      const modAcc = { answered: 0, correct: 0, partial: 0, wrong: 0, firstWrongQ: -1, lastTs: 0 };
      for (const [qIdxStr, rec] of Object.entries(ans)) {
        if (!rec || !rec.checked || rec.unknown) continue;
        const qIdx = parseInt(qIdxStr, 10);
        const tIdx = ti.q[qIdx];
        if (tIdx == null) continue;
        const a = acc[tIdx];
        a.answered++;
        modAcc.answered++;
        if (rec.ts) { if (rec.ts > a.lastTs) a.lastTs = rec.ts; if (rec.ts > modAcc.lastTs) modAcc.lastTs = rec.ts; }
        if (rec.correct) { a.correct++; modAcc.correct++; }
        else if (rec.partial) { a.partial++; modAcc.partial++; }
        else {
          a.wrong++; modAcc.wrong++;
          if (a.firstWrongQ < 0 || qIdx < a.firstWrongQ) a.firstWrongQ = qIdx;
          if (modAcc.firstWrongQ < 0 || qIdx < modAcc.firstWrongQ) modAcc.firstWrongQ = qIdx;
        }
      }
      touchedQuestions += modAcc.answered;
      for (let i = 0; i < ti.t.length; i++) {
        const a = acc[i];
        if (a.answered === 0) continue;
        touchedTopics++;
        rows.push({
          slug, sem: m.sem, moduleName: m.name, topic: ti.t[i],
          answered: a.answered, correct: a.correct, partial: a.partial, wrong: a.wrong,
          firstWrongQ: a.firstWrongQ, lastTs: a.lastTs,
          accuracy: (a.correct + a.partial * 0.5) / a.answered,
        });
      }
      if (modAcc.answered > 0) {
        modRows.push({
          slug, sem: m.sem, moduleName: m.name,
          answered: modAcc.answered, correct: modAcc.correct, partial: modAcc.partial, wrong: modAcc.wrong,
          firstWrongQ: modAcc.firstWrongQ, lastTs: modAcc.lastTs,
          accuracy: (modAcc.correct + modAcc.partial * 0.5) / modAcc.answered,
        });
      }
    }
    const byAcc = (a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong || b.answered - a.answered;
    const byStrength = (a, b) => b.accuracy - a.accuracy || b.answered - a.answered;
    const eligible = rows.filter(r => r.answered >= minAnswered);
    return {
      meta: { touchedQuestions, touchedTopics, totalTopics: rows.length },
      topics: eligible.slice().sort(byAcc),
      modules: modRows.filter(r => r.answered >= minAnswered).sort(byAcc),
      strengths: eligible.slice().sort(byStrength),
      allTopics: rows.slice().sort(byAcc),
    };
  }

  function showAnalysis() {
    if (document.querySelector('.overlay')) { closeOverlays(); return; }
    const state = {
      tab: LS.get('analysis.tab', 'topics'),       // topics | modules
      minAnswered: LS.get('analysis.minAnswered', 3),
      cursor: 0,
    };
    const accClass = (a) => a >= 0.7 ? 'good' : a >= 0.5 ? 'mid' : 'bad';
    const pct = (a) => Math.round(a * 100);

    makeOverlay((panel) => {
      panel.classList.add('analysis-panel');

      function rowsForTab(w) {
        if (state.tab === 'modules') return w.modules;
        if (state.tab === 'strengths') return w.strengths || [];
        return w.topics;
      }
      const recency = (r) => {
        if (!r.lastTs) return '';
        const d = Math.max(0, Math.floor((Date.now() - r.lastTs) / 86400000));
        return d === 0 ? ' · seen today' : ` · seen ${d}d ago`;
      };
      function rowHref(row) {
        // Jump to first wrong question (training mode) if we have one; else module home.
        const q = row.firstWrongQ;
        return `modules/${row.slug}.html` + (q >= 0 ? `?q=${q}` : '');
      }

      function renderBody() {
        const w = computeWeaknesses({ minAnswered: state.minAnswered });
        const rows = rowsForTab(w);
        const empty = w.meta.touchedQuestions === 0
          ? `<div class="empty"><div class="ico">📭</div>No answers yet — finish a few questions, then come back.</div>`
          : (rows.length === 0
            ? `<div class="empty"><div class="ico">🎯</div>No ${state.tab} hit the <b>${state.minAnswered}+ answered</b> threshold yet.<br><small>Lower the threshold or keep practising.</small></div>`
            : '');

        state.cursor = Math.max(0, Math.min(state.cursor, rows.length - 1));

        const head = `
          <div class="analysis-head">
            <h3>📊 Weakness Analysis</h3>
            <div class="analysis-sub">${w.meta.touchedQuestions.toLocaleString('fr-FR')} answered · ${w.meta.totalTopics} topics touched · ${w.meta.touchedTopics ? 'sorted lowest accuracy first' : ''}</div>
          </div>
          <div class="analysis-bar">
            <div class="tabs" role="tablist">
              <button class="tab ${state.tab === 'topics' ? 'active' : ''}" data-tab="topics"><kbd>1</kbd> Weak topics</button>
              <button class="tab ${state.tab === 'modules' ? 'active' : ''}" data-tab="modules"><kbd>2</kbd> Modules</button>
              <button class="tab ${state.tab === 'strengths' ? 'active' : ''}" data-tab="strengths"><kbd>3</kbd> Strengths</button>
            </div>
            <div class="filter">
              <label>Min answered <select id="ana-min">
                ${[1,3,5,10,20].map(n => `<option value="${n}" ${n === state.minAnswered ? 'selected' : ''}>${n}+</option>`).join('')}
              </select></label>
              <span class="count">${rows.length} shown</span>
            </div>
          </div>
        `;

        const list = empty || `
          <div class="analysis-list" tabindex="0">
            ${rows.map((r, i) => {
              const ac = accClass(r.accuracy);
              const action = r.firstWrongQ >= 0 ? `↪ first wrong: Q${r.firstWrongQ + 1}` : 'open module';
              return `
                <a class="analysis-row ${i === state.cursor ? 'focused' : ''} ${ac}"
                   data-idx="${i}" href="${rowHref(r)}" data-slug="${r.slug}">
                  <div class="ar-main">
                    ${state.tab === 'modules' ? `
                      <div class="ar-title">${escapeHtml(r.moduleName)}</div>
                      <div class="ar-sub">${r.sem}${recency(r)}</div>
                    ` : `
                      <div class="ar-title">${escapeHtml(r.topic)}</div>
                      <div class="ar-sub">${r.sem} · ${escapeHtml(r.moduleName)}${recency(r)}</div>
                    `}
                  </div>
                  <div class="ar-counts">
                    <span title="correct">${r.correct}✓</span>
                    <span title="partial">${r.partial}◔</span>
                    <span title="wrong">${r.wrong}✗</span>
                    <span class="ar-of">/ ${r.answered}</span>
                  </div>
                  <div class="ar-bar"><span class="${ac}" style="width:${pct(r.accuracy)}%"></span></div>
                  <div class="ar-pct ${ac}">${pct(r.accuracy)}%</div>
                  <div class="ar-action">${action}</div>
                </a>
              `;
            }).join('')}
          </div>
        `;

        const rem = computeReminders(4);
        const remBand = rem.length
          ? `<div class="analysis-reminders">${rem.map(r => `<span class="ana-rem ${r.kind}">${r.icon} ${r.text}</span>`).join('')}</div>`
          : '';
        const foot = `<div class="esc-hint"><kbd>↑↓</kbd>/<kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> open · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> tab · <kbd>Esc</kbd> close</div>`;
        panel.innerHTML = head + remBand + list + foot;
        wire();
      }

      function wire() {
        panel.querySelectorAll('.tab').forEach(t => {
          t.addEventListener('click', () => {
            state.tab = t.dataset.tab;
            state.cursor = 0;
            LS.set('analysis.tab', state.tab);
            renderBody();
          });
        });
        const sel = panel.querySelector('#ana-min');
        if (sel) sel.addEventListener('change', () => {
          state.minAnswered = parseInt(sel.value, 10) || 3;
          state.cursor = 0;
          LS.set('analysis.minAnswered', state.minAnswered);
          renderBody();
        });
        panel.querySelectorAll('.analysis-row').forEach(a => {
          a.addEventListener('mouseenter', () => prefetchData(a.dataset.slug, ''), { once: true });
        });
        // Scroll the focused row into view (after layout)
        const focused = panel.querySelector('.analysis-row.focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
      }

      // Key dispatch is owned by handleOverlayKeys so it wins against the
      // dashboard's document listener (which was bound earlier).
      const keyHandler = (e) => {
        const w = computeWeaknesses({ minAnswered: state.minAnswered });
        const rows = rowsForTab(w);
        const k = e.key;
        if (k === '1') { state.tab = 'topics';    LS.set('analysis.tab', 'topics');    state.cursor = 0; renderBody(); return true; }
        if (k === '2') { state.tab = 'modules';   LS.set('analysis.tab', 'modules');   state.cursor = 0; renderBody(); return true; }
        if (k === '3') { state.tab = 'strengths'; LS.set('analysis.tab', 'strengths'); state.cursor = 0; renderBody(); return true; }
        if (k === 'ArrowDown' || k === 'j' || k === 'J') { if (rows.length) { state.cursor = (state.cursor + 1) % rows.length; renderBody(); } return true; }
        if (k === 'ArrowUp'   || k === 'k' || k === 'K') { if (rows.length) { state.cursor = (state.cursor - 1 + rows.length) % rows.length; renderBody(); } return true; }
        if (k === 'Home') { state.cursor = 0; renderBody(); return true; }
        if (k === 'End')  { state.cursor = Math.max(0, rows.length - 1); renderBody(); return true; }
        if (k === 'Enter') {
          const row = rows[state.cursor];
          if (row) window.location.href = rowHref(row);
          return true;
        }
        return false;
      };

      renderBody();
      // Stash on the overlay element so handleOverlayKeys finds it.
      const overlay = panel.closest('.overlay');
      if (overlay) overlay._qeKeyHandler = keyHandler;
    });
  }

  // ===== Study coach — natural-language reminders =====
  // Joins the weakness slices + activity log + topic recency into a short,
  // ranked list of human reminders. Each may carry { slug, q } so the UI can
  // deep-link straight to the relevant module (and first wrong question).
  function computeReminders(max) {
    max = max || 5;
    const w = computeWeaknesses({ minAnswered: 5 });
    const act = computeActivity();
    const now = Date.now();
    const daysAgo = (ts) => ts ? Math.floor((now - ts) / 86400000) : null;
    const out = [];
    // 1) Hardest topics (low accuracy, enough samples).
    w.topics.filter(t => t.accuracy < 0.6).slice(0, 3).forEach(t => out.push({
      icon: '⚠️', kind: 'weak',
      text: `You're struggling with <b>${escapeHtml(t.topic)}</b> (${Math.round(t.accuracy * 100)}% over ${t.answered})`,
      slug: t.slug, q: t.firstWrongQ,
    }));
    // 2) Stale topics — practised before but not seen in a while.
    (w.allTopics || [])
      .map(t => ({ t, days: daysAgo(t.lastTs) }))
      .filter(x => x.days != null && x.days >= 10)
      .sort((a, b) => b.days - a.days)
      .slice(0, 2)
      .forEach(({ t, days }) => out.push({
        icon: '🕓', kind: 'stale',
        text: `You haven't reviewed <b>${escapeHtml(t.topic)}</b> in ${days} days`,
        slug: t.slug, q: t.firstWrongQ,
      }));
    // 3) Weakest module overall.
    if (w.modules.length && w.modules[0].accuracy < 0.65) {
      const m = w.modules[0];
      out.push({
        icon: '📉', kind: 'module',
        text: `<b>${escapeHtml(m.moduleName)}</b> is your weakest module (${Math.round(m.accuracy * 100)}%)`,
        slug: m.slug, q: m.firstWrongQ,
      });
    }
    // 4) Streak / nudges / positive reinforcement.
    if (act.streak >= 2) out.unshift({ icon: '🔥', kind: 'streak', text: `<b>${act.streak}-day streak</b> — keep it going!` });
    else if (act.today.answered === 0) out.push({ icon: '🎯', kind: 'nudge', text: `Nothing yet today — a quick 10 keeps the streak alive.` });
    const best = (w.strengths || [])[0];
    if (best && best.accuracy >= 0.85) out.push({
      icon: '💪', kind: 'strength',
      text: `Strongest area: <b>${escapeHtml(best.topic)}</b> (${Math.round(best.accuracy * 100)}%)`,
    });
    return out.slice(0, max);
  }

  // ===== Command palette (Ctrl/Cmd + K) =====
  // Single fuzzy launcher shared by the dashboard and every viewer page:
  // jump to any module, or run any command, without touching the mouse.
  function paletteContext() {
    const onViewer = !!state.viewer;
    const modHref = (slug) => onViewer ? `${slug}.html` : `modules/${slug}.html`;
    return { onViewer, modHref };
  }
  function buildPaletteItems() {
    const { onViewer, modHref } = paletteContext();
    const mods = window.QE_MODULES || [];
    const counts = window.QE_COUNTS || {};
    const go = (href) => () => { window.location.href = href; };
    const items = [];
    // Commands
    items.push({ icon: '🎨', title: 'Toggle theme', sub: 'light / dark', hint: 'L', run: toggleTheme });
    items.push({ icon: '🎯', title: 'Toggle focus mode', sub: 'distraction-free', hint: 'Z', run: toggleFocus });
    items.push({ icon: '📊', title: 'Open analytics & weakness analysis', sub: 'strengths · weak topics · reminders', hint: 'W', run: showAnalysis });
    items.push({ icon: '🧠', title: 'AI report — fix my mistakes', sub: 'build a prompt from your wrong answers', run: go(onViewer ? '../report.html' : 'report.html') });
    items.push({ icon: '📈', title: 'High-yield analysis', sub: 'ranked high-yield docs per module', run: go(onViewer ? '../high-yield.html' : 'high-yield.html') });
    items.push({ icon: '⚙️', title: 'Settings', hint: 'S', run: showSettings });
    items.push({ icon: '⌨️', title: 'Keyboard shortcuts', hint: '?', run: showHelp });
    items.push({ icon: '🍅', title: (pomo.running ? 'Pause' : 'Start') + ' pomodoro', hint: 'P', run: pomoToggle });
    items.push({ icon: '🔁', title: 'Toggle Training / Exam mode', sub: 'currently ' + getMode(), run: () => { toggleMode(); if (onViewer) location.href = location.pathname; } });
    items.push({ icon: '⛶', title: 'Toggle fullscreen', hint: 'F', run: toggleFS });
    if (onViewer) {
      items.push({ icon: '#️⃣', title: 'Go to question…', hint: 'G', run: () => { if (state.viewer && state.viewer.gotoPrompt) state.viewer.gotoPrompt(); } });
      items.push({ icon: '📚', title: 'Switch module', hint: 'M', run: showModuleSwitcher });
      items.push({ icon: '🏠', title: 'Back to dashboard', hint: '0', run: go('../index.html') });
    }
    const last = LS.get('lastModule', null);
    if (last && mods.find(m => m.slug === last.slug)) {
      items.push({ icon: '▶', title: 'Continue: ' + last.name, sub: 'jump back in', hint: 'C', run: go(modHref(last.slug)) });
    }
    // Modules
    mods.forEach(m => items.push({
      icon: '📕', title: m.name,
      sub: m.sem.toUpperCase() + ((counts[m.slug] || {}).questions ? ' · ' + counts[m.slug].questions + ' Q' : ''),
      kind: 'module', slug: m.slug, run: go(modHref(m.slug)),
    }));
    return items;
  }
  // Lightweight fuzzy scorer: subsequence match with bonuses for word-starts
  // and consecutive hits. Returns -1 for no match. No deps, fast enough for
  // the few dozen palette rows even on every keystroke.
  function fuzzyScore(query, text) {
    if (!query) return 0;
    const q = query.toLowerCase(), t = (text || '').toLowerCase();
    let qi = 0, score = 0, streak = 0, prevIdx = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        let s = 1;
        if (ti === prevIdx + 1) { streak++; s += streak * 2; } else streak = 0;
        if (ti === 0 || /[\s\-·/]/.test(t[ti - 1])) s += 3;
        score += s; prevIdx = ti; qi++;
      }
    }
    return qi === q.length ? score : -1;
  }
  function showCommandPalette() {
    if (document.querySelector('.overlay.cmdk')) { closeOverlays(); return; }
    const allItems = buildPaletteItems();
    const st = { q: '', cursor: 0, results: allItems };
    makeOverlay((panel, overlay) => {
      overlay.classList.add('cmdk');
      overlay._qeOwnsTyping = true;
      panel.classList.add('cmdk-panel');
      const filter = () => {
        const q = st.q.trim();
        st.results = !q ? allItems : allItems
          .map(it => ({ it, s: Math.max(fuzzyScore(q, it.title), fuzzyScore(q, it.sub) - 2) }))
          .filter(x => x.s >= 0)
          .sort((a, b) => b.s - a.s)
          .map(x => x.it);
      };
      const run = (i) => {
        const it = st.results[i];
        if (!it) return;
        closeOverlays();
        setTimeout(() => { try { it.run(); } catch {} }, 0);
      };
      const renderList = () => {
        const list = panel.querySelector('.cmdk-list');
        st.cursor = Math.max(0, Math.min(st.cursor, st.results.length - 1));
        list.innerHTML = st.results.length ? st.results.map((it, i) => `
          <div class="cmdk-item ${i === st.cursor ? 'sel' : ''}" data-idx="${i}">
            <span class="ci-ico">${it.icon || '•'}</span>
            <span class="ci-main"><span class="ci-title">${escapeHtml(it.title)}</span>${it.sub ? `<span class="ci-sub">${escapeHtml(it.sub)}</span>` : ''}</span>
            ${it.kind === 'module' ? '<span class="ci-tag">module</span>' : ''}
            ${it.hint ? `<kbd>${it.hint}</kbd>` : ''}
          </div>`).join('') : `<div class="cmdk-empty">No matches for “${escapeHtml(st.q)}”</div>`;
        const sel = list.querySelector('.cmdk-item.sel');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
        list.querySelectorAll('.cmdk-item').forEach(el => {
          el.addEventListener('click', () => run(parseInt(el.dataset.idx, 10)));
          el.addEventListener('mousemove', () => {
            const i = parseInt(el.dataset.idx, 10);
            if (i !== st.cursor) { st.cursor = i; list.querySelectorAll('.cmdk-item').forEach(x => x.classList.toggle('sel', x === el)); }
          });
        });
      };
      panel.innerHTML = `
        <div class="cmdk-input-wrap">
          <span class="cmdk-prompt">⌘K</span>
          <input type="text" class="cmdk-input" aria-label="Command palette" placeholder="Type a command or module…  (↑↓ to move, ↵ to run)" autocomplete="off" spellcheck="false">
        </div>
        <div class="cmdk-list"></div>
        <div class="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> run · <kbd>Esc</kbd> close</div>
      `;
      const input = panel.querySelector('.cmdk-input');
      renderList();
      input.addEventListener('input', () => { st.q = input.value; st.cursor = 0; filter(); renderList(); });
      setTimeout(() => input.focus(), 0);
      // The overlay owns navigation keys; typing falls through to the input.
      overlay._qeKeyHandler = (e) => {
        const k = e.key;
        if (k === 'ArrowDown' || (k === 'n' && e.ctrlKey)) { if (st.results.length) { st.cursor = (st.cursor + 1) % st.results.length; renderList(); } return true; }
        if (k === 'ArrowUp'   || (k === 'p' && e.ctrlKey)) { if (st.results.length) { st.cursor = (st.cursor - 1 + st.results.length) % st.results.length; renderList(); } return true; }
        if (k === 'Tab') { if (st.results.length) { st.cursor = (st.cursor + (e.shiftKey ? -1 : 1) + st.results.length) % st.results.length; renderList(); } return true; }
        if (k === 'Enter') { run(st.cursor); return true; }
        return false;
      };
    });
  }
  function toggleCommandPalette() {
    if (document.querySelector('.overlay.cmdk')) { closeOverlays(); return; }
    showCommandPalette();
  }

  // ===== Fullscreen =====
  let fsExitPending = false, fsExitT = null;
  function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFS() {
    if (!isFS()) {
      const el = document.documentElement;
      const r = el.requestFullscreen || el.webkitRequestFullscreen;
      if (r) r.call(el).catch(() => {});
      toast('⛶ Fullscreen ON', 'ok');
    } else {
      if (fsExitPending) {
        clearTimeout(fsExitT); fsExitPending = false;
        const x = document.exitFullscreen || document.webkitExitFullscreen;
        if (x) x.call(document).catch(() => {});
        toast('⛶ Fullscreen OFF', 'ok');
      } else {
        fsExitPending = true;
        toast('⛶ Press F again to exit fullscreen', 'warn');
        fsExitT = setTimeout(() => { fsExitPending = false; }, 1800);
      }
    }
  }

  // =====================================================================
  // ============================  PARSER  ===============================
  // =====================================================================
  // Format of each .txt:
  //   # <exam name> Q<n> - <topic>
  //   <blank line>
  //   <number>. <question text...>
  //   <blank line>
  //   A] option
  //   B] option ...
  //   <blank>
  //   Correction officielle - <exam> Q<n> = E
  //   Correction officielle - <exam> Q<n> = A,B,D
  //
  // Optional header block before first '#': overview text, ignored.
  // Optional `// ... Correction officielle ... : <url>` lines between groups.

  function parseQuestionsFile(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const questions = [];
    const exams = new Map(); // examName -> { url }

    const examUrlRe = /^(?:\/\/\s*)?(.+?)\s*\(Correction\s+(?:officielle|collective)\)\s*:\s*(https?:\/\/\S+)/i;
    const headerRe  = /^(?:#\s+)?(.+?)\s+Q\s*(\d+)(?:\s*-\s*(.+))?\s*$/;
    const optRe     = /^([A-E])[\]\.\)]\s*(.+)$/;
    const corrRe    = /^Correction\s+officielle\s*-\s*(.+?)\s+Q\s*(\d+)(?:\s*-\s*.+?)?\s*=\s*(.+)$/i;
    const numRe     = /^(\d+)[\.\)]\s+(.*)$/;

    let cur = null;
    let prevType = 'none'; // none | option | correction | url | separator | text | header
    let sawSeparator = false;

    const flush = () => {
      if (cur) {
        cur.text = (cur.text || '').trim();
        questions.push(cur);
        cur = null;
      }
    };

    const isLikelyHeader = (line) => {
      if (!line || line.length > 180) return false;
      if (/^\d+[\.\)]/.test(line)) return false;        // numbered list (question body)
      if (/^[A-E][\]\.\)]/.test(line)) return false;     // option line
      if (line.startsWith('Correction')) return false;
      if (line.startsWith('//')) return false;
      if (/[?!]$/.test(line)) return false;             // ends with question/exclamation
      if (/:\s*$/.test(line)) return false;             // ends with colon (intro)
      if (/\(Correction/i.test(line)) return false;     // URL hint w/o //
      return headerRe.test(line);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\s+$/g, '');
      const trimmed = line.trim();

      if (trimmed === '') continue;

      if (/^-{3,}$/.test(trimmed) || /^={3,}$/.test(trimmed)) {
        sawSeparator = true;
        prevType = 'separator';
        continue;
      }

      // URL hint
      const um = trimmed.match(examUrlRe);
      if (um) {
        exams.set(um[1].trim(), { url: um[2].trim() });
        prevType = 'url';
        sawSeparator = true;
        continue;
      }

      // Correction line
      const cm = trimmed.match(corrRe);
      if (cm) {
        const examName = cm[1].trim();
        const qn = parseInt(cm[2], 10);
        const letters = (cm[3].toUpperCase().match(/[A-E]/g) || []);
        let target = null;
        if (cur && cur.exam === examName && cur.qn === qn) target = cur;
        else for (let j = questions.length - 1; j >= 0; j--) {
          if (questions[j].exam === examName && questions[j].qn === qn) { target = questions[j]; break; }
        }
        if (target) {
          target.correct = Array.from(new Set(letters));
          target.hasCorrection = true;
        }
        prevType = 'correction';
        continue;
      }

      // Option line
      const om = trimmed.match(optRe);
      if (om && cur) {
        cur.options.push({ letter: om[1], text: om[2].trim() });
        prevType = 'option';
        continue;
      }

      // Header detection — only after first separator, only when prior was a boundary
      if (sawSeparator && ['option', 'correction', 'url', 'separator', 'none'].includes(prevType) && isLikelyHeader(trimmed)) {
        const hm = trimmed.match(headerRe);
        flush();
        cur = {
          exam: hm[1].trim(),
          qn: parseInt(hm[2], 10),
          topic: (hm[3] || '').trim(),
          text: '',
          options: [],
          correct: [],
          hasCorrection: false,
        };
        prevType = 'header';
        continue;
      }

      // Continuation of last option (wrapped)
      if (cur && prevType === 'option' && cur.options.length > 0) {
        cur.options[cur.options.length - 1].text += ' ' + trimmed;
        continue;
      }

      // Question text accumulation
      if (cur && (prevType === 'header' || prevType === 'text')) {
        const nm = trimmed.match(numRe);
        const t = nm ? nm[2] : trimmed;
        cur.text += (cur.text ? '\n' : '') + t;
        prevType = 'text';
        continue;
      }
    }
    flush();

    const byExam = new Map();
    questions.forEach(q => {
      if (!byExam.has(q.exam)) byExam.set(q.exam, { name: q.exam, url: (exams.get(q.exam) || {}).url || null, count: 0, questions: [] });
      const grp = byExam.get(q.exam);
      grp.count++;
      grp.questions.push(q);
    });

    return { questions, exams: Array.from(byExam.values()) };
  }

  // =====================================================================
  // ============================  STATE  ================================
  // =====================================================================
  const state = {
    viewer: null,
  };

  // =====================================================================
  // ============================  DASHBOARD  ============================
  // =====================================================================
  function bootDashboard() {
    buildTopbar({ search: true, crumbHtml: 'Dashboard' });
    const root = document.getElementById('qe-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'qe-root' }));
    const mods = window.QE_MODULES || [];
    const sems = window.QE_SEMESTERS || {};
    const grouped = {};
    mods.forEach(m => { (grouped[m.sem] ||= []).push(m); });

    root.innerHTML = `
      <div class="container">
        <div class="hero">
          <h1>MCQ Question Bank</h1>
          <p>Keyboard-driven question trainer. Pick a module to start practising.</p>
          <div id="qe-stats" class="hero-stats" aria-label="Overall progress"></div>
          <div id="qe-continue"></div>
          <div class="hero-cta">
            <a class="report-link" href="report.html">🧠 Rapport IA — corrige tes erreurs</a>
            <a class="report-link alt" href="high-yield.html">📈 Questions à forte rentabilité</a>
          </div>
          <div class="hint">
            <kbd>⌘</kbd><kbd>K</kbd> palette · <kbd>1</kbd>–<kbd>9</kbd> jump · <kbd>↑↓←→</kbd> focus · <kbd>Enter</kbd> open ·
            <kbd>/</kbd> search · <kbd>C</kbd> continue · <kbd>W</kbd> analysis ·
            <kbd>R</kbd>×2 reset · <kbd>L</kbd> theme · <kbd>?</kbd> help
            · mode → <span id="qe-mode-inline" style="font-weight:700;color:var(--accent)"></span>
          </div>
        </div>
        <div id="qe-coach"></div>
        <div id="qe-weak"></div>
        <div id="qe-semesters"></div>
      </div>
    `;
    const modeInline = document.getElementById('qe-mode-inline');
    const refreshModeInline = () => {
      const m = getMode();
      modeInline.textContent = m === 'exam' ? '📝 Exam (full set, correction at end)' : '🎯 Training (instant correction)';
      modeInline.style.color = m === 'exam' ? 'var(--warn)' : 'var(--accent)';
    };
    refreshModeInline();
    document.getElementById('qe-mode-pill')?.addEventListener('click', refreshModeInline);
    const semRoot = document.getElementById('qe-semesters');
    const statsRoot = document.getElementById('qe-stats');
    const continueRoot = document.getElementById('qe-continue');
    const weakRoot = document.getElementById('qe-weak');
    const coachRoot = document.getElementById('qe-coach');

    function renderStatsHero() {
      const s = computeGlobalStats();
      const act = computeActivity();
      const fmt = (n) => n.toLocaleString('fr-FR');
      const accClass = s.totalAnswered === 0 ? '' : (s.accuracy >= 70 ? 'good' : s.accuracy >= 50 ? 'mid' : 'bad');
      statsRoot.innerHTML = `
        <div class="stat"><div class="num">${fmt(s.totalAnswered)}<small>/${fmt(s.totalQuestions)}</small></div><div class="lbl">answered</div></div>
        <div class="stat"><div class="num ${accClass}">${s.totalAnswered ? s.accuracy + '%' : '—'}</div><div class="lbl">accuracy</div></div>
        <div class="stat"><div class="num">${s.totalCorrect}<small> · ${s.totalPartial}◔ · ${s.totalWrong}✗</small></div><div class="lbl">✓ correct / partial / wrong</div></div>
        <div class="stat"><div class="num">${act.streak}<small> 🔥</small></div><div class="lbl">day streak${act.longest > act.streak ? ' · best ' + act.longest : ''}</div></div>
        <div class="stat"><div class="num">${s.modulesTouched}<small>/${s.totalModules}</small></div><div class="lbl">modules touched</div></div>
        <div class="stat"><div class="num">${s.examsSubmitted}<small>${s.examSessions > s.examsSubmitted ? ' +' + (s.examSessions - s.examsSubmitted) + ' draft' : ''}</small></div><div class="lbl">exams completed</div></div>
      `;
      renderCoach();

      // Continue tile — last visited module, jumping to current Q (training)
      const last = LS.get('lastModule', null);
      const lastMod = last && mods.find(m => m.slug === last.slug);
      if (lastMod) {
        const cur = LS.get(`current.${lastMod.slug}`, 0);
        const prog = LS.get(`progress.${lastMod.slug}`, null);
        const total = (prog && prog.total) || ((window.QE_COUNTS || {})[lastMod.slug] || {}).questions || 0;
        const sub = total ? `Q ${cur + 1}<small> / ${total}</small>` : '';
        continueRoot.innerHTML = `
          <a class="continue-tile" href="modules/${lastMod.slug}.html" data-slug="${lastMod.slug}">
            <span class="play">▶</span>
            <span class="ct-label">Continue</span>
            <b class="ct-name">${escapeHtml(lastMod.name)}</b>
            <span class="ct-sub">${sub}</span>
            <span class="ct-key"><kbd>C</kbd></span>
          </a>
        `;
        const ctile = continueRoot.querySelector('.continue-tile');
        const pf = () => prefetchData(lastMod.slug, '');
        ctile.addEventListener('mouseenter', pf, { once: true });
        ctile.addEventListener('focus', pf, { once: true });
      } else {
        continueRoot.innerHTML = '';
      }

      // Weakest 3 modules — only show modules with ≥ 5 answered (sample-size guard)
      const weakest = s.perModule
        .filter(m => m.answered >= 5)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 3);
      if (weakest.length === 0) {
        weakRoot.innerHTML = '';
      } else {
        weakRoot.innerHTML = `
          <div class="weak-strip">
            <h4>🎯 Needs work — lowest accuracy modules · <a href="#" id="qe-open-analysis">📊 Full analysis</a> <kbd>W</kbd></h4>
            <div class="weak-list">
              ${weakest.map(m => {
                const pct = Math.round(m.accuracy * 100);
                const cls = pct >= 70 ? 'good' : pct >= 50 ? 'mid' : 'bad';
                return `
                  <a class="weak-item" href="modules/${m.slug}.html" data-slug="${m.slug}">
                    <span class="wi-name">${escapeHtml(m.name)}</span>
                    <span class="wi-meta">${m.sem} · ${m.answered}/${m.total} answered</span>
                    <span class="wi-bar"><span class="${cls}" style="width:${pct}%"></span></span>
                    <span class="wi-pct ${cls}">${pct}%</span>
                  </a>
                `;
              }).join('')}
            </div>
          </div>
        `;
        weakRoot.querySelectorAll('.weak-item').forEach(a => {
          const slug = a.dataset.slug;
          const pf = () => prefetchData(slug, '');
          a.addEventListener('mouseenter', pf, { once: true });
          a.addEventListener('focus', pf, { once: true });
        });
        const openAnalysis = weakRoot.querySelector('#qe-open-analysis');
        if (openAnalysis) openAnalysis.addEventListener('click', (e) => { e.preventDefault(); showAnalysis(); });
      }
    }

    // Study-coach panel: streak + 14-day activity sparkline + ranked reminders.
    function renderCoach() {
      if (!coachRoot) return;
      const act = computeActivity();
      const reminders = computeReminders(5);
      const peak = Math.max(1, ...act.last14.map(d => d.answered));
      const spark = act.last14.map(d => {
        const h = d.answered ? Math.max(10, Math.round((d.answered / peak) * 100)) : 4;
        return `<span class="sp ${d.answered ? '' : 'empty'}" style="height:${h}%" title="${d.day}: ${d.answered} answered"></span>`;
      }).join('');
      const remHtml = reminders.length
        ? reminders.map(r => {
            const href = r.slug ? `modules/${r.slug}.html${r.q >= 0 ? `?q=${r.q}` : ''}` : null;
            const inner = `<span class="rm-ico">${r.icon}</span><span class="rm-text">${r.text}</span>${href ? '<span class="rm-go">↪</span>' : ''}`;
            return href
              ? `<a class="reminder ${r.kind}" href="${href}" data-slug="${r.slug}">${inner}</a>`
              : `<div class="reminder ${r.kind}">${inner}</div>`;
          }).join('')
        : `<div class="reminder nudge"><span class="rm-ico">✨</span><span class="rm-text">Answer a few questions to unlock personalised recommendations.</span></div>`;
      coachRoot.innerHTML = `
        <div class="coach">
          <div class="coach-trend">
            <div class="ct-top"><span class="ct-streak">🔥 ${act.streak}</span><span class="ct-lbl">day streak</span></div>
            <div class="spark" aria-hidden="true">${spark}</div>
            <div class="ct-foot">${act.today.answered} today · 14-day activity</div>
          </div>
          <div class="coach-reminders">
            <h4>📌 Recommended for you <a href="#" id="qe-coach-analysis">full analysis ↗</a></h4>
            <div class="reminders">${remHtml}</div>
          </div>
        </div>
      `;
      coachRoot.querySelectorAll('.reminder[data-slug]').forEach(a => {
        const slug = a.dataset.slug;
        a.addEventListener('mouseenter', () => prefetchData(slug, ''), { once: true });
      });
      const an = coachRoot.querySelector('#qe-coach-analysis');
      if (an) an.addEventListener('click', (e) => { e.preventDefault(); showAnalysis(); });
    }

    function render(filter = '') {
      const f = filter.trim().toLowerCase();
      const visSet = getVisibleModuleSet();   // null => show all
      semRoot.innerHTML = '';
      let globalIdx = 0;
      // Home page order: newest semester first → s10, s9, s8, s7, s6, s5.
      const semNum = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
      Object.keys(grouped).sort((a, b) => semNum(b) - semNum(a)).forEach(sem => {
        const list = grouped[sem].filter(m =>
          (!visSet || visSet.has(m.slug)) &&                                   // hidden modules are skipped
          (!f || m.name.toLowerCase().includes(f) || m.sem.includes(f)));
        if (list.length === 0) return;
        const block = document.createElement('div');
        block.className = 'semester';
        block.innerHTML = `
          <div class="semester-head">
            <span class="tag">${sem.toUpperCase()}</span>
            <span class="name">${sems[sem] || ''}</span>
          </div>
          <div class="grid"></div>
        `;
        const grid = block.querySelector('.grid');
        list.forEach(m => {
          globalIdx++;
          const a = document.createElement('a');
          a.className = 'card';
          a.href = `modules/${m.slug}.html`;
          a.dataset.idx = String(globalIdx);
          a.dataset.slug = m.slug;
          const prog = LS.get(`progress.${m.slug}`, null);
          const cnt = (window.QE_COUNTS || {})[m.slug];
          const total = (prog && prog.total) || (cnt && cnt.questions) || null;
          const pct = prog && prog.total ? Math.round((prog.answered / prog.total) * 100) : 0;
          const hasProgress = !!(prog && (prog.answered > 0));
          // Also count any submitted-or-draft exam sessions for the badge
          let examSessions = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(`qe:exam.${m.slug}.`)) examSessions++;
          }
          const showReset = hasProgress || examSessions > 0;
          a.innerHTML = `
            <span class="num">${globalIdx <= 9 ? globalIdx : ''}</span>
            ${showReset ? `<button class="card-report" type="button" title="Rapport d'erreurs — télécharger un .txt des questions fausses" aria-label="Rapport d'erreurs">📄</button>` : ''}
            ${showReset ? `<button class="card-reset" type="button" title="Reset all progress for this module (click twice to confirm)" aria-label="Reset progress">↻</button>` : ''}
            <div class="title">${escapeHtml(m.name)}</div>
            <div class="meta">${m.sem}${total ? ' · ' + total + ' Q' : ''}${cnt ? ' · ' + cnt.exams + ' exams' : ''}${examSessions ? ' · ' + examSessions + ' exam' + (examSessions>1?'s':'') + ' taken' : ''}</div>
            ${prog ? `<div class="meta">${prog.answered}/${prog.total} answered · ${prog.correct || 0}✓</div><div class="progress"><span style="width:${pct}%"></span></div>` : ''}
          `;
          // Wire the reset button so it doesn't navigate.
          const resetBtn = a.querySelector('.card-reset');
          if (resetBtn) {
            resetBtn.addEventListener('click', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              tryResetModule(m, resetBtn);
            });
          }
          // Report button — open the per-module error report (loads data lazily).
          const reportBtn = a.querySelector('.card-report');
          if (reportBtn) {
            reportBtn.addEventListener('click', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              showModuleReport(m, '');
            });
          }
          // Prefetch the module's baked data on hover/focus — viewer loads instantly.
          const pf = () => prefetchData(m.slug, '');
          a.addEventListener('mouseenter', pf, { once: true });
          a.addEventListener('focus', pf, { once: true });
          grid.appendChild(a);
        });
        semRoot.appendChild(block);
      });

      // Reapply focus
      focusCardByIdx(focusIdx);
      if (semRoot.querySelector('.card') === null) {
        if (f) {
          semRoot.innerHTML = `<div class="empty"><div class="ico">🔍</div>No modules match "<b>${escapeHtml(filter)}</b>"</div>`;
        } else {
          // No search term but still nothing → every module is hidden in Settings.
          semRoot.innerHTML = `<div class="empty"><div class="ico">🙈</div>All modules are hidden.<br><button id="qe-open-settings-empty" class="primary" style="margin-top:12px;">⚙️ Choose visible modules</button></div>`;
          const b = semRoot.querySelector('#qe-open-settings-empty');
          if (b) b.addEventListener('click', () => showSettings());
        }
      }
    }

    let focusIdx = -1;
    function focusCardByIdx(i) {
      const cards = [...semRoot.querySelectorAll('.card')];
      document.querySelectorAll('.card.focused').forEach(c => c.classList.remove('focused'));
      if (cards.length === 0) { focusIdx = -1; return; }
      focusIdx = Math.max(0, Math.min(i, cards.length - 1));
      const card = cards[focusIdx];
      card.classList.add('focused');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // Reset confirmation is bound to the focused card; clear pending state on focus change.
      resetPending = null;
      clearTimeout(resetPendingT);
    }

    let resetPending = null; // slug currently armed for confirm
    let resetPendingT = null;
    function tryResetModule(m, srcBtn) {
      if (resetPending === m.slug) {
        clearTimeout(resetPendingT);
        resetPending = null;
        const n = resetModuleProgress(m.slug);
        toast(`🔄 ${m.name} — ${n} progress entries wiped`, 'ok');
        renderStatsHero();
        render(document.getElementById('qe-search')?.value || '');
      } else {
        resetPending = m.slug;
        toast(`⚠️ ${m.name}: click ↻ again (or R) within 2s to wipe ALL progress`, 'warn');
        if (srcBtn) {
          srcBtn.classList.add('armed');
          setTimeout(() => srcBtn.classList.remove('armed'), 2000);
        }
        resetPendingT = setTimeout(() => { resetPending = null; }, 2000);
      }
    }

    const search = document.getElementById('qe-search');
    search.addEventListener('input', () => render(search.value));

    renderStatsHero();
    render();

    // Let the per-module report overlay refresh cards/stats after a reset.
    dashboardRefresh = () => {
      renderStatsHero();
      render(document.getElementById('qe-search')?.value || '');
    };
    // Refresh cards/stats if a reset happened in another tab, or this page is
    // restored from the back/forward cache after resetting a module elsewhere.
    window.addEventListener('pageshow', (e) => { if (e.persisted) dashboardRefresh(); });
    window.addEventListener('storage', (e) => {
      if (!e.key || /^qe:(answers|exam|progress)\./.test(e.key)) dashboardRefresh();
    });

    // Dashboard-specific keyboard
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleCommandPalette(); return; }
      if (handleOverlayKeys(e)) return;
      const target = e.target;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const k = e.key;

      if (inField) {
        if (k === 'Escape') { target.blur(); }
        if (k === 'Enter' && target === search) {
          const first = semRoot.querySelector('.card');
          if (first) window.location.href = first.href;
        }
        return;
      }

      if (k === '/') { e.preventDefault(); search.focus(); search.select(); return; }
      if (k === 'w' || k === 'W') { e.preventDefault(); showAnalysis(); return; }
      if (k === 'c' || k === 'C') {
        const last = LS.get('lastModule', null);
        if (last && mods.find(m => m.slug === last.slug)) {
          e.preventDefault();
          window.location.href = `modules/${last.slug}.html`;
          return;
        }
        toast('No module visited yet — pick one first', 'warn');
        return;
      }
      if (handleGlobalKeys(e)) return;

      const cards = [...semRoot.querySelectorAll('.card')];
      if (cards.length === 0) return;

      if (/^[1-9]$/.test(k)) {
        const n = parseInt(k, 10) - 1;
        if (cards[n]) { e.preventDefault(); window.location.href = cards[n].href; return; }
      }
      if (k === 'Enter' && focusIdx >= 0) {
        e.preventDefault();
        window.location.href = cards[focusIdx].href;
        return;
      }
      if (k === 'ArrowRight' || k === 'l') { e.preventDefault(); focusCardByIdx(focusIdx < 0 ? 0 : focusIdx + 1); return; }
      if (k === 'ArrowLeft' || k === 'h') { e.preventDefault(); focusCardByIdx(focusIdx < 0 ? 0 : focusIdx - 1); return; }
      if (k === 'ArrowDown' || k === 'j') {
        e.preventDefault();
        const grid = (cards[focusIdx] || cards[0]).parentElement;
        const cs = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        focusCardByIdx(focusIdx < 0 ? 0 : focusIdx + cs);
        return;
      }
      if (k === 'ArrowUp' || k === 'k') {
        e.preventDefault();
        const grid = (cards[focusIdx] || cards[0]).parentElement;
        const cs = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        focusCardByIdx(focusIdx < 0 ? 0 : focusIdx - cs);
        return;
      }
      if (k === 'r' || k === 'R') {
        if (focusIdx < 0) {
          toast('Focus a module card first (arrows), then press R twice', 'warn');
          return;
        }
        const card = cards[focusIdx];
        const slug = card.dataset.slug;
        const m = mods.find(x => x.slug === slug);
        if (!m) return;
        e.preventDefault();
        tryResetModule(m, card.querySelector('.card-reset'));
        return;
      }
      if (k === '0' || (k === 'd' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        // Already on dashboard — flash a hint instead of navigating.
        toast('🏠 You are on the Dashboard', 'ok');
        return;
      }
    }, true);
  }

  // =====================================================================
  // ============================  VIEWER  ===============================
  // =====================================================================
  async function bootViewer() {
    const root = document.getElementById('qe-root');
    const moduleSlug = root.dataset.module;
    const mods = window.QE_MODULES || [];
    const module = mods.find(m => m.slug === moduleSlug);
    if (!module) {
      document.body.innerHTML = `<div class="empty"><div class="ico">⚠️</div>Unknown module: ${escapeHtml(moduleSlug)}</div>`;
      return;
    }

    buildTopbar({
      search: false,
      indexHref: '../index.html',
      crumbHtml: `<a href="../index.html">Dashboard</a> · <b>${escapeHtml(module.name)}</b> <span style="opacity:.6">(${escapeHtml(module.sem)})</span>`,
    });

    // Remember this module so the dashboard's "Continue" tile can jump back.
    LS.set('lastModule', { slug: module.slug, name: module.name, sem: module.sem, ts: Date.now() });

    // Island timer host
    const island = document.createElement('div');
    island.id = 'qe-island';
    document.body.appendChild(island);

    // Prefer pre-baked data (offline-friendly), fall back to live parse if absent
    let parsed;
    if (window.QE_DATA && window.QE_DATA.slug === module.slug) {
      parsed = { questions: window.QE_DATA.questions, exams: window.QE_DATA.exams };
    } else {
      try {
        const url = '../' + encodeURI(module.file);
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        parsed = parseQuestionsFile(text);
      } catch (e) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const hint = offline
          ? `You're offline and this module hasn't been saved for offline use yet.<br>Open it once while online, then it'll work offline.`
          : `Couldn't load this module's questions.<br><small>${escapeHtml(e.message)}</small><br>Try reloading, or go back to the <a href="../index.html">dashboard</a>.`;
        root.innerHTML = `<div class="empty"><div class="ico">⚠️</div>${hint}</div>`;
        return;
      }
    }

    if (!parsed.questions || parsed.questions.length === 0) {
      root.innerHTML = `<div class="empty"><div class="ico">📭</div>No questions parsed from this module.</div>`;
      return;
    }

    const viewer = makeViewer(root, module, parsed, island);
    state.viewer = viewer;
    viewer.render();

    document.addEventListener('keydown', (e) => viewer.onKey(e), true);
    document.addEventListener('keyup', (e) => viewer.onKeyUp(e), true);
  }

  function makeViewer(root, module, parsed, island) {
    const questions = parsed.questions;
    const exams = parsed.exams;

    // Pre-compute global offset of each exam (start index in flat questions[])
    const examStarts = [];
    {
      let acc = 0;
      for (const grp of exams) { examStarts.push(acc); acc += grp.questions.length; }
    }
    const examIdxOf = (qIdx) => {
      for (let i = exams.length - 1; i >= 0; i--) if (qIdx >= examStarts[i]) return i;
      return 0;
    };

    const progKey = `progress.${module.slug}`;
    const ansKey = `answers.${module.slug}`;
    let answers = LS.get(ansKey, {}); // qIdx -> { picked: [...], correct, partial, checked }
    let idx = LS.get(`current.${module.slug}`, 0);
    if (idx < 0 || idx >= questions.length) idx = 0;

    // Mode wiring
    const globalMode = LS.get('mode', 'training');
    const urlParams = new URLSearchParams(location.search);
    const urlExam = urlParams.get('exam');
    const urlQ = urlParams.get('q');
    // ?q=N deep-link (training only): jump straight to that question. Used by the
    // dashboard's Weakness Analysis to land on the first wrong question of a topic.
    if (urlQ !== null && /^\d+$/.test(urlQ)) {
      const qj = parseInt(urlQ, 10);
      if (qj >= 0 && qj < questions.length) idx = qj;
    }
    let viewMode = 'training';            // training | exam-pick | exam-run | exam-review
    let activeExamIdx = null;             // index into exams[]
    let reviewFilter = 'all';             // all | wrong | partial | correct | skipped
    if (globalMode === 'exam') {
      if (urlExam !== null && /^\d+$/.test(urlExam)) {
        const ei = parseInt(urlExam, 10);
        if (ei >= 0 && ei < exams.length) {
          activeExamIdx = ei;
          const sess = examSession(ei);
          viewMode = sess.submitted ? 'exam-review' : 'exam-run';
          const grp = exams[ei];
          const localCur = Math.max(0, Math.min(grp.questions.length - 1, sess.cur || 0));
          idx = examStarts[ei] + localCur;
        } else {
          viewMode = 'exam-pick';
        }
      } else {
        viewMode = 'exam-pick';
      }
    }

    function examSessionKey(ei) { return `exam.${module.slug}.${ei}`; }
    function examSession(ei) {
      return LS.get(examSessionKey(ei), { picked: {}, cur: 0, submitted: false, submittedAt: 0, durationSec: 0 });
    }
    function saveExamSession(ei, sess) { LS.set(examSessionKey(ei), sess); }

    let picked = new Set();
    let checked = false;
    let phase = 'question'; // question | answer
    let shownAt = Date.now();   // when the current question was first shown
    let shownIdx = -1;          // which idx that timestamp belongs to
    let timerH = null;
    let timerStart = 0;
    let timerDur = 0;
    let timerEpoch = 0;
    let timerIdx = -1;          // question idx the auto-advance countdown belongs to
    let timerPhase = null;      // phase the auto-advance countdown belongs to
    let dashboardConfirm = false, dashboardConfirmT = null;
    let resetConfirm = false, resetConfirmT = null;
    let tLong = false, tLongT = null;
    let submitConfirm = false, submitConfirmT = null;
    let examStartT = 0;
    let examTimerH = null;
    let examPickFocus = -1;     // keyboard focus cursor on the exam-picker tiles
    let reviewFocus = -1;       // keyboard focus cursor on the exam-review correction cards
    let reviewHover = -1;       // data-local of the review card under the mouse (Alt+C copies it)

    function persist() {
      LS.set(ansKey, answers);
      LS.set(`current.${module.slug}`, idx);
      const correctCount = Object.values(answers).filter(a => a.checked && a.correct).length;
      const answered = Object.values(answers).filter(a => a.checked).length;
      LS.set(progKey, { total: questions.length, answered, correct: correctCount });
    }

    function currentQ() { return questions[idx]; }

    function loadCurrentAnswer() {
      const rec = answers[idx];
      picked = new Set(rec && rec.picked ? rec.picked : []);
      checked = !!(rec && rec.checked);
    }

    function evaluate() {
      const q = currentQ();
      const correct = new Set(q.correct || []);
      const got = picked;
      if (correct.size === 0) {
        return { correct: false, partial: false, unknown: true };
      }
      let allRight = true, anyWrong = false;
      for (const c of correct) if (!got.has(c)) allRight = false;
      for (const g of got) if (!correct.has(g)) { anyWrong = true; allRight = false; }
      const partial = !allRight && !anyWrong && got.size > 0;
      return { correct: allRight && got.size > 0, partial, unknown: false };
    }

    // Persistent map of which non-current exam groups the user has manually
    // expanded. The current exam is always open regardless of this map.
    const openKey = `examOpen.${module.slug}`;
    const getOpenExams = () => LS.get(openKey, {});
    const setExamOpen = (ei, open) => {
      const m = getOpenExams();
      if (open) m[ei] = true; else delete m[ei];
      LS.set(openKey, m);
    };

    // Build the per-exam sidebar HTML. Tracks offset directly (no .indexOf scan),
    // distinguishes untouched / picked / correct / partial / wrong chips, and
    // highlights the active exam header.  `chipState(qIdx)` returns one of:
    //   { kind: 'untouched' | 'picked' | 'correct' | 'partial' | 'wrong' | 'unknown' }
    function buildSidebarHtml(opts) {
      opts = opts || {};
      const chipState = opts.chipState || ((qIdx) => {
        const rec = answers[qIdx];
        if (!rec) return { kind: 'untouched' };
        if (rec.checked) {
          if (rec.unknown) return { kind: 'unknown' };
          if (rec.partial) return { kind: 'partial' };
          if (rec.correct) return { kind: 'correct' };
          return { kind: 'wrong' };
        }
        if (rec.picked && rec.picked.length > 0) return { kind: 'picked' };
        return { kind: 'untouched' };
      });
      const interactive = opts.interactive !== false;
      const currentGlobal = opts.currentGlobal != null ? opts.currentGlobal : idx;
      const openMap = getOpenExams();

      let offset = 0;
      return exams.map((grp, ei) => {
        const start = offset;
        const end = offset + grp.questions.length;
        const isCurrentExam = (currentGlobal >= start && currentGlobal < end);
        const isOpen = isCurrentExam || !!openMap[ei];
        let answered = 0, correct = 0, picked = 0;
        const chips = grp.questions.map((qq, j) => {
          const qIdx = start + j;
          const st = chipState(qIdx);
          let cls = 'q-chip';
          if (qIdx === currentGlobal) cls += ' current';
          if (st.kind === 'correct')      { cls += ' correct'; answered++; correct++; }
          else if (st.kind === 'partial') { cls += ' partial'; answered++; }
          else if (st.kind === 'wrong')   { cls += ' wrong';   answered++; }
          else if (st.kind === 'unknown') { cls += ' picked';  answered++; }
          else if (st.kind === 'picked')  { cls += ' picked';  picked++; }
          if (st.flagged) cls += ' flagged';
          const idAttr = interactive ? `data-idx="${qIdx}"` : '';
          return `<div class="${cls}" ${idAttr} title="${escapeHtml('Q' + qq.qn + (qq.topic ? ' — ' + qq.topic : ''))}">${qq.qn}</div>`;
        }).join('');
        offset = end;
        const examLink = grp.url ? `<a href="${escapeHtml(grp.url)}" target="_blank" rel="noopener" title="Open original on e-qe.online">↗</a>` : '';
        const stats = `<span class="stats">${answered}/${grp.questions.length}${correct ? ' · <b>' + correct + '✓</b>' : ''}${picked ? ' · ' + picked + '◔' : ''} ${examLink}</span>`;
        return `
          <div class="exam-group ${isOpen ? '' : 'collapsed'}" data-exam-idx="${ei}">
            <div class="exam-name ${isCurrentExam ? 'current' : ''}" role="${isCurrentExam ? 'heading' : 'button'}" aria-expanded="${isOpen}" tabindex="${isCurrentExam ? '-1' : '0'}">
              <span class="chev" aria-hidden="true">▾</span>
              <span class="name" title="${escapeHtml(grp.name)}">${escapeHtml(grp.name)}</span>
              ${stats}
            </div>
            <div class="q-list">${chips}</div>
          </div>
        `;
      }).join('');
    }

    // Hook up the exam-name toggle clicks. Call from every render that builds a sidebar.
    function wireSidebarToggles(rootEl) {
      rootEl.querySelectorAll('.exam-group').forEach(grp => {
        const head = grp.querySelector('.exam-name');
        if (!head) return;
        const toggle = (e) => {
          if (e && e.target.closest('a')) return;            // ↗ link → open tab
          if (head.classList.contains('current')) return;     // current is forced open
          if (e) { e.preventDefault(); e.stopPropagation(); }
          const ei = parseInt(grp.dataset.examIdx, 10);
          const collapsing = !grp.classList.contains('collapsed');
          grp.classList.toggle('collapsed');
          head.setAttribute('aria-expanded', String(!collapsing));
          setExamOpen(ei, !collapsing);
        };
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        });
      });
    }

    function render() {
      if (viewMode === 'exam-pick')   return renderExamPicker();
      if (viewMode === 'exam-run')    return renderExamRun();
      if (viewMode === 'exam-review') return renderExamReview();
      renderTraining();
    }

    function renderTraining() {
      loadCurrentAnswer();
      // Start the per-question timer the first time a new question is shown
      // (re-renders from toggling options keep the same clock).
      if (shownIdx !== idx) { shownIdx = idx; shownAt = Date.now(); }
      const q = currentQ();
      const total = questions.length;
      const sidebarHtml = buildSidebarHtml();

      const optionsHtml = (q.options || []).map((o) => {
        const isPicked = picked.has(o.letter);
        const isCorrect = (q.correct || []).includes(o.letter);
        let cls = 'opt';
        if (!checked && isPicked) cls += ' selected';
        if (checked) {
          if (isCorrect && isPicked) cls += ' correct';
          else if (!isCorrect && isPicked) cls += ' wrong';
          else if (isCorrect && !isPicked) cls += ' missed';
        }
        return `
          <div class="${cls}" data-letter="${o.letter}">
            <div class="letter">${o.letter}</div>
            <div class="text">${escapeHtml(o.text)}</div>
          </div>
        `;
      }).join('');

      const correctCount = Object.values(answers).filter(a => a.checked && a.correct).length;
      const answeredCount = Object.values(answers).filter(a => a.checked).length;
      const pct = total ? (answeredCount / total) * 100 : 0;

      const correctLetters = (q.correct && q.correct.length) ? q.correct.join(', ') : '—';
      let feedback = '';
      if (checked) {
        const ev = evaluate();
        if (ev.unknown) {
          feedback = `<div class="feedback show">No official correction recorded for this question.<small>Choices revealed only · select an answer and try the next one.</small></div>`;
        } else if (ev.correct) {
          feedback = `<div class="feedback show ok">✓ Correct! (${correctLetters})<small>${escapeHtml(q.exam)} — Q${q.qn}</small></div>`;
        } else if (ev.partial) {
          feedback = `<div class="feedback show partial">~ Partial. Right answer(s): ${correctLetters}<small>${escapeHtml(q.exam)} — Q${q.qn}</small></div>`;
        } else {
          feedback = `<div class="feedback show bad">✗ Incorrect. Right answer(s): ${correctLetters}<small>${escapeHtml(q.exam)} — Q${q.qn}</small></div>`;
        }
      }

      root.innerHTML = `
        <div class="viewer ${cfg.sidebarHidden ? 'no-sidebar' : ''}">
          ${cfg.sidebarHidden ? '' : `
            <aside class="sidebar">
              <h3>${escapeHtml(module.name)}</h3>
              ${sidebarHtml}
            </aside>
          `}
          <div class="qpane">
            <div class="qhead">
              <div class="qmeta">Q <b>${idx + 1}</b> / ${total} · ${answeredCount} answered · ${correctCount}✓</div>
              <div class="qexam">${escapeHtml(q.exam)}</div>
              ${q.topic ? `<div class="qtopic">${escapeHtml(q.topic)}</div>` : ''}
            </div>
            <div class="qtext">${escapeHtml(q.text)}</div>
            <div class="options">${optionsHtml}</div>
            ${feedback}
            <div class="controls">
              <button id="btn-prev" title="Prev (← / P / K)">‹ Prev</button>
              <button id="btn-check" class="primary" title="${checked ? 'Next (Space / Enter)' : 'Check (Space / Enter)'}">${checked ? 'Next ›' : 'Check'}</button>
              <button id="btn-next" title="Next (→ / N / J)">Next ›</button>
              <button id="btn-reset" title="Reset (R)">Reset</button>
              <button id="btn-toggle-side" title="Sidebar (H)">${cfg.sidebarHidden ? '☰ Show' : '☰ Hide'}</button>
              <button id="btn-auto" title="Auto-advance (A)">${cfg.autoAdvance ? '⏸ Auto' : '▶ Auto'}</button>
              <button id="btn-loadout" title="Loadout (T)">${preset.emoji} ${preset.q}/${preset.a}</button>
              <button id="btn-mod" title="Module switcher (M)">📚</button>
              <div class="progress" title="${answeredCount}/${total}"><span style="width:${pct}%"></span></div>
            </div>
          </div>
        </div>
      `;

      // Wire up controls
      root.querySelectorAll('.opt').forEach(el => {
        el.addEventListener('click', () => toggle(el.dataset.letter));
      });
      root.querySelector('#btn-prev').addEventListener('click', prev);
      root.querySelector('#btn-next').addEventListener('click', next);
      root.querySelector('#btn-check').addEventListener('click', spaceAction);
      root.querySelector('#btn-reset').addEventListener('click', resetCurrent);
      root.querySelector('#btn-toggle-side').addEventListener('click', toggleSidebar);
      root.querySelector('#btn-auto').addEventListener('click', toggleAuto);
      root.querySelector('#btn-loadout').addEventListener('click', cyclePreset);
      root.querySelector('#btn-mod').addEventListener('click', showModuleSwitcher);

      root.querySelectorAll('.q-chip').forEach(el => {
        el.addEventListener('click', () => { gotoIdx(parseInt(el.dataset.idx, 10)); });
      });
      wireSidebarToggles(root);

      // Restart the countdown only when the question/phase changed (not on
      // option-toggle re-renders).
      syncTimer();
    }

    // ===== Exam mode helpers =====
    function enterExam(ei) {
      // Make sure any stale training-mode auto-advance timer is invalidated
      // before we switch view modes.
      stopTimer(); hideIsland();
      activeExamIdx = ei;
      const sess = examSession(ei);
      viewMode = sess.submitted ? 'exam-review' : 'exam-run';
      const start = examStarts[ei];
      const localCur = Math.max(0, Math.min(exams[ei].questions.length - 1, sess.cur || 0));
      idx = start + localCur;
      if (!sess.submitted && (!sess.startedAt)) {
        sess.startedAt = Date.now();
        saveExamSession(ei, sess);
      }
      examStartT = (sess.startedAt || Date.now());
      try {
        const u = new URL(location.href);
        u.searchParams.set('exam', String(ei));
        history.replaceState(null, '', u);
      } catch {}
      render();
    }
    function exitExam() {
      viewMode = 'exam-pick';
      activeExamIdx = null;
      stopExamTimer();
      try {
        const u = new URL(location.href);
        u.searchParams.delete('exam');
        history.replaceState(null, '', u);
      } catch {}
      render();
    }
    function submitExam() {
      if (activeExamIdx == null) return;
      const ei = activeExamIdx;
      const sess = examSession(ei);
      sess.submitted = true;
      sess.submittedAt = Date.now();
      sess.durationSec = Math.max(1, Math.floor((Date.now() - (sess.startedAt || Date.now())) / 1000));
      saveExamSession(ei, sess);
      // Feed the streak/trend: count each answered (non-skipped) question once.
      const grp = exams[ei];
      const perQMs = Math.round((sess.durationSec * 1000) / Math.max(1, grp.questions.length));
      for (let j = 0; j < grp.questions.length; j++) {
        const ev = evaluateExamLocal(ei, j);
        if (ev.kind === 'skipped') continue;
        logActivity(ev.kind === 'correct', perQMs);
      }
      // FMPM barème: note /20, validation at ≥ 10/20 (e.g. ≥ 30/50 correct).
      const sc = examScore(ei);
      const grade20 = examGrade(sc.correct, sc.total);
      if (grade20 >= 10) {
        toast(`✅ ${grp.name} validée — ${grade20.toFixed(2)}/20 (${sc.correct}/${sc.total})`, 'ok');
      } else {
        toast(`❌ ${grp.name} non validée — ${grade20.toFixed(2)}/20 (${sc.correct}/${sc.total})`, 'warn');
      }
      viewMode = 'exam-review';
      stopExamTimer();
      reviewFilter = 'all';
      render();
    }
    function restartExam(ei) {
      LS.del(`exam.${module.slug}.${ei}`);
      enterExam(ei);
    }

    // Two-click confirm for the ↻ button on each picker tile. Just wipes that
    // exam's session and re-renders the picker so the status flips back to "Not started".
    let tileResetPendingEi = null, tileResetT = null;
    function tryResetExamTile(ei, srcBtn) {
      if (tileResetPendingEi === ei) {
        clearTimeout(tileResetT);
        tileResetPendingEi = null;
        resetExamProgress(module.slug, ei);
        toast(`🔄 ${exams[ei].name} — exam progress wiped`, 'ok');
        if (viewMode === 'exam-pick') render();
      } else {
        tileResetPendingEi = ei;
        toast(`⚠️ Click ↻ again to wipe "${exams[ei].name}"`, 'warn');
        if (srcBtn) {
          srcBtn.classList.add('armed');
          setTimeout(() => srcBtn.classList.remove('armed'), 2000);
        }
        tileResetT = setTimeout(() => { tileResetPendingEi = null; }, 2000);
      }
    }
    function evaluateExamLocal(ei, localIdx) {
      const sess = examSession(ei);
      const grp = exams[ei];
      const q = grp.questions[localIdx];
      const got = sess.picked[localIdx] || [];
      const correct = q.correct || [];
      if (correct.length === 0) return { kind: got.length ? 'unknown' : 'skipped' };
      if (got.length === 0) return { kind: 'skipped' };
      const setG = new Set(got), setC = new Set(correct);
      let allRight = true, anyWrong = false;
      for (const c of setC) if (!setG.has(c)) allRight = false;
      for (const g of setG) if (!setC.has(g)) { anyWrong = true; allRight = false; }
      if (allRight && !anyWrong) return { kind: 'correct' };
      if (!anyWrong) return { kind: 'partial' };
      return { kind: 'wrong' };
    }
    // Safe percentage helper — guards against empty exam groups (a hand-edited
    // .txt could yield an exam with 0 questions, which would otherwise show NaN%).
    function pctOf(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }
    function examScore(ei) {
      const grp = exams[ei];
      let correct = 0, partial = 0, wrong = 0, skipped = 0, unknown = 0;
      for (let j = 0; j < grp.questions.length; j++) {
        const ev = evaluateExamLocal(ei, j);
        if (ev.kind === 'correct') correct++;
        else if (ev.kind === 'partial') partial++;
        else if (ev.kind === 'wrong') wrong++;
        else if (ev.kind === 'skipped') skipped++;
        else if (ev.kind === 'unknown') unknown++;
      }
      return { correct, partial, wrong, skipped, unknown, total: grp.questions.length };
    }

    function renderExamPicker() {
      stopTimer(); hideIsland();
      const tiles = exams.map((grp, ei) => {
        const sess = examSession(ei);
        const picks = Object.keys(sess.picked || {}).length;
        let status = '', statusCls = 'fresh';
        if (sess.submitted) {
          const s = examScore(ei);
          status = `✓ ${s.correct}/${s.total} (${pctOf(s.correct, s.total)}%)`;
          statusCls = 'done';
        } else if (picks > 0) {
          status = `… ${picks}/${grp.questions.length} answered (in progress)`;
          statusCls = 'draft';
        } else {
          status = 'Not started';
        }
        const pct = sess.submitted ? pctOf(examScore(ei).correct, grp.questions.length) : pctOf(picks, grp.questions.length);
        const showReset = (picks > 0 || sess.submitted);
        return `
          <div class="exam-tile" data-ei="${ei}" role="button" tabindex="0">
            <span class="num">${ei < 9 ? ei + 1 : ''}</span>
            ${showReset ? `<button class="tile-reset" type="button" data-ei="${ei}" title="Reset this exam's progress (click twice)" aria-label="Reset exam">↻</button>` : ''}
            <div class="name">${escapeHtml(grp.name)}</div>
            <div class="meta">${grp.questions.length} questions${grp.url ? ' · <a class="src-link" href="' + escapeHtml(grp.url) + '" target="_blank" rel="noopener" title="Source">↗</a>' : ''}</div>
            <div class="status ${statusCls}">${status}</div>
            <div class="progress"><span style="width:${pct}%"></span></div>
          </div>
        `;
      }).join('');
      root.innerHTML = `
        <div class="exam-picker">
          <div class="head">
            <h2>📝 Exam Mode — ${escapeHtml(module.name)}</h2>
            <p>Pick an exam to take. You'll answer every question in one sitting, with no feedback. Submit at the end to see the full correction.</p>
            <div class="hint">
              <kbd>1</kbd>–<kbd>9</kbd> open · <kbd>↑↓←→</kbd> focus · <kbd>Enter</kbd> start ·
              <kbd>Esc</kbd> / <kbd>0</kbd> dashboard ·
              <button id="btn-mode-switch" style="margin-left:8px;">Switch to Training mode</button>
            </div>
          </div>
          <div class="exam-list" id="exam-list">${tiles}</div>
        </div>
      `;
      const list = root.querySelector('#exam-list');
      list.querySelectorAll('.exam-tile').forEach(t => {
        t.addEventListener('click', (e) => {
          if (e.target.closest('a.src-link')) return;           // ↗ link → open tab, stop here
          if (e.target.closest('.tile-reset')) return;          // ↻ → handled below
          enterExam(parseInt(t.dataset.ei, 10));
        });
        t.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            enterExam(parseInt(t.dataset.ei, 10));
          }
        });
      });
      list.querySelectorAll('.tile-reset').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          tryResetExamTile(parseInt(btn.dataset.ei, 10), btn);
        });
      });
      root.querySelector('#btn-mode-switch').addEventListener('click', () => {
        LS.set('mode', 'training');
        location.href = location.pathname;
      });
      // Reapply the keyboard focus cursor after a re-render (e.g. a tile reset).
      if (examPickFocus >= 0) focusExamTile(examPickFocus);
    }

    // Move the keyboard focus cursor among the exam-picker tiles (mirrors the
    // dashboard's focusCardByIdx). Arrow keys drive this; Enter opens the tile.
    function focusExamTile(i) {
      const tiles = [...root.querySelectorAll('.exam-tile')];
      root.querySelectorAll('.exam-tile.focused').forEach(t => t.classList.remove('focused'));
      if (tiles.length === 0) { examPickFocus = -1; return; }
      examPickFocus = Math.max(0, Math.min(i, tiles.length - 1));
      const tile = tiles[examPickFocus];
      tile.classList.add('focused');
      tile.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function startExamTimer() {
      stopExamTimer();
      examTimerH = setInterval(() => {
        const banner = document.getElementById('exam-banner-timer');
        if (banner) {
          const sec = Math.floor((Date.now() - examStartT) / 1000);
          const m = Math.floor(sec / 60), s = String(sec % 60).padStart(2, '0');
          banner.textContent = `${m}:${s}`;
        }
      }, 1000);
    }
    function stopExamTimer() {
      if (examTimerH) { clearInterval(examTimerH); examTimerH = null; }
    }

    function renderExamRun() {
      const ei = activeExamIdx;
      const grp = exams[ei];
      const start = examStarts[ei];
      const total = grp.questions.length;
      const localIdx = idx - start;
      const q = grp.questions[localIdx];
      const sess = examSession(ei);
      const sessPicked = sess.picked[localIdx] || [];
      picked = new Set(sessPicked);
      checked = false;
      phase = 'question';   // exam has no answer phase — the countdown always times the question

      const sidebarHtml = buildSidebarHtml({
        chipState: (qIdx) => {
          if (qIdx < start || qIdx >= start + total) {
            return { kind: 'untouched', dim: true };
          }
          const li = qIdx - start;
          const p = sess.picked[li];
          if (p && p.length > 0) return { kind: 'picked' };
          return { kind: 'untouched' };
        },
        currentGlobal: idx,
      });

      const optionsHtml = (q.options || []).map((o) => {
        const isPicked = picked.has(o.letter);
        let cls = 'opt';
        if (isPicked) cls += ' selected';
        return `
          <div class="${cls}" data-letter="${o.letter}">
            <div class="letter">${o.letter}</div>
            <div class="text">${escapeHtml(o.text)}</div>
          </div>
        `;
      }).join('');

      const answered = Object.keys(sess.picked || {}).filter(k => (sess.picked[k] || []).length > 0).length;
      const pct = total ? (answered / total) * 100 : 0;
      const elapsedSec = Math.floor((Date.now() - examStartT) / 1000);
      const elapsedM = Math.floor(elapsedSec / 60), elapsedS = String(elapsedSec % 60).padStart(2, '0');

      root.innerHTML = `
        <div class="viewer ${cfg.sidebarHidden ? 'no-sidebar' : ''}">
          ${cfg.sidebarHidden ? '' : `
            <aside class="sidebar">
              <h3>${escapeHtml(module.name)}</h3>
              ${sidebarHtml}
            </aside>
          `}
          <div class="qpane">
            <div class="exam-banner">
              <span class="dot"></span>
              <span class="label">EXAM</span>
              <span>${escapeHtml(grp.name)} · Q ${localIdx + 1}/${total} · ${answered} answered</span>
              <span class="timer" id="exam-banner-timer">${elapsedM}:${elapsedS}</span>
            </div>
            <div class="qhead">
              <div class="qmeta">Q <b>${q.qn}</b> / ${total}</div>
              ${q.topic ? `<div class="qtopic">${escapeHtml(q.topic)}</div>` : ''}
            </div>
            <div class="qtext">${escapeHtml(q.text)}</div>
            <div class="options">${optionsHtml}</div>
            <div class="controls">
              <button id="btn-prev" title="Prev (← / K)">‹ Prev</button>
              <button id="btn-next" title="Next (→ / N / J / Space / Enter)">Next ›</button>
              <button id="btn-reset" title="Reset (R)">Clear</button>
              <button id="btn-toggle-side" title="Sidebar (H)">${cfg.sidebarHidden ? '☰ Show' : '☰ Hide'}</button>
              <button id="btn-exit-exam" title="Pause & exit (Esc)">⏸ Exit</button>
              <button id="btn-submit" class="primary" title="Submit exam (press twice)">Submit ▶</button>
              <div class="progress" title="${answered}/${total} answered"><span style="width:${pct}%"></span></div>
            </div>
          </div>
        </div>
      `;

      root.querySelectorAll('.opt').forEach(el => {
        el.addEventListener('click', () => toggle(el.dataset.letter));
      });
      root.querySelector('#btn-prev').addEventListener('click', prev);
      root.querySelector('#btn-next').addEventListener('click', next);
      root.querySelector('#btn-reset').addEventListener('click', resetCurrent);
      root.querySelector('#btn-toggle-side').addEventListener('click', toggleSidebar);
      root.querySelector('#btn-exit-exam').addEventListener('click', exitExam);
      root.querySelector('#btn-submit').addEventListener('click', tryConfirmSubmit);
      root.querySelectorAll('.q-chip[data-idx]').forEach(el => {
        el.addEventListener('click', () => { gotoIdx(parseInt(el.dataset.idx, 10)); });
      });
      wireSidebarToggles(root);
      startExamTimer();
      // Per-question auto-advance countdown: resets on every navigation (manual
      // or auto), but not when merely picking an option (same idx → no restart).
      syncTimer();
    }

    function tryConfirmSubmit() {
      if (submitConfirm) {
        clearTimeout(submitConfirmT); submitConfirm = false;
        submitExam();
      } else {
        submitConfirm = true;
        const ei = activeExamIdx;
        const sess = examSession(ei);
        const total = exams[ei].questions.length;
        const answered = Object.keys(sess.picked || {}).filter(k => (sess.picked[k] || []).length > 0).length;
        const left = total - answered;
        toast(`📝 Press Submit again to lock in (${left} unanswered)`, left > 0 ? 'warn' : 'ok');
        submitConfirmT = setTimeout(() => { submitConfirm = false; }, 3000);
      }
    }

    function renderExamReview() {
      stopTimer(); hideIsland(); stopExamTimer();
      const ei = activeExamIdx;
      const grp = exams[ei];
      const start = examStarts[ei];
      const sess = examSession(ei);
      const s = examScore(ei);
      const score100 = pctOf(s.correct, s.total);
      const dur = sess.durationSec || 0;
      const durM = Math.floor(dur / 60), durS = String(dur % 60).padStart(2, '0');
      const scoreCls = score100 >= 70 ? 'good' : score100 >= 50 ? 'mid' : 'bad';
      // FMPM barème grade + validation + bubble-sheet correction (template PDF).
      const grade20 = examGrade(s.correct, s.total);
      const validated = grade20 >= 10;
      const threshold = examPassThreshold(s.total);
      const answerSheetHtml = buildExamAnswerSheet(grp, sess, {
        module: module.name,
        niveau: (module.sem || '').toUpperCase(),
        session: grp.name,
      });
      const verdictHtml = `
        <div class="exam-verdict ${validated ? 'ok' : 'no'}">
          <div class="ev-grade">${grade20.toFixed(2)}<small>/20</small></div>
          <div class="ev-main">
            <div class="ev-title">${validated ? '✅ ' : '❌ '}${escapeHtml(grp.name)} ${validated ? 'validée' : 'non validée'}</div>
            <div class="ev-sub">${s.correct}/${s.total} bonnes réponses · seuil de validation 10/20 (≥ ${threshold}/${s.total})${validated ? '' : ` · il manque ${Math.max(0, threshold - s.correct)} bonne(s) réponse(s)`}</div>
          </div>
        </div>`;

      const inExam = (idx >= start && idx < start + grp.questions.length);
      const sidebarHtml = buildSidebarHtml({
        chipState: (qIdx) => {
          if (qIdx < start || qIdx >= start + grp.questions.length) return { kind: 'untouched' };
          const li = qIdx - start;
          const ev = evaluateExamLocal(ei, li);
          if (ev.kind === 'skipped') return { kind: 'untouched' };
          return { kind: ev.kind };
        },
        currentGlobal: inExam ? idx : -1,
      });

      const items = grp.questions.map((q, j) => {
        const ev = evaluateExamLocal(ei, j);
        const picks = new Set(sess.picked[j] || []);
        const correctSet = new Set(q.correct || []);
        let verdict = ev.kind;
        const optsHtml = (q.options || []).map(o => {
          let cls = 'ri-opt';
          const isC = correctSet.has(o.letter);
          const isP = picks.has(o.letter);
          if (isC && isP) cls += ' picked-correct';
          else if (!isC && isP) cls += ' picked-wrong';
          else if (isC && !isP) cls += ' correct missed';
          return `<div class="${cls}"><span class="letter">${o.letter}</span><span>${escapeHtml(o.text)}</span></div>`;
        }).join('');
        return `
          <div class="review-item ${verdict}" data-verdict="${verdict}" data-local="${j}">
            <div class="ri-head">
              <span class="qn">Q${q.qn}</span>
              <span class="verdict ${verdict}">${verdictLabel(verdict)}</span>
              <span class="ri-spacer"></span>
              ${q.topic ? `<span class="topic">${escapeHtml(q.topic)}</span>` : ''}
              <button class="ri-copy" type="button" title="Copier le prompt de correction (énoncé + ma réponse + correction officielle)">📋 Copier</button>
            </div>
            <div class="ri-q">${escapeHtml(q.text)}</div>
            <div class="ri-opts">${optsHtml}</div>
          </div>
        `;
      }).join('');

      // Footer nav — jump straight from this correction to the previous / next
      // exam (mirrors clicking its picker tile: shows that exam's correction if
      // already taken, otherwise starts it). Only shown when there's more than
      // one exam to move between. This footer is exclusive to exam-review.
      const prevEi = ei - 1, nextEi = ei + 1;
      const hasPrev = prevEi >= 0, hasNext = nextEi < exams.length;
      const navHtml = exams.length <= 1 ? '' : `
        <div class="review-nav">
          <button id="btn-prev-exam" class="rn-btn rn-prev" type="button" ${hasPrev ? '' : 'disabled'}
            title="${hasPrev ? 'Previous exam: ' + escapeHtml(exams[prevEi].name) : 'This is the first exam'}">
            <span class="rn-dir">‹ Previous exam <kbd>[</kbd></span>
            <span class="rn-name">${hasPrev ? escapeHtml(exams[prevEi].name) : '—'}</span>
          </button>
          <span class="rn-pos">Exam ${ei + 1} / ${exams.length}</span>
          <button id="btn-next-exam" class="rn-btn rn-next" type="button" ${hasNext ? '' : 'disabled'}
            title="${hasNext ? 'Next exam: ' + escapeHtml(exams[nextEi].name) : 'This is the last exam'}">
            <span class="rn-dir"><kbd>]</kbd> Next exam ›</span>
            <span class="rn-name">${hasNext ? escapeHtml(exams[nextEi].name) : '—'}</span>
          </button>
        </div>
      `;

      root.innerHTML = `
        <div class="viewer ${cfg.sidebarHidden ? 'no-sidebar' : ''}">
          ${cfg.sidebarHidden ? '' : `
            <aside class="sidebar">
              <h3>${escapeHtml(module.name)}</h3>
              ${sidebarHtml}
            </aside>
          `}
          <div class="qpane">
            <div class="review-head">
              <div>
                <h2>📊 ${escapeHtml(grp.name)} — Results</h2>
                <div class="sub">${s.correct} correct · ${s.partial} partial · ${s.wrong} wrong · ${s.skipped} skipped${s.unknown ? ' · ' + s.unknown + ' no-correction' : ''}${dur ? ' · ' + durM + ':' + durS + ' taken' : ''} · Note ${grade20.toFixed(2)}/20</div>
                <div class="review-actions">
                  <button id="btn-exit-exam">‹ Pick another exam</button>
                  <button id="btn-restart-exam">↻ Retake this exam</button>
                  ${grp.url ? `<a class="btn" href="${escapeHtml(grp.url)}" target="_blank" rel="noopener">↗ Original source</a>` : ''}
                </div>
              </div>
              <div class="score ${scoreCls}">${score100}%<small>${s.correct}/${s.total}</small></div>
            </div>
            ${verdictHtml}
            ${answerSheetHtml}
            <div class="review-filters">
              <span class="chip ${reviewFilter==='all'?'active':''}"     data-f="all">All ${s.total}</span>
              <span class="chip ${reviewFilter==='correct'?'active':''}" data-f="correct">Correct ${s.correct}</span>
              <span class="chip ${reviewFilter==='partial'?'active':''}" data-f="partial">Partial ${s.partial}</span>
              <span class="chip ${reviewFilter==='wrong'?'active':''}"   data-f="wrong">Wrong ${s.wrong}</span>
              <span class="chip ${reviewFilter==='skipped'?'active':''}" data-f="skipped">Skipped ${s.skipped}</span>
            </div>
            <div id="review-items">${items}</div>
            ${navHtml}
          </div>
        </div>
      `;

      function applyFilter() {
        root.querySelectorAll('.review-item').forEach(el => {
          if (reviewFilter === 'all' || el.dataset.verdict === reviewFilter) el.style.display = '';
          else el.style.display = 'none';
        });
        // Filtering changes which cards are visible — drop the keyboard cursor so
        // the next ↑/↓ restarts cleanly from the top of the new visible set.
        root.querySelectorAll('.review-item.focused').forEach(el => el.classList.remove('focused'));
        reviewFocus = -1;
      }
      applyFilter();

      root.querySelectorAll('.review-filters .chip').forEach(c => {
        c.addEventListener('click', () => {
          reviewFilter = c.dataset.f;
          root.querySelectorAll('.review-filters .chip').forEach(x => x.classList.toggle('active', x.dataset.f === reviewFilter));
          applyFilter();
        });
      });
      root.querySelector('#btn-exit-exam').addEventListener('click', exitExam);
      root.querySelector('#btn-restart-exam').addEventListener('click', () => restartExam(activeExamIdx));
      // Footer prev/next-exam buttons (no-ops at the ends — they render disabled).
      const prevExamBtn = root.querySelector('#btn-prev-exam');
      if (prevExamBtn && !prevExamBtn.disabled) prevExamBtn.addEventListener('click', () => enterExam(activeExamIdx - 1));
      const nextExamBtn = root.querySelector('#btn-next-exam');
      if (nextExamBtn && !nextExamBtn.disabled) nextExamBtn.addEventListener('click', () => enterExam(activeExamIdx + 1));
      // Fresh list — clear the keyboard/hover cursors from any previous render.
      reviewFocus = -1; reviewHover = -1;
      // Per-card wiring: the 📋 button copies a ready-to-paste correction prompt,
      // and mouseenter/leave track which card is hovered so Alt+C copies that one.
      root.querySelectorAll('.review-item').forEach(item => {
        const j = parseInt(item.dataset.local, 10);
        item.addEventListener('mouseenter', () => { reviewHover = j; });
        item.addEventListener('mouseleave', () => { if (reviewHover === j) reviewHover = -1; });
        const btn = item.querySelector('.ri-copy');
        if (btn) btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyReviewItemEl(item);
        });
      });
      root.querySelectorAll('.q-chip[data-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const qi = parseInt(el.dataset.idx, 10);
          const li = qi - start;
          if (li < 0 || li >= grp.questions.length) return;
          idx = qi; // focus this question so Alt+C / Shift+V copy the right one
          // Incremental highlight — avoid wiping the long review list.
          root.querySelectorAll('.q-chip.current').forEach(c => c.classList.remove('current'));
          el.classList.add('current');
          const target = root.querySelector(`.review-item[data-local="${li}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
      wireSidebarToggles(root);
    }

    // Copy the ready-to-paste correction prompt (énoncé + ma réponse + correction
    // officielle, "Professeur agrégé" format) for one review card, with the same
    // toast + ✓ button feedback whether triggered by the 📋 button or by Alt+C.
    function copyReviewItemEl(item) {
      if (!item) return;
      const grp = exams[activeExamIdx];
      const j = parseInt(item.dataset.local, 10);
      if (!grp || isNaN(j)) return;
      const text = buildExamReviewPrompt(activeExamIdx, j);
      if (!text) { toast('Rien à copier', 'warn'); return; }
      copyText(text).then(ok => {
        if (ok) {
          toast(`📋 Prompt copié — Q${grp.questions[j].qn} (${text.length} car.)`, 'ok');
          const btn = item.querySelector('.ri-copy');
          if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copié';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = prev; btn.classList.remove('copied'); }, 1300);
          }
        } else {
          toast('⚠️ Copie impossible — sélectionnez et copiez manuellement', 'warn');
        }
      });
    }

    // Move the keyboard focus cursor among the *visible* review cards (mirrors the
    // dashboard's focusCardByIdx / the picker's focusExamTile). Also syncs `idx`
    // and the sidebar's "current" chip so Alt+C / Shift+V stay on the same Q.
    function focusReviewItem(i) {
      const vis = [...root.querySelectorAll('.review-item')].filter(el => el.style.display !== 'none');
      root.querySelectorAll('.review-item.focused').forEach(el => el.classList.remove('focused'));
      if (vis.length === 0) { reviewFocus = -1; return; }
      reviewFocus = Math.max(0, Math.min(i, vis.length - 1));
      const el = vis[reviewFocus];
      el.classList.add('focused');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const li = parseInt(el.dataset.local, 10);
      const gi = examStarts[activeExamIdx] + li;
      if (!isNaN(gi)) {
        idx = gi;
        root.querySelectorAll('.q-chip.current').forEach(c => c.classList.remove('current'));
        const chip = root.querySelector(`.q-chip[data-idx="${gi}"]`);
        if (chip) chip.classList.add('current');
      }
    }

    // Alt+C / Enter on the review screen: copy the prompt for whichever card the
    // mouse is hovering, else the keyboard-focused card. Nudge the user otherwise.
    function copyReviewActive() {
      let el = null;
      if (reviewHover >= 0) {
        const h = root.querySelector(`.review-item[data-local="${reviewHover}"]`);
        if (h && h.style.display !== 'none') el = h;
      }
      if (!el) el = root.querySelector('.review-item.focused');
      if (!el) { toast('Survolez une question (ou ↑/↓) puis Alt+C', 'warn'); return; }
      copyReviewItemEl(el);
    }

    function verdictLabel(k) {
      return ({
        correct: '✓ Correct',
        partial: '~ Partial',
        wrong:   '✗ Wrong',
        skipped: '— Skipped',
        unknown: '? No official correction',
      })[k] || k;
    }

    function examLocalIdx() { return idx - examStarts[activeExamIdx]; }

    function toggle(letter) {
      if (viewMode === 'exam-review') return;
      if (viewMode === 'exam-run') {
        const ei = activeExamIdx;
        const li = examLocalIdx();
        const sess = examSession(ei);
        const cur = new Set(sess.picked[li] || []);
        if (!cfg.multiSelect) cur.clear();
        if (cur.has(letter)) cur.delete(letter); else cur.add(letter);
        sess.picked[li] = [...cur];
        sess.cur = li;
        saveExamSession(ei, sess);
        picked = cur;
        // re-render just the option states without rebuilding the whole pane
        renderExamRun();
        return;
      }
      // training
      if (checked) return;
      if (!cfg.multiSelect) picked.clear();
      if (picked.has(letter)) picked.delete(letter); else picked.add(letter);
      answers[idx] = { ...(answers[idx] || {}), picked: [...picked], checked: false };
      persist();
      render();
    }

    function check() {
      if (viewMode !== 'training') return;
      checked = true;
      const ev = evaluate();
      const prev = answers[idx] || {};
      const dt = Math.min(600000, Math.max(0, Date.now() - shownAt)); // clamp idle skew
      answers[idx] = {
        picked: [...picked],
        checked: true,
        correct: ev.correct,
        partial: ev.partial,
        unknown: ev.unknown,
        ts: Date.now(),                       // last-seen, powers recency reminders
        tMs: prev.tMs ? prev.tMs : dt,        // time to first answer
        n: (prev.n || 0) + 1,                 // review frequency
      };
      // Count a day's activity only the first time a question is checked, so
      // re-checking the same one doesn't inflate the streak/trend.
      if (!prev.checked) logActivity(!ev.unknown && ev.correct, dt);
      persist();
      phase = 'answer';
      render();
    }

    function navWithin(direction) {
      if (viewMode === 'exam-run') {
        const ei = activeExamIdx;
        const grp = exams[ei];
        const start = examStarts[ei];
        const end = start + grp.questions.length;
        const ni = idx + direction;
        if (ni < start || ni >= end) return false;
        idx = ni;
        const sess = examSession(ei);
        sess.cur = ni - start;
        saveExamSession(ei, sess);
        render();
        return true;
      }
      if (direction > 0 && idx < questions.length - 1) { idx++; phase = 'question'; render(); return true; }
      if (direction < 0 && idx > 0) { idx--; phase = 'question'; render(); return true; }
      return false;
    }

    function next() {
      if (viewMode === 'exam-review') return;
      const moved = navWithin(+1);
      if (!moved && viewMode !== 'exam-run') toast('🏁 End of module. Great work!', 'ok');
      else if (!moved && viewMode === 'exam-run') toast('Last question — press Submit when ready', 'warn');
    }
    function prev() {
      if (viewMode === 'exam-review') return;
      navWithin(-1);
    }
    function gotoIdx(i) {
      if (viewMode === 'exam-run') {
        const ei = activeExamIdx;
        const start = examStarts[ei];
        const end = start + exams[ei].questions.length;
        if (i < start || i >= end) return;
        idx = i;
        const sess = examSession(ei);
        sess.cur = i - start;
        saveExamSession(ei, sess);
        render();
        return;
      }
      if (viewMode === 'exam-review') return;
      if (i < 0 || i >= questions.length) return;
      idx = i;
      phase = 'question';
      render();
    }
    function gotoQuestionPrompt() {
      const max = (viewMode === 'exam-run') ? exams[activeExamIdx].questions.length : questions.length;
      const curDisplay = (viewMode === 'exam-run') ? (examLocalIdx() + 1) : (idx + 1);
      const v = window.prompt(`Go to question (1–${max}):`, String(curDisplay));
      if (!v) return;
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1 || n > max) return;
      if (viewMode === 'exam-run') gotoIdx(examStarts[activeExamIdx] + n - 1);
      else gotoIdx(n - 1);
    }

    function resetCurrent() {
      if (viewMode === 'exam-run') {
        const ei = activeExamIdx;
        const li = examLocalIdx();
        const sess = examSession(ei);
        delete sess.picked[li];
        saveExamSession(ei, sess);
        picked.clear();
        render();
        toast('🔄 Cleared', 'warn');
        return;
      }
      if (viewMode === 'exam-review') return;
      delete answers[idx];
      picked.clear();
      checked = false;
      phase = 'question';
      shownAt = Date.now();   // restart the per-question clock
      persist();
      render();
      toast('🔄 Question reset', 'warn');
    }

    function spaceAction() {
      if (viewMode === 'exam-run') { next(); return; }
      if (viewMode === 'exam-review') return;
      if (!checked) {
        if (picked.size === 0) {
          const q = currentQ();
          if (!q.options.length) return;
          const r = q.options[Math.floor(Math.random() * q.options.length)];
          picked.add(r.letter);
          toast(`Random pick: ${r.letter}`, 'warn');
          answers[idx] = { ...(answers[idx] || {}), picked: [...picked], checked: false };
          persist();
        }
        check();
      } else {
        next();
      }
    }

    function toggleSidebar() {
      cfg.sidebarHidden = !cfg.sidebarHidden;
      LS.set('sidebarHidden', cfg.sidebarHidden);
      render();
    }

    function toggleAuto() {
      cfg.autoAdvance = !cfg.autoAdvance;
      LS.set('autoAdvance', cfg.autoAdvance);
      toast(cfg.autoAdvance ? '▶ Auto-advance ON' : '⏸ Auto-advance OFF', 'ok');
      // render() → syncTimer() starts the countdown when turning on; stop it
      // explicitly when turning off (covers modes whose render skips syncTimer).
      if (!cfg.autoAdvance) { stopTimer(); hideIsland(); timerIdx = -1; timerPhase = null; }
      render();
    }

    // ===== Timer / dynamic island =====
    function showIsland() { island.classList.add('show'); }
    function hideIsland() { island.classList.remove('show', 'low', 'pulse'); }
    function renderIsland(remaining, total, kind) {
      const low = remaining <= 3 && remaining > 0;
      island.classList.toggle('low', low);
      island.classList.toggle('pulse', low);
      const label = kind === 'question' ? '❓ Question' : '✅ Answer';
      island.innerHTML = `<span style="font-size:14px;opacity:.9">${label}</span><span class="num">${remaining}s</span>`;
      showIsland();
    }

    function startTimer() {
      stopTimer();
      if (!cfg.autoAdvance) { hideIsland(); return; }
      timerEpoch++;
      const epoch = timerEpoch;
      const dur = phase === 'question' ? preset.q : preset.a;
      timerDur = dur;
      timerStart = Date.now();
      const tick = () => {
        if (epoch !== timerEpoch) return;
        const elapsed = Math.floor((Date.now() - timerStart) / 1000);
        const remaining = Math.max(0, dur - elapsed);
        renderIsland(remaining, dur, phase);
        if (remaining <= 0) {
          if (phase === 'question' && !checked) {
            spaceAction(); // auto-check (random if no pick)
          } else {
            next();
          }
          return;
        }
        timerH = setTimeout(tick, 250);
      };
      tick();
    }
    function stopTimer() {
      if (timerH) { clearTimeout(timerH); timerH = null; }
      timerEpoch++;
    }
    // Called on every render. Restarts the per-question countdown only when the
    // question (or phase) actually changes — so navigating to another question
    // resets the timer, while re-renders from picking an option keep the clock.
    function syncTimer() {
      if (!cfg.autoAdvance) { stopTimer(); hideIsland(); timerIdx = -1; timerPhase = null; return; }
      if (idx !== timerIdx || phase !== timerPhase || !timerH) {
        timerIdx = idx;
        timerPhase = phase;
        startTimer();
      }
    }

    // ===== Copy prompts =====
    function buildSimplePrompt() {
      if (viewMode === 'exam-pick' || viewMode === 'exam-review') return null;
      const q = currentQ();
      if (!q) return null;
      const opts = q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
      return `Question médicale :\n${q.text}\n\nPropositions :\n${opts}\n\nPour chaque proposition, indique si elle est VRAIE ou FAUSSE avec une explication courte et précise.`;
    }
    function buildAIPrompt() {
      if (viewMode === 'exam-pick') return null;
      const q = currentQ();
      if (!q) return null;
      const opts = q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
      let p = `Rôle : Agis en tant que Professeur agrégé de médecine et expert en pédagogie médicale. Corrige ce QCM avec rigueur et clarté.\n\n`;
      p += `### Contexte\n* Module : ${module.name}\n* Examen : ${q.exam}\n* Question : Q${q.qn}${q.topic ? ' — ' + q.topic : ''}\n\n`;
      p += `### Question\n${q.text}\n\n`;
      p += `### Propositions\n${opts}\n\n`;
      // Show correction only when it's already been revealed to the user
      // (training-mode checked, or exam-review). Never leak during exam-run.
      const correctionVisible = (viewMode === 'training' && checked) || viewMode === 'exam-review';
      if (cfg.showCorrectionOnCopy && correctionVisible && q.correct && q.correct.length) {
        p += `### Correction officielle\n${q.correct.join(', ')}\n\n`;
      }
      p += `### Ta mission (Markdown)\n`;
      p += `1. **Verdict** : la (ou les) bonne(s) réponse(s) en gras.\n`;
      p += `2. **Diagnostic / cadre** : identifie la pathologie ou le mécanisme central.\n`;
      p += `3. **Mots-clés** : puces des éléments décisifs de l'énoncé.\n`;
      p += `4. **Justification** : pourquoi la (les) bonne(s) réponse(s).\n`;
      p += `5. **Distracteurs** : pourquoi chaque mauvaise proposition est fausse, et à quoi elle ferait référence sinon.\n`;
      p += `6. **Perle 💎** : piège classique, recommandation ou astuce mnémotechnique.`;
      return p;
    }
    // Self-contained correction prompt for ONE exam-review question: énoncé +
    // the user's selection + the official correction, in the same "Professeur
    // agrégé" format. Used by the 📋 button on each review card so any question
    // can be handed to an AI without leaving the results screen.
    function buildExamReviewPrompt(ei, j) {
      const grp = exams[ei];
      if (!grp) return null;
      const q = grp.questions[j];
      if (!q) return null;
      const sess = examSession(ei);
      const picks = sess.picked[j] || [];
      const map = {};
      (q.options || []).forEach(o => { map[o.letter] = o.text; });
      const optsList = (q.options || []).map(o => `${o.letter}. ${o.text}`).join('\n');
      const fmtLetters = (arr) => (arr && arr.length)
        ? arr.map(l => `${l}. ${map[l] || '?'}`).join('\n')
        : '(aucune réponse cochée)';
      let p = `Rôle : Agis en tant que Professeur agrégé de médecine et expert en pédagogie médicale. Corrige ce QCM avec rigueur et clarté.\n\n`;
      p += `### Contexte\n* Module : ${module.name}\n* Examen : ${q.exam || grp.name}\n* Question : Q${q.qn}${q.topic ? ' — ' + q.topic : ''}\n\n`;
      p += `### Question\n${q.text}\n\n`;
      p += `### Propositions\n${optsList}\n\n`;
      p += `### Ma réponse\n${fmtLetters(picks)}\n\n`;
      p += `### Correction officielle\n${(q.correct && q.correct.length) ? fmtLetters(q.correct) : '(non disponible)'}\n\n`;
      p += `### Ta mission (Markdown)\n`;
      p += `1. **Verdict** : la (ou les) bonne(s) réponse(s) en gras.\n`;
      p += `2. **Diagnostic / cadre** : identifie la pathologie ou le mécanisme central.\n`;
      p += `3. **Mots-clés** : puces des éléments décisifs de l'énoncé.\n`;
      p += `4. **Justification** : pourquoi la (les) bonne(s) réponse(s).\n`;
      p += `5. **Distracteurs** : pourquoi chaque mauvaise proposition est fausse, et à quoi elle ferait référence sinon.\n`;
      p += `6. **Perle 💎** : piège classique, recommandation ou astuce mnémotechnique.`;
      return p;
    }
    function copyPrompt(builder, label) {
      const text = builder();
      if (!text) { toast('Open a question first to copy', 'warn'); return; }
      copyText(text).then(ok => toast(
        ok ? `📋 ${label} copied (${text.length} chars)` : '⚠️ Copy failed — select & copy manually',
        ok ? 'ok' : 'warn'));
    }

    // ===== Keyboard =====
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleCommandPalette(); return; }
      if (handleOverlayKeys(e)) return;
      const target = e.target;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (inField) {
        if (e.key === 'Escape') target.blur();
        return;
      }

      const k = e.key;

      // Esc exits exam-run/review back to picker; from picker, goes to dashboard.
      if (k === 'Escape' && !document.querySelector('.overlay')) {
        if (viewMode === 'exam-run' || viewMode === 'exam-review') {
          e.preventDefault(); exitExam(); return;
        }
        if (viewMode === 'exam-pick') {
          e.preventDefault(); window.location.href = '../index.html'; return;
        }
      }

      // Exam picker: digit jump + arrow focus + dashboard
      if (viewMode === 'exam-pick') {
        if (handleGlobalKeys(e)) return;
        if (/^[1-9]$/.test(k)) {
          const ei = parseInt(k, 10) - 1;
          if (ei < exams.length) { e.preventDefault(); enterExam(ei); }
          return;
        }
        // Arrow keys move a focus cursor across the exam tiles; Enter opens it.
        if (k === 'ArrowRight') { e.preventDefault(); focusExamTile(examPickFocus < 0 ? 0 : examPickFocus + 1); return; }
        if (k === 'ArrowLeft')  { e.preventDefault(); focusExamTile(examPickFocus < 0 ? 0 : examPickFocus - 1); return; }
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          e.preventDefault();
          const list = root.querySelector('#exam-list');
          const cols = list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : 1;
          const step = (k === 'ArrowDown' ? cols : -cols);
          focusExamTile(examPickFocus < 0 ? 0 : examPickFocus + step);
          return;
        }
        if (k === 'Enter' && examPickFocus >= 0 && examPickFocus < exams.length) {
          e.preventDefault(); enterExam(examPickFocus); return;
        }
        if (k === '0' || (k === 'd' && !e.ctrlKey && !e.metaKey)) {
          e.preventDefault();
          if (dashboardConfirm) { clearTimeout(dashboardConfirmT); window.location.href = '../index.html'; }
          else { dashboardConfirm = true; toast('🏠 Press 0/D again for Dashboard', 'warn');
                 dashboardConfirmT = setTimeout(() => { dashboardConfirm = false; }, 1500); }
          return;
        }
        if (k === 'h' || k === 'H') { e.preventDefault(); toggleSidebar(); return; }
        return;
      }

      // Exam review: Alt+C copy hovered/focused card, ↑↓/JK navigate cards,
      // digit filter chips, R retake, H sidebar, 0/D dashboard
      if (viewMode === 'exam-review') {
        if (handleGlobalKeys(e)) return;
        // Alt+C — copy the correction prompt for the hovered (or focused) card.
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && k.toLowerCase() === 'c') {
          e.preventDefault(); copyReviewActive(); return;
        }
        if (/^[1-5]$/.test(k)) {
          e.preventDefault();
          reviewFilter = ['all','correct','partial','wrong','skipped'][parseInt(k, 10) - 1];
          render();
          return;
        }
        // Navigate between correction cards (mirrors dashboard / exam-picker focus).
        if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'n' || k === 'N' || k === 'j' || k === 'J') {
          e.preventDefault(); focusReviewItem(reviewFocus < 0 ? 0 : reviewFocus + 1); return;
        }
        if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'k' || k === 'K') {
          e.preventDefault(); focusReviewItem(reviewFocus < 0 ? 0 : reviewFocus - 1); return;
        }
        // Enter activates the focused/hovered card = copy its prompt.
        if (k === 'Enter') { e.preventDefault(); copyReviewActive(); return; }
        // [ / ] — jump to the previous / next exam (same as the footer buttons).
        if (k === '[') {
          e.preventDefault();
          if (activeExamIdx > 0) enterExam(activeExamIdx - 1); else toast('Already at the first exam', 'warn');
          return;
        }
        if (k === ']') {
          e.preventDefault();
          if (activeExamIdx < exams.length - 1) enterExam(activeExamIdx + 1); else toast('Already at the last exam', 'warn');
          return;
        }
        if (k === 'r' || k === 'R') { e.preventDefault(); restartExam(activeExamIdx); return; }
        if (k === 'h' || k === 'H') { e.preventDefault(); toggleSidebar(); return; }
        if (k === '0' || (k === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
          e.preventDefault();
          if (dashboardConfirm) { clearTimeout(dashboardConfirmT); window.location.href = '../index.html'; }
          else {
            dashboardConfirm = true;
            toast('🏠 Press 0/D again for Dashboard', 'warn');
            dashboardConfirmT = setTimeout(() => { dashboardConfirm = false; }, 1500);
          }
          return;
        }
        return;
      }

      // Always-on shortcuts (training / exam-run share these)
      if (handleGlobalKeys(e)) return;

      // Submit exam shortcut: Shift+Enter
      if (viewMode === 'exam-run' && e.shiftKey && k === 'Enter') {
        e.preventDefault(); tryConfirmSubmit(); return;
      }

      // Module page-specific
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && k.toLowerCase() === 'c') {
        e.preventDefault(); copyPrompt(buildAIPrompt, 'AI prompt'); return;
      }
      if (k === 'v' || k === 'V') {
        e.preventDefault();
        if (e.shiftKey) showAIMenu(buildSimplePrompt());
        else copyPrompt(buildSimplePrompt, 'Question prompt');
        return;
      }

      if (k === 't' || k === 'T') {
        if (e.shiftKey) { e.preventDefault(); showLoadoutTable(); return; }
        if (!tLongT) {
          tLongT = setTimeout(() => { showLoadoutTable(); tLong = true; }, 600);
        }
        return;
      }

      if (k === 'a' || k === 'A') { e.preventDefault(); toggleAuto(); return; }
      if (k === 'r' || k === 'R') {
        e.preventDefault();
        if (resetConfirm) {
          clearTimeout(resetConfirmT); resetConfirm = false;
          resetCurrent();
        } else {
          resetConfirm = true;
          toast('⚠️ Press R again to reset this question', 'warn');
          resetConfirmT = setTimeout(() => { resetConfirm = false; }, 1500);
        }
        return;
      }
      if (k === 'g' || k === 'G') { e.preventDefault(); gotoQuestionPrompt(); return; }
      if (k === 'h' || k === 'H') { e.preventDefault(); toggleSidebar(); return; }

      // Digit shortcuts: 1-5 select option, 6 settings, 7 auto, 8 loadout cycle, 9 module switcher, 0 dashboard
      if (/^[1-5]$/.test(k)) {
        e.preventDefault();
        const q = currentQ();
        const letter = String.fromCharCode(64 + parseInt(k, 10)); // 1 -> 'A'
        const exists = q.options.find(o => o.letter === letter);
        if (exists) toggle(letter);
        return;
      }
      if (k === '6') { e.preventDefault(); showSettings(); return; }
      if (k === '7') { e.preventDefault(); toggleAuto(); return; }
      if (k === '8') { e.preventDefault(); cyclePreset(); return; }
      if (k === '9') { e.preventDefault(); showModuleSwitcher(); return; }

      if (k === '0' || (k === 'd' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        if (dashboardConfirm) {
          clearTimeout(dashboardConfirmT);
          window.location.href = '../index.html';
        } else {
          dashboardConfirm = true;
          toast('🏠 Press 0/D again to go to Dashboard', 'warn');
          dashboardConfirmT = setTimeout(() => { dashboardConfirm = false; }, 1500);
        }
        return;
      }

      if (k === ' ' || k === 'Enter') { e.preventDefault(); spaceAction(); return; }
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'n' || k === 'N' || k === 'j' || k === 'J') {
        e.preventDefault(); next(); return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'k' || k === 'K') {
        e.preventDefault(); prev(); return;
      }
    }
    function onKeyUp(e) {
      if ((e.key === 't' || e.key === 'T') && tLongT) {
        clearTimeout(tLongT); tLongT = null;
        if (!tLong && !e.shiftKey) cyclePreset();
        tLong = false;
      }
    }

    return {
      module,
      render,
      onKey,
      onKeyUp,
      startTimer,
      stopTimer,
      gotoPrompt: gotoQuestionPrompt,
    };
  }

  // ===== Global key handlers (shared) =====
  function handleOverlayKeys(e) {
    const overlay = document.querySelector('.overlay');
    if (!overlay) return false;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlays(); return true; }
    // Overlay-owned keyboard dispatch (e.g. analysis panel) takes priority so
    // its 1/2/arrows aren't grabbed by the dashboard's underlying handler.
    if (typeof overlay._qeKeyHandler === 'function') {
      if (overlay._qeKeyHandler(e)) { e.preventDefault(); return true; }
      // Search-style overlays (command palette) own their text input: let
      // unhandled keys type normally instead of triggering digit shortcuts.
      if (overlay._qeOwnsTyping) return false;
    }
    // 1-9 number selection forwarded to module switcher list
    if (/^[1-9]$/.test(e.key)) {
      const rows = overlay.querySelectorAll('.row[data-href], .row[data-idx]');
      const i = parseInt(e.key, 10) - 1;
      if (rows[i]) { e.preventDefault(); rows[i].click(); return true; }
    }
    return false;
  }
  function handleGlobalKeys(e) {
    const k = e.key;
    if (k === 'Escape') { closeOverlays(); return true; }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); showHelp(); return true; }
    if (k === 'l' || k === 'L') { e.preventDefault(); toggleTheme(); return true; }
    if (k === 'z' || k === 'Z') { e.preventDefault(); toggleFocus(); return true; }
    if (k === 'f' || k === 'F') { e.preventDefault(); toggleFS(); return true; }
    if (k === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); pomoToggle(); return true; }
    if (k === 'P' && e.shiftKey) { e.preventDefault(); pomoToggle(); return true; }
    if (k === 'm' || k === 'M') { e.preventDefault(); showModuleSwitcher(); return true; }
    if ((k === 's' || k === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); showSettings(); return true; }
    return false;
  }

  // =====================================================================
  // ====================  AI REPORT PAGE (report.html)  =================
  // =====================================================================
  // A standalone "prompt engineer" page: pick any modules, collect every
  // wrong/partial answer (with the official correction when present), and build
  // one clean Markdown prompt you can hand to an AI to explain & fix your errors.
  // Reuses collectModuleReport()/gradePick()/loadModuleData() so grading matches
  // the viewer exactly.

  // Turn the collected error items of one module into a Markdown block.
  function reportItemsToMarkdown(moduleName, items) {
    const out = [];
    out.push(`## ${moduleName}  (${items.length} question${items.length > 1 ? 's' : ''} à revoir)`);
    out.push('');
    items.forEach((it, i) => {
      const map = {};
      (it.options || []).forEach(o => { map[o.letter] = o.text; });
      const fmt = (arr) => (arr && arr.length) ? arr.map(l => `${l}) ${map[l] || '?'}`).join(' ; ') : '(aucune)';
      out.push(`### ${i + 1}. ${it.exam} · Q${it.qn}${it.topic ? ' · ' + it.topic : ''}  — ${it.verdict === 'partial' ? 'réponse partielle' : 'réponse fausse'}`);
      out.push('');
      out.push(`**Énoncé :** ${String(it.text || '').replace(/\n+/g, ' ').trim()}`);
      out.push('');
      out.push('**Propositions :**');
      (it.options || []).forEach(o => { out.push(`- ${o.letter}) ${o.text}`); });
      out.push('');
      const hasCorr = it.correct && it.correct.length;
      out.push(`- ✅ Correction officielle : ${hasCorr ? fmt(it.correct) : '_(non disponible — propose la réponse la plus probable)_'}`);
      out.push(`- ❌ Ma réponse : ${fmt(it.picked)}`);
      out.push('');
    });
    return out.join('\n');
  }

  // Compute a statistical analysis of the errors (app-side, deterministic):
  // totals, wrong-vs-partial split, per-module breakdown, and a per-topic
  // frequency ranking — the raw material for "notions à forte rentabilité".
  function reportStats(allItems) {
    const total = allItems.length;
    const wrong = allItems.filter(i => i.verdict === 'wrong').length;
    const partial = total - wrong;
    const pct = (n) => total ? Math.round((n / total) * 100) : 0;

    const byMod = new Map();
    allItems.forEach(i => byMod.set(i.module, (byMod.get(i.module) || 0) + 1));
    const modRows = [...byMod.entries()].sort((a, b) => b[1] - a[1]);

    const byTopic = new Map();
    allItems.forEach(i => {
      const t = ((i.topic || '').trim()) || '(sans thème)';
      const r = byTopic.get(t) || { count: 0, wrong: 0, partial: 0, mods: new Set() };
      r.count++; if (i.verdict === 'wrong') r.wrong++; else r.partial++; r.mods.add(i.module);
      byTopic.set(t, r);
    });
    const topicRows = [...byTopic.entries()].map(([topic, r]) => ({ topic, ...r }))
      .sort((a, b) => b.count - a.count || b.wrong - a.wrong);

    return { total, wrong, partial, pct, modRows, topicRows };
  }

  // Render the stats as a Markdown section for the AI prompt / .txt.
  function reportStatsToMarkdown(s) {
    const out = [];
    out.push(`## 📊 Analyse statistique de mes erreurs`);
    out.push('');
    out.push(`- **Total :** ${s.total} question(s) à revoir — ${s.wrong} fausse(s) (${s.pct(s.wrong)} %) · ${s.partial} partielle(s) (${s.pct(s.partial)} %)`);
    out.push(`- **Modules concernés :** ${s.modRows.length}`);
    out.push('');
    out.push(`**Erreurs par module :**`);
    s.modRows.forEach(([name, n]) => out.push(`- ${name} : ${n}`));
    out.push('');
    out.push(`**Thèmes les plus ratés** (fréquence — base des notions à forte rentabilité) :`);
    s.topicRows.slice(0, 15).forEach((r, i) => {
      out.push(`${i + 1}. ${r.topic} — ${r.count} erreur(s) (${r.wrong} fausse(s), ${r.partial} partielle(s))${r.mods.size > 1 ? ` · ${r.mods.size} modules` : ''}`);
    });
    out.push('');
    return out.join('\n');
  }

  // Assemble the full AI prompt: role + computed stats + mission + per-module
  // question blocks. The mission asks the AI for the qualitative work the app
  // can't do: classify each error (knowledge / reasoning / QCM-trap) and turn
  // the topic-frequency ranking into high-yield study priorities.
  function buildAIReportPrompt(statsMd, sections, totals) {
    const p = [];
    p.push(`Rôle : Agis comme un Professeur agrégé de médecine et un tuteur pédagogique exigeant et bienveillant, spécialiste de la préparation aux QCM.`);
    p.push('');
    p.push(`Voici mes erreurs de QCM (${totals.items} question(s) sur ${totals.modules} module(s)), précédées d'une analyse statistique. Pour chaque question : l'énoncé, les propositions, la correction officielle si elle existe, et la réponse que j'ai donnée.`);
    p.push('');
    p.push(`### Ta mission`);
    p.push(`1. **Correction ciblée** — pour chaque question, explique pourquoi la bonne réponse est correcte et pourquoi chaque proposition que j'ai choisie est fausse. Si la correction officielle manque, donne la réponse la plus probable en le signalant.`);
    p.push(`2. **Typologie de l'erreur** — classe chaque question dans **une** catégorie, avec une justification en une ligne :`);
    p.push(`   - 🧠 **Connaissance** — il me manquait un fait / une notion.`);
    p.push(`   - 🔗 **Raisonnement** — je connaissais les notions mais j'ai mal relié/déduit les données.`);
    p.push(`   - 🪤 **Piège QCM** — erreur de lecture/formulation : négation, « toujours/jamais », unités, proposition la plus complète, etc.`);
    p.push(`3. **Bilan statistique** — donne la répartition de mes erreurs **par catégorie** (nombre et %) et **par thème**, et commente le tableau statistique fourni (tendances, points faibles dominants).`);
    p.push(`4. **Notions à forte rentabilité pédagogique** — identifie les 3 à 6 notions qui me feront gagner le plus de points, en croisant : fréquence dans mes erreurs × importance clinique × probabilité de tomber. Pour chacune : pourquoi elle est rentable + l'essentiel à retenir (format fiche).`);
    p.push(`5. **Plan de révision priorisé** — court et concret : quoi réviser d'abord, et comment neutraliser mes pièges récurrents.`);
    p.push(`6. Reste concis, structuré en Markdown, et va à l'essentiel clinique.`);
    p.push('');
    p.push('---');
    p.push('');
    p.push(statsMd);
    p.push('---');
    p.push('');
    p.push(`# 📚 Détail de mes erreurs`);
    p.push('');
    p.push(sections.join('\n---\n\n'));
    return p.join('\n');
  }

  function bootReport() {
    buildTopbar({ search: false, active: 'report', crumbHtml: `<a href="index.html">Dashboard</a> · <b>Rapport IA</b>` });
    const root = document.getElementById('qe-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'qe-root' }));
    const mods = window.QE_MODULES || [];
    const sems = window.QE_SEMESTERS || {};
    const counts = window.QE_COUNTS || {};

    // Persist the selection so it survives reloads. Default: the last-visited module.
    let selected = new Set(LS.get('report.selected', null) || []);
    if (selected.size === 0) {
      const last = LS.get('lastModule', null);
      if (last && mods.find(m => m.slug === last.slug)) selected.add(last.slug);
    }
    const saveSel = () => LS.set('report.selected', [...selected]);

    // Quick per-module error counts from training answers only (cheap, no data
    // file needed) so the checkboxes can show a hint without loading 16 MB.
    function quickWrongCount(slug) {
      const ans = LS.get(`answers.${slug}`, {});
      let n = 0;
      for (const rec of Object.values(ans)) {
        if (rec && rec.checked && !rec.unknown && !rec.correct) n++;
      }
      return n;
    }

    const grouped = {};
    mods.forEach(m => { (grouped[m.sem] ||= []).push(m); });
    const semNum = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;

    root.innerHTML = `
      <div class="container report-page">
        <div class="hero report-hero">
          <h1>🧠 Rapport IA — corrige tes erreurs</h1>
          <p>Sélectionne un ou plusieurs modules. On rassemble chaque question <b>fausse</b> ou <b>partielle</b> (avec la correction officielle quand elle existe) et on construit un prompt prêt à coller dans une IA pour t'expliquer et t'aider à progresser.</p>
        </div>

        <div class="report-grid">
          <aside class="report-pick">
            <div class="rp-head">
              <h3>Modules</h3>
              <div class="rp-bulk">
                <button id="rp-all" class="mini">Tout</button>
                <button id="rp-none" class="mini">Aucun</button>
                <button id="rp-wrong" class="mini" title="Sélectionner les modules où tu as des erreurs">Avec erreurs</button>
              </div>
            </div>
            <div class="rp-modules">
              ${Object.keys(grouped).sort((a, b) => semNum(b) - semNum(a)).map(sem => `
                <div class="rp-sem">
                  <div class="rp-sem-head">${sem.toUpperCase()} · ${sems[sem] || ''}</div>
                  ${grouped[sem].map(m => {
                    const wc = quickWrongCount(m.slug);
                    return `
                      <label class="rp-mod" data-slug="${m.slug}">
                        <input type="checkbox" data-slug="${m.slug}" ${selected.has(m.slug) ? 'checked' : ''}>
                        <span class="rp-mod-name">${escapeHtml(m.name)}</span>
                        <span class="rp-mod-meta ${wc ? 'has' : ''}">${wc ? wc + ' ✗' : ''}</span>
                      </label>`;
                  }).join('')}
                </div>
              `).join('')}
            </div>
          </aside>

          <section class="report-main">
            <div class="report-toolbar">
              <div class="rt-summary" id="rt-summary">Sélectionne des modules pour générer le rapport.</div>
              <div class="rt-actions">
                <button id="rp-copy" class="primary" disabled>📋 Copier le prompt</button>
                <button id="rp-download" disabled>⬇ .txt</button>
              </div>
            </div>
            <div class="report-output" id="report-output">
              <div class="report-empty"><div class="ico">📋</div>Aucun module sélectionné.<br><small>Coche un module à gauche.</small></div>
            </div>
          </section>
        </div>
      </div>
    `;

    const out = root.querySelector('#report-output');
    const summary = root.querySelector('#rt-summary');
    const copyBtn = root.querySelector('#rp-copy');
    const dlBtn = root.querySelector('#rp-download');
    let currentPrompt = '';

    // Build the report from the current selection (loads each module's data lazily).
    async function regenerate() {
      saveSel();
      const slugs = [...selected];
      if (slugs.length === 0) {
        currentPrompt = '';
        copyBtn.disabled = dlBtn.disabled = true;
        summary.textContent = 'Sélectionne des modules pour générer le rapport.';
        out.innerHTML = `<div class="report-empty"><div class="ico">📋</div>Aucun module sélectionné.<br><small>Coche un module à gauche.</small></div>`;
        return;
      }
      summary.textContent = 'Chargement des données…';
      out.innerHTML = `<div class="report-loading">⏳ Lecture de ${slugs.length} module(s)…</div>`;

      const sections = [];
      const allItems = [];
      let totalItems = 0, modulesWithErrors = 0;
      const previewBlocks = [];
      for (const slug of slugs) {
        const m = mods.find(x => x.slug === slug);
        if (!m) continue;
        let data;
        try { data = await loadModuleData(slug, ''); }
        catch { previewBlocks.push(`<div class="ro-mod error">⚠️ ${escapeHtml(m.name)} — données indisponibles</div>`); continue; }
        const items = collectModuleReport(slug, data);
        if (items.length === 0) {
          previewBlocks.push(`<div class="ro-mod empty">✓ ${escapeHtml(m.name)} — aucune erreur enregistrée</div>`);
          continue;
        }
        modulesWithErrors++;
        totalItems += items.length;
        items.forEach(it => allItems.push({ module: m.name, ...it }));   // for the statistical analysis
        sections.push(reportItemsToMarkdown(m.name, items));
        previewBlocks.push(`
          <div class="ro-mod">
            <div class="ro-mod-head"><b>${escapeHtml(m.name)}</b><span>${items.length} à revoir</span></div>
            ${items.slice(0, 5).map(it => `
              <div class="ro-item ${it.verdict}">
                <span class="ro-qn">Q${it.qn}</span>
                <span class="ro-text">${escapeHtml((it.text || '').replace(/\n+/g, ' ').slice(0, 120))}${(it.text || '').length > 120 ? '…' : ''}</span>
                <span class="ro-corr" title="Correction officielle">✓ ${escapeHtml((it.correct || []).join(', ') || '—')}</span>
              </div>`).join('')}
            ${items.length > 5 ? `<div class="ro-more">+ ${items.length - 5} autre(s) dans le prompt…</div>` : ''}
          </div>`);
      }

      if (totalItems === 0) {
        currentPrompt = '';
        copyBtn.disabled = dlBtn.disabled = true;
        summary.textContent = 'Aucune erreur sur les modules choisis. 🎉';
        out.innerHTML = previewBlocks.join('') ||
          `<div class="report-empty"><div class="ico">🎉</div>Aucune erreur enregistrée.<br><small>Réponds à des questions en Entraînement ou Examen, puis reviens.</small></div>`;
        return;
      }

      const s = reportStats(allItems);
      currentPrompt = buildAIReportPrompt(reportStatsToMarkdown(s), sections, { items: totalItems, modules: modulesWithErrors });
      copyBtn.disabled = dlBtn.disabled = false;
      summary.innerHTML = `<b>${totalItems}</b> question(s) à revoir · ${modulesWithErrors} module(s) · <span class="rt-chars">${currentPrompt.length.toLocaleString('fr-FR')} caractères</span>`;
      // The Personalized Revision Plan is shown ON THE PAGE ONLY — it is built
      // from `s` here and deliberately NOT part of `currentPrompt`, so it is
      // never copied to the clipboard nor written to the downloaded .txt.
      out.innerHTML = revisionPlanHtml(s) + statsPanelHtml(s) + previewBlocks.join('');
    }

    // App-computed study plan (on-screen only). Splits mostly-wrong topics
    // (real knowledge gaps → deep work) from mostly-partial ones (nearly there
    // → quick wins), and orders them by how often they cost you points.
    function revisionPlanHtml(s) {
      const top = s.topicRows.slice(0, 6);
      const gaps  = s.topicRows.filter(r => r.wrong >  r.partial).slice(0, 6).map(r => r.topic);
      const close = s.topicRows.filter(r => r.partial >= r.wrong).slice(0, 6).map(r => r.topic);
      const item = (r, i) => {
        const isGap = r.wrong > r.partial;
        const action = isGap
          ? 'Lacune de connaissances — reprends les bases de ce thème.'
          : 'Tu y es presque — affine les détails, les exceptions et les pièges.';
        return `<li class="pi ${isGap ? 'gap' : 'close'}">
          <span class="pi-rank">${i + 1}</span>
          <span class="pi-body">
            <span class="pi-top"><b>${escapeHtml(r.topic)}</b><span class="pi-count">${r.count} erreur(s) · ${r.wrong}✗ ${r.partial}◔</span></span>
            <span class="pi-action">${action}</span>
          </span>
        </li>`;
      };
      return `
        <div class="ro-plan">
          <div class="ro-plan-head">
            <h3>🗺️ Personalized Revision Plan</h3>
            <span class="ro-plan-badge" title="Cette section reste sur la page — elle n'est ni copiée ni incluse dans le .txt">👁 affiché ici · pas dans le prompt</span>
          </div>
          <p class="ro-plan-sub">D'après tes <b>${s.total}</b> erreur(s), commence dans cet ordre :</p>
          <ol class="ro-plan-list">${top.map(item).join('')}</ol>
          <div class="ro-plan-tips">
            ${gaps.length  ? `<div>📚 <b>À reprendre à fond</b> (lacunes réelles) : ${gaps.map(escapeHtml).join(' · ')}</div>` : ''}
            ${close.length ? `<div>⚡ <b>Quick wins</b> (tu y es presque) : ${close.map(escapeHtml).join(' · ')}</div>` : ''}
            <div>✅ <b>Ensuite</b> : reteste ces thèmes en mode Examen pour valider tes progrès.</div>
          </div>
        </div>`;
    }

    // A compact on-page version of the statistical analysis (mirrors the .txt).
    function statsPanelHtml(s) {
      const top = s.topicRows.slice(0, 8);
      const maxc = top.length ? top[0].count : 1;
      return `
        <div class="ro-stats">
          <div class="ro-stats-row">
            <div class="ro-stat"><b>${s.total}</b><span>à revoir</span></div>
            <div class="ro-stat bad"><b>${s.wrong}</b><span>✗ fausses (${s.pct(s.wrong)}%)</span></div>
            <div class="ro-stat mid"><b>${s.partial}</b><span>◔ partielles (${s.pct(s.partial)}%)</span></div>
            <div class="ro-stat"><b>${s.modRows.length}</b><span>modules</span></div>
          </div>
          <div class="ro-stats-topics">
            <div class="ro-stats-lbl">🎯 Thèmes les plus ratés — forte rentabilité, à réviser d'abord</div>
            ${top.map(r => `
              <div class="ro-topic">
                <span class="rt-name">${escapeHtml(r.topic)}</span>
                <span class="rt-bar"><span style="width:${Math.round((r.count / maxc) * 100)}%"></span></span>
                <span class="rt-n">${r.count}</span>
              </div>`).join('')}
          </div>
          <div class="ro-stats-foot">La classification (connaissance · raisonnement · piège) et les notions prioritaires sont demandées à l'IA dans le prompt.</div>
        </div>`;
    }

    // Checkbox + bulk wiring
    root.querySelectorAll('.rp-mod input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.dataset.slug); else selected.delete(cb.dataset.slug);
        regenerate();
      });
    });
    const setAll = (pred) => {
      selected = new Set(mods.filter(pred).map(m => m.slug));
      root.querySelectorAll('.rp-mod input[type=checkbox]').forEach(cb => { cb.checked = selected.has(cb.dataset.slug); });
      regenerate();
    };
    root.querySelector('#rp-all').addEventListener('click', () => setAll(() => true));
    root.querySelector('#rp-none').addEventListener('click', () => setAll(() => false));
    root.querySelector('#rp-wrong').addEventListener('click', () => setAll(m => quickWrongCount(m.slug) > 0));

    copyBtn.addEventListener('click', () => {
      if (!currentPrompt) return;
      copyText(currentPrompt).then(ok => toast(
        ok ? `📋 Prompt copié (${currentPrompt.length.toLocaleString('fr-FR')} car.)` : '⚠️ Copie impossible — sélectionne le texte et copie à la main',
        ok ? 'ok' : 'warn'));
    });
    dlBtn.addEventListener('click', () => {
      if (!currentPrompt) return;
      const ok = downloadTextFile(`qe-prompt-ia-${localDayStr()}.txt`, currentPrompt);
      toast(ok ? '⬇ Prompt téléchargé' : '⚠️ Téléchargement impossible', ok ? 'ok' : 'warn');
    });

    // Keyboard: C copies, Esc → dashboard.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleCommandPalette(); return; }
      if (handleOverlayKeys(e)) return;
      const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (inField) return;
      if (handleGlobalKeys(e)) return;
      if ((e.key === 'c' || e.key === 'C') && !copyBtn.disabled) { e.preventDefault(); copyBtn.click(); }
      if (e.key === '0' || (e.key === 'd' && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); window.location.href = 'index.html'; }
    }, true);

    // Keep the on-screen report honest when a module's progress is reset
    // elsewhere: re-read localStorage and rebuild when this page is restored
    // from the back/forward cache (back button) or when another tab changes a
    // qe:answers/exam/progress key. Otherwise it could show errors just wiped.
    window.addEventListener('pageshow', (e) => { if (e.persisted) regenerate(); });
    window.addEventListener('storage', (e) => {
      if (!e.key || /^qe:(answers|exam|progress)\./.test(e.key)) regenerate();
    });

    regenerate();
  }

  // =====================================================================
  // ==============  HIGH-YIELD ANALYSIS PAGE (high-yield.html)  =========
  // =====================================================================
  // A document browser: lists every module (no quiz) and links/previews its
  // high-yield analysis doc (PDF / Word / txt) from qe-analysis/<slug>/. The
  // available docs come from window.QE_ANALYSIS, baked by tools/build-analysis.js.
  function bootHighYield() {
    buildTopbar({ search: false, active: 'highyield', crumbHtml: `<a href="index.html">Dashboard</a> · <b>Forte rentabilité</b>` });
    const root = document.getElementById('qe-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'qe-root' }));
    const mods = window.QE_MODULES || [];
    const sems = window.QE_SEMESTERS || {};
    const counts = window.QE_COUNTS || {};
    const analysis = window.QE_ANALYSIS || {};
    const semNum = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const grouped = {};
    mods.forEach(m => { (grouped[m.sem] ||= []).push(m); });

    const PREVIEWABLE = /\.(pdf|txt|md)$/i;
    const docMeta = (f) => {
      if (/\.pdf$/i.test(f))        return { icon: '📄' };
      if (/\.(docx?|odt)$/i.test(f)) return { icon: '📝' };
      if (/\.(txt|md)$/i.test(f))    return { icon: '📃' };
      if (/\.pptx?$/i.test(f))       return { icon: '📊' };
      return { icon: '📎' };
    };
    const available = mods.filter(m => (analysis[m.slug] || []).length).length;

    const card = (m) => {
      const files = analysis[m.slug] || [];
      const base = `qe-analysis/${m.slug}/`;
      const cnt = counts[m.slug];
      const meta = `${m.sem}${cnt ? ' · ' + cnt.questions + ' Q' : ''}`;
      if (!files.length) {
        return `<div class="hy-card empty">
          <div class="hy-title">${escapeHtml(m.name)}</div>
          <div class="hy-meta">${meta}</div>
          <div class="hy-soon">Analyse à venir</div>
        </div>`;
      }
      const docs = files.map((f) => {
        const href = base + encodeURIComponent(f);
        const can = PREVIEWABLE.test(f);
        return `<div class="hy-doc">
          <span class="hy-doc-name">${docMeta(f).icon} ${escapeHtml(f)}</span>
          <span class="hy-doc-act">
            ${can ? `<button class="mini hy-prev" data-src="${escapeHtml(href)}" data-name="${escapeHtml(f)}">Aperçu</button>` : ''}
            <a class="mini" href="${escapeHtml(href)}" target="_blank" rel="noopener">Ouvrir ↗</a>
            <a class="mini" href="${escapeHtml(href)}" download="${escapeHtml(f)}">Télécharger ↓</a>
          </span>
        </div>`;
      }).join('');
      return `<div class="hy-card has">
        <div class="hy-title">${escapeHtml(m.name)} <span class="hy-badge">${files.length}</span></div>
        <div class="hy-meta">${meta}</div>
        <div class="hy-docs">${docs}</div>
        <div class="hy-preview"></div>
      </div>`;
    };

    root.innerHTML = `
      <div class="container hy-page">
        <div class="hero hy-hero">
          <h1>📈 Questions à forte rentabilité</h1>
          <p>Pour chaque module, le document d'analyse <b>high-yield</b> (leçons classées par fréquence, Q/R dédupliquées et pièges ⚠) produit avec le skill <code>qe-analysis</code>. <b>${available}/${mods.length}</b> module(s) disponible(s).</p>
        </div>
        <div id="hy-grid">
          ${Object.keys(grouped).sort((a, b) => semNum(b) - semNum(a)).map(sem => `
            <div class="semester">
              <div class="semester-head"><span class="tag">${sem.toUpperCase()}</span><span class="name">${escapeHtml(sems[sem] || '')}</span></div>
              <div class="hy-cards">${grouped[sem].map(card).join('')}</div>
            </div>`).join('')}
        </div>
      </div>
    `;

    // Inline preview (PDF / txt) via an iframe — toggles open/closed per doc.
    root.querySelectorAll('.hy-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardEl = btn.closest('.hy-card');
        const host = cardEl.querySelector('.hy-preview');
        const src = btn.dataset.src;
        if (host.dataset.src === src && host.innerHTML) { host.innerHTML = ''; host.dataset.src = ''; btn.classList.remove('on'); return; }
        cardEl.querySelectorAll('.hy-prev').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        host.dataset.src = src;
        host.innerHTML = `<iframe class="hy-frame" src="${escapeHtml(src)}" title="${escapeHtml(btn.dataset.name)}"></iframe>`;
      });
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleCommandPalette(); return; }
      if (handleOverlayKeys(e)) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (handleGlobalKeys(e)) return;
      if (e.key === '0' || (e.key === 'd' && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); window.location.href = 'index.html'; }
    }, true);
  }

  // ===== Utils =====
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Expose
  window.QE = {
    bootDashboard,
    bootViewer,
    bootReport,
    bootHighYield,
    showHelp,
    showSettings,
    showModuleSwitcher,
    showAnalysis,
    showCommandPalette,
    toggleFocus,
    computeActivity,
    computeReminders,
    PRESETS,
  };

  // ===== PWA: installable + offline on the web (the file:// copy is already offline) =====
  (function registerPWA() {
    try {
      if (!String(location.protocol).startsWith('http')) return;     // skip file://
      const base = /\/modules\//.test(location.pathname) ? '../' : './';
      if (!document.querySelector('link[rel="manifest"]')) {
        const l = document.createElement('link');
        l.rel = 'manifest'; l.href = base + 'manifest.webmanifest';
        document.head.appendChild(l);
      }
      if (!document.querySelector('meta[name="theme-color"]')) {
        const m = document.createElement('meta');
        m.name = 'theme-color'; m.content = '#6c8dff';
        document.head.appendChild(m);
      }
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
        });
      }
    } catch (e) { /* PWA is a progressive enhancement — never block the app */ }
  })();
})();
