/**
 * Реестр спрайтов. Любой спрайт — это CanvasImageSource с известной раскладкой кадров.
 * Процедурный генератор регистрируется по ключу; если в public/sprites/manifest.json
 * для этого ключа указан PNG, используется он (см. docs/SPRITES.md).
 */
export type SpriteSource = HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return g;
}

export class SpriteRegistry {
  private cache = new Map<string, SpriteSource>();
  private overrides = new Map<string, HTMLImageElement>();

  /** Загружает public/sprites/manifest.json и PNG из него. Ошибки не фатальны. */
  async loadOverrides(base = `${import.meta.env.BASE_URL}sprites/`): Promise<string[]> {
    const loaded: string[] = [];
    try {
      const res = await fetch(`${base}manifest.json`);
      if (!res.ok) return loaded;
      const manifest = (await res.json()) as { overrides?: Record<string, string> };
      const entries = Object.entries(manifest.overrides ?? {});
      await Promise.all(
        entries.map(
          ([key, file]) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                this.overrides.set(key, img);
                loaded.push(key);
                resolve();
              };
              img.onerror = () => {
                console.warn(`[sprites] не удалось загрузить ${file} для ${key}`);
                resolve();
              };
              img.src = `${base}${file}`;
            }),
        ),
      );
    } catch {
      /* без манифеста — только процедурные спрайты */
    }
    return loaded;
  }

  hasOverride(key: string): boolean {
    return this.overrides.has(key);
  }

  /** Получить спрайт: PNG-подмена или результат генератора (кешируется). */
  get(key: string, generate: () => SpriteSource): SpriteSource {
    const o = this.overrides.get(key);
    if (o) return o;
    let s = this.cache.get(key);
    if (!s) {
      s = generate();
      this.cache.set(key, s);
    }
    return s;
  }

  invalidate(prefix: string): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
  }
}
