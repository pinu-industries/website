/* =========================================================
   Hero: la π se arma con partículas (del caos al sistema).
   - Objetivos: el trazo del isotipo (js/pi-path.js) dibujado en un canvas
     fuera de pantalla y muestreado en una retícula.
   - El cursor / toque aparta las partículas; regresan con un resorte.
   - Se detiene cuando todo está quieto, cuando el hero no se ve
     o cuando la pestaña está oculta.
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!root.classList.contains('motion') || !window.PINU_PI) return;

  var hero = document.querySelector('.hero');
  var stage = hero && hero.querySelector('.hero__stage');
  var canvas = hero && hero.querySelector('.hero__canvas');
  var markBox = hero && hero.querySelector('.hero__mark');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var PI = window.PINU_PI;
  var piPath = new Path2D(PI.d);

  // Colores del degradado del isotipo
  var STOPS = [
    [0, [93, 252, 176]],
    [0.45, [0, 115, 63]],
    [0.75, [0, 163, 92]],
    [1, [0, 232, 138]]
  ];
  function gradColor(t) {
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        var c = a[1].map(function (v, j) { return Math.round(v + (b[1][j] - v) * k); });
        return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      }
    }
    return 'rgb(0,232,138)';
  }

  var dpr = 1, W = 0, H = 0;
  var particles = [];
  var dotSize = 4;
  var pointer = { x: -9999, y: -9999, active: false };
  var running = false, visible = true, startTime = 0, rafId = 0;
  var REPEL = 90;

  function targetCount() {
    var w = window.innerWidth;
    if (w < 600) return 520;
    if (w < 1100) return 900;
    return 1300;
  }

  // Calcula puntos de la π dentro de la caja .hero__mark
  function buildTargets() {
    var cr = canvas.getBoundingClientRect();
    var mr = markBox.getBoundingClientRect();
    var bw = mr.width, bh = mr.height;
    var ox = mr.left - cr.left, oy = mr.top - cr.top;

    // Punto de origen para el zoom al hacer scroll y para el brillo
    hero.style.setProperty('--ox', ((ox + bw / 2) / cr.width * 100).toFixed(2) + '%');
    hero.style.setProperty('--oy', ((oy + bh / 2) / cr.height * 100).toFixed(2) + '%');

    var off = document.createElement('canvas');
    var ow = Math.max(1, Math.round(bw)), oh = Math.max(1, Math.round(bh));
    off.width = ow; off.height = oh;
    var o = off.getContext('2d');
    o.scale(ow / PI.w, oh / PI.h);
    o.fill(piPath, 'evenodd');
    var data = o.getImageData(0, 0, ow, oh).data;

    function filled(x, y) { return data[(y * ow + x) * 4 + 3] > 128; }

    // Área aproximada para escoger el paso de la retícula
    var area = 0;
    for (var y = 0; y < oh; y += 2) for (var x = 0; x < ow; x += 2) if (filled(x, y)) area += 4;
    var step = Math.max(3, Math.sqrt(area / targetCount()));
    dotSize = Math.max(1.6, step * 0.62);

    var pts = [];
    for (var gy = step / 2; gy < oh; gy += step) {
      for (var gx = step / 2; gx < ow; gx += step) {
        if (filled(gx | 0, gy | 0)) {
          pts.push({ x: ox + gx, y: oy + gy, c: gradColor(Math.min(1, (gx / ow + gy / oh) / 2)) });
        }
      }
    }
    return pts;
  }

  function resize(initial) {
    // Medimos sin el zoom que aplica el scroll (si la página cargó a media
    // página, el canvas está ampliado y las medidas saldrían mal).
    var prevTransform = canvas.style.transform;
    canvas.style.transform = 'none';
    var r = canvas.getBoundingClientRect();
    var oldW = W, oldH = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var targets = buildTargets();
    canvas.style.transform = prevTransform;

    // Si la pantalla cambió de tamaño, las partículas que ya existen se
    // reparten en proporción al área nueva (no se quedan en el área vieja).
    var sx = oldW ? W / oldW : 1, sy = oldH ? H / oldH : 1;
    var next = [];
    for (var i = 0; i < targets.length; i++) {
      var p = particles[i];
      if (!p || initial) {
        // Caos: posición aleatoria en toda la pantalla
        p = {
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
          delay: 250 + Math.random() * 1100 + (targets[i].x / W) * 300,
          rot: Math.random() * Math.PI
        };
      }
      else if (sx !== 1 || sy !== 1) { p.x *= sx; p.y *= sy; }
      p.tx = targets[i].x; p.ty = targets[i].y; p.c = targets[i].c;
      next.push(p);
    }
    particles = next;
    start();
  }

  function frame(now) {
    rafId = 0;
    if (!running) return;
    var t = now - startTime;
    ctx.clearRect(0, 0, W, H);

    var moving = false;
    var R2 = REPEL * REPEL;
    var lastColor = '';

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (t > p.delay) {
        // Resorte hacia su lugar en la π
        var k = Math.min(1, (t - p.delay) / 900);
        p.vx += (p.tx - p.x) * 0.05 * k;
        p.vy += (p.ty - p.y) * 0.05 * k;
        p.vx *= 0.82; p.vy *= 0.82;
        p.rot *= 0.9;
      } else {
        // Deriva caótica antes de ordenarse
        p.vx += (Math.random() - 0.5) * 0.3;
        p.vy += (Math.random() - 0.5) * 0.3;
        p.vx *= 0.98; p.vy *= 0.98;
      }

      if (pointer.active) {
        var dx = p.x - pointer.x, dy = p.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var f = (1 - d / REPEL) * 3.2;
          p.vx += dx / d * f; p.vy += dy / d * f;
        }
      }

      p.x += p.vx; p.y += p.vy;

      if (Math.abs(p.vx) > 0.03 || Math.abs(p.vy) > 0.03 ||
          Math.abs(p.x - p.tx) > 0.4 || Math.abs(p.y - p.ty) > 0.4 || t <= p.delay) {
        moving = true;
      }

      if (p.c !== lastColor) { ctx.fillStyle = p.c; lastColor = p.c; }
      var s = dotSize;
      if (p.rot > 0.02) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }

    if (moving || pointer.active) {
      rafId = requestAnimationFrame(frame);
    } else {
      running = false; // todo en su lugar: no gastamos batería
    }
  }

  function start() {
    if (!visible || document.hidden) return;
    if (!running) {
      running = true;
      if (!startTime) startTime = performance.now();
    }
    if (!rafId) rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // ---- Interacción ----
  function setPointer(e) {
    var r = canvas.getBoundingClientRect();
    // No reaccionar si ya estamos haciendo zoom de salida
    if (r.width === 0) return;
    var sx = W / r.width, sy = H / r.height; // compensa el scale() del scroll
    pointer.x = (e.clientX - r.left) * sx;
    pointer.y = (e.clientY - r.top) * sy;
    pointer.active = true;
    start();
  }
  var touchTimer = 0;
  function clearPointer() { pointer.active = false; pointer.x = pointer.y = -9999; start(); }

  stage.addEventListener('pointermove', setPointer, { passive: true });
  stage.addEventListener('pointerdown', function (e) {
    setPointer(e);
    if (e.pointerType !== 'mouse') {
      clearTimeout(touchTimer);
      touchTimer = setTimeout(clearPointer, 450);
    }
  }, { passive: true });
  stage.addEventListener('pointerleave', clearPointer);
  stage.addEventListener('pointercancel', clearPointer);

  // ---- Visibilidad ----
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  // ---- Tamaño ----
  var lastW = 0, lastH = 0, resizeTimer = 0;
  var ro = new ResizeObserver(function () {
    var r = { width: canvas.clientWidth, height: stage.clientHeight };
    // Ignora los cambios de alto por la barra del navegador móvil
    if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 80) return;
    var initial = lastW === 0;
    lastW = r.width; lastH = r.height;
    clearTimeout(resizeTimer);
    if (initial) resize(true);
    else resizeTimer = setTimeout(function () { resize(false); }, 120);
  });
  ro.observe(stage);
  ro.observe(canvas);

  // Cuando cargan las fuentes el texto cambia de alto y la caja de la π se mueve
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (lastW) resize(false); });
  }
})();
