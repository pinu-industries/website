/* =========================================================
   Pinu Industries — interacción general
   Sin dependencias. Cada módulo revisa si su sección existe.
   ========================================================= */

// Enlace de agenda (Calendly, Cal.com, Google Calendar…). Mientras sea '#',
// los botones abren un correo a contacto@pinuindustries.com.
// TODO: poner aquí el enlace real de agenda.
const BOOKING_URL = '#';
// Mientras no haya agenda, el botón abre un correo con una plantilla lista para llenar.
const MAIL_BODY = [
  'Hola, equipo Pinu:',
  '',
  'Quiero agendar mi diagnóstico gratuito.',
  '',
  'Nombre:',
  'Negocio y giro:',
  '¿Qué me gustaría resolver?:',
  'Días y horarios que me acomodan:',
  'Teléfono / WhatsApp (opcional):',
].join('\n');
const FALLBACK_MAIL = 'mailto:contacto@pinuindustries.com'
  + '?subject=' + encodeURIComponent('Quiero agendar mi diagnóstico')
  + '&body=' + encodeURIComponent(MAIL_BODY);

(function () {
  'use strict';

  const root = document.documentElement;
  const MOTION = root.classList.contains('motion');
  const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // Ejecuta fn como máximo una vez por cuadro mientras se redimensiona la ventana
  const onResize = (fn) => {
    let id = 0;
    window.addEventListener('resize', () => {
      if (!id) id = requestAnimationFrame(() => { id = 0; fn(); });
    });
  };

  /* ---------- CTA ---------- */
  document.querySelectorAll('[data-cta]').forEach((a) => {
    if (BOOKING_URL && BOOKING_URL !== '#') {
      a.href = BOOKING_URL;
      a.target = '_blank';
      a.rel = 'noopener';
    } else {
      a.href = FALLBACK_MAIL;
    }
  });

  /* ---------- Hero: si el canvas nunca arrancó (p. ej. hero.js no cargó),
     se muestra el logo fijo en lugar de dejar el hueco vacío ---------- */
  const heroEl = document.querySelector('.hero');
  if (MOTION && heroEl) {
    window.addEventListener('load', () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!heroEl.classList.contains('hero--canvas')) heroEl.classList.add('hero--fallback');
      }));
    });
  }

  /* ---------- Header ---------- */
  const nav = document.querySelector('[data-nav]');
  const toggle = nav && nav.querySelector('.nav__toggle');
  const links = nav && nav.querySelector('.nav__links');

  function setMenu(open) {
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Cerrar menú' : 'Abrir menú';
    nav.classList.toggle('is-open', open);
  }
  if (toggle) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', () => setMenu(false));
  }

  let navScrolled = null;
  function updateNav() {
    if (!nav) return;
    const s = window.scrollY > 8;
    if (s !== navScrolled) { nav.classList.toggle('is-scrolled', s); navScrolled = s; }
  }

  /* ---------- Frases que se encienden palabra por palabra ---------- */
  document.querySelectorAll('[data-words]').forEach((el) => {
    // Respeta los <span class="..."> internos (p. ej. palabras resaltadas)
    let i = 0;
    const wrapText = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.style.setProperty('--i', i++);
            w.textContent = part;
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          wrapText(child);
        }
      });
    };
    wrapText(el);
    el.style.setProperty('--n', i);
  });

  /* =========================================================
     Motor de escenas: cada [data-scene] recibe --p de 0 a 1.
     - Escenas fijas (más altas que la pantalla): progreso del pin.
     - Escenas normales: progreso al cruzar la pantalla.
     Se suaviza con interpolación para una sensación más fluida.
     ========================================================= */
  const scenes = [...document.querySelectorAll('[data-scene]')].map((el) => ({
    el, p: MOTION ? 0 : 1, target: 0, visible: false, hooks: [],
  }));
  const sceneOf = (el) => scenes.find((s) => s.el === el);

  // ¿La escena está fija (sticky) en este tamaño de pantalla?
  function checkPinned() {
    scenes.forEach((s) => {
      const child = s.el.querySelector(':scope > .scene__sticky');
      s.sticky = child;
      s.pinned = !!child && getComputedStyle(child).position === 'sticky';
    });
  }
  checkPinned();
  onResize(checkPinned);

  function measure(s) {
    const r = s.el.getBoundingClientRect();
    if (s.pinned) {
      // El escenario fijo mide 100svh; en celular innerHeight cambia con la barra
      // del navegador, así que se usa la altura real del escenario.
      const span = r.height - s.sticky.clientHeight;
      if (span <= 0) return r.top <= 0 ? 1 : 0;
      return clamp(-r.top / span);
    }
    const vh = window.innerHeight;
    if (r.height <= 0) return 0;
    return clamp((vh * 0.85 - r.top) / (r.height * 0.85));
  }

  let raf = 0;
  function tick() {
    raf = 0;
    updateNav();
    if (!MOTION) return;
    let again = false;
    for (const s of scenes) {
      if (!s.visible) continue;
      s.target = measure(s);
      const d = s.target - s.p;
      s.p = Math.abs(d) < 0.0005 ? s.target : s.p + d * 0.16;
      if (s.p !== s.target) again = true;
      apply(s);
    }
    if (again) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }
  function apply(s) {
    s.el.style.setProperty('--p', s.p.toFixed(4));
    for (const h of s.hooks) h(s.p, s);
  }

  if (MOTION) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = sceneOf(e.target);
        if (!s) continue;
        if (e.isIntersecting && !s.visible) {
          s.p = s.target = measure(s);
          apply(s);
        }
        s.visible = e.isIntersecting;
      }
      kick();
    }, { rootMargin: '15% 0px' });
    scenes.forEach((s) => io.observe(s.el));
  }
  window.addEventListener('scroll', kick, { passive: true });
  onResize(kick);
  kick();

  /* ---------- Proceso: línea SVG que se dibuja con el scroll ---------- */
  const proc = document.querySelector('[data-process]');
  if (proc) {
    const svg = proc.querySelector('.process__svg');
    const base = svg.querySelector('.process__base');
    const line = svg.querySelector('.process__line');
    const steps = [...proc.querySelectorAll('.step')];
    let len = 0;
    let stops = [];

    function layoutLine() {
      const box = proc.querySelector('.process__track').getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const pts = steps.map((st) => {
        const r = st.querySelector('.step__dot').getBoundingClientRect();
        return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
      });
      // En escritorio (pasos en fila) la línea entra por el borde izquierdo de la
      // pantalla y sale por el derecho, para que el trazo ocupe todo el ancho.
      // Los extremos son los bordes del escenario (máximo 1920 de diseño, nunca más).
      const row = Math.abs(pts[pts.length - 1][1] - pts[0][1]) < 2;
      const stage = proc.querySelector('.process__stage').getBoundingClientRect();
      const path = row
        ? [[stage.left - box.left, pts[0][1]], ...pts, [stage.right - box.left, pts[0][1]]]
        : pts;
      let d = `M ${path[0][0]} ${path[0][1]}`;
      for (let i = 1; i < path.length; i++) d += ` L ${path[i][0]} ${path[i][1]}`;
      base.setAttribute('d', d);
      line.setAttribute('d', d);
      len = line.getTotalLength();
      line.style.strokeDasharray = `${len} ${len}`;
      // Proporción del trazo en la que se alcanza cada paso
      let acc = 0;
      const dist = [0];
      for (let i = 1; i < path.length; i++) {
        acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        dist.push(acc / len);
      }
      stops = row ? dist.slice(1, -1) : dist;
      const sc = sceneOf(proc);
      drawLine(sc ? sc.p : 1, sc);
    }

    function drawLine(p, s) {
      let t;
      if (!MOTION) {
        t = 1;
      } else if (s && !s.pinned) {
        // Celular: la "pluma" va al 70% de la pantalla y dibuja hasta ahí
        const first = steps[0].querySelector('.step__dot').getBoundingClientRect();
        const last = steps[steps.length - 1].querySelector('.step__dot').getBoundingClientRect();
        const span = (last.top - first.top) || 1;
        t = clamp((window.innerHeight * 0.7 - first.top) / span);
      } else {
        // Escritorio fijo: el trazo avanza entre el 10% y el 85% del progreso
        t = clamp((p - 0.1) / 0.75);
      }
      line.style.strokeDashoffset = String(len * (1 - t));
      steps.forEach((st, i) => st.classList.toggle('is-on', t >= stops[i] - 0.001));
    }

    const s = sceneOf(proc);
    if (s) s.hooks.push(drawLine);
    layoutLine();
    onResize(layoutLine);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutLine);
  }

  /* ---------- Configurador de servicios ---------- */
  const conf = document.querySelector('[data-configurator]');
  if (conf) {
    const services = [...conf.querySelectorAll('[data-service]')];
    const live = conf.querySelector('[data-live]');
    conf.classList.add('is-ready');

    function choose(key, label) {
      conf.classList.add('has-choice');
      services.forEach((sv) => {
        const on = sv.dataset.service === key;
        sv.classList.toggle('is-active', on);
        sv.querySelector('.svc__body').hidden = !on;
      });
      const active = conf.querySelector(`[data-service="${key}"]`);
      const name = active.querySelector('.svc__name').textContent;
      if (live) live.textContent = `Para “${label}”, te recomendamos: ${name}.`;

      // En celular el panel queda debajo de las opciones: lo traemos a la vista
      if (window.matchMedia('(max-width: 959px)').matches) {
        requestAnimationFrame(() => {
          const r = active.getBoundingClientRect();
          const navH = nav ? nav.offsetHeight : 0;
          if (r.top < navH || r.top > window.innerHeight * 0.55) {
            window.scrollTo({
              top: window.scrollY + r.top - navH - 16,
              behavior: MOTION ? 'smooth' : 'auto',
            });
          }
        });
      }
    }

    // Sin selección: todos colapsados excepto el diagnóstico (punto de entrada)
    services.forEach((sv) => { sv.querySelector('.svc__body').hidden = sv.dataset.service !== 'diagnostico'; });

    conf.addEventListener('change', (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (!input) return;
      choose(input.value, input.closest('label').textContent.trim());
    });
  }

  /* ---------- Proyectos: expandir problema → solución → tecnología ---------- */
  const projects = [...document.querySelectorAll('[data-project]')];
  if (projects.length) {
    const setOpen = (proj, open) => {
      proj.classList.toggle('is-open', open);
      proj.querySelector('.proj__toggle').setAttribute('aria-expanded', String(open));
    };
    projects.forEach((proj) => {
      const btn = proj.querySelector('.proj__toggle');
      btn.addEventListener('click', () => {
        // En escritorio (tarjetas en fila) un clic siempre abre: nunca deja las tres vacías
        const row = window.matchMedia('(min-width: 960px)').matches;
        const open = row || !proj.classList.contains('is-open');
        projects.forEach((p) => setOpen(p, p === proj ? open : false));
      });
      if (FINE_POINTER) {
        proj.addEventListener('mouseenter', () => projects.forEach((p) => setOpen(p, p === proj)));
      }
    });
    const list = projects[0].parentElement;
    if (FINE_POINTER) {
      list.addEventListener('mouseleave', () => {
        if (!list.contains(document.activeElement)) projects.forEach((p, i) => setOpen(p, i === 0));
      });
    }
    setOpen(projects[0], true);
  }

  /* ---------- Textos que se "compilan" al aparecer ---------- */
  const compileEls = document.querySelectorAll('[data-compile]');
  if (compileEls.length && MOTION) {
    const GLYPHS = '01{}[]<>/=+*#$%&';
    const run = (el) => {
      const final = el.dataset.compile;
      const dur = 900;
      const t0 = performance.now();
      const step = (now) => {
        const k = clamp((now - t0) / dur);
        const fixed = Math.floor(final.length * k);
        let out = final.slice(0, fixed);
        for (let i = fixed; i < final.length; i++) {
          out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = final;
      };
      requestAnimationFrame(step);
    };
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { run(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    compileEls.forEach((el) => cio.observe(el));
  }

  /* ---------- Aparición suave de bloques ---------- */
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reveals.length && MOTION) {
    const rio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach((el) => rio.observe(el));
  }

  /* ---------- Botones magnéticos (solo con mouse) ---------- */
  if (MOTION && FINE_POINTER) {
    document.querySelectorAll('[data-magnetic]').forEach((btn) => {
      const strength = 0.28;
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        btn.style.setProperty('--bx', `${x.toFixed(1)}px`);
        btn.style.setProperty('--by', `${y.toFixed(1)}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--bx', '0px');
        btn.style.setProperty('--by', '0px');
      });
    });
  }
})();
