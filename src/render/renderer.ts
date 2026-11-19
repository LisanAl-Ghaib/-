import { CORE_W, SLAB } from '../config';
import { clamp01, mix, shade } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import { daylight } from '../sim/env/sun';
import type { ResidentDef } from '../data/schemas';
import type { ResidentState } from '../sim/state';
import type { Simulation } from '../sim/simulation';
import type { ApartmentModel } from '../world/layout';
import { drawApartmentDoor, drawEntrance, renderBuilding, residentsBoardRect, windowRect, type BuildingLayers, type ConstructionView } from './building';
import { Camera } from './camera';
import { DEFAULT_LOOK, drawGround, drawTrees, drawYardProps, makeTrees, type OutdoorLook, type TreeShape } from './outdoor';
import { busPhase } from '../world/transport';
import { digits, disc, rect } from './pixel';
import { drawSkyGradient, drawStars, drawSunMoon, makeCity, makeCloud, makeStars, skyColors, type Star } from './sky';
import { CELL_H, CELL_W, FRAME, figureOf, generateCharacterSheet } from './sprites/character';
import { screenRect, screenRects } from './sprites/furniture';
import { generateIcon, generatePlate } from './sprites/icons';
import { hashString } from '../core/rng';
import { LifeDetails } from './lifeDetails';
import { generatePetSheet, PET_FRAME, PET_H, PET_W } from './sprites/pet';
import { nightHeadphones, outfitOfDay, visitorAppearance, withOutfitVariant, withStreet } from './visitorLook';
import { animatePose, smokePhase, type AnimEnv, type Pose } from './animation';
import { cigaretteTip, drawProp, eyesOf } from './props';
import type { FurnitureInstance } from '../world/layout';
import { partnerOf } from '../sim/couple';
import { drawScreen, type ScreenKind } from './screens';

/** кадры анфас и со спины — не отражаются по направлению взгляда */
const PROP_FRONT = new Set<number>([FRAME.frontStand, FRAME.frontSit, FRAME.frontTalk, FRAME.frontWave, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.standHandUp, FRAME.backStand, FRAME.backSit, FRAME.backWork, FRAME.backSitWork, FRAME.frontSitCross, FRAME.frontSmoke, FRAME.frontHold, FRAME.frontHang]);
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
  /** как нарисован каждый жилец в этом кадре — чтобы ночью дорисовать силуэт перед светящимся */
  private actorDraws: { sheet: CanvasImageSource; frame: number; x: number; top: number; flip: boolean }[] = [];
  private silhouetteCanvas: HTMLCanvasElement | null = null;
  private cigTips = new Map<string, [number, number, 1 | -1]>();
  private headTops = new Map<string, number>();
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
    this.stars = makeStars(this.W, L.groundY, 'stars', 320);
    const rng = Rng.fromSeed('clouds');
    // облака на разной высоте: дальние — выше, мельче и медленнее
    this.clouds = Array.from({ length: 16 }, (_, i) => {
      const y = rng.int(8, Math.max(20, L.roofY - 30));
      const far = 1 - y / Math.max(1, L.roofY);
      return {
        img: makeCloud(`cloud${i}`, Math.round(rng.int(30, 60) * (1 - far * 0.4)), Math.round(rng.int(12, 18) * (1 - far * 0.3))),
        x0: rng.int(0, this.W),
        y,
        speed: rng.range(0.4, 1) * (1 - far * 0.5),
      };
    });
    this.trees = makeTrees(defs);
    this.life = new LifeDetails(defs, sim, this.sprites);
  }

  private life: LifeDetails;

  async init(): Promise<void> {
    await this.sprites.loadOverrides();
    this.rebuildStatic();
  }

  rebuildStatic(): void {
    const con = this.conView();
    this.conKey = con ? Math.floor(con.progress * 100) : -1;
    this.layers = renderBuilding(this.defs, this.sprites, con);
  }

  /** Стройка этажа сейчас (или null) */
  private conView(): ConstructionView | null {
    const c = this.sim.state.construction;
    return c && !c.done ? { level: c.floor - 1, progress: c.progress } : null;
  }

  private conKey = -1;

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
    // крупнее всего, при котором виден весь дом (с крышей, краном и полоской двора),
    // но не мельче, чем нужно, чтобы экран целиком был внутри мира
    const bw = L.buildingX1 - L.buildingX0 + 24;
    const top = L.roofY - (this.sim.state.construction && !this.sim.state.construction.done ? 44 : 22);
    const bottom = L.groundY + 26;
    const fit = Math.max(1, Math.floor(Math.min(cam.viewW / bw, cam.visH / (bottom - top))));
    const z = Math.max(cam.minZoom(), fit);
    const visW = cam.viewW / z;
    // если по ширине есть запас — дом левее, справа двор с лавочкой и остановкой
    const x = visW >= bw + 80 ? L.buildingX0 - 12 + visW / 2 : (L.buildingX0 + L.buildingX1) / 2;
    const y = (top + bottom) / 2;
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
    // стройка продвинулась на процент (или закончилась) — перерисовать дом
    const con = this.conView();
    if ((con ? Math.floor(con.progress * 100) : -1) !== this.conKey) this.rebuildStatic();
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
    this.drawSkyLife(nowMs, day);
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
    this.drawSite(nowMs);
    this.life.draw(wg);
    this.drawDoors();
    this.drawElevator();
    // мастера — после кабины лифта: едут с цементом и их видно в кабине
    this.life.drawWorkers(wg, nowMs);
    this.drawActors(alpha, prev, opts, nowMs);
    this.drawVisitors(nowMs);
    this.drawPets(nowMs);
    wg.drawImage(this.layers.front, 0, 0);
    this.drawBus(tGame);

    // освещение
    this.drawLighting(day);
    this.drawNightLights(nowMs, day);
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

  /** Небо живёт: днём пролетает стая птиц, ночью — самолёт с мигающими огнями */
  private drawSkyLife(nowMs: number, day: number) {
    const g = this.wg;
    const L = this.defs.layout;
    const t = nowMs / 1000;
    if (day > 0.4 && this.env.rain < 0.3) {
      // стая раз в ~40 секунд пересекает небо
      const period = 40;
      const k = (t % period) / period;
      const cycle = Math.floor(t / period);
      const y0 = Math.round(L.roofY - 60 - ((cycle * 37) % Math.max(40, L.roofY - 120)));
      const x0 = Math.round(-30 + k * (this.W + 60));
      const flap = Math.floor(t * 4) % 2;
      for (let i = 0; i < 7; i++) {
        const bx = x0 - Math.abs(i - 3) * 6;
        const by = y0 + Math.abs(i - 3) * 2; // клин
        g.fillStyle = '#2a2a34';
        g.fillRect(bx - 1, by - flap, 1, 1);
        g.fillRect(bx, by, 1, 1);
        g.fillRect(bx + 1, by - flap, 1, 1);
      }
    }
    if (day < 0.5) {
      // самолёт: красный и белый огни мигают, медленно ползёт по небу
      const period = 70;
      const k = (t % period) / period;
      const cycle = Math.floor(t / period);
      const x = Math.round(this.W + 20 - k * (this.W + 40));
      const y = Math.round(40 + ((cycle * 53) % Math.max(40, L.roofY - 120)));
      if (Math.floor(t * 1.5) % 2) {
        g.fillStyle = '#ff4a3a';
        g.fillRect(x, y, 1, 1);
      }
      if (Math.floor(t * 1.5 + 0.5) % 3 === 0) {
        g.fillStyle = '#ffffff';
        g.fillRect(x + 3, y, 1, 1);
      }
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
    const conLevel = this.conView()?.level;
    for (const apt of L.apartments) {
      if (apt.level === conLevel) continue; // на стройке дверей ещё нет
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

  /** Кран: тележка ездит по стреле, на тросе качается поддон с кирпичом */
  private drawSite(nowMs: number) {
    const con = this.conView();
    if (!con || con.progress >= 0.5) return;
    const L = this.defs.layout;
    const g = this.wg;
    const mx = L.buildingX0 + 70;
    const top = L.levelTop(con.level) - 34;
    const working = this.sim.state.workers.some((w) => w.phase === 'working' && !w.away);
    const t = working ? this.sim.time / 600 : 0;
    const tx = Math.round(mx + 30 + Math.sin(t) * 45);
    const ropeLen = working ? 20 + Math.round((Math.sin(t * 1.7) + 1) * 14) : 12;
    const sway = Math.round(Math.sin(nowMs / 700) * (working ? 1 : 0));
    rect(g, tx - 2, top + 2, 5, 2, '#3a3a42');
    rect(g, tx, top + 4, 1, ropeLen, '#2a2a30');
    rect(g, tx - 1 + sway, top + 4 + ropeLen, 3, 2, '#3a3a42'); // крюк
    if (working && Math.sin(t * 0.5) > -0.2) {
      const ly = top + 6 + ropeLen;
      rect(g, tx - 7 + sway, ly, 14, 2, '#8a6a4a');
      rect(g, tx - 6 + sway, ly - 4, 12, 4, '#a85a4a');
      rect(g, tx - 6 + sway, ly - 4, 12, 1, '#c8b8a0');
    }
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
    this.screenDraws = [];
    this.tanks = [];
    this.drawAmbient(nowMs);
    this.drawCurtainsAndSmoke(nowMs);
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
          const glow = drawScreen(this.wg, 'tv', x, f.y - f.h + sr[1], sr[2], sr[3], this.sim.time, nowMs, f.uid, f.channel);
          this.screensOn.push([x + sr[2] / 2, f.y - f.h + sr[1], apt.id, room.index, glow, sr[2]]);
          this.screenDraws.push({ kind: 'tv', x, y: f.y - f.h + sr[1], w: sr[2], h: sr[3], seed: f.uid, channel: f.channel, apt, ri: room.index });
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
            // что на экране: телевизор, камеры, игра, сайты, работа (каждый раз — разное)
            const online = this.defs.residentById.get(r.id)?.traits.tags.some((tg) => /дискорд|онлайн/i.test(tg));
            let kind: ScreenKind = a.id === 'watch_tv' ? 'tv' : f.def.draw === 'concierge_desk' ? 'cctv' : a.id === 'gaming' ? 'game' : a.id === 'computer' ? (online && Math.floor(this.sim.time / 1800) % 3 === 0 ? 'chat' : 'web') : 'work';
            // второй экран: в игре — дискорд или сайт, за работой — чат или браузер
            if (si === 1) kind = a.id === 'gaming' ? (online ? 'chat' : 'web') : a.id === 'computer' ? 'work' : online ? 'chat' : 'web';
            const glow = drawScreen(this.wg, kind, x, f.y - f.h + sr[1], sr[2], sr[3], this.sim.time, nowMs, `${f.uid}:${si}:${r.id}`, kind === 'tv' ? f.channel : undefined);
            this.screenDraws.push({ kind, x, y: f.y - f.h + sr[1], w: sr[2], h: sr[3], seed: `${f.uid}:${si}:${r.id}`, channel: kind === 'tv' ? f.channel : undefined, apt, ri: room.index });
            this.screensOn.push([x + sr[2] / 2, f.y - f.h + sr[1], apt.id, room.index, glow, sr[2]]);
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

  /** светящиеся экраны кадра: x, y, квартира, комната, цвет свечения, ширина экрана */
  private screensOn: [number, number, string, number, string, number][] = [];
  /** экраны этого кадра — в тёмной комнате их перерисовываем поверх ночи: они светятся */
  private screenDraws: { kind: ScreenKind; x: number; y: number; w: number; h: number; seed: string; channel?: string; apt: ApartmentModel; ri: number }[] = [];
  private tanks: { f: FurnitureInstance; apt: ApartmentModel; ri: number; colors: string[] }[] = [];

  /**
   * Светящееся (экран, аквариум) рисуется поверх ночного затемнения — значит, и поверх людей.
   * Кто стоит перед ним, тот после этого дорисовывается тёмным силуэтом: человек на фоне света.
   */
  private behindActors(x: number, y: number, w: number, h: number, draw: () => void) {
    const g = this.wg;
    draw();
    const sc = (this.silhouetteCanvas ??= makeCanvas(CELL_W, CELL_H));
    const sg = sc.getContext('2d')!;
    for (const d of this.actorDraws) {
      if (d.x >= x + w || d.x + CELL_W <= x || d.top >= y + h || d.top + CELL_H <= y) continue;
      sg.globalCompositeOperation = 'source-over';
      sg.clearRect(0, 0, CELL_W, CELL_H);
      sg.save();
      if (d.flip) {
        sg.translate(CELL_W, 0);
        sg.scale(-1, 1);
      }
      sg.drawImage(d.sheet, d.frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
      sg.restore();
      sg.globalCompositeOperation = 'source-in';
      sg.fillStyle = '#161a28';
      sg.fillRect(0, 0, CELL_W, CELL_H);
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.drawImage(sc, d.x, d.top);
      g.restore();
    }
  }

  /** Рыбки в аквариуме */
  private drawFish(f: FurnitureInstance, colors: string[], nowMs: number) {
    const g = this.wg;
    const top = f.y - f.h;
    const iw = f.w - 4;
    colors.forEach((col, i) => {
      const ph = (nowMs / (5200 + i * 900) + i * 0.37 + f.x * 0.01) % 2;
      const k = ph < 1 ? ph : 2 - ph; // туда и обратно
      const fx = f.x + 2 + Math.round(k * (iw - 3));
      const fy = top + 4 + i * 3 + Math.round(Math.sin(nowMs / 900 + i) * 1.4);
      const dir = ph < 1 ? 1 : -1;
      rect(g, fx, fy, 3, 2, col);
      rect(g, dir > 0 ? fx - 1 : fx + 3, fy, 1, 2, shade(col, -0.25)); // хвост
      rect(g, dir > 0 ? fx + 2 : fx, fy, 1, 1, '#1a1a1a'); // глаз
    });
    const b = Math.floor(nowMs / 260) % 9;
    rect(g, f.x + f.w - 5, top + 9 - b, 1, 1, '#d8f0fb');
  }

  /** После ночного затемнения: светящиеся экраны и аквариумы в тёмных комнатах, огоньки сигарет */
  private drawNightLights(nowMs: number, day: number) {
    const g = this.wg;
    if (day < 0.6) {
      for (const s of this.screenDraws) {
        if (this.roomLit(s.apt, s.ri, day)) continue;
        this.behindActors(s.x, s.y, s.w, s.h, () => {
          g.globalAlpha = 0.9;
          drawScreen(g, s.kind, s.x, s.y, s.w, s.h, this.sim.time, nowMs, s.seed, s.channel);
          g.globalAlpha = 1;
        });
      }
      for (const t of this.tanks) {
        if (this.roomLit(t.apt, t.ri, day)) continue;
        // кто стоит перед аквариумом — остаётся перед ним
        this.behindActors(t.f.x, t.f.y - t.f.h, t.f.w, t.f.h, () => {
          g.globalAlpha = 0.55;
          rect(g, t.f.x + 1, t.f.y - t.f.h + 1, t.f.w - 2, t.f.h - 10, '#4f93b8');
          g.globalAlpha = 1;
          this.drawFish(t.f, t.colors, nowMs);
        });
      }
    }
    // ночью с телефоном в тёмной комнате: экран светит в лицо
    if (day < 0.5) for (const r of Object.values(this.sim.state.residents)) {
      const a = r.action;
      if (r.away || !a || a.phase !== 'perform' || a.id !== 'night_watch' || r.pose !== 'sit') continue;
      const apt = this.defs.layout.apartmentAt(r.level, r.x);
      if (!apt || this.roomLit(apt, this.defs.layout.roomAt(apt, r.x).index, day)) continue;
      const fx = Math.round(r.x) + (r.facing < 0 ? -5 : 4);
      const fy = Math.round(r.y) - 13;
      rect(g, fx, fy, 2, 1, '#9ed8ff');
      g.globalAlpha = 0.16;
      rect(g, fx - 2, fy - 5, 4, 5, '#9ed8ff');
      rect(g, fx - 1, fy - 6, 2, 1, '#9ed8ff');
      g.globalAlpha = 1;
    }
    // дым: тонкая струйка от кончика сигареты, на выдохе — облачко изо рта; огонёк светится в темноте
    for (const r of Object.values(this.sim.state.residents)) {
      const a = r.action;
      if (r.away || !a || a.phase !== 'perform' || (a.id !== 'smoke' && a.id !== 'smoke_window')) continue;
      const h = hashString(r.id);
      const ph = smokePhase(nowMs, h);
      const tip = this.cigTips.get(r.id);
      const headY = Math.round(r.y) - 19;
      // откуда дым: кончик сигареты, а если стоит спиной — над плечом
      const sx = tip ? tip[0] : Math.round(r.x) + 3;
      const sy = tip ? tip[1] - 1 : headY + 2;
      g.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) {
        const t = Math.floor(nowMs / 200 + i * 4 + h);
        const k = t % 12;
        rect(g, sx + Math.round(Math.sin((t + i) / 3) * 1.2) + Math.floor(k / 5), sy - k, 1, 1, '#e0e0e0');
      }
      if (ph === 'exhale') {
        // облачко изо рта расползается и тает
        const p = ((nowMs + (h % 997) * 37) % 6200 - 4700) / 1500;
        const mx = tip && tip[2] < 0 ? Math.round(r.x) - 3 : Math.round(r.x) + 2;
        const my = headY + 3;
        g.globalAlpha = 0.55 * (1 - p);
        const rad = 1 + Math.round(p * 4);
        for (let i = 0; i < 7; i++) rect(g, mx + Math.round(Math.cos(i * 0.9) * rad) + Math.round(p * 3), my - Math.round(Math.abs(Math.sin(i * 0.9)) * rad) - Math.round(p * 4), 1, 1, '#ececec');
      }
      g.globalAlpha = 1;
      if (tip && day < 0.45) {
        // огонёк: на затяжке разгорается
        const bright = ph === 'drag';
        g.globalAlpha = bright ? 0.35 : 0.18;
        rect(g, tip[0] - 1, tip[1] - 1, 3, 3, '#ff8a3a');
        g.globalAlpha = 1;
        rect(g, tip[0], tip[1], 1, 1, bright ? '#ffd0a0' : '#ff7a3a');
      }
    }
  }

  /**
   * «Зашторивает комнату даже днём»: в выходной за компьютером — плотные шторы задёрнуты.
   * Косметика: от дня и жильца, без случайностей симуляции.
   */
  private curtainsClosed(apt: ApartmentModel, roomIndex: number): boolean {
    const room = apt.rooms[roomIndex];
    if (!room.def.window) return false;
    const cal = this.sim.calendar();
    for (const d of this.defs.residents) {
      if (d.apartment !== apt.id || !d.traits.tags.some((t) => /зашторива/i.test(t))) continue;
      const r = this.sim.state.residents[d.id];
      const a = r?.action;
      if (!r || r.away || !a || a.phase !== 'perform' || r.x < room.x0 || r.x >= room.x1) continue;
      if (a.id !== 'computer' && a.id !== 'gaming' && a.id !== 'work') continue;
      const h = cal.hourOfDay;
      if (h < 9 || h > 19) continue;
      if (cal.weekday >= 6 ? hashString(`${d.id}:${cal.dayIndex}`) % 3 !== 0 : hashString(`${d.id}:${cal.dayIndex}`) % 7 === 0) return true;
    }
    return false;
  }

  /** Задёрнутые шторы; открытая форточка, когда курит в окно (дым — в drawNightLights) */
  private drawCurtainsAndSmoke(nowMs: number) {
    const g = this.wg;
    const L = this.defs.layout;
    for (const apt of L.apartments) {
      if (apt.vacant) continue;
      for (const room of apt.rooms) {
        if (!this.curtainsClosed(apt, room.index)) continue;
        const wr = windowRect(room, L.levelTop(apt.level));
        if (!wr) continue;
        const col = apt.def?.palette.textile ?? '#4a4f58';
        rect(g, wr[0] - 3, wr[1] - 2, wr[2] + 6, wr[3] + 4, col);
        for (let x = wr[0] - 2; x < wr[0] + wr[2] + 3; x += 3) rect(g, x, wr[1] - 2, 1, wr[3] + 4, shade(col, -0.18)); // складки
        rect(g, wr[0] + Math.floor(wr[2] / 2), wr[1] - 2, 1, wr[3] + 4, shade(col, -0.3)); // где сходятся
        rect(g, wr[0] - 3, wr[1] - 3, wr[2] + 6, 1, '#7a7a7a'); // карниз
      }
    }
    for (const r of Object.values(this.sim.state.residents)) {
      const a = r.action;
      if (r.away || !a || a.phase !== 'perform' || a.id !== 'smoke_window') continue;
      {
        // форточка открыта, дым тянет наружу
        const apt = L.apartmentAt(r.level, r.x);
        const room = apt ? L.roomAt(apt, r.x) : null;
        const wr = room ? windowRect(room, L.levelTop(r.level)) : null;
        if (wr) {
          rect(g, wr[0] + Math.floor(wr[2] / 2) + 1, wr[1] + 1, Math.floor(wr[2] / 2) - 2, 5, 'rgba(230,240,246,0.35)');
          rect(g, wr[0] + wr[2] - 2, wr[1], 1, 7, '#efece4'); // приоткрытая створка
        }
      }
    }
  }

  /** Душевая кабина, в которой сейчас моется жилец */
  private showerOf(r: ResidentState): FurnitureInstance | null {
    const a = r.action;
    if (a?.id !== 'wash' || a.phase !== 'perform' || !a.target.slot) return null;
    const slot = this.sim.slotIndex.get(a.target.slot);
    const f = slot ? this.furniture(slot.furnitureUid) : undefined;
    return f?.def.draw === 'shower' ? f : null;
  }

  private drawShowerExtras(def: ResidentDef, f: FurnitureInstance, nowMs: number) {
    const g = this.wg;
    const app = def.appearance;
    // одежда переброшена через дверцу кабины, полотенце рядом
    const ty = f.y - f.h;
    rect(g, f.x + 1, ty - 1, 5, 2, app.outfit.top);
    rect(g, f.x + 1, ty + 1, 2, 4, app.outfit.top);
    rect(g, f.x + 4, ty + 1, 2, 3, app.outfit.bottom);
    rect(g, f.x + f.w - 4, ty - 1, 3, 2, '#f4f2ec');
    rect(g, f.x + f.w - 3, ty + 1, 2, 5, '#f4f2ec');
    // пар над кабиной
    g.globalAlpha = 0.55;
    for (let i = 0; i < 4; i++) {
      const t = Math.floor(nowMs / 160 + i * 7);
      rect(g, f.x + 2 + ((t + i * 3) % (f.w - 3)), f.y - f.h - 1 - (t % 6), 1, 1, '#ffffff');
    }
    g.globalAlpha = 1;
  }

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
            case 'aquarium': {
              // рыбки плавают туда-сюда, поднимаются пузырьки; в темноте аквариум светится
              const owners = this.defs.residents.filter((d) => d.apartment === apt.id).flatMap((d) => d.pets.filter((p) => p.species === 'fish'));
              const fish = owners.length ? owners.map((p) => p.color) : ['#f08a3c', '#f2d16b'];
              this.drawFish(f, fish, nowMs);
              this.tanks.push({ f, apt, ri: room.index, colors: fish });
              this.screensOn.push([f.x + f.w / 2, top + 6, apt.id, room.index, '#4f93b8', f.w - 2]);
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
    // экраны светятся: в тёмной комнате пятно света цвета картинки ложится на стены, пол и людей
    if (day < 0.7) {
      for (const [x, y, aptId, ri, color, sw] of this.screensOn) {
        const apt = L.aptById.get(aptId);
        if (!apt) continue;
        const room = apt.rooms[ri];
        const lit = this.roomLit(apt, ri, day);
        const k = Math.min(1, (0.7 - day) / 0.45) * (lit ? 0.35 : 1);
        if (k <= 0) continue;
        const flick = 0.75 + 0.25 * ((((Math.floor(nowMs / 170) + x) * 2654435761) >>> 0) % 100) / 100;
        const col = mix(color, '#ffffff', 0.35);
        const lt = L.levelTop(apt.level);
        const fy = L.floorY(apt.level);
        const size = 0.6 + Math.min(1, sw / 12) * 0.6;
        // мягкие слои от экрана во все стороны, сильнее всего — вниз и вперёд, на того, кто смотрит
        for (let i = 5; i >= 1; i--) {
          g.globalAlpha = 0.045 * k * flick;
          const r = Math.round(i * 9 * size);
          const x0 = Math.max(room.x0, Math.round(x - r * 1.3));
          const x1 = Math.min(room.x1, Math.round(x + r * 1.3));
          const y0 = Math.max(lt, Math.round(y - r * 0.7));
          rect(g, x0, y0, x1 - x0, fy - y0, col);
        }
        // яркий ореол вокруг самого экрана
        g.globalAlpha = 0.18 * k * flick;
        rect(g, Math.round(x - sw / 2) - 2, Math.round(y) - 2, sw + 4, 9, col);
        g.globalAlpha = 1;
      }
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
    // пара в одной комнате, каждый занят своим — время от времени перебрасываются словами
    const pid = partnerOf(this.sim, r.id);
    const p = pid ? this.sim.state.residents[pid] : undefined;
    if (p && a?.phase === 'perform' && p.action?.phase === 'perform' && !r.away && !p.away && p.level === r.level && env.faceToX === undefined) {
      const apt = this.defs.layout.apartmentAt(r.level, r.x);
      const quiet = (x: ResidentState) => ['sleep', 'nap', 'toilet', 'wash', 'together', 'work', 'side_work'].includes(x.action!.id) && !(x.action!.id === 'side_work' && Math.floor(this.sim.time / 900) % 3 === 0);
      if (apt && this.defs.layout.roomAt(apt, r.x).index === this.defs.layout.roomAt(apt, p.x).index && !quiet(r) && !quiet(p)) {
        const win = Math.floor(this.sim.time / 180 + hashString(apt.id)) % 5;
        if (win !== 0 && win !== 3) {
          env.faceToX = p.x;
          env.chatter = true;
        }
      }
    }
    if (f && (f.def.draw === 'piano' || f.def.draw === 'digital_piano')) env.instrument = 'piano';
    if (f?.def.draw === 'eguitar_amp') env.instrument = 'guitar';
    if (f?.def.draw === 'pullup_bar') env.pullup = f.y - f.h + 1;
    if (f?.def.draw === 'recliner') env.recline = true;
    return env;
  }

  private sheet(r: ResidentState): HTMLCanvasElement | HTMLImageElement {
    const def = this.defs.residentById.get(r.id)!;
    // куртка — только если оделся в прихожей (и до тех пор, пока не снял её дома)
    const coat = this.env.coats && !!r.dressed;
    // иногда надевает другое (рубашку с галстуком вместо толстовки) — на весь день
    const vi = outfitOfDay(def, r.today.day);
    let app = vi < 0 ? def.appearance : withOutfitVariant(def.appearance, vi);
    // на улице — уличная одежда (джинсы, кепка), дома — домашняя
    const street = !!r.dressed && !!def.appearance.street;
    if (street) app = withStreet(app);
    // ночью в наушниках
    const hp = !street && nightHeadphones(def, r, this.sim.calendar().hourOfDay);
    if (hp) app = { ...app, accessories: [...app.accessories, 'headphones'] };
    const key = `resident:${r.id}${vi >= 0 ? `:v${vi}` : ''}${street ? ':street' : ''}${hp ? ':hp' : ''}${coat && def.appearance.outfit.coat ? ':coat' : ''}`;
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
    this.actorDraws = [];
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
      let sheet = this.sheet(r);
      // в душе: за матовым стеклом только силуэт, одежда сложена рядом, идёт пар
      const showerF = this.showerOf(r);
      if (showerF) {
        sheet = this.sprites.get(`resident:${r.id}:shower`, () => generateCharacterSheet(showerLook(def.appearance))) as HTMLCanvasElement;
        const k = Math.floor((nowMs + hashString(r.id)) / 1400) % 4;
        frame = k === 1 ? FRAME.frontWave : k === 3 ? FRAME.backStand : FRAME.frontStand;
        pose = { frame };
        this.drawShowerExtras(def, showerF, nowMs);
      }
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
      this.actorDraws.push({ sheet, frame, x: sx - CELL_W / 2, top, flip });
      // где макушка — над ней значок и отметка «следим»
      this.headTops.set(r.id, frame === FRAME.lie ? iy - 7 : top + CELL_H - figureOf(def.appearance).H - (frame === FRAME.frontHang ? 2 : 0));
      // запотевшее стекло душевой: силуэт едва угадывается
      if (showerF) {
        g.globalAlpha = 0.5;
        rect(g, showerF.x + 1, showerF.y - showerF.h + 1, showerF.w - 2, showerF.h - 3, '#e6f0f4');
        g.globalAlpha = 0.35;
        for (let i = 0; i < 6; i++) rect(g, showerF.x + 1 + ((i * 5 + Math.floor(nowMs / 700)) % (showerF.w - 3)), showerF.y - showerF.h + 3 + i * 5, 2, 3, '#ffffff');
        g.globalAlpha = 1;
      }
      // моргнул
      if (pose?.blink && !def.sprite && !showerF) {
        for (const [ex, ey] of eyesOf(def.appearance, frame)) {
          const x = flip ? sx + CELL_W / 2 - 1 - ex : sx - CELL_W / 2 + ex;
          rect(g, x, top + ey, 1, 1, def.appearance.skin);
        }
      }
      // реквизит в руках
      if (pose?.prop) drawProp(g, def.appearance, frame, pose.prop.kind, pose.prop.at, sx, top, flip && !PROP_FRONT.has(frame), nowMs, hashString(r.id));
      // где кончик сигареты — оттуда пойдёт дым (рисуется после ночного затемнения)
      if (pose?.prop?.kind === 'cigarette') this.cigTips.set(r.id, cigaretteTip(def.appearance, frame, sx, top, flip && !PROP_FRONT.has(frame)));
      else this.cigTips.delete(r.id);
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
    // ночью в наушниках — иногда там музыка
    const def = this.defs.residentById.get(r.id);
    if (def && nightHeadphones(def, r, this.sim.calendar().hourOfDay) && (this.sim.calendar().hour + hashString(r.id)) % 3 !== 0) return 'music';
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
      // сначала — самочувствие (зевает, вздыхает) и события (заболел, кошмар), иначе — чем занят
      const mood = this.moodIcon(r, nowMs) ?? (r.bubble && EVENT_ICONS.has(r.bubble.icon) ? r.bubble.icon : null);
      const name = mood ?? iconFor(r);
      if (!name) continue;
      const icon = this.sprites.get(`plate:${name}:${mood ? 1 : 0}`, () => generatePlate(name, !!mood));
      const bob = Math.floor(nowMs / 600 + r.x) % 2;
      const head = this.headTops.get(r.id) ?? (r.pose === 'lie' ? r.y - 7 : r.pose === 'sit' ? r.y - 21 : r.y - 23);
      this.wg.drawImage(icon, Math.round(r.x) - 5, Math.round(head) - 15 - bob);
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
      const head = this.headTops.get(sel.id) ?? (sel.pose === 'lie' ? sel.y - 7 : sel.pose === 'sit' ? sel.y - 21 : sel.y - 23);
      const plate = !!iconFor(sel) || !!sel.bubble;
      const bob = Math.floor(nowMs / 400) % 2;
      const x = Math.round(sel.x);
      const y = Math.round(plate ? head - 15 : head) - 5 - bob;
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
    // «почти не включает свет»: днём светло из окна, вечером хватает монитора (в санузле — включит)
    if (room.type !== 'bathroom' && this.defs.residents.some((d) => d.apartment === apt.id && d.traits.tags.some((t) => /не включает свет/i.test(t)))) return false;
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
    const conLevel = this.conView()?.level;
    for (const apt of L.apartments) {
      if (apt.level === conLevel) continue; // стройка — под открытым небом
      const lt = L.levelTop(apt.level);
      const fy = L.floorY(apt.level);
      for (const room of apt.rooms) {
        const on = this.roomLit(apt, room.index, day);
        const shut = this.curtainsClosed(apt, room.index) ? 0.32 : 0; // задёрнуто — полумрак
        const a = on ? 0.04 : apt.vacant ? 0.18 + overcastDim + (1 - day) * 0.7 : 0.1 + shut + overcastDim * 1.5 + (1 - day) * 0.74;
        region(room.x0, lt, room.x1 - room.x0, fy - lt + 2, Math.min(0.88, a));
        if (on) lit.push([room.x0, lt, room.x1 - room.x0, fy - lt]);
      }
    }
    // подъезд: лампы горят всю ночь (тускло)
    for (let level = 0; level <= L.floors; level++) {
      if (level === conLevel) continue; // на стройке ламп подъезда ещё нет
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

/** Как человек выглядит в душе сквозь матовое стекло: силуэт без одежды и очков */
function showerLook(app: ResidentDef['appearance']): ResidentDef['appearance'] {
  return {
    ...app,
    outfit: { ...app.outfit, top: app.skin, bottom: shade(app.skin, -0.06), shoes: app.skin, style: 'casual', pattern: 'plain', coat: undefined, variants: [] },
    accessories: [],
  };
}

/** Значки-события (не занятия): болеет, грустит, сердится, смеётся */
const EVENT_ICONS = new Set(['sick', 'gloom', 'anger', 'laugh', 'heart', 'gift', 'shock', 'yawn', 'hungry']);

/** Понятный значок занятия: что человек делает прямо сейчас (null — ничего показывать не нужно) */
export function iconFor(r: ResidentState): string | null {
  const a = r.action;
  if (!a || r.away) return null;
  // в дороге значок не нужен — видно, что идёт
  if (a.phase !== 'perform') return null;
  switch (a.id) {
    case 'sleep':
    case 'nap':
      return 'zzz';
    case 'eat':
    case 'snack':
      return 'food';
    case 'cook':
      return 'cook';
    case 'tea':
      return 'cup';
    case 'wash':
    case 'wash_dishes':
      return 'wash';
    case 'make_bed':
      return 'bed';
    case 'unpack':
      return 'bag';
    case 'take_out_trash':
      return 'trash';
    case 'work':
      return a.label.includes('окошк') ? 'eye' : 'laptop';
    case 'side_work':
    case 'computer':
      return 'laptop';
    case 'watch_tv':
      return 'tv';
    case 'read':
      return 'book';
    case 'music':
      return a.label.includes('гитар') ? 'guitar' : 'music';
    case 'gaming':
      return 'game';
    case 'crafts':
      return 'hoop';
    case 'plants':
      return 'plant';
    case 'fitness':
      return 'sport';
    case 'phone':
      return 'phone';
    case 'window':
      return 'eye';
    case 'chores':
      return 'broom';
    case 'walk_yard':
    case 'jog':
      return 'shoe';
    case 'smoke':
    case 'smoke_window':
      return 'cig';
    case 'snowman':
      return 'snow';
    case 'visit':
    case 'host':
    case 'guest':
    case 'chat':
    case 'family_visit':
      return 'talk';
    case 'feed_pets':
    case 'feed_fish':
      return 'fish';
    case 'night_watch':
      return 'moon';
    case 'nightmare':
      return 'shock';
    case 'chess':
      return 'chess';
    case 'wave_window':
      return 'hand';
    case 'together':
      switch (a.data.kind) {
        case 'talk':
          return 'talk';
        case 'film':
          return 'film';
        case 'chess':
          return 'chess';
        case 'help_cook':
          return 'cook';
        case 'gift':
          return 'gift';
        default:
          return null; // уединились — сердечко рисуется отдельно
      }
    default:
      return null;
  }
}
