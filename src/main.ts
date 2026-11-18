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
  let speedIndex = Number(localStorage.getItem('dom.speed') ?? 1);
  if (!(speedIndex >= 0 && speedIndex < SPEEDS.length)) speedIndex = 1;
  let following = false;
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
      following = false;
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
      if (!NOSAVE) await clearWorld();
      location.search = '';
      location.reload();
    },
  };
  const ui = new Ui(host);
  installViews(ui, host);
  if (restored) ui.toast('Жизнь в доме продолжается с того же места');

  // ── ввод
  let drag: { x: number; y: number; moved: boolean } | null = null;
  const dpr = () => window.devicePixelRatio || 1;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.moved || Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        following = false;
        canvas.classList.add('dragging');
        renderer.camera.panBy(dx * dpr(), dy * dpr());
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
      return;
    }
    const sx = e.offsetX * dpr();
    const sy = e.offsetY * dpr();
    hoverResident = renderer.pickResident(sx, sy);
    hoverApartment = hoverResident ? null : renderer.pickApartment(sx, sy)?.id ?? null;
    canvas.classList.toggle('pointer', !!(hoverResident || hoverApartment));
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    const wasDrag = drag?.moved;
    drag = null;
    if (wasDrag) return;
    const sx = e.offsetX * dpr();
    const sy = e.offsetY * dpr();
    const rid = renderer.pickResident(sx, sy);
    if (rid) return host.select(rid);
    const apt = renderer.pickApartment(sx, sy);
    if (apt) return host.focusApartment(apt.id);
  });
  canvas.addEventListener('pointerleave', () => {
    hoverResident = hoverApartment = null;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      following = false;
      renderer.camera.zoomAt(e.offsetX * dpr(), e.offsetY * dpr(), e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      host.setSpeed(speedIndex === 0 ? Number(localStorage.getItem('dom.lastSpeed') ?? 1) || 1 : 0);
      if (speedIndex !== 0) localStorage.setItem('dom.lastSpeed', String(speedIndex));
    } else if (e.key >= '1' && e.key <= '4') host.setSpeed(Number(e.key) - 1);
    else if (e.key === 'Escape') {
      host.select(null);
      host.overview();
    }
  });
  window.addEventListener('resize', () => renderer.resize());

  // ── сохранение
  let saving = false;
  const save = async () => {
    if (NOSAVE || saving) return;
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
  Object.assign(window, { dom: { sim, defs, renderer, save } });
}

boot();
