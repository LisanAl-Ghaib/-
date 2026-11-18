import './ui/styles.css';
import { BASE_TIME_SCALE, DT, SPEEDS } from './config';
import { buildDefs } from './data/defs';
import { loadRawData } from './data/loadBrowser';
import { clearWorld, loadWorld, saveWorld } from './persist/save';
import { Renderer } from './render/renderer';
import { computeEnvironment } from './render/season';
import { Simulation } from './sim/simulation';
import { createWorldState, type WorldState } from './sim/state';
import { $, el, escapeHtml } from './ui/dom';
import { Ui, type UiHost } from './ui/ui';
import { installViews } from './ui/views';

const params = new URLSearchParams(location.search);
const NOSAVE = params.has('nosave');

async function boot() {
  const built = buildDefs(loadRawData());
  for (const w of built.warnings) console.warn(`[data] ${w}`);
  if (!built.defs) {
    $('#stage').append(el('div', { class: 'errors', html: `<b>Ошибки в данных (npm run validate):</b>\n\n${built.errors.map(escapeHtml).join('\n')}` }));
    return;
  }
  const defs = built.defs;

  // ── мир: сохранение или новый
  const seedParam = params.get('seed');
  const seed = seedParam !== null ? (isNaN(+seedParam) ? seedParam : +seedParam) : undefined;
  let state: WorldState | null = null;
  if (!params.has('fresh') && seed === undefined && !NOSAVE) state = await loadWorld();
  const restored = !!state;
  if (!state) state = createWorldState(defs, seed);
  const sim = new Simulation(defs, state);
  state.dataHash = defs.dataHash;

  // ── рендер
  const canvas = $('#view') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, defs, sim);
  await renderer.init();
  renderer.resize();
  renderer.overview(performance.now(), false);

  // ── состояние интерфейса
  let speedIndex = 1;
  try {
    speedIndex = Number(localStorage.getItem('dom.speed') ?? 1);
  } catch {
    /* хранилище недоступно */
  }
  if (!(speedIndex >= 0 && speedIndex < SPEEDS.length)) speedIndex = 1;
  let following = false;
  let resetting = false;
  let hoverResident: string | null = null;
  let hoverApartment: string | null = null;

  const host: UiHost = {
    sim,
    defs,
    get speedIndex() {
      return speedIndex;
    },
    setSpeed(i: number) {
      speedIndex = i;
      try {
        localStorage.setItem('dom.speed', String(i));
      } catch {
        /* приватный режим */
      }
      ui.refreshSpeed();
    },
    selected: null,
    focusedApartment: null,
    select(id, opts) {
      host.selected = id;
      following = !!(id && opts?.focus);
      if (id) {
        ui.openPanel();
        syncInset();
      }
      if (id && opts?.focus) {
        const r = sim.state.residents[id];
        if (r && !r.away) {
          const z = Math.max(renderer.camera.zoom, renderer.camera.fitZoom(220, 120));
          renderer.camera.animateTo(r.x, r.y - 12, z, performance.now());
        }
      }
      ui.showTab('details');
    },
    focusApartment(id) {
      host.focusedApartment = id;
      host.selected = null;
      following = false;
      if (id) {
        ui.openPanel();
        syncInset();
      }
      const apt = id ? defs.layout.aptById.get(id) : null;
      if (apt) renderer.focusApartment(apt, performance.now());
      ui.showTab('details');
    },
    overview() {
      host.focusedApartment = null;
      following = false;
      renderer.overview(performance.now());
    },
    async newWorld() {
      resetting = true; // чтобы автосохранение при уходе со страницы не вернуло старый мир
      if (!NOSAVE) await clearWorld();
      if (location.search) location.href = location.pathname;
      else location.reload();
    },
  };
  const ui = new Ui(host);
  installViews(ui, host);
  if (restored) ui.toast('Жизнь в доме продолжается с того же места');

  // ── ввод: мышь и тач (перетаскивание, щипок для масштаба, тап)
  const dpr = () => window.devicePixelRatio || 1;
  const store = {
    get: (k: string) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* хранилище недоступно */
      }
    },
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false;
  let pinch: { dist: number; acc: number } | null = null;
  const local = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * dpr(), y: (e.clientY - r.top) * dpr() };
  };
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) moved = false;
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), acc: 0 };
      moved = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        const { x, y } = local(e);
        hoverResident = renderer.pickResident(x, y);
        hoverApartment = hoverResident ? null : renderer.pickApartment(x, y)?.id ?? null;
        canvas.classList.toggle('pointer', !!(hoverResident || hoverApartment));
      }
      return;
    }
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size >= 2 && pinch) {
      // щипок: целочисленный масштаб, шаг — каждые ~60 px изменения расстояния
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      pinch.acc += d - pinch.dist;
      pinch.dist = d;
      const r = canvas.getBoundingClientRect();
      const cx = ((p1.x + p2.x) / 2 - r.left) * dpr();
      const cy = ((p1.y + p2.y) / 2 - r.top) * dpr();
      while (Math.abs(pinch.acc) > 60) {
        renderer.camera.zoomAt(cx, cy, pinch.acc > 0 ? 1 : -1);
        pinch.acc -= Math.sign(pinch.acc) * 60;
      }
      following = false;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (moved || Math.abs(dx) + Math.abs(dy) > 3) {
      moved = true;
      following = false;
      canvas.classList.add('dragging');
      renderer.camera.panBy(dx * dpr(), dy * dpr());
    } else pointers.set(e.pointerId, prev); // копим смещение до порога
  });
  const release = (e: PointerEvent, tap: boolean) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    canvas.classList.remove('dragging');
    if (!tap || moved) return;
    const { x, y } = local(e);
    const rid = renderer.pickResident(x, y);
    if (rid) return host.select(rid);
    const apt = renderer.pickApartment(x, y);
    if (apt) return host.focusApartment(apt.id);
  };
  canvas.addEventListener('pointerup', (e) => release(e, true));
  canvas.addEventListener('pointercancel', (e) => release(e, false));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hoverResident = hoverApartment = null;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      following = false;
      const { x, y } = local(e);
      renderer.camera.zoomAt(x, y, e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  const zoomCenter = (d: number) => {
    following = false;
    renderer.camera.zoomAt(canvas.width / 2, canvas.height / 2, d);
  };
  $('#zoom-in').addEventListener('click', () => zoomCenter(1));
  $('#zoom-out').addEventListener('click', () => zoomCenter(-1));
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (speedIndex !== 0) store.set('dom.lastSpeed', String(speedIndex));
      host.setSpeed(speedIndex === 0 ? Number(store.get('dom.lastSpeed') ?? 1) || 1 : 0);
    } else if (e.key >= '1' && e.key <= '4') host.setSpeed(Number(e.key) - 1);
    else if (e.key === '+' || e.key === '=') zoomCenter(1);
    else if (e.key === '-') zoomCenter(-1);
    else if (e.key === 'Escape') {
      host.select(null);
      host.overview();
    }
  });
  window.addEventListener('resize', () => renderer.resize());
  // телефон: панель — нижний лист, камера центрирует то, что над ним
  function syncInset() {
    const panel = $('#panel');
    const sheet = window.matchMedia('(max-width: 760px)').matches && !panel.classList.contains('hidden');
    const stage = $('#stage').getBoundingClientRect();
    const covered = sheet ? Math.max(0, stage.bottom - panel.getBoundingClientRect().top) : 0;
    renderer.camera.insetBottom = Math.round(covered * (window.devicePixelRatio || 1));
    renderer.camera.clampCenter();
  }
  new ResizeObserver(syncInset).observe($('#panel'));
  new MutationObserver(syncInset).observe($('#panel'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', syncInset);
  syncInset();

  // ── сохранение
  let saving = false;
  const save = async () => {
    if (NOSAVE || saving || resetting) return;
    saving = true;
    try {
      await saveWorld(sim.state);
    } catch (err) {
      console.warn('[save]', err);
    } finally {
      saving = false;
    }
  };
  window.setInterval(save, 15000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  window.addEventListener('pagehide', () => void save());

  // ── главный цикл: фиксированный шаг симуляции + интерполяция рендера
  const prev = new Map<string, { x: number; y: number }>();
  let acc = 0;
  let last = performance.now();
  let lastUi = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt * BASE_TIME_SCALE * SPEEDS[speedIndex];
    let steps = Math.floor(acc / DT);
    if (steps > 400) {
      steps = 400;
      acc = 0;
    } else acc -= steps * DT;
    for (let i = 0; i < steps; i++) {
      for (const r of Object.values(sim.state.residents)) {
        const p = prev.get(r.id);
        if (p) {
          p.x = r.x;
          p.y = r.y;
        } else prev.set(r.id, { x: r.x, y: r.y });
      }
      sim.step();
    }
    const alpha = speedIndex === 0 ? 1 : Math.min(1, acc / DT);

    if (following && host.selected) {
      const r = sim.state.residents[host.selected];
      if (r && !r.away && !renderer.camera.animating) {
        renderer.camera.cx += (r.x - renderer.camera.cx) * 0.08;
        renderer.camera.cy += (r.y - 12 - renderer.camera.cy) * 0.08;
      }
    }
    renderer.camera.update(now);
    renderer.env = computeEnvironment(sim);
    renderer.render(now, alpha, prev, {
      hoverResident,
      selectedResident: host.selected,
      hoverApartment,
      focusApartment: host.focusedApartment,
    });
    if (now - lastUi > 250) {
      lastUi = now;
      ui.update();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // для отладки из консоли
  Object.assign(window, { dom: { sim, defs, renderer, save, host } });
}

boot();
