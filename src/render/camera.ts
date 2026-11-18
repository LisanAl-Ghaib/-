import { clamp, lerp } from '../core/math';

/**
 * Камера: целочисленный масштаб (мировой пиксель = zoom экранных пикселей),
 * центр в мировых координатах. Анимация плавно ведёт центр и масштаб.
 */
export class Camera {
  cx = 0;
  cy = 0;
  zoom = 2;
  viewW = 1;
  viewH = 1;
  /** снизу экран закрыт панелью (телефон) — центрируем по видимой части */
  insetBottom = 0;
  worldW: number;
  worldH: number;
  private anim: { fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; t0: number; dur: number } | null = null;
  private zoomF = 2;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.cx = worldW / 2;
    this.cy = worldH / 2;
  }

  setViewport(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
  }

  /** Наибольший целый масштаб, при котором прямоугольник целиком влезает */
  fitZoom(w: number, h: number, margin = 0): number {
    return Math.max(1, Math.floor(Math.min((this.viewW - margin) / w, (this.visH - margin) / h)));
  }

  get visH(): number {
    return Math.max(1, this.viewH - this.insetBottom);
  }

  minZoom(): number {
    return Math.max(1, Math.floor(Math.min(this.viewW / this.worldW, this.viewH / this.worldH)));
  }

  maxZoom(): number {
    return 12;
  }

  animateTo(x: number, y: number, zoom: number, now: number, dur = 450) {
    this.anim = { fromX: this.cx, fromY: this.cy, fromZ: this.zoomF, toX: x, toY: y, toZ: zoom, t0: now, dur };
  }

  jumpTo(x: number, y: number, zoom: number) {
    this.anim = null;
    this.cx = x;
    this.cy = y;
    this.zoom = zoom;
    this.zoomF = zoom;
    this.clampCenter();
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  update(now: number) {
    if (this.anim) {
      const a = this.anim;
      const t = clamp((now - a.t0) / a.dur, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.cx = lerp(a.fromX, a.toX, e);
      this.cy = lerp(a.fromY, a.toY, e);
      this.zoomF = lerp(a.fromZ, a.toZ, e);
      this.zoom = Math.max(1, Math.round(this.zoomF));
      if (t >= 1) {
        this.anim = null;
        this.zoomF = this.zoom = a.toZ;
      }
    }
    this.clampCenter();
  }

  clampCenter() {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.visH / 2 / this.zoom;
    this.cx = this.worldW <= halfW * 2 ? this.worldW / 2 : clamp(this.cx, halfW, this.worldW - halfW);
    this.cy = this.worldH <= halfH * 2 ? this.worldH / 2 : clamp(this.cy, halfH, this.worldH - halfH);
  }

  /** Смещение мира на экране (в экранных пикселях, целое) */
  offset(): { ox: number; oy: number } {
    return {
      ox: Math.round(this.viewW / 2 - this.cx * this.zoom),
      oy: Math.round(this.visH / 2 - this.cy * this.zoom),
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const { ox, oy } = this.offset();
    return { x: ox + x * this.zoom, y: oy + y * this.zoom };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { ox, oy } = this.offset();
    return { x: (sx - ox) / this.zoom, y: (sy - oy) / this.zoom };
  }

  panBy(dxScreen: number, dyScreen: number) {
    this.anim = null;
    this.cx -= dxScreen / this.zoom;
    this.cy -= dyScreen / this.zoom;
    this.clampCenter();
  }

  zoomAt(sx: number, sy: number, delta: number) {
    const before = this.screenToWorld(sx, sy);
    const z = clamp(this.zoom + delta, this.minZoom(), this.maxZoom());
    if (z === this.zoom) return;
    this.anim = null;
    this.zoom = this.zoomF = z;
    // точка под курсором остаётся на месте
    const { ox, oy } = this.offset();
    const after = { x: (sx - ox) / z, y: (sy - oy) / z };
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clampCenter();
  }
}
