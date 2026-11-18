import { CORE_W, SLAB } from '../config';
import { clamp01, mix } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import { daylight } from '../sim/env/sun';
import type { ResidentState } from '../sim/state';
import type { Simulation } from '../sim/simulation';
import type { ApartmentModel } from '../world/layout';
import { drawApartmentDoor, drawEntrance, renderBuilding, type BuildingLayers } from './building';
import { Camera } from './camera';
import { DEFAULT_LOOK, drawGround, drawTrees, drawYardProps, makeTrees, type OutdoorLook, type TreeShape } from './outdoor';
import { busPhase } from '../world/transport';
import { digits, disc, rect } from './pixel';
import { drawSkyGradient, drawStars, drawSunMoon, makeCity, makeCloud, makeStars, skyColors, type Star } from './sky';
import { CELL_H, CELL_W, FRAME, generateCharacterSheet } from './sprites/character';
import { screenRect } from './sprites/furniture';
import { generateIcon } from './sprites/icons';
import { ctx2d, makeCanvas, SpriteRegistry } from './sprites/registry';

export interface Environment {
  overcast: number;
  rain: number;
  snow: number;
  fog: number;
  wind: number;
  look: OutdoorLook;
  coats: boolean;
}

export interface RenderOptions {
  hoverResident: string | null;
  selectedResident: string | null;
  hoverApartment: string | null;
  focusApartment: string | null;
}

interface Cloud {
  img: HTMLCanvasElement;
  x0: number;
  y: number;
  speed: number;
}

/** Где нарисован жилец (для наведения мыши) */
interface ActorBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly camera: Camera;
  readonly sprites = new SpriteRegistry();
  private world: HTMLCanvasElement;
  private wg: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lg: CanvasRenderingContext2D;
  private layers: BuildingLayers | null = null;
  private city: ReturnType<typeof makeCity>;
  private stars: Star[];
  private clouds: Cloud[];
  private trees: TreeShape[];
  private fxRng = Rng.fromSeed('render-fx'); // косметика, не влияет на симуляцию
  private actorBoxes: ActorBox[] = [];
  private drops: { x: number; y: number; s: number }[] = [];
  readonly W: number;
  readonly H: number;
  /** окружение (погода/сезон) — задаётся извне */
  env: Environment = { overcast: 0.15, rain: 0, snow: 0, fog: 0, wind: 0.2, look: DEFAULT_LOOK, coats: false };

  constructor(canvas: HTMLCanvasElement, private defs: WorldDefs, private sim: Simulation) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    const L = defs.layout;
    this.W = L.worldW;
    this.H = L.worldH;
    this.world = makeCanvas(this.W, this.H);
    this.wg = ctx2d(this.world);
    this.light = makeCanvas(this.W, this.H);
    this.lg = ctx2d(this.light);
    this.camera = new Camera(this.W, this.H);
    this.city = makeCity(this.W, 80);
    this.stars = makeStars(this.W, L.groundY);
    const rng = Rng.fromSeed('clouds');
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      img: makeCloud(`cloud${i}`, rng.int(30, 56), rng.int(12, 18)),
      x0: rng.int(0, this.W),
      y: rng.int(4, 60),
      speed: rng.range(0.4, 1),
    }));
    this.trees = makeTrees(defs);
  }

  async init(): Promise<void> {
    await this.sprites.loadOverrides();
    this.rebuildStatic();
  }

  rebuildStatic(): void {
    this.layers = renderBuilding(this.defs, this.sprites);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.camera.setViewport(w, h);
    this.camera.clampCenter();
  }

  /** Обзор всего дома */
  overview(now: number, animate = true): void {
    const L = this.defs.layout;
    const cam = this.camera;
    const z = cam.fitZoom(L.buildingX1 - L.buildingX0 + 40, L.worldH - L.roofY + 24);
    const visW = cam.viewW / z;
    // дом целиком слева, остальное место — двору
    const x = visW >= this.W ? this.W / 2 : L.buildingX0 - 16 + visW / 2;
    const y = (L.roofY - 20 + L.worldH) / 2;
    if (animate) cam.animateTo(x, y, z, now);
    else this.camera.jumpTo(x, y, z);
  }

  focusApartment(apt: ApartmentModel, now: number): void {
    const L = this.defs.layout;
    const y = (L.levelTop(apt.level) + L.floorY(apt.level)) / 2;
    const z = Math.min(10, this.camera.fitZoom(apt.x1 - apt.x0 + 24, 70));
    this.camera.animateTo((apt.x0 + apt.x1) / 2, y, z, now);
  }

  // ───────────────────────────── кадр ─────────────────────────────

  render(nowMs: number, alpha: number, prev: Map<string, { x: number; y: number }>, opts: RenderOptions): void {
    if (!this.layers) return;
    const { wg, defs, sim } = this;
    const L = defs.layout;
    const cal = sim.calendar();
    const day = daylight(cal);
    const env = this.env;
    const tGame = sim.time;

    // небо
    const sky = skyColors(cal, env.overcast);
    drawSkyGradient(wg, this.W, L.groundY, sky);
    drawStars(wg, this.stars, (1 - day) * (1 - env.overcast), nowMs);
    drawSunMoon(wg, cal, this.W, L.groundY - 40, env.overcast);
    this.drawClouds(tGame, day);
    this.drawCity(day, cal.hour);
    if (env.fog > 0) {
      wg.globalAlpha = env.fog * 0.5;
      rect(wg, 0, L.groundY - 90, this.W, 90, mix('#9aa3ad', '#2a3040', 1 - day));
      wg.globalAlpha = 1;
    }
    // дождь/снег позади дома (виден в окнах)
    this.drawPrecip(nowMs, true);

    // улица
    drawGround(wg, defs, env.look);
    drawYardProps(wg, defs, env.look);
    drawTrees(wg, defs, this.trees, env.look, nowMs);
    this.drawSnowman();
    this.drawLeaves(nowMs);

    // дом
    wg.drawImage(this.layers.back, 0, 0);
    this.drawDynamicFurniture(nowMs);
    this.drawDoors();
    this.drawElevator();
    this.drawActors(alpha, prev, opts, nowMs);
    wg.drawImage(this.layers.front, 0, 0);
    this.drawBus(tGame);

    // освещение
    this.drawLighting(day);
    // осадки перед всем, кроме дома
    this.drawPrecip(nowMs, false);
    if (env.fog > 0) this.drawFog(day);
    this.drawFocus(opts);
    this.drawBubbles(nowMs);
    this.drawMarkers(opts, nowMs);

    // на экран
    this.blit();
    this.drawLabels(opts);
  }

  private drawClouds(t: number, day: number) {
    const cover = 0.3 + this.env.overcast * 0.7;
    const n = Math.round(this.clouds.length * cover);
    for (let i = 0; i < n; i++) {
      const c = this.clouds[i];
      const span = this.W + c.img.width;
      const x = Math.round(((((c.x0 + (t / 60) * c.speed * (0.3 + this.env.wind)) % span) + span) % span) - c.img.width);
      this.wg.globalAlpha = 0.85 * (0.25 + 0.75 * clamp01(day * 1.3)) * (1 - this.env.overcast * 0.3);
      this.wg.drawImage(c.img, x, c.y);
      this.wg.globalAlpha = 1;
    }
  }

  private drawCity(day: number, hour: number) {
    const L = this.defs.layout;
    const y0 = L.groundY - this.city.base.height;
    this.wg.drawImage(this.city.base, 0, y0);
    // ночной оттенок
    if (day < 0.95) {
      this.wg.globalAlpha = (1 - day) * 0.55;
      rect(this.wg, 0, y0, this.W, this.city.base.height, '#141a38');
      this.wg.globalAlpha = 1;
    }
    if (day < 0.6) {
      const night = hour >= 1 && hour < 5;
      const share = night ? 8 : 38;
      for (const w of this.city.windows) {
        if ((w.k + hour * 7919) % 100 < share) rect(this.wg, w.x, y0 + w.y, 2, 2, w.k % 5 === 0 ? '#bfe0ff' : '#ffd98a');
      }
    }
  }

  private drawPrecip(nowMs: number, back: boolean) {
    const { rain, snow, wind } = this.env;
    const amount = Math.max(rain, snow);
    if (amount <= 0.01) return;
    const L = this.defs.layout;
    const g = this.wg;
    const target = Math.round(amount * 420);
    while (this.drops.length < target) this.drops.push({ x: this.fxRng.range(0, this.W), y: this.fxRng.range(0, L.groundY), s: this.fxRng.range(0.6, 1.2) });
    if (this.drops.length > target) this.drops.length = target;
    const t = nowMs / 1000;
    const isSnow = snow > rain;
    for (let i = 0; i < this.drops.length; i++) {
      if (back !== (i % 2 === 0)) continue;
      const d = this.drops[i];
      const fall = isSnow ? 22 * d.s : 220 * d.s;
      const drift = wind * (isSnow ? 30 : 60) + (isSnow ? Math.sin(t + i) * 6 : 0);
      const y = (d.y + t * fall) % L.groundY;
      let x = (d.x + t * drift) % this.W;
      if (x < 0) x += this.W;
      // спереди — только снаружи дома
      if (!back && x > L.buildingX0 - 2 && x < L.buildingX1 + 2 && y > L.roofY) continue;
      if (isSnow) rect(g, x, y, 1, 1, '#f4f8ff');
      else {
        rect(g, x, y, 1, 3, 'rgba(190,210,235,0.75)');
        if (wind > 0.4) rect(g, x + 1, y - 1, 1, 1, 'rgba(190,210,235,0.5)');
      }
    }
  }

  private drawFog(day: number) {
    const L = this.defs.layout;
    const g = this.wg;
    const color = mix('#c4cad1', '#3a4250', 1 - day);
    for (let y = L.groundY - 60; y < L.groundY; y += 4) {
      g.globalAlpha = this.env.fog * 0.35 * ((y - (L.groundY - 60)) / 60);
      rect(g, 0, y, L.buildingX0, 4, color);
      rect(g, L.buildingX1, y, this.W - L.buildingX1, 4, color);
    }
    g.globalAlpha = 1;
  }

  private drawSnowman() {
    const sm = this.sim.state.yard.snowman;
    if (!sm) return;
    const g = this.wg;
    const y = this.defs.layout.groundY;
    const melt = Math.max(0, Math.min(1, (this.sim.weather.temp - 0) / 4)) * (1 - this.sim.weather.snowCover);
    const k = 1 - melt * 0.4;
    disc(g, sm.x, y - Math.round(5 * k), Math.round(5 * k), '#f4f8fb');
    disc(g, sm.x, y - Math.round(13 * k), Math.round(4 * k), '#eef4f8');
    disc(g, sm.x, y - Math.round(19 * k), Math.round(3 * k), '#f4f8fb');
    rect(g, sm.x + 2, y - Math.round(19 * k), 3, 1, '#e8742a');
    rect(g, sm.x - 1, y - Math.round(20 * k), 1, 1, '#222');
    rect(g, sm.x + 1, y - Math.round(20 * k), 1, 1, '#222');
    if (sm.builtAt % 2 === 0) rect(g, sm.x - 3, y - Math.round(25 * k), 6, 3, '#6a7a8a');
    rect(g, sm.x - 7, y - Math.round(14 * k), 4, 1, '#5b4030');
    rect(g, sm.x + 4, y - Math.round(14 * k), 4, 1, '#5b4030');
  }

  private leaves: { x: number; y: number; vx: number; c: string; ph: number }[] = [];
  private drawLeaves(nowMs: number) {
    const look = this.env.look;
    const L = this.defs.layout;
    const falling = look.foliage.length > 0 && look.leafAmount < 0.99 && look.foliage === look.foliage && this.sim.calendar().month >= 9 && this.sim.calendar().month <= 11;
    if (falling && this.leaves.length < 14 && this.fxRng.chance(0.03 + this.env.wind * 0.08)) {
      const tx = this.fxRng.pick(L.yard.trees);
      this.leaves.push({ x: tx + this.fxRng.range(-12, 12), y: L.groundY - this.fxRng.range(30, 50), vx: this.env.wind * 0.5 + this.fxRng.range(-0.1, 0.2), c: this.fxRng.pick(look.foliage), ph: this.fxRng.range(0, 6) });
    }
    for (const lf of this.leaves) {
      lf.y += 0.18;
      lf.x += lf.vx + Math.sin(nowMs / 400 + lf.ph) * 0.25;
      rect(this.wg, lf.x, lf.y, 1, 1, lf.c);
    }
    this.leaves = this.leaves.filter((lf) => lf.y < L.groundY && lf.x < this.W + 2);
  }

  private drawDoors() {
    const L = this.defs.layout;
    const residents = Object.values(this.sim.state.residents);
    for (const apt of L.apartments) {
      const fy = L.floorY(apt.level);
      const open = residents.some((r) => !r.away && r.level === apt.level && Math.abs(r.x - apt.doorX) < 7 && Math.abs(r.y - fy) < 4);
      drawApartmentDoor(this.wg, apt, fy, open);
    }
    const fy0 = L.floorY(0);
    const ex = L.buildingX1 - 2;
    const open = residents.some((r) => !r.away && Math.abs(r.x - ex) < 8 && Math.abs(r.y - fy0) < 4);
    drawEntrance(this.wg, this.defs, open);
  }

  private drawBus(t: number) {
    const ph = busPhase(t);
    if (ph === null) return;
    const L = this.defs.layout;
    const k = ph <= 0.5 ? ph * 2 : 1 - (ph - 0.5) * 2; // 0 — за краем, 1 — у остановки
    const ease = 1 - Math.pow(1 - k, 2);
    const x = Math.round(this.W + 4 + (L.yard.busStop - 22 - this.W - 4) * ease);
    const y = L.groundY;
    const g = this.wg;
    rect(g, x, y - 22, 48, 19, '#e0b020');
    rect(g, x, y - 22, 48, 2, '#f0c84a');
    rect(g, x + 1, y - 8, 46, 2, '#b88a18');
    for (let i = 0; i < 5; i++) rect(g, x + 4 + i * 8, y - 18, 6, 6, '#5a7890');
    rect(g, x + 4, y - 18, 2, 6, '#a8c8dc');
    rect(g, x + 43, y - 17, 3, 9, '#3a4a5a'); // дверь
    rect(g, x + 1, y - 13, 1, 2, '#ffe6a0');
    digits(g, '7', x + 20, y - 27, '#333');
    rect(g, x + 18, y - 28, 9, 7, '#f4f1ea');
    digits(g, '7', x + 21, y - 27, '#333');
    rect(g, x + 7, y - 4, 6, 4, '#222');
    rect(g, x + 35, y - 4, 6, 4, '#222');
    rect(g, x + 9, y - 3, 2, 2, '#888');
    rect(g, x + 37, y - 3, 2, 2, '#888');
  }

  private drawElevator() {
    const L = this.defs.layout;
    const e = this.sim.state.elevator;
    const g = this.wg;
    const x0 = L.elevator.x0 + 1;
    const w = L.elevator.x1 - L.elevator.x0 - 2;
    const y = Math.round(e.y);
    rect(g, x0, y - 28, w, 28, '#8a7d6a');
    rect(g, x0 + 1, y - 27, w - 2, 26, '#b5a68c');
    rect(g, x0 + 1, y - 27, w - 2, 1, '#fff2c0');
    rect(g, x0, y - 30, w, 2, '#4a4a52');
    rect(g, Math.round(x0 + w / 2), y - 40, 1, 10, '#222');
  }

  private drawDynamicFurniture(nowMs: number) {
    const L = this.defs.layout;
    for (const r of Object.values(this.sim.state.residents)) {
      const a = r.action;
      if (!a || a.phase !== 'perform' || r.away) continue;
      const apt = L.apartmentAt(r.level, r.x);
      if (!apt) continue;
      const room = L.roomAt(apt, r.x);
      if (a.id === 'watch_tv' || a.id === 'work' || a.id === 'gaming') {
        const wants = a.id === 'watch_tv' ? ['tv_stand', 'tv_old'] : ['computer_desk'];
        for (const f of room.furniture) {
          if (!wants.includes(f.def.draw)) continue;
          const sr = screenRect(f.def.draw, f.w, f.h);
          if (!sr) continue;
          const x = f.flip ? f.x + f.w - sr[0] - sr[2] : f.x + sr[0];
          const flick = Math.floor(nowMs / 400) % 3;
          rect(this.wg, x, f.y - f.h + sr[1], sr[2], sr[3], ['#9fd4f5', '#b8e2ff', '#8ec6ee'][flick]);
          rect(this.wg, x + 1, f.y - f.h + sr[1] + 1, Math.max(1, sr[2] - 3), 1, '#e8f6ff');
        }
      }
      if (a.id === 'cook') {
        for (const f of room.furniture) {
          if (f.def.draw !== 'stove') continue;
          const k = Math.floor(nowMs / 250) % 2;
          rect(this.wg, f.x + 2, f.y - f.h - 1, 3, 1, k ? '#ff9a3c' : '#ffcf5a');
          // пар
          const sx = f.x + 4 + (Math.floor(nowMs / 300) % 3);
          this.wg.globalAlpha = 0.6;
          rect(this.wg, sx, f.y - f.h - 5 - (Math.floor(nowMs / 200) % 4), 1, 2, '#ffffff');
          this.wg.globalAlpha = 1;
        }
      }
    }
  }

  private sheet(r: ResidentState): HTMLCanvasElement | HTMLImageElement {
    const def = this.defs.residentById.get(r.id)!;
    const coat = this.env.coats && r.level === 0 && !r.away && (r.x > this.defs.layout.buildingX1 - 6 || r.path.length > 0 || r.action?.data.out === true);
    const key = `resident:${r.id}${coat && def.appearance.outfit.coat ? ':coat' : ''}`;
    if (def.sprite) {
      // путь из JSON жильца: public/sprites/<sprite>
      const k = `resident:${r.id}`;
      if (this.sprites.hasOverride(k)) return this.sprites.get(k, () => makeCanvas(1, 1)) as HTMLImageElement;
    }
    return this.sprites.get(key, () => generateCharacterSheet(def.appearance, { coat: key.endsWith(':coat') })) as HTMLCanvasElement;
  }

  private drawActors(alpha: number, prev: Map<string, { x: number; y: number }>, opts: RenderOptions, nowMs: number) {
    const g = this.wg;
    const L = this.defs.layout;
    const list = Object.values(this.sim.state.residents).filter((r) => !r.away);
    list.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
    this.actorBoxes = [];
    for (const r of list) {
      const p = prev.get(r.id);
      let x = r.x;
      let y = r.y;
      if (p && Math.abs(p.x - r.x) + Math.abs(p.y - r.y) < 40) {
        x = p.x + (r.x - p.x) * alpha;
        y = p.y + (r.y - p.y) * alpha;
      }
      const ix = Math.round(x);
      const iy = Math.round(y);
      const moving = r.path.length > 0 && r.path[0].k === 'walk' && (p ? Math.abs(p.x - r.x) + Math.abs(p.y - r.y) > 0.01 : true);
      let frame: number = FRAME.stand;
      let top = iy - CELL_H;
      if (moving) frame = FRAME.walk0 + (Math.floor(r.walkDist / 3) % 4);
      else if (r.pose === 'lie') {
        frame = FRAME.lie;
        top = iy - CELL_H + 1;
      } else if (r.pose === 'sit') {
        frame = r.front ? FRAME.frontSit : FRAME.sit;
        top = iy - 21;
      } else if (r.action?.data.talking === true) {
        frame = Math.floor(nowMs / 600 + r.x) % 3 === 0 ? FRAME.frontTalk : FRAME.frontStand;
      } else if (r.action?.phase === 'perform' && ['cook', 'wash', 'plants', 'crafts'].includes(r.action.id)) {
        frame = Math.floor(nowMs / 500) % 2 ? FRAME.work : FRAME.stand;
      } else if (r.front) frame = FRAME.frontStand;
      const sheet = this.sheet(r);
      const flip = r.facing < 0 && !(r.front && frame !== FRAME.lie);
      g.save();
      if (flip) {
        g.translate(ix + CELL_W / 2, top);
        g.scale(-1, 1);
        g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
      } else g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, ix - CELL_W / 2, top, CELL_W, CELL_H);
      g.restore();
      // одеяло / вода в ванне
      if (r.pose === 'lie' && r.action?.phase === 'perform') {
        const apt = L.apartmentAt(r.level, r.x);
        const def = this.defs.residentById.get(r.id)!;
        const H = def.appearance.height === 'short' ? 18 : def.appearance.height === 'tall' ? 22 : 20;
        const color = r.action.id === 'wash' ? '#9fd3ef' : apt?.def?.palette.textile ?? '#9a948a';
        const bx = flip ? ix - Math.floor(H / 2) + 6 : ix - Math.floor(H / 2);
        rect(g, bx, iy - 3, H - 6, 4, color);
        rect(g, bx, iy - 3, H - 6, 1, mix(color, '#ffffff', 0.25));
      }
      // зонт
      if (this.env.rain > 0.1 && r.level === 0 && (r.x < L.buildingX0 || r.x > L.buildingX1)) {
        const u = this.sprites.get('icon:umbrella-big', () => makeUmbrella());
        g.drawImage(u, ix - 7 + (r.facing > 0 ? 1 : -1), iy - 30);
      }
      const hb = r.pose === 'lie' ? { x: ix - 10, y: iy - 6, w: 20, h: 7 } : { x: ix - 5, y: iy - 22, w: 10, h: 22 };
      this.actorBoxes.push({ id: r.id, ...hb });
      void opts;
    }
  }

  private drawBubbles(nowMs: number) {
    for (const r of Object.values(this.sim.state.residents)) {
      if (r.away || !r.bubble) continue;
      const icon = this.sprites.get(`icon:${r.bubble.icon}`, () => generateIcon(r.bubble!.icon));
      const bob = Math.floor(nowMs / 500 + r.x) % 2;
      const yTop = r.pose === 'lie' ? r.y - 16 : r.pose === 'sit' ? r.y - 31 : r.y - 34;
      this.wg.drawImage(icon, Math.round(r.x) - 4, Math.round(yTop) - bob);
    }
  }

  /** Приближенная квартира — остальное чуть притушено */
  private drawFocus(opts: RenderOptions) {
    const apt = opts.focusApartment ? this.defs.layout.aptById.get(opts.focusApartment) : null;
    if (!apt) return;
    const L = this.defs.layout;
    const y0 = L.levelTop(apt.level);
    const y1 = L.floorY(apt.level) + SLAB;
    const g = this.wg;
    g.fillStyle = 'rgba(8,8,20,0.6)';
    g.fillRect(0, 0, this.W, y0);
    g.fillRect(0, y1, this.W, this.H - y1);
    g.fillRect(0, y0, apt.x0, y1 - y0);
    g.fillRect(apt.x1, y0, this.W - apt.x1, y1 - y0);
  }

  private drawMarkers(opts: RenderOptions, nowMs: number) {
    const L = this.defs.layout;
    const g = this.wg;
    const outline = (apt: ApartmentModel, color: string) => {
      const lt = L.levelTop(apt.level);
      const fy = L.floorY(apt.level);
      rect(g, apt.x0, lt, apt.x1 - apt.x0, 1, color);
      rect(g, apt.x0, fy + SLAB - 1, apt.x1 - apt.x0, 1, color);
      rect(g, apt.x0, lt, 1, fy - lt + SLAB, color);
      rect(g, apt.x1 - 1, lt, 1, fy - lt + SLAB, color);
    };
    if (opts.hoverApartment && opts.hoverApartment !== opts.focusApartment) {
      const apt = L.aptById.get(opts.hoverApartment);
      if (apt) outline(apt, 'rgba(255,240,180,0.7)');
    }
    const sel = opts.selectedResident ? this.sim.state.residents[opts.selectedResident] : null;
    if (sel && !sel.away) {
      const head = sel.pose === 'lie' ? sel.y - 8 : sel.pose === 'sit' ? sel.y - 24 : sel.y - 26;
      const icon = sel.pose === 'lie' ? sel.y - 16 : sel.pose === 'sit' ? sel.y - 31 : sel.y - 34;
      const bob = Math.floor(nowMs / 400) % 2;
      const x = Math.round(sel.x);
      const y = Math.round(sel.bubble ? icon : head) - 5 - bob;
      rect(g, x - 2, y, 5, 1, '#ffe066');
      rect(g, x - 1, y + 1, 3, 1, '#ffe066');
      rect(g, x, y + 2, 1, 1, '#ffe066');
    }
  }

  private roomLit(apt: ApartmentModel, roomIndex: number, day: number): boolean {
    // в пасмурную погоду свет включают раньше
    if (day * (1 - this.env.overcast * 0.4) > 0.6 || apt.vacant) return false;
    const room = apt.rooms[roomIndex];
    for (const r of Object.values(this.sim.state.residents)) {
      if (r.away || r.level !== apt.level || r.x < room.x0 || r.x >= room.x1) continue;
      if (r.action?.id === 'sleep' && r.action.phase === 'perform') continue;
      return true;
    }
    return false;
  }

  private drawLighting(day: number) {
    const { lg, defs } = this;
    const L = defs.layout;
    const dark = (1 - day) * 0.72;
    lg.clearRect(0, 0, this.W, this.H);
    lg.fillStyle = `rgba(10,14,40,${dark.toFixed(3)})`;
    lg.fillRect(0, 0, this.W, this.H);
    const overcastDim = this.env.overcast * 0.12;
    const region = (x: number, y: number, w: number, h: number, a: number) => {
      lg.clearRect(x, y, w, h);
      lg.fillStyle = `rgba(10,14,40,${a.toFixed(3)})`;
      lg.fillRect(x, y, w, h);
    };
    const lit: [number, number, number, number][] = [];
    for (const apt of L.apartments) {
      const lt = L.levelTop(apt.level);
      const fy = L.floorY(apt.level);
      for (const room of apt.rooms) {
        const on = this.roomLit(apt, room.index, day);
        const a = on ? 0.04 : apt.vacant ? 0.18 + overcastDim + (1 - day) * 0.7 : 0.1 + overcastDim * 1.5 + (1 - day) * 0.74;
        region(room.x0, lt, room.x1 - room.x0, fy - lt + 2, Math.min(0.88, a));
        if (on) lit.push([room.x0, lt, room.x1 - room.x0, fy - lt]);
      }
    }
    // подъезд: лампы горят всю ночь (тускло)
    for (let level = 0; level <= L.floors; level++) {
      const lt = L.levelTop(level);
      const fy = L.floorY(level);
      region(L.coreX, lt, CORE_W, fy - lt + 2, 0.08 + overcastDim + (1 - day) * 0.32);
      if (level === 0) {
        region(L.buildingX0 + 4, lt, L.coreX - L.buildingX0 - 4, fy - lt + 2, 0.15 + (1 - day) * 0.6);
        region(L.coreX + CORE_W, lt, L.buildingX1 - L.coreX - CORE_W - 4, fy - lt + 2, 0.08 + (1 - day) * 0.34);
      }
    }
    // фонари
    if (day < 0.5) {
      const k = 1 - day * 2;
      lg.globalCompositeOperation = 'destination-out';
      for (const [x, y, r] of [
        [L.yard.lamp + 1, L.groundY - 30, 30],
        [20, L.groundY - 28, 22],
        [L.buildingX1 + 4, L.groundY - 22, 16],
      ] as const) {
        for (let i = 3; i >= 1; i--) {
          lg.globalAlpha = 0.28 * k;
          disc(lg, x, y, Math.round((r * i) / 3), '#000');
        }
      }
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = 'source-over';
    }
    this.wg.drawImage(this.light, 0, 0);
    // тёплый свет в окнах
    if (lit.length) {
      const k = clamp01((0.6 - day * (1 - this.env.overcast * 0.4)) * 2);
      this.wg.globalAlpha = 0.09 * k;
      for (const [x, y, w, h] of lit) rect(this.wg, x, y, w, h, '#ffc070');
      this.wg.globalAlpha = 1;
      for (const [x, y, w] of lit) {
        const lx = Math.round(x + w / 2);
        rect(this.wg, lx - 2, y + 7, 5, 1, '#fff2c0');
      }
    }
  }

  private blit() {
    const { g, camera } = this;
    g.imageSmoothingEnabled = false;
    const cal = this.sim.calendar();
    const day = daylight(cal);
    g.fillStyle = mix('#0b0f24', '#5d4a3a', 0.15 + day * 0.1);
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const { ox, oy } = camera.offset();
    const z = camera.zoom;
    // видимая часть мира
    const sx0 = Math.max(0, Math.floor(-ox / z));
    const sy0 = Math.max(0, Math.floor(-oy / z));
    const sx1 = Math.min(this.W, Math.ceil((this.canvas.width - ox) / z));
    const sy1 = Math.min(this.H, Math.ceil((this.canvas.height - oy) / z));
    if (sx1 <= sx0 || sy1 <= sy0) return;
    g.drawImage(this.world, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * z, oy + sy0 * z, (sx1 - sx0) * z, (sy1 - sy0) * z);
  }

  private drawLabels(opts: RenderOptions) {
    const { g, camera } = this;
    const ids = new Set<string>();
    if (opts.hoverResident) ids.add(opts.hoverResident);
    if (opts.selectedResident) ids.add(opts.selectedResident);
    if (camera.zoom >= 5) for (const r of Object.values(this.sim.state.residents)) if (!r.away) ids.add(r.id);
    const dpr = window.devicePixelRatio || 1;
    g.font = `${Math.round(11 * dpr)}px ui-monospace, Menlo, Consolas, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const id of ids) {
      const r = this.sim.state.residents[id];
      if (!r || r.away) continue;
      const def = this.defs.residentById.get(id)!;
      const yTop = r.pose === 'lie' ? r.y - 10 : r.pose === 'sit' ? r.y - 24 : r.y - 26;
      const p = camera.worldToScreen(r.x, yTop - (r.bubble ? 10 : 2));
      const text = def.name.short ?? def.name.first;
      const w = g.measureText(text).width + 8 * dpr;
      // не налезать на уже поставленные подписи
      const h = 15 * dpr;
      for (let guard = 0; guard < 6; guard++) {
        const hit = placed.find((b) => p.x - w / 2 < b.x1 && p.x + w / 2 > b.x0 && p.y - h < b.y1 && p.y > b.y0);
        if (!hit) break;
        p.y = hit.y0 - 1;
      }
      placed.push({ x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y });
      g.fillStyle = id === opts.selectedResident ? 'rgba(60,45,10,0.85)' : 'rgba(15,15,30,0.75)';
      g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 15 * dpr), Math.round(w), Math.round(14 * dpr));
      g.fillStyle = id === opts.selectedResident ? '#ffe066' : '#f4f1ea';
      g.fillText(text, Math.round(p.x), Math.round(p.y - 2 * dpr));
    }
  }

  // ───────────────────────────── наведение ─────────────────────────────

  pickResident(sx: number, sy: number): string | null {
    const w = this.camera.screenToWorld(sx, sy);
    for (let i = this.actorBoxes.length - 1; i >= 0; i--) {
      const b = this.actorBoxes[i];
      if (w.x >= b.x - 1 && w.x <= b.x + b.w + 1 && w.y >= b.y - 1 && w.y <= b.y + b.h + 1) return b.id;
    }
    return null;
  }

  pickApartment(sx: number, sy: number): ApartmentModel | null {
    const w = this.camera.screenToWorld(sx, sy);
    const L = this.defs.layout;
    const level = L.levelAtY(w.y);
    if (w.y < L.levelTop(level) || w.y > L.floorY(level) + SLAB) return null;
    return L.apartmentAt(level, w.x) ?? null;
  }
}

function makeUmbrella(): HTMLCanvasElement {
  const c = makeCanvas(15, 12);
  const g = ctx2d(c);
  rect(g, 4, 0, 7, 1, '#2f5f9e');
  rect(g, 2, 1, 11, 1, '#3a6fb0');
  rect(g, 1, 2, 13, 2, '#3a6fb0');
  rect(g, 1, 3, 13, 1, '#2f5f9e');
  rect(g, 7, 4, 1, 8, '#333');
  return c;
}
