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
        answered++;
        if (rec.correct) correct++;
        else if (rec.partial) partial++;
        else if (!rec.unknown) wrong++;
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

  function cyclePreset() {
    cfg.presetIndex = (cfg.presetIndex + 1) % PRESETS.length;
    preset = PRESETS[cfg.presetIndex];
    LS.set('presetIndex', cfg.presetIndex);
    toast(`${preset.emoji} ${preset.name} — ${preset.q}s / ${preset.a}s — ${preset.desc}`, 'ok');
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
    top.innerHTML = `
      <a class="brand" href="${opts.indexHref || 'index.html'}" title="Dashboard">
        <span class="logo">QE</span>
        <span>MCQ Bank</span>
      </a>
      <div class="crumb">${opts.crumbHtml || ''}</div>
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
      <button id="qe-theme" title="Toggle theme (L)">🌓</button>
      <button id="qe-help" title="Help (?)">⌨️</button>
      <button id="qe-settings" title="Settings (Shift+S)">⚙️</button>
    `;
    document.body.prepend(top);
    document.getElementById('qe-pomo').addEventListener('click', pomoToggle);
    document.getElementById('qe-theme').addEventListener('click', toggleTheme);
    document.getElementById('qe-help').addEventListener('click', showHelp);
    document.getElementById('qe-settings').addEventListener('click', showSettings);
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
          <div class="keys">${k('1 2 3 4 5')}</div><div>Select option (toggle in multi-select)</div>
          <div class="keys">${k('Space')} / ${k('Enter')}</div><div>Check answer · continue</div>
          <div class="keys">${k('←')} ${k('→')} ${k('↑')} ${k('↓')}</div><div>Prev / next question</div>
          <div class="keys">${k('N')} ${k('J')} / ${k('K')}</div><div>Next / prev (vim-ish)</div>
          <div class="keys">${k('R')}</div><div>Reset current question</div>
          <div class="keys">${k('G')}</div><div>Go to question # (prompt)</div>
          <div class="keys">${k('M')} / ${k('9')}</div><div>Module switcher</div>
          <div class="keys">${k('D')} / ${k('0')}</div><div>Dashboard (press 0 twice on viewer)</div>
          <div class="keys">${k('C')} (dashboard)</div><div>Continue last module where you left off</div>
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
          <div class="keys">${k('S')} / ${k('Shift+S')} / ${k('6')}</div><div>Settings</div>
          <div class="keys">${k('?')}</div><div>This help</div>
          <div class="keys">${k('Esc')}</div><div>Close overlay · exit exam back to picker</div>
        </div>
        <div class="group-title">Exam mode</div>
        <div class="help-grid">
          <div class="keys"><kbd>Mode pill</kbd></div><div>Toggle Training ↔ Exam (top bar, persisted)</div>
          <div class="keys">${k('1')}–${k('9')} (picker)</div><div>Start that exam</div>
          <div class="keys">${k('Shift+Enter')}</div><div>Submit exam (press twice to confirm)</div>
          <div class="keys">${k('Esc')} (exam-run)</div><div>Pause and back to picker (progress kept)</div>
          <div class="keys">${k('1')}–${k('5')} (review)</div><div>Filter: all / correct / partial / wrong / skipped</div>
          <div class="keys">${k('R')} (review)</div><div>Retake same exam (clears stored answers)</div>
          <div class="keys">${k('0')} / ${k('D')} ×2</div><div>Back to dashboard (anywhere)</div>
        </div>
        <div class="group-title">Reset progress</div>
        <div class="help-grid">
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
              <span class="label">${m.name}</span>
              <span class="right">${m.file.split('/').pop()}</span>
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
        navigator.clipboard.writeText(promptText).catch(() => {});
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
        if (state.viewer) {
          state.viewer.render();
          if (cfg.autoAdvance) state.viewer.startTimer(); else state.viewer.stopTimer();
        }
      };
      panel.querySelector('#set-save').addEventListener('click', save);
      panel.querySelector('#set-close').addEventListener('click', closeOverlays);
      panel.querySelector('#set-cycle').addEventListener('click', cyclePreset);
    });
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
          <div class="hint">
            <kbd>1</kbd>–<kbd>9</kbd> jump · <kbd>↑↓←→</kbd> focus · <kbd>Enter</kbd> open ·
            <kbd>/</kbd> search · <kbd>C</kbd> continue · <kbd>R</kbd>×2 reset focused ·
            <kbd>L</kbd> theme · <kbd>?</kbd> help
            · mode → <span id="qe-mode-inline" style="font-weight:700;color:var(--accent)"></span>
          </div>
        </div>
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

    function renderStatsHero() {
      const s = computeGlobalStats();
      const fmt = (n) => n.toLocaleString('fr-FR');
      const accClass = s.totalAnswered === 0 ? '' : (s.accuracy >= 70 ? 'good' : s.accuracy >= 50 ? 'mid' : 'bad');
      statsRoot.innerHTML = `
        <div class="stat"><div class="num">${fmt(s.totalAnswered)}<small>/${fmt(s.totalQuestions)}</small></div><div class="lbl">answered</div></div>
        <div class="stat"><div class="num ${accClass}">${s.totalAnswered ? s.accuracy + '%' : '—'}</div><div class="lbl">accuracy</div></div>
        <div class="stat"><div class="num">${s.totalCorrect}<small> · ${s.totalPartial}◔ · ${s.totalWrong}✗</small></div><div class="lbl">✓ correct / partial / wrong</div></div>
        <div class="stat"><div class="num">${s.modulesTouched}<small>/${s.totalModules}</small></div><div class="lbl">modules touched</div></div>
        <div class="stat"><div class="num">${s.examsSubmitted}<small>${s.examSessions > s.examsSubmitted ? ' +' + (s.examSessions - s.examsSubmitted) + ' draft' : ''}</small></div><div class="lbl">exams completed</div></div>
      `;

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
            <b class="ct-name">${lastMod.name}</b>
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
            <h4>🎯 Needs work — lowest accuracy</h4>
            <div class="weak-list">
              ${weakest.map(m => {
                const pct = Math.round(m.accuracy * 100);
                const cls = pct >= 70 ? 'good' : pct >= 50 ? 'mid' : 'bad';
                return `
                  <a class="weak-item" href="modules/${m.slug}.html" data-slug="${m.slug}">
                    <span class="wi-name">${m.name}</span>
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
      }
    }

    function render(filter = '') {
      const f = filter.trim().toLowerCase();
      semRoot.innerHTML = '';
      let globalIdx = 0;
      Object.keys(grouped).sort().forEach(sem => {
        const list = grouped[sem].filter(m => !f || m.name.toLowerCase().includes(f) || m.sem.includes(f));
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
            ${showReset ? `<button class="card-reset" type="button" title="Reset all progress for this module (click twice to confirm)" aria-label="Reset progress">↻</button>` : ''}
            <div class="title">${m.name}</div>
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
        semRoot.innerHTML = `<div class="empty"><div class="ico">🔍</div>No modules match "<b>${filter}</b>"</div>`;
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

    // Dashboard-specific keyboard
    document.addEventListener('keydown', (e) => {
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
      document.body.innerHTML = `<div class="empty"><div class="ico">⚠️</div>Unknown module: ${moduleSlug}</div>`;
      return;
    }

    buildTopbar({
      search: false,
      indexHref: '../index.html',
      crumbHtml: `<a href="../index.html">Dashboard</a> · <b>${module.name}</b> <span style="opacity:.6">(${module.sem})</span>`,
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
        root.innerHTML = `<div class="empty"><div class="ico">⚠️</div>Failed to load <code>${module.file}</code><br><small>${e.message}</small><br><br>Run <code>node tools/build-data.js</code> to bake offline data, or serve the folder via <code>python3 -m http.server</code>.</div>`;
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
    let timerH = null;
    let timerStart = 0;
    let timerDur = 0;
    let timerEpoch = 0;
    let dashboardConfirm = false, dashboardConfirmT = null;
    let resetConfirm = false, resetConfirmT = null;
    let tLong = false, tLongT = null;
    let submitConfirm = false, submitConfirmT = null;
    let examStartT = 0;
    let examTimerH = null;

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
          return `<div class="${cls}" ${idAttr} title="Q${qq.qn}${qq.topic ? ' — ' + qq.topic : ''}">${qq.qn}</div>`;
        }).join('');
        offset = end;
        const examLink = grp.url ? `<a href="${grp.url}" target="_blank" rel="noopener" title="Open original on e-qe.online">↗</a>` : '';
        const stats = `<span class="stats">${answered}/${grp.questions.length}${correct ? ' · <b>' + correct + '✓</b>' : ''}${picked ? ' · ' + picked + '◔' : ''} ${examLink}</span>`;
        return `
          <div class="exam-group ${isOpen ? '' : 'collapsed'}" data-exam-idx="${ei}">
            <div class="exam-name ${isCurrentExam ? 'current' : ''}" role="${isCurrentExam ? 'heading' : 'button'}" aria-expanded="${isOpen}" tabindex="${isCurrentExam ? '-1' : '0'}">
              <span class="chev" aria-hidden="true">▾</span>
              <span class="name" title="${grp.name}">${grp.name}</span>
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
          feedback = `<div class="feedback show ok">✓ Correct! (${correctLetters})<small>${q.exam} — Q${q.qn}</small></div>`;
        } else if (ev.partial) {
          feedback = `<div class="feedback show partial">~ Partial. Right answer(s): ${correctLetters}<small>${q.exam} — Q${q.qn}</small></div>`;
        } else {
          feedback = `<div class="feedback show bad">✗ Incorrect. Right answer(s): ${correctLetters}<small>${q.exam} — Q${q.qn}</small></div>`;
        }
      }

      root.innerHTML = `
        <div class="viewer ${cfg.sidebarHidden ? 'no-sidebar' : ''}">
          ${cfg.sidebarHidden ? '' : `
            <aside class="sidebar">
              <h3>${module.name}</h3>
              ${sidebarHtml}
            </aside>
          `}
          <div class="qpane">
            <div class="qhead">
              <div class="qmeta">Q <b>${idx + 1}</b> / ${total} · ${answeredCount} answered · ${correctCount}✓</div>
              <div class="qexam">${q.exam}</div>
              ${q.topic ? `<div class="qtopic">${q.topic}</div>` : ''}
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

      // Restart timer for current phase
      if (cfg.autoAdvance) startTimer();
      else hideIsland();
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
          status = `✓ ${s.correct}/${s.total} (${Math.round(s.correct / s.total * 100)}%)`;
          statusCls = 'done';
        } else if (picks > 0) {
          status = `… ${picks}/${grp.questions.length} answered (in progress)`;
          statusCls = 'draft';
        } else {
          status = 'Not started';
        }
        const pct = sess.submitted ? Math.round(examScore(ei).correct / grp.questions.length * 100) : Math.round(picks / grp.questions.length * 100);
        const showReset = (picks > 0 || sess.submitted);
        return `
          <div class="exam-tile" data-ei="${ei}" role="button" tabindex="0">
            <span class="num">${ei < 9 ? ei + 1 : ''}</span>
            ${showReset ? `<button class="tile-reset" type="button" data-ei="${ei}" title="Reset this exam's progress (click twice)" aria-label="Reset exam">↻</button>` : ''}
            <div class="name">${escapeHtml(grp.name)}</div>
            <div class="meta">${grp.questions.length} questions${grp.url ? ' · <a class="src-link" href="' + grp.url + '" target="_blank" rel="noopener" title="Source">↗</a>' : ''}</div>
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
              <h3>${module.name}</h3>
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
      const score100 = Math.round(s.correct / s.total * 100);
      const dur = sess.durationSec || 0;
      const durM = Math.floor(dur / 60), durS = String(dur % 60).padStart(2, '0');
      const scoreCls = score100 >= 70 ? 'good' : score100 >= 50 ? 'mid' : 'bad';

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
              ${q.topic ? `<span class="topic">${escapeHtml(q.topic)}</span>` : ''}
            </div>
            <div class="ri-q">${escapeHtml(q.text)}</div>
            <div class="ri-opts">${optsHtml}</div>
          </div>
        `;
      }).join('');

      root.innerHTML = `
        <div class="viewer ${cfg.sidebarHidden ? 'no-sidebar' : ''}">
          ${cfg.sidebarHidden ? '' : `
            <aside class="sidebar">
              <h3>${module.name}</h3>
              ${sidebarHtml}
            </aside>
          `}
          <div class="qpane">
            <div class="review-head">
              <div>
                <h2>📊 ${escapeHtml(grp.name)} — Results</h2>
                <div class="sub">${s.correct} correct · ${s.partial} partial · ${s.wrong} wrong · ${s.skipped} skipped${s.unknown ? ' · ' + s.unknown + ' no-correction' : ''}${dur ? ' · ' + durM + ':' + durS + ' taken' : ''}</div>
                <div class="review-actions">
                  <button id="btn-exit-exam">‹ Pick another exam</button>
                  <button id="btn-restart-exam">↻ Retake this exam</button>
                  ${grp.url ? `<a class="btn" href="${grp.url}" target="_blank" rel="noopener">↗ Original source</a>` : ''}
                </div>
              </div>
              <div class="score ${scoreCls}">${score100}%<small>${s.correct}/${s.total}</small></div>
            </div>
            <div class="review-filters">
              <span class="chip ${reviewFilter==='all'?'active':''}"     data-f="all">All ${s.total}</span>
              <span class="chip ${reviewFilter==='correct'?'active':''}" data-f="correct">Correct ${s.correct}</span>
              <span class="chip ${reviewFilter==='partial'?'active':''}" data-f="partial">Partial ${s.partial}</span>
              <span class="chip ${reviewFilter==='wrong'?'active':''}"   data-f="wrong">Wrong ${s.wrong}</span>
              <span class="chip ${reviewFilter==='skipped'?'active':''}" data-f="skipped">Skipped ${s.skipped}</span>
            </div>
            <div id="review-items">${items}</div>
          </div>
        </div>
      `;

      function applyFilter() {
        root.querySelectorAll('.review-item').forEach(el => {
          if (reviewFilter === 'all' || el.dataset.verdict === reviewFilter) el.style.display = '';
          else el.style.display = 'none';
        });
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
      answers[idx] = {
        picked: [...picked],
        checked: true,
        correct: ev.correct,
        partial: ev.partial,
        unknown: ev.unknown,
      };
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
      if (cfg.autoAdvance) startTimer(); else { stopTimer(); hideIsland(); }
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
    function copyPrompt(builder, label) {
      const text = builder();
      if (!text) { toast('Open a question first to copy', 'warn'); return; }
      navigator.clipboard.writeText(text).then(
        () => toast(`📋 ${label} copied (${text.length} chars)`, 'ok'),
        () => {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          toast(`📋 ${label} copied`, 'ok');
        }
      );
    }

    // ===== Keyboard =====
    function onKey(e) {
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

      // Exam picker: digit jump + dashboard
      if (viewMode === 'exam-pick') {
        if (handleGlobalKeys(e)) return;
        if (/^[1-9]$/.test(k)) {
          const ei = parseInt(k, 10) - 1;
          if (ei < exams.length) { e.preventDefault(); enterExam(ei); }
          return;
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

      // Exam review: filter chips by digit, R retake, H sidebar, 0/D dashboard
      if (viewMode === 'exam-review') {
        if (handleGlobalKeys(e)) return;
        if (/^[1-5]$/.test(k)) {
          e.preventDefault();
          reviewFilter = ['all','correct','partial','wrong','skipped'][parseInt(k, 10) - 1];
          render();
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
    };
  }

  // ===== Global key handlers (shared) =====
  function handleOverlayKeys(e) {
    const overlay = document.querySelector('.overlay');
    if (!overlay) return false;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlays(); return true; }
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
    if (k === 'f' || k === 'F') { e.preventDefault(); toggleFS(); return true; }
    if (k === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); pomoToggle(); return true; }
    if (k === 'P' && e.shiftKey) { e.preventDefault(); pomoToggle(); return true; }
    if (k === 'm' || k === 'M') { e.preventDefault(); showModuleSwitcher(); return true; }
    if ((k === 's' || k === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); showSettings(); return true; }
    return false;
  }

  // ===== Utils =====
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Expose
  window.QE = {
    bootDashboard,
    bootViewer,
    showHelp,
    showSettings,
    showModuleSwitcher,
    PRESETS,
  };
})();
