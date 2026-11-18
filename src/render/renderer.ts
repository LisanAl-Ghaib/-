import { CORE_W, SLAB } from '../config';
import { clamp01, mix, shade } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import { daylight } from '../sim/env/sun';
import type { ResidentState } from '../sim/state';
import type { Simulation } from '../sim/simulation';
import type { ApartmentModel } from '../world/layout';
import { drawApartmentDoor, drawEntrance, renderBuilding, residentsBoardRect, windowRect, type BuildingLayers } from './building';
import { Camera } from './camera';
import { DEFAULT_LOOK, drawGround, drawTrees, drawYardProps, makeTrees, type OutdoorLook, type TreeShape } from './outdoor';
import { busPhase } from '../world/transport';
import { digits, disc, rect } from './pixel';
import { drawSkyGradient, drawStars, drawSunMoon, makeCity, makeCloud, makeStars, skyColors, type Star } from './sky';
import { CELL_H, CELL_W, FRAME, generateCharacterSheet } from './sprites/character';
import { screenRect, screenRects } from './sprites/furniture';
import { generateIcon } from './sprites/icons';
import { hashString } from '../core/rng';
import { LifeDetails } from './lifeDetails';
import { generatePetSheet, PET_FRAME, PET_H, PET_W } from './sprites/pet';
import { outfitOfDay, visitorAppearance, withOutfitVariant } from './visitorLook';
import { animatePose, type AnimEnv, type Pose } from './animation';
import { drawProp, eyesOf } from './props';
import type { FurnitureInstance } from '../world/layout';
import { drawScreen, type ScreenKind } from './screens';

/** кадры анфас и со спины — не отражаются по направлению взгляда */
const PROP_FRONT = new Set<number>([FRAME.frontStand, FRAME.frontSit, FRAME.frontTalk, FRAME.frontWave, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.standHandUp, FRAME.backStand, FRAME.backSit, FRAME.backWork, FRAME.backSitWork, FRAME.frontSitCross]);
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
  hoverBoard?: boolean;
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
  private skyTop = '#0b0f24';
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
    this.life = new LifeDetails(defs, sim, this.sprites);
  }

  private life: LifeDetails;

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
    // дом по ширине целиком (можно чуть обрезать по краям), но не меньше ×1
    const bw = L.buildingX1 - L.buildingX0;
    const fitW = Math.max(1, Math.floor(cam.viewW / (bw * 0.97)));
    const fitH = Math.max(1, Math.floor(cam.visH / (L.worldH - L.roofY + 30)));
    // если по высоте место есть — можно на ступень крупнее, обрезав края дома
    const z = Math.max(fitW, Math.min(fitH, fitW + 1));
    const visW = cam.viewW / z;
    // дом целиком слева, остальное — двору; если дом не влезает — по центру дома
    const x = visW >= this.W ? this.W / 2 : visW >= bw + 32 ? L.buildingX0 - 16 + visW / 2 : (L.buildingX0 + L.buildingX1) / 2;
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
    this.skyTop = sky.top;
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
    this.life.draw(wg);
    this.life.drawWorkers(wg, nowMs);
    this.drawDoors();
    this.drawElevator();
    this.drawActors(alpha, prev, opts, nowMs);
    this.drawVisitors(nowMs);
    this.drawPets(nowMs);
    wg.drawImage(this.layers.front, 0, 0);
    this.drawBus(tGame);

    // освещение
    this.drawLighting(day);
    this.drawGlow(nowMs, day);
    // осадки перед всем, кроме дома
    this.drawPrecip(nowMs, false);
    if (env.fog > 0) this.drawFog(day);
    this.drawFocus(opts);
    this.drawBubbles(nowMs);
    this.drawMarkers(opts, nowMs);

    // на экран
    this.blit();
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
    const residents: { x: number; y: number; level: number; away: boolean }[] = [...Object.values(this.sim.state.residents), ...this.sim.state.visitors, ...this.sim.state.workers];
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

  /** Кошки (и будущие собаки) */
  private drawPets(nowMs: number) {
    const L = this.defs.layout;
    for (const p of Object.values(this.sim.state.pets)) {
      const def = this.defs.residentById.get(p.owner);
      const pet = def?.pets[p.idx];
      if (!pet) continue;
      const sheet = this.sprites.get(`pet:${p.id}`, () => generatePetSheet(pet));
      let f: number = PET_FRAME.sit;
      const anim = Math.floor(nowMs / 600 + p.idx * 3);
      switch (p.mode) {
        case 'walk':
        case 'play':
          f = p.mode === 'walk' || Math.floor(p.walkDist / 3) % 2 ? PET_FRAME.walk0 + (Math.floor(p.walkDist / 3) % 2) : PET_FRAME.stretch;
          break;
        case 'sleep':
          f = PET_FRAME.curl;
          break;
        case 'lap':
          f = PET_FRAME.loaf;
          break;
        case 'groom':
          f = anim % 2 ? PET_FRAME.groom : PET_FRAME.sit;
          break;
        case 'eat':
          f = PET_FRAME.stretch;
          break;
        default:
          f = anim % 9 === 0 ? PET_FRAME.groom : PET_FRAME.sit;
      }
      const x = Math.round(p.x);
      const feet = L.floorY(p.level) - Math.round(p.h) + (p.mode === 'sleep' && f === PET_FRAME.curl && anim % 4 === 0 ? 0 : 0);
      const g = this.wg;
      // сидящая кошка оглядывается по сторонам
      let facing = p.facing;
      if ((p.mode === 'window' || p.mode === 'watch' || p.mode === 'tray') && Math.floor((nowMs + p.idx * 2900) / 3100) % 3 === 0) facing = -facing as 1 | -1;
      g.save();
      if (facing < 0) {
        g.translate(x + PET_W / 2, feet - PET_H);
        g.scale(-1, 1);
        g.drawImage(sheet, f * PET_W, 0, PET_W, PET_H, 0, 0, PET_W, PET_H);
      } else g.drawImage(sheet, f * PET_W, 0, PET_W, PET_H, x - PET_W / 2, feet - PET_H, PET_W, PET_H);
      g.restore();
      if (p.mode === 'sleep' && anim % 6 === 0) rect(g, x + 3, feet - 14, 2, 1, '#cfe2ff'); // посапывает
    }
  }

  /** Гости «из города» */
  private drawVisitors(nowMs: number) {
    const g = this.wg;
    for (const v of this.sim.state.visitors) {
      if (v.away) continue;
      const owner = this.defs.residentById.get(v.owner);
      const c = owner?.contacts[v.contact];
      if (!owner || !c) continue;
      const key = `visitor:${v.owner}:${v.contact}`;
      const app = visitorAppearance(owner, c, key);
      const coat = this.env.coats && (v.phase === 'arriving' || v.phase === 'leaving');
      const sheet = this.sprites.get(`${key}${coat ? ':coat' : ''}`, () => generateCharacterSheet(app, { coat }));
      const ix = Math.round(v.x);
      const iy = Math.round(v.y);
      let frame: number = FRAME.frontStand;
      let top = iy - CELL_H;
      let flip = v.facing < 0;
      if (v.path.length) frame = FRAME.walk0 + (Math.floor(v.walkDist / 3) % 4);
      else if (v.phase === 'visiting' && v.seat) {
        const talk = Math.floor(nowMs / 900 + ix) % 4 === 0;
        const seg = Math.floor(this.sim.time / 300 + ix) % 4; // пересаживается поудобнее
        const front = [FRAME.frontSit, FRAME.frontSitCross, FRAME.frontSitSlouch, FRAME.frontSitHands];
        const side = [FRAME.sit, FRAME.sitLean, FRAME.sit, FRAME.sitArm];
        frame = v.seat.front ? (talk ? FRAME.frontSitHandUp : front[seg]) : talk ? FRAME.sitArmUp : side[seg];
        top -= Math.floor((nowMs + ix * 37) / 1900) % 2;
        top = iy - 21;
        if (v.seat.front) flip = false;
      } else if (v.phase === 'waiting') frame = Math.floor(nowMs / 2000) % 3 === 0 ? FRAME.standHandUp : FRAME.stand;
      g.save();
      if (flip) {
        g.translate(ix + CELL_W / 2, top);
        g.scale(-1, 1);
        g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
      } else g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, ix - CELL_W / 2, top, CELL_W, CELL_H);
      g.restore();
      if (v.carrying && v.path.length) this.life.drawCarry(g, 'bags', ix, iy, v.facing);
    }
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
    this.screensOn = [];
    this.drawAmbient(nowMs);
    // «вечно включённые» экраны: работают, пока хозяин дома и не спит
    for (const apt of L.apartments) {
      for (const room of apt.rooms) {
        for (const f of room.furniture) {
          if (!f.alwaysOn) continue;
          const awakeHome = this.defs.residents.some((d) => {
            const r = this.sim.state.residents[d.id];
            return d.apartment === apt.id && r && !r.away && r.level === apt.level && !(r.action?.id === 'sleep' && r.action.phase === 'perform');
          });
          if (!awakeHome) continue;
          const sr = screenRect(f.def.draw, f.w, f.h);
          if (!sr) continue;
          const x = f.flip ? f.x + f.w - sr[0] - sr[2] : f.x + sr[0];
          drawScreen(this.wg, 'tv', x, f.y - f.h + sr[1], sr[2], sr[3], this.sim.time, nowMs, f.uid, f.channel);
          this.screensOn.push([x + sr[2] / 2, f.y - f.h + sr[1], apt.id, room.index]);
        }
      }
    }
    for (const r of Object.values(this.sim.state.residents)) {
      const a = r.action;
      if (!a || a.phase !== 'perform' || r.away) continue;
      const apt = L.apartmentAt(r.level, r.x);
      if (!apt) continue;
      const room = L.roomAt(apt, r.x);
      if (a.id === 'watch_tv' || a.id === 'work' || a.id === 'side_work' || a.id === 'gaming' || a.id === 'computer') {
        const wants = a.id === 'watch_tv' ? ['tv_stand', 'tv_old', 'small_tv'] : ['computer_desk', 'concierge_desk', 'gaming_desk', 'laptop_desk'];
        // компьютер — тот, за которым сидит (у каждого свой стол)
        const own = a.target.slot ? this.sim.slotIndex.get(a.target.slot)?.furnitureUid : undefined;
        for (const f of room.furniture) {
          if (!wants.includes(f.def.draw)) continue;
          if (a.id !== 'watch_tv' && own && f.uid !== own) continue;
          screenRects(f.def.draw, f.w, f.h).forEach((sr, si) => {
            const x = f.flip ? f.x + f.w - sr[0] - sr[2] : f.x + sr[0];
            let kind: ScreenKind = a.id === 'watch_tv' ? 'tv' : f.def.draw === 'concierge_desk' ? 'cctv' : a.id === 'gaming' ? 'game' : a.id === 'computer' ? 'browser' : (Math.floor(this.sim.time / 1500) + f.x) % 3 === 0 ? 'browser' : 'code';
            // второй монитор: во время игры — чат/браузер, за работой — документ
            if (si === 1) kind = a.id === 'gaming' ? 'browser' : kind === 'code' ? 'browser' : 'code';
            drawScreen(this.wg, kind, x, f.y - f.h + sr[1], sr[2], sr[3], this.sim.time, nowMs, `${f.uid}:${si}`);
            if (kind === 'tv' || (a.id === 'gaming' && si === 0)) this.screensOn.push([x + sr[2] / 2, f.y - f.h + sr[1], apt.id, room.index]);
          });
        }
      }
      if (a.id === 'tea' || a.id === 'snack') {
        // чайник на плите посвистывает паром
        const st = room.furniture.find((f) => f.def.draw === 'stove' || f.def.draw === 'hotplate');
        if (st && a.id === 'tea') {
          const kx = st.x + st.w - 7;
          const ky = (st.def.draw === 'hotplate' ? st.y - 13 : st.y - st.h) - 4;
          rect(this.wg, kx, ky, 5, 4, '#d8d4cc');
          rect(this.wg, kx + 1, ky - 1, 3, 1, '#a8a49c');
          rect(this.wg, kx + 5, ky + 1, 1, 1, '#d8d4cc');
          const t = Math.floor(nowMs / 180) % 6;
          this.wg.globalAlpha = 0.65;
          rect(this.wg, kx + 6 + (t >> 1), ky - t, 1, 1, '#ffffff');
          rect(this.wg, kx + 7 + ((t + 3) % 6 >> 1), ky - ((t + 3) % 6), 1, 1, '#ffffff');
          this.wg.globalAlpha = 1;
        }
      }
      if (a.id === 'cook') {
        for (const f of room.furniture) {
          if (!f.slots.some((s) => s.use.includes('cook')) || f.def.draw === 'kitchen_counter') continue;
          const k = Math.floor(nowMs / 250) % 2;
          const top = f.def.draw === 'hotplate' ? f.y - 13 : f.y - f.h;
          rect(this.wg, f.x + 2, top - 1, 3, 1, k ? '#ff9a3c' : '#ffcf5a');
          // пар
          const sx = f.x + 4 + (Math.floor(nowMs / 300) % 3);
          this.wg.globalAlpha = 0.6;
          rect(this.wg, sx, f.y - f.h - 5 - (Math.floor(nowMs / 200) % 4), 1, 2, '#ffffff');
          this.wg.globalAlpha = 1;
        }
      }
    }
  }

  private screensOn: [number, number, string, number][] = [];

  /** Закрытая дверь туалета (занято) */
  private drawWcDoor(level: number, x: number) {
    const L = this.defs.layout;
    const apt = L.apartmentAt(level, x);
    if (!apt) return;
    const room = L.roomAt(apt, x);
    const g = this.wg;
    const fy = L.floorY(level);
    const pal = apt.def?.palette;
    const wood = pal ? mix(pal.wood, '#d8cbb4', 0.55) : '#c8b8a0';
    const x0 = room.x0 + 2;
    const w = room.x1 - room.x0 - 3;
    rect(g, x0 - 1, fy - 28, w + 2, 28, shade(wood, -0.35)); // наличник
    rect(g, x0, fy - 27, w, 27, wood);
    rect(g, x0 + 2, fy - 24, w - 4, 9, shade(wood, -0.08)); // филёнки
    rect(g, x0 + 2, fy - 12, w - 4, 9, shade(wood, -0.08));
    rect(g, x0 + w - 3, fy - 14, 2, 1, '#c8b070'); // ручка
    rect(g, x0 + w - 3, fy - 16, 1, 1, '#8a7a50'); // шпингалет закрыт
    rect(g, x0 + 1, fy - 1, w - 2, 1, '#ffe9a0'); // свет из-под двери
    // окошко под потолком — горит
    rect(g, x0 + 2, fy - 34, w - 4, 4, '#ffe9a0');
    rect(g, x0 + 1, fy - 35, w - 2, 1, shade(wood, -0.35));
  }

  private awakeHome(apt: ApartmentModel): boolean {
    return this.defs.residents.some((d) => {
      const r = this.sim.state.residents[d.id];
      return d.apartment === apt.id && r && !r.away && r.level === apt.level && !(r.action?.id === 'sleep' && r.action.phase === 'perform');
    });
  }

  /** Вещи, которые живут сами: часы идут, радио играет, обогреватель щёлкает */
  private drawAmbient(nowMs: number) {
    const g = this.wg;
    const cal = this.sim.calendar();
    for (const apt of this.defs.layout.apartments) {
      if (apt.vacant || apt.def?.renovation) continue;
      const awake = this.awakeHome(apt);
      for (const room of apt.rooms) {
        for (const f of room.furniture) {
          const top = f.y - f.h;
          switch (f.def.draw) {
            case 'wall_clock': {
              // часы показывают настоящее (игровое) время
              const D = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
              const cx = f.x + Math.floor(f.w / 2);
              const cy = top + Math.floor(f.h / 2);
              rect(g, f.x + 1, top + 1, f.w - 2, f.h - 2, '#f3f1ea');
              const m = D[Math.round(cal.minute / 7.5) % 8];
              const hh = D[Math.round(((cal.hour % 12) + cal.minute / 60) / 1.5) % 8];
              rect(g, cx + m[0], cy + m[1], 1, 1, '#222');
              rect(g, cx + m[0] * 2, cy + m[1] * 2, 1, 1, '#222');
              rect(g, cx + hh[0], cy + hh[1], 1, 1, '#7a2a20');
              rect(g, cx, cy, 1, 1, '#222');
              // секундная стрелка — тикает
              const sd = D[Math.floor(nowMs / 1000) % 8];
              if (Math.floor(nowMs / 1000) % 2) rect(g, cx + sd[0] * 2, cy + sd[1] * 2, 1, 1, '#c8402e');
              break;
            }
            case 'radio': {
              if (!awake || cal.hour < 6 || cal.hour >= 23) break;
              const ph = (nowMs / 1000 + f.x) % 7;
              rect(g, f.x + 6, top + 2, 3, 1, Math.floor(nowMs / 600) % 2 ? '#ffe9a0' : '#e8d8a0');
              if (ph < 3) {
                const k = Math.floor(ph * 3);
                const nx = f.x + 3 + (k % 3);
                const ny = top - 3 - k;
                g.globalAlpha = 1 - ph / 3;
                rect(g, nx, ny, 1, 3, '#4a3a30');
                rect(g, nx - 1, ny + 2, 1, 1, '#4a3a30');
                rect(g, nx + 1, ny, 1, 1, '#4a3a30');
                g.globalAlpha = 1;
              }
              break;
            }
            case 'heater': {
              if (!awake || !this.env.coats) break;
              const on = Math.floor((nowMs + f.x * 97) / 7000) % 3 !== 0;
              rect(g, f.x + f.w - 2, top, 1, 2, on ? '#ff5a3a' : '#5a2a22');
              if (on) {
                // марево над обогревателем
                g.globalAlpha = 0.25;
                for (let i = 0; i < 3; i++) {
                  const yy = top - 2 - ((Math.floor(nowMs / 220) + i * 3) % 7);
                  rect(g, f.x + 2 + i * 3 + (Math.floor(nowMs / 300 + i) % 2), yy, 1, 1, '#fff4e0');
                }
                g.globalAlpha = 1;
              }
              break;
            }
            case 'plant':
            case 'plant_big':
            case 'eguitar_amp': {
              // гитара стоит на стойке, пока на ней не играют
              const playing = Object.values(this.sim.state.residents).some((r) => r.action?.id === 'music' && r.action.phase === 'perform' && r.action.target.slot?.startsWith(f.uid));
              if (!playing) drawGuitarOnStand(g, f.x + 9, f.y);
              if (awake && Math.floor((nowMs + f.x * 31) / 900) % 2) rect(g, f.x + 6, top + f.h - 8, 1, 1, '#ff5a3a'); // лампочка комбика
              break;
            }
            case 'couple_photo': {
              // на фото — те, кто тут живёт
              const people = this.defs.residents.filter((d) => d.apartment === apt.id).slice(0, 2);
              people.forEach((d, i) => {
                const px0 = f.x + 3 + i * 4;
                const a = d.appearance;
                rect(g, px0, top + 2, 3, 1, a.hair.color);
                rect(g, px0, top + 3, 3, 2, a.skin);
                if (a.hair.style !== 'short' && a.hair.style !== 'buzz') rect(g, px0 + (i ? 2 : 0), top + 3, 1, 3, a.hair.color);
                rect(g, px0, top + 5, 3, 3, a.outfit.top);
              });
              break;
            }
            case 'chessboard': {
              // во время партии фигуры переставляют
              const busy = Object.values(this.sim.state.residents).some((r) => (r.action?.id === 'chess' || (r.action?.id === 'together' && r.action.data.kind === 'chess')) && r.action.phase === 'perform' && r.level === apt.level && Math.abs(r.x - f.x) < 24);
              if (busy) {
                const t = Math.floor(nowMs / 2600 + f.x);
                for (let i = 0; i < 4; i++) {
                  const k = (Math.imul(t + i * 7, 2654435761) >>> 0) % f.w;
                  rect(g, f.x + k, f.y - 2 - (i % 2), 1, 1 + (i % 2), i % 2 ? '#f3f1ea' : '#1e1e22');
                }
              }
              break;
            }
            case 'gaming_desk': {
              // подсветка системника переливается, пока хозяин дома
              if (!awake) break;
              const cols = ['#ff4a8a', '#7a5aff', '#3ad0ff', '#4aff9a', '#ffd04a'];
              const ci = Math.floor(nowMs / 700) % cols.length;
              rect(g, f.x + f.w - 7, f.y - 9, 3, 1, cols[ci]);
              rect(g, f.x + f.w - 7, f.y - 4, 3, 1, cols[(ci + 2) % cols.length]);
              break;
            }
            case 'hanging_plant': {
              // листья чуть колышутся от сквозняка
              if (Math.floor((nowMs + f.x * 131) / 900) % 5 === 0) rect(g, f.x + 1 + (Math.floor(nowMs / 450) % 2), top + 1, 1, 1, shade('#4f8a3a', 0.15));
              break;
            }
          }
        }
      }
    }
  }

  /** Поверх освещения: мерцание телевизора в темноте, солнечные лучи с пылинками */
  private drawGlow(nowMs: number, day: number) {
    const g = this.wg;
    const L = this.defs.layout;
    if (day < 0.55) {
      const k = (0.55 - day) / 0.55;
      for (const [x, y, aptId, ri] of this.screensOn) {
        const apt = L.aptById.get(aptId);
        if (!apt) continue;
        const room = apt.rooms[ri];
        const flick = 0.6 + 0.4 * (((Math.floor(nowMs / 170) * 2654435761) >>> 0) % 100) / 100;
        const cols = ['#9ec4ff', '#c8d8ff', '#a8f0ff', '#ffd8b0'];
        const col = cols[Math.floor(nowMs / 2300 + x) % cols.length];
        const fy = L.floorY(apt.level);
        for (let i = 3; i >= 1; i--) {
          g.globalAlpha = 0.05 * k * flick;
          const r = i * 9;
          const x0 = Math.max(room.x0, Math.round(x - r));
          const x1 = Math.min(room.x1, Math.round(x + r));
          rect(g, x0, Math.round(y - r / 2), x1 - x0, fy - Math.round(y - r / 2), col);
        }
      }
      g.globalAlpha = 1;
    }
    // солнечные лучи из окна
    const env = this.env;
    if (day > 0.6 && env.overcast < 0.35 && env.rain < 0.05 && env.fog < 0.2) {
      const cal = this.sim.calendar();
      const h = cal.hourOfDay;
      const slant = h < 13 ? 1 : -1; // утром солнце с одной стороны, вечером — с другой
      const strength = Math.min(1, (day - 0.6) / 0.2) * (1 - env.overcast * 2);
      for (const apt of L.apartments) {
        if (apt.vacant) continue;
        const lt = L.levelTop(apt.level);
        const fy = L.floorY(apt.level);
        for (const room of apt.rooms) {
          const wr = windowRect(room, lt);
          if (!wr) continue;
          const [wx, wy, ww, wh] = wr;
          const y0 = wy + wh + 3;
          const len = fy - y0;
          g.globalAlpha = 0.17 * strength;
          for (let yy = 0; yy < len; yy++) {
            const off = Math.round(yy * 0.6 * slant);
            const xa = Math.max(room.x0, wx + off);
            const xb = Math.min(room.x1, wx + ww + off);
            if (xb > xa) rect(g, xa, y0 + yy, xb - xa, 1, '#fff0b8');
          }
          // пылинки в луче
          g.globalAlpha = 0.17 * strength;
          for (let i = 0; i < 4; i++) {
            const seed = (room.x0 * 31 + i * 977) % 1000;
            const t = (nowMs / 9000 + seed / 1000) % 1;
            const yy = Math.floor(t * len);
            const xx = wx + Math.round(yy * 0.6 * slant) + ((seed + Math.floor(nowMs / 1400)) % ww);
            if (xx > room.x0 && xx < room.x1) rect(g, xx, y0 + yy, 1, 1, '#fff8e0');
          }
          g.globalAlpha = 1;
        }
      }
    }
  }

  private furnByUid: Map<string, FurnitureInstance> | null = null;

  private furniture(uid: string): FurnitureInstance | undefined {
    if (!this.furnByUid) {
      this.furnByUid = new Map();
      for (const apt of this.defs.layout.apartments) for (const room of apt.rooms) for (const f of room.furniture) this.furnByUid.set(f.uid, f);
    }
    return this.furnByUid.get(uid);
  }

  /** Что вокруг жильца: телевизор, собеседник, стол (для ракурса позы) */
  private animEnv(r: ResidentState, all: ResidentState[]): AnimEnv {
    const env: AnimEnv = {};
    const a = r.action;
    const slot = a?.target.slot ? this.sim.slotIndex.get(a.target.slot) : undefined;
    const f = slot ? this.furniture(slot.furnitureUid) : undefined;
    if (r.interaction !== null || a?.data.talking === true) {
      let best: ResidentState | null = null;
      for (const o of all) if (o !== r && o.level === r.level && Math.abs(o.x - r.x) < 48 && (!best || Math.abs(o.x - r.x) < Math.abs(best.x - r.x))) best = o;
      if (best) env.faceToX = best.x;
    } else if (a?.id === 'watch_tv' && a.phase === 'perform' && slot) {
      const apt = this.defs.layout.aptById.get(slot.aptId);
      const room = apt?.rooms[slot.roomIndex];
      const tv = room?.furniture.find((x) => x.def.draw.startsWith('tv'));
      if (tv) env.faceToX = tv.x + tv.w / 2;
    }
    if (f && r.pose === 'sit' && /table/.test(f.def.draw) && (a?.id === 'eat' || a?.id === 'tea' || a?.id === 'idle' || a?.id === 'host' || a?.id === 'guest'))
      env.tableBack = hashString(slot!.key) % 2 === 0;
    if (f && /stove|sink|window/.test(f.def.draw)) env.wallWork = true;
    if (f && (f.def.draw === 'piano' || f.def.draw === 'digital_piano')) env.instrument = 'piano';
    if (f?.def.draw === 'eguitar_amp') env.instrument = 'guitar';
    if (f?.def.draw === 'pullup_bar') env.pullup = true;
    return env;
  }

  private sheet(r: ResidentState): HTMLCanvasElement | HTMLImageElement {
    const def = this.defs.residentById.get(r.id)!;
    const coat = this.env.coats && r.level === 0 && !r.away && (r.x > this.defs.layout.buildingX1 - 6 || r.path.length > 0 || r.action?.data.out === true);
    // иногда надевает другое (рубашку с галстуком вместо толстовки) — на весь день
    const vi = outfitOfDay(def, r.today.day);
    const app = vi < 0 ? def.appearance : withOutfitVariant(def.appearance, vi);
    const key = `resident:${r.id}${vi >= 0 ? `:v${vi}` : ''}${coat && def.appearance.outfit.coat ? ':coat' : ''}`;
    if (def.sprite) {
      // путь из JSON жильца: public/sprites/<sprite>
      const k = `resident:${r.id}`;
      if (this.sprites.hasOverride(k)) return this.sprites.get(k, () => makeCanvas(1, 1)) as HTMLImageElement;
    }
    return this.sprites.get(key, () => generateCharacterSheet(app, { coat: key.endsWith(':coat') })) as HTMLCanvasElement;
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
      const def = this.defs.residentById.get(r.id)!;
      if (r.action?.id === 'toilet' && r.action.phase === 'perform') {
        // в туалете: дверь закрыта, в окошке над ней свет
        this.drawWcDoor(r.level, r.x);
        this.actorBoxes.push({ id: r.id, x: ix - 5, y: iy - 26, w: 10, h: 26 });
        continue;
      }
      let frame: number = FRAME.stand;
      let top = iy - CELL_H;
      let pose: Pose | null = null;
      if (moving) frame = FRAME.walk0 + (Math.floor(r.walkDist / 3) % 4);
      else {
        pose = animatePose(r, def, this.sim.time, nowMs, this.animEnv(r, list));
        frame = pose.frame;
        if (r.pose === 'lie') top = iy - CELL_H + 1;
        else if (r.pose === 'sit') top = iy - 21;
        top -= pose.bob ?? 0;
      }
      let dx = pose?.dx ?? 0;
      // идут вдвоём — рядом, а не друг в друге
      if (moving && r.action?.id === 'together' && r.action.data.kind === 'walk' && !r.action.data.lead) dx -= 6 * r.facing;
      const sx = ix + dx;
      const sheet = this.sheet(r);
      const facing = pose?.facing ?? r.facing;
      let flip = frame === FRAME.lie ? r.facing < 0 : facing < 0 && !PROP_FRONT.has(frame);
      if (pose?.turn) flip = !flip;
      g.save();
      if (flip) {
        g.translate(sx + CELL_W / 2, top);
        g.scale(-1, 1);
        g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
      } else g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, sx - CELL_W / 2, top, CELL_W, CELL_H);
      g.restore();
      // моргнул
      if (pose?.blink && !def.sprite) {
        for (const [ex, ey] of eyesOf(def.appearance, frame)) {
          const x = flip ? sx + CELL_W / 2 - 1 - ex : sx - CELL_W / 2 + ex;
          rect(g, x, top + ey, 1, 1, def.appearance.skin);
        }
      }
      // реквизит в руках
      if (pose?.prop) drawProp(g, def.appearance, frame, pose.prop.kind, pose.prop.at, sx, top, flip && !PROP_FRONT.has(frame), nowMs, hashString(r.id));
      // одеяло / вода в ванне
      if (r.pose === 'lie' && r.action?.phase === 'perform') {
        const apt = L.apartmentAt(r.level, r.x);
        const H = def.appearance.height === 'short' ? 18 : def.appearance.height === 'tall' ? 22 : 20;
        const color = r.action.id === 'wash' ? '#9fd3ef' : apt?.def?.palette.textile ?? '#9a948a';
        const bx = flip ? ix - Math.floor(H / 2) + 6 : ix - Math.floor(H / 2);
        rect(g, bx, iy - 3, H - 6, 4, color);
        rect(g, bx, iy - 3, H - 6, 1, mix(color, '#ffffff', 0.25));
      }
      // в руках: пакеты из магазина, мусор
      if (r.carrying && r.pose === 'stand') this.life.drawCarry(g, r.carrying, ix, iy, r.facing);
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

  /**
   * Проявления самочувствия: зевает, вздыхает, напевает. Только косметика рендера,
   * изредка и ненадолго — по ним можно догадаться о состоянии, цифр не видно.
   */
  private moodIcon(r: ResidentState, nowMs: number): string | null {
    const a = r.action;
    if (!a || a.phase !== 'perform' || a.id === 'sleep' || a.id === 'nap' || r.interaction !== null) return null;
    const cycle = (nowMs / 1000 + (hashString(r.id) % 40)) % 40;
    if (cycle > 3) return null;
    const n = r.needs;
    if (n.energy < 22) return 'yawn';
    if (n.mood < 30) return 'gloom';
    if (n.food < 18) return 'hungry';
    if (n.mood > 82) return 'music';
    return null;
  }

  private drawBubbles(nowMs: number) {
    for (const r of Object.values(this.sim.state.residents)) {
      if (r.away) continue;
      const ta = r.action;
      if (ta?.id === 'together' && ta.phase === 'perform' && ta.data.lead && (ta.data.kind === 'intimacy' || ta.data.kind === 'gift') && this.sim.time - ta.performStart < 240) {
        // сердечко — и всё, дальше их дело
        const icon = this.sprites.get('icon:heart', () => generateIcon('heart'));
        const rise = Math.floor((this.sim.time - ta.performStart) / 40);
        this.wg.drawImage(icon, Math.round(r.x) + (ta.data.kind === 'gift' ? -3 : 2), Math.round(r.y) - 16 - rise);
        continue;
      }
      const name = r.bubble?.icon ?? this.moodIcon(r, nowMs);
      if (!name) continue;
      const icon = this.sprites.get(`icon:${name}`, () => generateIcon(name));
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
    if (opts.hoverBoard) {
      const b = residentsBoardRect(this.defs);
      rect(g, b.x - 2, b.y - 2, b.w + 4, 1, '#ffe066');
      rect(g, b.x - 2, b.y + b.h + 1, b.w + 4, 1, '#ffe066');
      rect(g, b.x - 2, b.y - 2, 1, b.h + 4, '#ffe066');
      rect(g, b.x + b.w + 1, b.y - 2, 1, b.h + 4, '#ffe066');
    }
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
    if (this.life.workersOn(apt)) return true; // мастера включили прожектор
    const room = apt.rooms[roomIndex];
    for (const r of Object.values(this.sim.state.residents)) {
      if (r.away || r.level !== apt.level || r.x < room.x0 || r.x >= room.x1) continue;
      if (r.action?.id === 'sleep' && r.action.phase === 'perform') continue;
      // уединились — свет погашен
      if (r.action?.id === 'together' && r.action.data.kind === 'intimacy') continue;
      // играет ночью, рядом кто-то спит — сидит без света, только монитор
      if (r.action?.id === 'gaming' && r.action.phase === 'perform' && Object.values(this.sim.state.residents).some((o) => o !== r && o.level === r.level && o.x >= room.x0 && o.x < room.x1 && o.action?.id === 'sleep')) continue;
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
        if (!L.aptById.has('apt-1-left')) region(L.buildingX0 + 4, lt, L.coreX - L.buildingX0 - 4, fy - lt + 2, 0.15 + (1 - day) * 0.6);
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
    const { ox, oy } = camera.offset();
    const z = camera.zoom;
    // за краями мира: сверху — небо, снизу — земля
    g.fillStyle = this.skyTop;
    g.fillRect(0, 0, this.canvas.width, Math.max(0, oy + 2 * z));
    g.fillStyle = mix('#2a2018', '#5d4a3a', day * 0.6);
    g.fillRect(0, Math.max(0, oy + this.H * z - 2 * z), this.canvas.width, this.canvas.height);
    if (ox > 0) {
      g.fillStyle = this.skyTop;
      g.fillRect(0, 0, ox, this.canvas.height);
      g.fillRect(ox + this.W * z, 0, this.canvas.width, this.canvas.height);
    }
    // видимая часть мира
    const sx0 = Math.max(0, Math.floor(-ox / z));
    const sy0 = Math.max(0, Math.floor(-oy / z));
    const sx1 = Math.min(this.W, Math.ceil((this.canvas.width - ox) / z));
    const sy1 = Math.min(this.H, Math.ceil((this.canvas.height - oy) / z));
    if (sx1 <= sx0 || sy1 <= sy0) return;
    g.drawImage(this.world, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * z, oy + sy0 * z, (sx1 - sx0) * z, (sy1 - sy0) * z);
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

  /** Клик по стенду «Жильцы дома» у почтовых ящиков */
  pickBoard(sx: number, sy: number): boolean {
    const w = this.camera.screenToWorld(sx, sy);
    const b = residentsBoardRect(this.defs);
    return w.x >= b.x - 2 && w.x <= b.x + b.w + 2 && w.y >= b.y - 2 && w.y <= b.y + b.h + 2;
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

/** Электрогитара на стойке: корпус, гриф */
function drawGuitarOnStand(g: CanvasRenderingContext2D, x: number, floorY: number) {
  rect(g, x, floorY - 9, 3, 5, '#7a1f2b');
  rect(g, x - 1, floorY - 7, 1, 2, '#7a1f2b');
  rect(g, x + 1, floorY - 8, 1, 1, '#f3f1ea');
  rect(g, x + 1, floorY - 17, 1, 8, '#3a2a1a');
  rect(g, x, floorY - 18, 3, 1, '#2a2a30');
}
