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
  };

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
  function toast(msg, kind = '') {
    let el = document.getElementById('qe-toast');
    if (!el) { el = document.createElement('div'); el.id = 'qe-toast'; document.body.appendChild(el); }
    el.className = '';
    if (kind) el.classList.add(kind);
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
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
          <div class="keys">${k('Esc')}</div><div>Close overlay</div>
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
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="set-auto" ${cfg.autoAdvance ? 'checked' : ''}>
            <span><b>Auto-advance</b> — apply current loadout (Q/A timers)</span>
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
        LS.set('autoAdvance', cfg.autoAdvance);
        LS.set('multiSelect', cfg.multiSelect);
        LS.set('showCorrectionOnCopy', cfg.showCorrectionOnCopy);
        LS.set('pomoMinutes', cfg.pomoMinutes);
        if (!pomo.running) { pomo.remaining = pomo.total(); LS.set('pomo.paused', 0); }
        pomoRender();
        toast('✓ Settings saved', 'ok');
        closeOverlays();
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
          <div class="hint">
            <kbd>1</kbd>–<kbd>9</kbd> jump · <kbd>↑↓←→</kbd> focus · <kbd>Enter</kbd> open ·
            <kbd>/</kbd> search · <kbd>M</kbd> switcher · <kbd>L</kbd> theme · <kbd>?</kbd> help
          </div>
        </div>
        <div id="qe-semesters"></div>
      </div>
    `;
    const semRoot = document.getElementById('qe-semesters');

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
          const pct = prog && prog.total ? Math.round((prog.answered / prog.total) * 100) : 0;
          a.innerHTML = `
            <span class="num">${globalIdx <= 9 ? globalIdx : ''}</span>
            <div class="title">${m.name}</div>
            <div class="meta">${m.sem} · ${m.file.split('/').pop()}</div>
            ${prog ? `<div class="meta">${prog.answered}/${prog.total} · ${prog.correct || 0}✓</div><div class="progress"><span style="width:${pct}%"></span></div>` : ''}
          `;
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
    }

    const search = document.getElementById('qe-search');
    search.addEventListener('input', () => render(search.value));

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

    // Island timer host
    const island = document.createElement('div');
    island.id = 'qe-island';
    document.body.appendChild(island);

    // Load text file
    let text;
    try {
      const url = '../' + encodeURI(module.file);
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    } catch (e) {
      root.innerHTML = `<div class="empty"><div class="ico">⚠️</div>Failed to load <code>${module.file}</code><br><small>${e.message}</small><br><br>Serve the folder via a local web server (e.g. <code>python -m http.server</code>) — opening as <code>file://</code> blocks fetch.</div>`;
      return;
    }

    const parsed = parseQuestionsFile(text);
    if (parsed.questions.length === 0) {
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

    const progKey = `progress.${module.slug}`;
    const ansKey = `answers.${module.slug}`;
    let answers = LS.get(ansKey, {}); // qIdx -> { picked: ['A','C'], correct: bool, partial: bool, checked: bool }
    let idx = LS.get(`current.${module.slug}`, 0);
    if (idx < 0 || idx >= questions.length) idx = 0;

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

    function render() {
      loadCurrentAnswer();
      const q = currentQ();
      const total = questions.length;

      // Group sidebar by exam
      const sidebarHtml = exams.map(grp => {
        const offset = questions.indexOf(grp.questions[0]);
        const chips = grp.questions.map((qq, j) => {
          const qIdx = offset + j;
          const rec = answers[qIdx];
          let cls = 'q-chip';
          if (qIdx === idx) cls += ' current';
          if (rec && rec.checked) {
            cls += ' answered';
            if (rec.correct) cls += ' correct';
            else cls += ' wrong';
          }
          return `<div class="${cls}" data-idx="${qIdx}" title="Q${qq.qn} — ${qq.topic || ''}">${qq.qn}</div>`;
        }).join('');
        const examLink = grp.url ? `<a href="${grp.url}" target="_blank" title="Open original on e-qe.online">↗</a>` : '';
        return `
          <div class="exam-group">
            <div class="exam-name"><span>${grp.name}</span><span>${grp.count} ${examLink}</span></div>
            <div class="q-list">${chips}</div>
          </div>
        `;
      }).join('');

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

      // Restart timer for current phase
      if (cfg.autoAdvance) startTimer();
      else hideIsland();
    }

    function toggle(letter) {
      if (checked) return; // locked
      if (!cfg.multiSelect) picked.clear();
      if (picked.has(letter)) picked.delete(letter); else picked.add(letter);
      // Save partial pick
      answers[idx] = { ...(answers[idx] || {}), picked: [...picked], checked: false };
      persist();
      render();
    }

    function check() {
      const q = currentQ();
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

    function next() {
      if (idx < questions.length - 1) {
        idx++;
        phase = 'question';
        render();
      } else {
        toast('🏁 End of module. Great work!', 'ok');
      }
    }
    function prev() {
      if (idx > 0) {
        idx--;
        phase = 'question';
        render();
      }
    }
    function gotoIdx(i) {
      if (i < 0 || i >= questions.length) return;
      idx = i;
      phase = 'question';
      render();
    }
    function gotoQuestionPrompt() {
      const v = window.prompt(`Go to question (1–${questions.length}):`, String(idx + 1));
      if (!v) return;
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 1 && n <= questions.length) gotoIdx(n - 1);
    }

    function resetCurrent() {
      delete answers[idx];
      picked.clear();
      checked = false;
      phase = 'question';
      persist();
      render();
      toast('🔄 Question reset', 'warn');
    }

    function spaceAction() {
      if (!checked) {
        if (picked.size === 0) {
          // pick random
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
      const q = currentQ();
      const opts = q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
      return `Question médicale :\n${q.text}\n\nPropositions :\n${opts}\n\nPour chaque proposition, indique si elle est VRAIE ou FAUSSE avec une explication courte et précise.`;
    }
    function buildAIPrompt() {
      const q = currentQ();
      const opts = q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
      let p = `Rôle : Agis en tant que Professeur agrégé de médecine et expert en pédagogie médicale. Corrige ce QCM avec rigueur et clarté.\n\n`;
      p += `### Contexte\n* Module : ${module.name}\n* Examen : ${q.exam}\n* Question : Q${q.qn}${q.topic ? ' — ' + q.topic : ''}\n\n`;
      p += `### Question\n${q.text}\n\n`;
      p += `### Propositions\n${opts}\n\n`;
      if (cfg.showCorrectionOnCopy && checked && q.correct && q.correct.length) {
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
      // Always-on shortcuts
      if (handleGlobalKeys(e)) return;

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
    if (k === 's' && e.shiftKey) { e.preventDefault(); showSettings(); return true; }
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
