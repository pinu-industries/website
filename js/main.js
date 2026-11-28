/* =========================================================
   Pinu Industries — interacción general
   Sin dependencias. Cada módulo revisa si su sección existe.
   ========================================================= */

// Enlace de agenda (Calendly, Cal.com, Google Calendar…). Mientras sea '#',
// los botones "Agenda" abren la ventana con el formulario de cita (#cita).
// Sin JavaScript, los botones abren un correo a contacto@pinuindustries.com.
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
// Clave pública de Web3Forms (web3forms.com): con ella, el formulario de cita
// envía cada solicitud a contacto@pinuindustries.com. No es secreta: está hecha
// para ir en la página. Mientras esté vacía, el formulario abre el correo del visitante.
const WEB3FORMS_KEY = 'ad836976-9976-4cef-aaa1-70e4bbddc6c7';
const CONTACT_EMAIL = 'contacto@pinuindustries.com';
// Horario que se ofrece en el calendario de citas (hora del centro de México).
// Días: 1 = lunes … 6 = sábado, 0 = domingo. Ajusta a tu disponibilidad real.
const BOOKING_WEEKDAYS = [1, 2, 3, 4, 5];
// Bloques de atención [inicio, fin) y cada cuántos minutos se ofrece una hora.
// Con estos valores: 09:00, 09:30 … 13:30 y 16:00, 16:30 … 17:30.
const BOOKING_HOURS = [['09:00', '14:00'], ['16:00', '18:00']];
const BOOKING_STEP_MIN = 30;
const BOOKING_TIMES = BOOKING_HOURS.flatMap(([from, to]) => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const out = [];
  for (let t = toMin(from); t < toMin(to); t += BOOKING_STEP_MIN) {
    out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  }
  return out;
});
const BOOKING_DAYS_AHEAD = 45; // hasta cuántos días adelante se puede elegir
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

  /* ---------- Ventana para agendar (formulario de cita) ---------- */
  const booking = document.getElementById('cita');
  if (booking && typeof booking.showModal === 'function' && !(BOOKING_URL && BOOKING_URL !== '#')) {
    const $ = (sel) => booking.querySelector(sel);
    const form = $('[data-booking-form]');
    const steps = { 1: $('[data-step="1"]'), 2: $('[data-step="2"]') };
    const done = $('[data-view="done"]');
    const status = $('[data-status]');
    const submit = $('[data-submit]');
    const step1Err = $('[data-step1-err]');
    const grid = $('[data-cal-grid]');
    const monthLabel = $('[data-cal-month]');
    const prevBtn = $('[data-cal-prev]');
    const nextBtn = $('[data-cal-next]');
    const timesSet = $('[data-times]');
    const timesGrid = $('[data-times-grid]');
    const sumDate = $('[data-sum-date]');
    const sumTime = $('[data-sum-time]');

    const fmtLong = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtShort = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
    const fmtMonth = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    // Rango elegible: desde mañana hasta BOOKING_DAYS_AHEAD días
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = addDays(today, 1);
    const last = addDays(today, BOOKING_DAYS_AHEAD);
    const isOpenDay = (d) => d >= first && d <= last && BOOKING_WEEKDAYS.includes(d.getDay());
    let firstOpen = first;
    while (!isOpenDay(firstOpen) && firstOpen <= last) firstOpen = addDays(firstOpen, 1);

    // Mes inicial: el del primer día disponible, salvo que a ese mes le queden
    // menos de 3 días disponibles (entonces se abre el siguiente; las flechas permiten regresar)
    const startMonth = () => {
      const m = new Date(firstOpen.getFullYear(), firstOpen.getMonth(), 1);
      let left = 0;
      for (let d = firstOpen; d.getMonth() === m.getMonth(); d = addDays(d, 1)) if (isOpenDay(d)) left++;
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      return left < 3 && next <= last ? next : m;
    };
    let view = startMonth();
    let pickedDate = null;
    let pickedTime = null;
    let focusDate = firstOpen;

    function renderCalendar(moveFocus) {
      monthLabel.textContent = cap(fmtMonth.format(view));
      prevBtn.disabled = view <= new Date(first.getFullYear(), first.getMonth(), 1);
      nextBtn.disabled = view >= new Date(last.getFullYear(), last.getMonth(), 1);
      grid.textContent = '';
      const lead = view.getDay(); // la semana empieza en domingo
      for (let i = 0; i < lead; i++) grid.append(document.createElement('span'));
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (let n = 1; n <= days; n++) {
        const d = new Date(view.getFullYear(), view.getMonth(), n);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cal__day';
        b.textContent = n;
        b.dataset.date = key(d);
        b.setAttribute('aria-label', cap(fmtLong.format(d)));
        const open = isOpenDay(d);
        if (!open) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
        if (key(d) === key(today)) b.classList.add('is-today');
        const sel = pickedDate && key(d) === key(pickedDate);
        b.setAttribute('aria-pressed', sel ? 'true' : 'false');
        b.tabIndex = key(d) === key(focusDate) && open ? 0 : -1;
        grid.append(b);
      }
      // Si el día con foco no está en este mes, el primero disponible recibe el tabindex
      if (!grid.querySelector('.cal__day[tabindex="0"]')) {
        const any = grid.querySelector('.cal__day:not([disabled])');
        if (any) any.tabIndex = 0;
      }
      if (moveFocus) {
        const f = grid.querySelector('.cal__day[tabindex="0"]');
        if (f) f.focus();
      }
    }

    function renderTimes() {
      timesGrid.textContent = '';
      timesSet.disabled = !pickedDate;
      BOOKING_TIMES.forEach((t) => {
        const label = document.createElement('label');
        label.className = 'time';
        const input = document.createElement('input');
        input.type = 'radio'; input.name = 'hora'; input.value = t;
        input.checked = pickedTime === t;
        const span = document.createElement('span');
        span.textContent = t;
        label.append(input, span);
        timesGrid.append(label);
      });
    }

    function updateSummary() {
      sumDate.textContent = pickedDate ? cap(fmtShort.format(pickedDate)).replace(/\./g, '') : 'Elige un día';
      sumTime.textContent = pickedTime ? pickedTime + ' h' : 'Elige una hora';
      sumDate.parentElement.classList.toggle('is-set', !!pickedDate);
      sumTime.parentElement.classList.toggle('is-set', !!pickedTime);
    }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.cal__day');
      if (!b || b.disabled) return;
      const [y, m, d] = b.dataset.date.split('-').map(Number);
      pickedDate = new Date(y, m - 1, d);
      focusDate = pickedDate;
      step1Err.hidden = true;
      renderCalendar(true);
      renderTimes();
      updateSummary();
    });
    // Teclado: flechas por día y semana, Inicio/Fin por semana
    grid.addEventListener('keydown', (e) => {
      const b = e.target.closest('.cal__day');
      if (!b) return;
      const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      const [y, m, d] = b.dataset.date.split('-').map(Number);
      let cur = new Date(y, m - 1, d);
      let next = null;
      if (e.key in deltas) {
        next = addDays(cur, deltas[e.key]);
        // salta días cerrados en la misma dirección
        let guard = 0;
        while (!isOpenDay(next) && next >= first && next <= last && guard++ < 14) next = addDays(next, Math.sign(deltas[e.key]));
      } else if (e.key === 'Home' || e.key === 'End') {
        // primer / último día abierto de esa semana
        const dow = cur.getDay(); // domingo = 0
        next = e.key === 'Home' ? addDays(cur, -dow) : addDays(cur, 6 - dow);
        const dir = e.key === 'Home' ? 1 : -1;
        while (!isOpenDay(next) && (dir > 0 ? next < cur : next > cur)) next = addDays(next, dir);
      }
      if (!next) return;
      e.preventDefault();
      if (!isOpenDay(next)) return;
      focusDate = next;
      view = new Date(next.getFullYear(), next.getMonth(), 1);
      renderCalendar(true);
    });
    prevBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCalendar(false); });
    nextBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCalendar(false); });
    timesGrid.addEventListener('change', (e) => {
      if (e.target.name !== 'hora') return;
      pickedTime = e.target.value;
      step1Err.hidden = true;
      updateSummary();
    });

    const goStep = (n, focusTarget) => {
      Object.entries(steps).forEach(([k, el]) => { el.hidden = +k !== n; });
      booking.querySelectorAll('[data-step-dot]').forEach((li) => {
        if (+li.dataset.stepDot === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.classList.toggle('is-done', +li.dataset.stepDot < n);
      });
      if (focusTarget) focusTarget.focus();
    };

    $('[data-next]').addEventListener('click', () => {
      if (!pickedDate || !pickedTime) {
        step1Err.textContent = !pickedDate ? 'Elige un día en el calendario.' : 'Elige una hora para ese día.';
        step1Err.hidden = false;
        (!pickedDate ? grid.querySelector('.cal__day[tabindex="0"]') : timesGrid.querySelector('input')).focus();
        return;
      }
      goStep(2, $('#cita-datos-title'));
    });
    $('[data-back]').addEventListener('click', () => {
      goStep(1);
      const sel = grid.querySelector('.cal__day[aria-pressed="true"]') || grid.querySelector('.cal__day[tabindex="0"]');
      if (sel) sel.focus();
    });

    // ----- Paso 2: datos -----
    const fields = { nombre: form.elements.nombre, correo: form.elements.correo, mensaje: form.elements.mensaje };
    const MESSAGES = {
      nombre: 'Escribe tu nombre.',
      correo: 'Escribe un correo válido, por ejemplo nombre@empresa.com.',
      mensaje: 'Cuéntanos brevemente qué te gustaría resolver.',
    };
    const setError = (k, msg) => {
      const input = fields[k];
      const err = document.getElementById(input.id + '-err');
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      err.textContent = msg || '';
      err.hidden = !msg;
    };
    const validate = (k) => {
      const v = fields[k].value.trim();
      let ok = v.length > 0;
      if (ok && k === 'correo') ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      setError(k, ok ? '' : MESSAGES[k]);
      return ok;
    };
    Object.keys(fields).forEach((k) => {
      fields[k].addEventListener('blur', () => { if (fields[k].value.trim()) validate(k); });
      fields[k].addEventListener('input', () => { if (fields[k].getAttribute('aria-invalid') === 'true') validate(k); });
    });

    const reset = () => {
      pickedDate = null; pickedTime = null; focusDate = firstOpen;
      view = startMonth();
      form.reset();
      Object.keys(fields).forEach((k) => setError(k, ''));
      status.textContent = '';
      step1Err.hidden = true;
      form.hidden = false; done.hidden = true;
      renderCalendar(false); renderTimes(); updateSummary(); goStep(1);
    };

    const open = () => {
      if (!done.hidden) reset();
      // Si el visitante eligió una situación en Servicios, la usamos como punto de partida
      const picked = document.querySelector('[data-configurator] input:checked');
      if (picked && !fields.mensaje.value.trim()) fields.mensaje.value = picked.closest('label').textContent.trim() + '. ';
      root.classList.add('is-modal');
      booking.showModal();
    };
    const close = () => booking.close();
    booking.addEventListener('close', () => root.classList.remove('is-modal'));
    document.querySelectorAll('[data-cta]').forEach((a) => {
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        open();
      });
    });
    booking.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    booking.addEventListener('click', (e) => { if (e.target === booking) close(); });

    const data = () => {
      const f = form.elements;
      return {
        nombre: f.nombre.value.trim(),
        negocio: f.negocio.value.trim(),
        correo: f.correo.value.trim(),
        whatsapp: f.whatsapp.value.trim(),
        mensaje: f.mensaje.value.trim(),
        fecha: cap(fmtLong.format(pickedDate)),
        hora: pickedTime + ' h (centro de México)',
      };
    };
    const mailtoFor = (d) => 'mailto:' + CONTACT_EMAIL
      + '?subject=' + encodeURIComponent('Quiero agendar mi diagnóstico')
      + '&body=' + encodeURIComponent([
        'Hola, equipo Pinu:', '', 'Quiero agendar mi diagnóstico gratuito.', '',
        'Día: ' + d.fecha,
        'Hora: ' + d.hora,
        '',
        'Nombre: ' + d.nombre,
        'Negocio o giro: ' + (d.negocio || '-'),
        'Correo: ' + d.correo,
        'WhatsApp: ' + (d.whatsapp || '-'),
        '', '¿Qué me gustaría resolver?', d.mensaje,
      ].join('\n'));

    const finish = (d) => {
      $('[data-done-title]').textContent = '¡Listo, ' + d.nombre.split(/\s+/)[0] + '!';
      $('[data-done-text]').textContent = 'Recibimos tu solicitud. Te escribimos a ' + d.correo + ' para confirmar tu cita:';
      $('[data-done-when]').textContent = d.fecha + ' · ' + pickedTime + ' h';
      form.hidden = true; done.hidden = false;
      booking.querySelectorAll('[data-step-dot]').forEach((li) => { li.classList.add('is-done'); li.removeAttribute('aria-current'); });
      $('[data-done-title]').focus();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (steps[2].hidden) { $('[data-next]').click(); return; }
      if (form.elements.botcheck.checked) return;
      const invalid = Object.keys(fields).filter((k) => !validate(k));
      if (invalid.length) {
        status.textContent = invalid.length === 1 ? 'Revisa el campo marcado.' : 'Revisa los campos marcados.';
        fields[invalid[0]].focus();
        return;
      }
      const d = data();
      if (!WEB3FORMS_KEY) {
        window.location.href = mailtoFor(d);
        status.textContent = 'Abrimos tu correo con la solicitud escrita; solo falta enviarlo.';
        return;
      }
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      status.textContent = 'Enviando…';
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_KEY,
            subject: 'Nueva cita de diagnóstico: ' + d.nombre + ' · ' + d.fecha + ', ' + pickedTime + ' h',
            from_name: 'pinuindustries.com',
            replyto: d.correo,
            'Día': d.fecha,
            'Hora': d.hora,
            Nombre: d.nombre,
            'Negocio o giro': d.negocio || '-',
            Correo: d.correo,
            WhatsApp: d.whatsapp || '-',
            '¿Qué le gustaría resolver?': d.mensaje,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.message || res.status);
        status.textContent = '';
        finish(d);
      } catch (err) {
        status.textContent = '';
        status.append('No pudimos enviar tu solicitud. Intenta de nuevo o ');
        const link = document.createElement('a');
        link.href = mailtoFor(d);
        link.className = 'ulink';
        link.textContent = 'escríbenos por correo';
        status.append(link, '.');
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });

    renderCalendar(false);
    renderTimes();
    updateSummary();
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
    // Al salir del área, se queda abierta la última tarjeta que se vio
    setOpen(projects[0], true);
  }

  /* ---------- Textos que se "compilan" al aparecer ---------- */
  const compileEls = document.querySelectorAll('[data-compile]');
  if (compileEls.length && MOTION) {
    const GLYPHS = '01{}[]<>/=+*#$%&';
    const SCRAMBLE = 60;   // cada cuánto cambian los caracteres aleatorios (ms)
    const SETTLE = 400;    // al final, los caracteres se fijan de izquierda a derecha en este tiempo

    // Cambia caracteres al azar y se detiene a los `end` ms
    const run = (el, end = 900) => {
      const final = el.dataset.compile;
      const t0 = performance.now();
      let last = -Infinity;
      const step = (now) => {
        const t = now - t0;
        if (t < end && now - last < SCRAMBLE) { requestAnimationFrame(step); return; }
        last = now;
        const k = clamp((t - (end - SETTLE)) / SETTLE);
        const fixed = Math.floor(final.length * k);
        let out = final.slice(0, fixed);
        for (let i = fixed; i < final.length; i++) {
          out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (t < end) requestAnimationFrame(step);
        else el.textContent = final;
      };
      requestAnimationFrame(step);
    };

    // Grupos (las cifras del CTA): todas cambian a la vez y se van
    // deteniendo de izquierda a derecha.
    const FIRST = 1100;    // cuándo se detiene la primera
    const STAGGER = 650;   // tiempo entre una y la siguiente
    document.querySelectorAll('[data-compile-group]').forEach((group) => {
      const els = [...group.querySelectorAll('[data-compile]')];
      const gio = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        gio.disconnect();
        els.forEach((el, i) => run(el, FIRST + i * STAGGER));
      }, { threshold: 0.5 });
      gio.observe(group);
    });

    // Textos sueltos: se compilan al aparecer
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { run(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    compileEls.forEach((el) => { if (!el.closest('[data-compile-group]')) cio.observe(el); });
  }

  /* ---------- Aparición suave de bloques ---------- */
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reveals.length && MOTION && 'IntersectionObserver' in window) {
    root.classList.add('reveal-ready');
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
