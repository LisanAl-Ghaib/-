import './ui/styles.css';
import { BASE_TIME_SCALE, DT } from './config';
import { buildDefs } from './data/defs';
import { loadRawData } from './data/loadBrowser';
import { loadWorld, saveWorld } from './persist/save';
import { Renderer } from './render/renderer';
import { computeEnvironment } from './render/season';
import { Simulation } from './sim/simulation';
import { createWorldState, type WorldState } from './sim/state';
import { $, el, escapeHtml } from './ui/dom';
import { Voices } from './ai/voices';
import { Ui, type UiHost } from './ui/ui';
import { installViews } from './ui/views';
import { closeBoard, openBoard } from './ui/board';

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
  // инструмент разработки: атлас анимаций (в мире его нет)
  if (params.has('atlas')) {
    const { runAtlas } = await import('./dev/atlas');
    // ?atlas=read,wash — только эти занятия
    runAtlas(defs, (params.get('atlas') ?? '').split(',').filter((x) => x && x !== '1'));
    return;
  }

  // ── мир: сохранение или новый
  const seedParam = params.get('seed');
  const seed = seedParam !== null ? (isNaN(+seedParam) ? seedParam : +seedParam) : undefined;
  let state: WorldState | null = null;
  let savedAt = 0;
  if (!params.has('fresh') && seed === undefined && !NOSAVE) {
    const rec = await loadWorld();
    if (rec) {
      state = rec.state;
      savedAt = rec.savedAt;
    }
  }
  const restored = !!state;
  if (!state) state = createWorldState(defs, seed);
  const sim = new Simulation(defs, state);
  state.dataHash = defs.dataHash;

  // ── голоса жильцов: если на компьютере запущена локальная нейросеть (LM Studio / Ollama),
  // она дописывает в хронику, что именно соседи сказали друг другу; если нет — всё по-старому
  // ищем её только когда игра открыта с этого же компьютера (файлом или с localhost):
  // со страницы в интернете браузер стал бы спрашивать доступ к локальной сети
  const localPage = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const voices = new Voices(sim);
  const helpEl = $('#help');
  const helpBase = helpEl.textContent ?? '';

  // ── рендер
  const canvas = $('#view') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, defs, sim);
  await renderer.init();
  renderer.resize();
  renderer.overview(performance.now(), false);

  // ── состояние просмотра (мир не настраивается: только куда смотреть)
  let following: string | null = null;
  const doingEl = $('#doing') as HTMLElement;
  let lastDoing = 0;
  let focusedApartment: string | null = null;

  const host: UiHost = {
    sim,
    defs,
    overview() {
      focusedApartment = null;
      following = null;
      renderer.overview(performance.now());
    },
    follow(id: string) {
      focusedApartment = null;
      const r = sim.state.residents[id];
      if (!r) return;
      following = id;
      if (!r.away) {
        const z = Math.max(renderer.camera.zoom, renderer.camera.fitZoom(220, 120));
        renderer.camera.animateTo(r.x, r.y - 12, z, performance.now());
      } else ui.toast('Сейчас этого человека нет дома');
    },
  };
  const focusApartment = (id: string) => {
    focusedApartment = id;
    following = null;
    const apt = defs.layout.aptById.get(id);
    if (apt) renderer.focusApartment(apt, performance.now());
  };
  const ui = new Ui(host);
  installViews(ui, host);


  // ── ввод: мышь и тач (перетаскивание, щипок для масштаба, тап)
  const dpr = () => window.devicePixelRatio || 1;
  let hoverResident: string | null = null;
  let hoverApartment: string | null = null;
  let hoverBoard = false;
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
        const board = renderer.pickBoard(x, y);
        hoverResident = board ? null : renderer.pickResident(x, y);
        hoverApartment = board || hoverResident ? null : renderer.pickApartment(x, y)?.id ?? null;
        hoverBoard = board;
        canvas.classList.toggle('pointer', !!(board || hoverResident || hoverApartment));
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
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (moved || Math.abs(dx) + Math.abs(dy) > 3) {
      moved = true;
      following = null;
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
    if (renderer.pickBoard(x, y)) return openBoard(defs, sim);
    const rid = renderer.pickResident(x, y);
    if (rid) return host.follow?.(rid);
    const apt = renderer.pickApartment(x, y);
    if (apt) {
      if (focusedApartment === apt.id) return host.overview();
      return focusApartment(apt.id);
    }
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
      const { x, y } = local(e);
      renderer.camera.zoomAt(x, y, e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  const zoomCenter = (d: number) => {
    renderer.camera.zoomAt(canvas.width / 2, canvas.height / 2, d);
  };
  $('#zoom-in').addEventListener('click', () => zoomCenter(1));
  $('#zoom-out').addEventListener('click', () => zoomCenter(-1));
  window.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') zoomCenter(1);
    else if (e.key === '-') zoomCenter(-1);
    else if (e.key === 'Escape') {
      closeBoard();
      host.overview();
    }
  });
  window.addEventListener('resize', () => renderer.resize());
  // панель спрятали/показали — область холста меняется без resize окна:
  // пересчитываем буфер, иначе картинка растягивается
  new ResizeObserver(() => {
    renderer.resize();
    syncInset();
  }).observe(canvas);
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
  renderer.overview(performance.now(), false);

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

  // ── время: мир живёт сам — 1 реальная минута = 1 игровой час, ни паузы, ни ускорения.
  // Пока страница закрыта или спрятана, жизнь продолжается: при возвращении
  // пропущенное время досчитывается (не больше месяца игрового времени).
  const MAX_CATCHUP = 30 * 86400; // игровых секунд
  const prev = new Map<string, { x: number; y: number }>();
  let acc = 0;
  let catching = false;
  const away = $('#away');
  const catchUp = async (gameSeconds: number) => {
    const total = Math.floor(Math.min(gameSeconds, MAX_CATCHUP) / DT);
    if (total <= 0) return;
    catching = true;
    voices.live = false; // пропущенное — шаблонами, нейросеть зовём только «вживую»
    const days = Math.max(1, Math.round((total * DT) / 86400));
    const big = total > 3000;
    if (big) away.hidden = false;
    for (let done = 0; done < total; ) {
      const n = Math.min(4000, total - done);
      sim.run(n);
      done += n;
      if (big) {
        away.textContent = `Пока вас не было… ${total * DT >= 86400 ? `прошло ${days} дн.` : 'прошло несколько часов'} · ${Math.round((100 * done) / total)}%`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    away.hidden = true;
    catching = false;
    voices.live = true;
    prev.clear();
    if (big) ui.toast('Пока вас не было, жизнь шла своим чередом — загляните в хронику', 4000);
  };
  if (restored && savedAt > 0) await catchUp(((Date.now() - savedAt) / 1000) * BASE_TIME_SCALE);

  let last = performance.now();
  let lastUi = 0;
  const frame = (now: number) => {
    const gap = (now - last) / 1000;
    last = now;
    if (gap > 3 && !catching) {
      // вкладка спала — досчитываем пропущенное
      void catchUp(gap * BASE_TIME_SCALE);
    } else if (!catching) {
      acc += gap * BASE_TIME_SCALE;
      const steps = Math.floor(acc / DT);
      acc -= steps * DT;
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
    }
    const alpha = Math.min(1, acc / DT);

    // подпись: что делает тот, за кем следим (видно и так, но не всегда понятно)
    if (now - lastDoing > 300) {
      lastDoing = now;
      const text = following ? describeDoing(sim, following) : '';
      if (doingEl.textContent !== text) doingEl.textContent = text;
      doingEl.hidden = !text;
    }
    if (following) {
      const r = sim.state.residents[following];
      if (r && !r.away && !renderer.camera.animating) {
        renderer.camera.cx += (r.x - renderer.camera.cx) * 0.08;
        renderer.camera.cy += (r.y - 12 - renderer.camera.cy) * 0.08;
      }
    }
    renderer.camera.update(now);
    renderer.env = computeEnvironment(sim);
    renderer.render(now, alpha, prev, {
      hoverResident,
      selectedResident: following,
      hoverApartment,
      focusApartment: focusedApartment,
      hoverBoard,
    });
    if (now - lastUi > 250) {
      lastUi = now;
      ui.update();
      if (localPage) void voices.tick();
      const vs = voices.status();
      const helpText = vs ? `${helpBase} · голоса жильцов: ${vs.server} (${vs.model})` : helpBase;
      if (helpEl.textContent !== helpText) helpEl.textContent = helpText;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // для отладки из консоли
  Object.assign(window, { dom: { sim, defs, renderer, save, host, voices } });
}

boot();

/** «Иван: подтягивается на турнике», «Иван и Снежана: болтают» */
function describeDoing(sim: Simulation, id: string): string {
  const r = sim.state.residents[id];
  const def = sim.defs.residentById.get(id);
  if (!r || !def) return '';
  const name = def.name.short ?? def.name.first;
  const a = r.action;
  if (!a) return `${name}: думает, чем заняться`;
  if (a.id === 'together') {
    const other = sim.defs.residentById.get(String(a.data.with));
    const kind = String(a.data.kind);
    if (kind === 'intimacy') return `${name}: свет погашен`;
    if (other && kind !== 'help_cook' && kind !== 'gift') return `${name} и ${other.name.short ?? other.name.first}: ${a.label}`;
  }
  if (a.id === 'toilet') return `${name}: в туалете`;
  return `${name}: ${a.label}`;
}
