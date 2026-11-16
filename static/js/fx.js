/* Page effects around the 3D journey: particle name, project carousel, cursor comet and click sparks,
   decrypting headings, live GitHub numbers, optional sound. Each part is independent and fails quietly. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var root = document.documentElement;
  function ready(fn) { if (document.readyState === 'complete') fn(); else window.addEventListener('load', fn); }
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.warn('fx:', e); } }

  // ───────────────────────── 1 · name assembled from particles ─────────────────────────
  function initName() {
    var h1 = document.querySelector('.hero-name');
    if (!h1 || reduced) return;
    var PAD = 70;
    var cv = document.createElement('canvas');
    cv.className = 'name-fx';
    cv.setAttribute('aria-hidden', 'true');
    h1.appendChild(cv);
    var ctx = cv.getContext('2d');
    var parts = [], dpr = 1, running = false, assembling = false, pointer = null, startedAt = 0;

    function build(intro) {
      var box = h1.getBoundingClientRect();
      var w = Math.ceil(h1.offsetWidth), h = Math.ceil(h1.offsetHeight);
      if (!w || !h) return;
      var scale = box.width / w || 1;                       // the heading may be tilted in 3D; measure unscaled
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = (w + PAD * 2) * dpr; cv.height = (h + PAD * 2) * dpr;

      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      var o = off.getContext('2d');
      var lines = [];
      h1.querySelectorAll('span').forEach(function (span) {
        var cs = getComputedStyle(span);
        o.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        if ('letterSpacing' in o) o.letterSpacing = cs.letterSpacing;
        o.textBaseline = 'alphabetic';
        var m = o.measureText(span.textContent);
        var ascent = m.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.9;
        var top = span.offsetTop, left = span.offsetLeft;
        o.fillStyle = '#fff';
        o.fillText(span.textContent, left, top + ascent);
        lines.push({ top: top, bottom: top + span.offsetHeight, left: left, width: span.offsetWidth, gradient: span.classList.contains('line2'), color: cs.color });
      });
      var data = o.getImageData(0, 0, w, h).data, STEP = w > 420 ? 4 : 3, next = [];
      for (var y = 0; y < h; y += STEP) {
        for (var x = 0; x < w; x += STEP) {
          if (data[(y * w + x) * 4 + 3] < 128) continue;
          var line = lines[0];
          for (var i = 0; i < lines.length; i++) if (y >= lines[i].top && y < lines[i].bottom) line = lines[i];
          var color = line.color;
          if (line.gradient) {
            var f = Math.min(1, Math.max(0, (x - line.left) / (line.width || 1)));
            color = 'rgb(' + Math.round(59 + (167 - 59) * f) + ',' + Math.round(130 + (139 - 130) * f) + ',' + Math.round(246 + (250 - 246) * f) + ')';
          }
          var a = Math.random() * Math.PI * 2, d = 260 + Math.random() * 520;
          next.push({
            hx: x + PAD, hy: y + PAD,
            x: intro ? x + PAD + Math.cos(a) * d : x + PAD, y: intro ? y + PAD + Math.sin(a) * d : y + PAD,
            vx: 0, vy: 0, c: color, k: 0.03 + Math.random() * 0.035
          });
        }
      }
      parts = next;
      void scale;
    }

    function frame() {
      if (!running) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      var moving = 0, far = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vx += (p.hx - p.x) * p.k; p.vy += (p.hy - p.y) * p.k;
        if (pointer) {
          var dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
          if (d2 < 6400) { var push = (1 - Math.sqrt(d2) / 80) * 5.5, dist = Math.sqrt(d2) || 1; p.vx += dx / dist * push; p.vy += dy / dist * push; }
        }
        p.vx *= 0.84; p.vy *= 0.84;
        p.x += p.vx; p.y += p.vy;
        var off = Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy);
        if (off > 0.6) moving++;
        if (off > 6) far++;
        var alpha = assembling ? 1 : Math.min(1, off / 10);   // at rest the real text shows through
        if (alpha < 0.03) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
      }
      if (assembling && (far < parts.length * 0.04 || performance.now() - startedAt > 3200)) {
        assembling = false;
        h1.classList.remove('assembling');
      }
      if (!moving && !pointer && !assembling) { running = false; ctx.clearRect(0, 0, cv.width, cv.height); return; }
      requestAnimationFrame(frame);
    }
    function run() { if (!running) { running = true; requestAnimationFrame(frame); } }

    if (!coarse) {
      window.addEventListener('pointermove', function (e) {
        var r = cv.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { pointer = null; return; }
        pointer = { x: (e.clientX - r.left) / r.width * (cv.width / dpr), y: (e.clientY - r.top) / r.height * (cv.height / dpr) };
        run();
      }, { passive: true });
    }

    var first = window.scrollY < 60;
    if (first) h1.classList.add('assembling');
    ready(function () {
      setTimeout(function () {
        var go = function () { build(first); if (first) { assembling = true; startedAt = performance.now(); run(); } };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
      }, 350);
    });
    setTimeout(function () { h1.classList.remove('assembling'); }, 7000);   // never leave the name hidden

    var timer;
    var rebuild = function () { clearTimeout(timer); timer = setTimeout(function () { if (!assembling) build(false); }, 250); };
    window.addEventListener('resize', rebuild);
    new MutationObserver(rebuild).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ───────────────────────── 2 · projects as a 3D carousel ─────────────────────────
  function initCarousel() {
    var grid = document.querySelector('.projects-grid');
    if (!grid || reduced || coarse) return;
    var wide = window.matchMedia('(min-width: 1100px)');
    var state = null, preferGrid = false;
    try { preferGrid = localStorage.getItem('projectsView') === 'grid'; } catch (e) {}

    var toggle = document.createElement('button');
    toggle.className = 'car-toggle';
    toggle.type = 'button';
    grid.parentNode.insertBefore(toggle, grid);
    function label() {
      toggle.textContent = state ? '▦' : '◎';
      toggle.title = state ? 'Grid' : '3D';
      toggle.style.display = wide.matches ? '' : 'none';
    }

    function destroy() {
      if (!state) return;
      clearInterval(state.timer);
      state.items.forEach(function (it) { grid.appendChild(it.firstChild); });
      state.stage.remove(); state.ctrl.remove();
      grid.classList.remove('carousel');
      state = null;
    }

    function build() {
      var cards = Array.prototype.slice.call(grid.querySelectorAll(':scope > .proj'));
      if (cards.length < 3) return;
      var n = cards.length, step = 360 / n;
      var W = 400, R = Math.round(W / 2 / Math.tan(Math.PI / n)) + 70;
      var stage = document.createElement('div'); stage.className = 'car-stage'; stage.tabIndex = 0;
      var ring = document.createElement('div'); ring.className = 'car-ring';
      var items = cards.map(function (card, i) {
        var it = document.createElement('div'); it.className = 'car-item';
        it.style.transform = 'rotateY(' + i * step + 'deg) translateZ(' + R + 'px)';
        it.appendChild(card); ring.appendChild(it);
        card.classList.add('in');
        return it;
      });
      stage.appendChild(ring);
      var ctrl = document.createElement('div'); ctrl.className = 'car-ctrl';
      var prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '←'; prev.setAttribute('aria-label', 'Previous project');
      var next = document.createElement('button'); next.type = 'button'; next.textContent = '→'; next.setAttribute('aria-label', 'Next project');
      var dots = document.createElement('div'); dots.className = 'car-dots';
      var dotEls = cards.map(function (_, i) { var d = document.createElement('i'); d.addEventListener('click', function () { go(i); }); dots.appendChild(d); return d; });
      ctrl.appendChild(prev); ctrl.appendChild(dots); ctrl.appendChild(next);
      grid.classList.add('carousel');
      grid.appendChild(stage); grid.appendChild(ctrl);

      var angle = 0, dragging = false, startX = 0, startAngle = 0, hover = false;
      function apply(animated) {
        ring.style.transition = animated ? 'transform .9s cubic-bezier(0.16,1,0.3,1)' : 'none';
        ring.style.transform = 'translateZ(' + -R + 'px) rotateY(' + -angle + 'deg)';
        var front = ((Math.round(angle / step) % n) + n) % n;
        items.forEach(function (it, i) {
          var rel = Math.abs((((i * step - angle) % 360) + 540) % 360 - 180);
          it.classList.toggle('front', i === front);
          it.style.opacity = rel < step * 0.5 ? 1 : rel < step * 1.5 ? 0.42 : 0;
        });
        dotEls.forEach(function (d, i) { d.classList.toggle('on', i === front); });
      }
      function go(i) { var cur = Math.round(angle / step); var diff = ((i - cur) % n + n) % n; if (diff > n / 2) diff -= n; angle = (cur + diff) * step; apply(true); }
      function shift(by) { angle = (Math.round(angle / step) + by) * step; apply(true); }
      prev.addEventListener('click', function () { shift(-1); });
      next.addEventListener('click', function () { shift(1); });
      stage.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1); });
      stage.addEventListener('pointerdown', function (e) {
        if (e.target.closest('a')) return;
        dragging = true; startX = e.clientX; startAngle = angle; stage.classList.add('dragging');
      });
      window.addEventListener('pointermove', function (e) { if (!dragging) return; angle = startAngle - (e.clientX - startX) * 0.28; apply(false); });
      window.addEventListener('pointerup', function () { if (!dragging) return; dragging = false; stage.classList.remove('dragging'); angle = Math.round(angle / step) * step; apply(true); });
      stage.addEventListener('pointerenter', function () { hover = true; });
      stage.addEventListener('pointerleave', function () { hover = false; });
      var timer = setInterval(function () {
        var r = stage.getBoundingClientRect();
        if (hover || dragging || document.hidden || r.bottom < 0 || r.top > window.innerHeight) return;
        shift(1);
      }, 5200);
      apply(false);
      state = { stage: stage, ctrl: ctrl, items: items, timer: timer };
    }

    function sync() { destroy(); if (wide.matches && !preferGrid) build(); label(); }
    toggle.addEventListener('click', function () {
      preferGrid = !!state;
      try { localStorage.setItem('projectsView', preferGrid ? 'grid' : '3d'); } catch (e) {}
      sync();
    });
    if (wide.addEventListener) wide.addEventListener('change', sync);
    window.initProjectCarousel = sync;     // the page calls this again if projects are loaded from the API
    sync();
  }

  // ───────────────────────── 4 + 5 · cursor comet and click sparks ─────────────────────────
  function initPointerFx() {
    if (reduced) return;
    var cv = document.createElement('canvas');
    cv.className = 'pointer-fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d'), dpr = 1, running = false;
    var trail = [], sparks = [], rings = [], head = null, big = 0, bigTarget = 0, lastMove = 0;
    var COLORS = ['#60a5fa', '#a78bfa', '#22d3ee', '#ffffff'];
    function size() { dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr; }
    size();
    window.addEventListener('resize', size);

    function frame(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      var alive = false;

      if (head) {
        trail.push({ x: head.x, y: head.y });
        if (trail.length > 18) trail.shift();
        var idle = now - lastMove > 140;
        if (idle && trail.length > 1) trail.shift();
        big += (bigTarget - big) * 0.18;
        ctx.lineCap = 'round';
        for (var i = 1; i < trail.length; i++) {
          var f = i / trail.length;
          ctx.strokeStyle = 'rgba(96,165,250,' + (f * 0.55).toFixed(3) + ')';
          ctx.lineWidth = 1 + f * 5;
          ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
        }
        var rad = 3.5 + big * 13;
        var g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, rad * 2.4);
        g.addColorStop(0, 'rgba(191,219,254,' + (0.9 - big * 0.55) + ')');
        g.addColorStop(1, 'rgba(96,165,250,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(head.x, head.y, rad * 2.4, 0, Math.PI * 2); ctx.fill();
        if (big > 0.05) { ctx.strokeStyle = 'rgba(147,197,253,' + (big * 0.8).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(head.x, head.y, rad, 0, Math.PI * 2); ctx.stroke(); }
        if (!idle || trail.length > 1 || Math.abs(bigTarget - big) > 0.01) alive = true;
      }

      for (var s = sparks.length - 1; s >= 0; s--) {
        var p = sparks[s];
        p.life -= 0.022; if (p.life <= 0) { sparks.splice(s, 1); continue; }
        p.vy += 0.09; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy;
        ctx.globalAlpha = Math.min(1, p.life * 1.6);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + p.life), 0, Math.PI * 2); ctx.fill();
        alive = true;
      }
      ctx.globalAlpha = 1;
      for (var r = rings.length - 1; r >= 0; r--) {
        var w = rings[r];
        w.life -= 0.028; if (w.life <= 0) { rings.splice(r, 1); continue; }
        ctx.strokeStyle = 'rgba(147,197,253,' + (w.life * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 2 * w.life + 0.4;
        ctx.beginPath(); ctx.arc(w.x, w.y, (1 - w.life) * w.max, 0, Math.PI * 2); ctx.stroke();
        alive = true;
      }
      if (alive) requestAnimationFrame(frame); else running = false;
    }
    function run() { if (!running) { running = true; requestAnimationFrame(frame); } }

    if (!coarse) {
      window.addEventListener('pointermove', function (e) {
        head = { x: e.clientX, y: e.clientY };
        lastMove = performance.now();
        bigTarget = e.target.closest && e.target.closest('a, button, .proj, .ccard, .cert-card, input') ? 1 : 0;
        run();
      }, { passive: true });
      document.addEventListener('pointerleave', function () { head = null; trail = []; });
    }
    window.addEventListener('pointerdown', function (e) {
      var button = e.target.closest && e.target.closest('.btn');
      var count = button ? 34 : 18;
      for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * (button ? 6.5 : 4.5);
        sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.55 + Math.random() * 0.5, r: 1.2 + Math.random() * 2, c: COLORS[(Math.random() * COLORS.length) | 0] });
      }
      rings.push({ x: e.clientX, y: e.clientY, life: 1, max: button ? 120 : 46 });
      if (button) rings.push({ x: e.clientX, y: e.clientY, life: 0.75, max: 190 });
      run();
    }, { passive: true });
  }

  // ───────────────────────── 7 · headings that decrypt ─────────────────────────
  function initDecrypt() {
    if (reduced || !('IntersectionObserver' in window)) return;
    var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*<>/=+';
    function scramble(el) {
      var nodes = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
      var total = nodes.reduce(function (n, x) { return n + x.text.length; }, 0), start = performance.now(), DURATION = 520 + total * 14;
      (function tick(now) {
        var done = Math.min(1, (now - start) / DURATION), shown = Math.floor(done * total), offset = 0;
        nodes.forEach(function (x) {
          if (!x.node.parentNode) { offset += x.text.length; return; }     // replaced by a language switch
          var out = '';
          for (var i = 0; i < x.text.length; i++) {
            var ch = x.text[i];
            out += (offset + i < shown || ch === ' ' || ch === '\n') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
          x.node.nodeValue = out; offset += x.text.length;
        });
        if (done < 1) requestAnimationFrame(tick);
      })(start);
    }
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { seen.unobserve(e.target); scramble(e.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll('.section-title, .contact-title').forEach(function (el) { seen.observe(el); });
  }

  // ───────────────────────── 8 · live GitHub numbers ─────────────────────────
  function initGithub() {
    var link = document.querySelector('a[href*="github.com/"]');
    var user = link && (link.getAttribute('href').match(/github\.com\/([^\/?#]+)/) || [])[1];
    if (!user || !window.fetch) return;
    var KEY = 'gh:' + user;

    function show(d) {
      var nums = document.querySelectorAll('.github-stat-num'), labels = document.querySelectorAll('.github-stat-label');
      function set(i, value, label) {
        if (!nums[i] || value == null) return;
        nums[i].dataset.count = value;
        if (nums[i].textContent !== '0') nums[i].textContent = value;      // counter already played
        if (label && labels[i]) labels[i].textContent = label;
      }
      set(0, d.repos, 'REPOS');
      set(2, d.stars, 'STARS');
      // the public feed only covers public repositories; use it for the graph only when it says something
      var active = d.days.filter(function (n) { return n > 0; }).length;
      if (active >= 8) {
        var graph = document.getElementById('contribGraph');
        if (graph) {
          graph.innerHTML = '';
          d.days.forEach(function (n) {
            var c = document.createElement('div');
            c.className = 'contrib-cell' + (n >= 10 ? ' l4' : n >= 6 ? ' l3' : n >= 3 ? ' l2' : n >= 1 ? ' l1' : '');
            c.title = n + '';
            graph.appendChild(c);
          });
        }
        window.__ghDays = d.days;
        window.dispatchEvent(new CustomEvent('gh-activity', { detail: { days: d.days } }));
      }
    }

    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.at < 30 * 60 * 1000) { show(cached.data); return; }
    } catch (e) {}

    var api = 'https://api.github.com/users/' + encodeURIComponent(user);
    var json = function (url) { return fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    Promise.all([
      json(api),
      json(api + '/repos?per_page=100&type=owner'),
      json(api + '/events/public?per_page=100').catch(function () { return []; })
    ]).then(function (res) {
      var days = new Array(91).fill(0), today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
      res[2].forEach(function (ev) {
        var t = new Date(ev.created_at), idx = Math.floor((today - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000);
        if (idx >= 0 && idx < 91) days[90 - idx]++;
      });
      var data = {
        repos: res[0].public_repos,
        stars: res[1].reduce(function (n, r) { return n + (r.stargazers_count || 0); }, 0),
        days: days
      };
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
      show(data);
    }).catch(function () { /* offline or rate-limited: keep what the page already shows */ });
  }

  // ───────────────────────── 9 · sound (off by default) ─────────────────────────
  function initSound() {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctrl = document.querySelector('.nav-ctrl'), theme = document.getElementById('themeToggle');
    if (!AC || !ctrl) return;
    var btn = document.createElement('button');
    btn.className = 'theme-toggle sound-toggle'; btn.type = 'button'; btn.id = 'soundToggle';
    btn.title = 'Sound'; btn.setAttribute('aria-pressed', 'false'); btn.textContent = '🔇';
    ctrl.insertBefore(btn, theme || ctrl.firstChild);

    var ctx = null, master, whooshGain, whooshFilter, on = false, timer = null;
    function start() {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      // hum: three low detuned tones through a low-pass, slowly breathing
      var low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 240; low.connect(master);
      [[55, 'sine', 0.5], [82.6, 'sine', 0.28], [110.4, 'triangle', 0.1]].forEach(function (v) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = v[1]; o.frequency.value = v[0]; g.gain.value = v[2];
        o.connect(g); g.connect(low); o.start();
      });
      var lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 0.09; depth.gain.value = 60; lfo.connect(depth); depth.connect(low.frequency); lfo.start();
      // whoosh: filtered noise that follows the scroll speed
      var buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = buffer.getChannelData(0);
      for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      whooshFilter = ctx.createBiquadFilter(); whooshFilter.type = 'bandpass'; whooshFilter.frequency.value = 500; whooshFilter.Q.value = 0.8;
      whooshGain = ctx.createGain(); whooshGain.gain.value = 0;
      noise.connect(whooshFilter); whooshFilter.connect(whooshGain); whooshGain.connect(master); noise.start();
    }
    function blip() {
      if (!on || !ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
    }
    function set(next) {
      on = next;
      if (on && !ctx) start();
      if (ctx) {
        if (on) ctx.resume();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(on ? 0.22 : 0, ctx.currentTime + 0.6);
      }
      btn.textContent = on ? '🔊' : '🔇';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      clearInterval(timer);
      if (on) timer = setInterval(function () {
        var speed = (window.__journey && window.__journey.speed) || 0, t = ctx.currentTime;
        whooshGain.gain.setTargetAtTime(Math.min(0.5, speed * 0.9), t, 0.08);
        whooshFilter.frequency.setTargetAtTime(380 + Math.min(1, speed) * 2200, t, 0.08);
      }, 60);
    }
    btn.addEventListener('click', function () { set(!on); });
    window.addEventListener('journey-station', blip);
    document.addEventListener('visibilitychange', function () { if (ctx && on) { if (document.hidden) ctx.suspend(); else ctx.resume(); } });
  }

  safe(initName);
  safe(initCarousel);
  safe(initPointerFx);
  safe(initDecrypt);
  safe(initGithub);
  safe(initSound);
})();
