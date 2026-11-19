import { mix, shade } from '../../core/math';
import { hashString, Rng } from '../../core/rng';
import type { Palette } from '../../data/schemas';
import type { FurnitureInstance } from '../../world/layout';

/**
 * Процедурная отрисовка мебели. Каждая функция рисует предмет в локальных координатах
 * (0,0 — левый верхний угол коробки w×h). Отражение делается снаружи.
 */
export interface FurnCtx {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
  main: string;
  pal: Palette;
  rng: Rng;
  style: string;
}

type Drawer = (c: FurnCtx) => void;

const R = (c: FurnCtx, x: number, y: number, w: number, h: number, color: string) => {
  c.g.fillStyle = color;
  c.g.fillRect(x, y, w, h);
};

const OUT = '#2a2230';
const WHITE = '#f3f1ea';
const DARK_SCREEN = '#1c2430';

const BOOK_COLORS = ['#a8433a', '#3f6e9e', '#d6a03c', '#4f8a55', '#7b4a8c', '#c9c2b0', '#2f4858', '#b86b3c'];

const drawers: Record<string, Drawer> = {
  bed(c) {
    const { w, h, main, pal } = c;
    const wood = pal.wood;
    R(c, w - 3, 0, 3, h, wood); // изголовье
    R(c, w - 3, 0, 3, 1, shade(wood, 0.2));
    R(c, 0, h - 8, 2, 8, wood); // изножье
    R(c, 0, h - 5, w, 3, shade(wood, -0.1)); // рама
    R(c, 1, h - 7, w - 4, 2, WHITE); // матрас
    R(c, 1, h - 8, w - 10, 3, main); // одеяло
    R(c, 1, h - 8, w - 10, 1, shade(main, 0.2));
    R(c, w - 9, h - 9, 6, 2, '#fbfaf5'); // подушка
    R(c, 1, h - 2, 1, 2, shade(wood, -0.3));
    R(c, w - 3, h - 2, 1, 2, shade(wood, -0.3));
  },
  bed_double(c) {
    const { w, h, main, pal } = c;
    const wood = pal.wood;
    R(c, w - 3, 0, 3, h, wood);
    R(c, w - 3, 0, 3, 1, shade(wood, 0.2));
    R(c, 0, h - 8, 2, 8, wood);
    R(c, 0, h - 5, w, 3, shade(wood, -0.1));
    R(c, 1, h - 7, w - 4, 2, WHITE);
    R(c, 1, h - 9, w - 11, 4, main);
    R(c, 1, h - 9, w - 11, 1, shade(main, 0.2));
    R(c, 4, h - 7, w - 18, 1, shade(main, -0.15));
    R(c, w - 10, h - 10, 7, 2, '#fbfaf5');
    R(c, w - 9, h - 11, 6, 1, '#e9e6dc');
    R(c, 1, h - 2, 1, 2, shade(wood, -0.3));
    R(c, w - 3, h - 2, 1, 2, shade(wood, -0.3));
  },
  sofa(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, h - 6, shade(main, -0.12)); // спинка
    R(c, 1, 0, w - 2, 1, shade(main, 0.1));
    for (let x = 1 + 10; x < w - 2; x += 10) R(c, x, 2, 1, h - 9, shade(main, -0.25));
    R(c, 0, h - 7, w, 4, main); // сиденье
    R(c, 0, h - 7, w, 1, shade(main, 0.18));
    R(c, 0, 3, 3, h - 5, shade(main, -0.05)); // подлокотники
    R(c, w - 3, 3, 3, h - 5, shade(main, -0.05));
    R(c, 0, 3, 3, 1, shade(main, 0.15));
    R(c, w - 3, 3, 3, 1, shade(main, 0.15));
    R(c, 0, h - 3, w, 1, shade(main, -0.35));
    R(c, 1, h - 2, 1, 2, OUT);
    R(c, w - 2, h - 2, 1, 2, OUT);
    // подушка-акцент
    R(c, 4, h - 10, 4, 3, c.pal.accent);
  },
  armchair(c) {
    const { w, h, main } = c;
    R(c, 2, 0, w - 4, h - 6, shade(main, -0.12));
    R(c, 2, 0, w - 4, 1, shade(main, 0.1));
    R(c, 1, h - 7, w - 2, 4, main);
    R(c, 1, h - 7, w - 2, 1, shade(main, 0.18));
    R(c, 0, 4, 2, h - 6, shade(main, -0.05));
    R(c, w - 2, 4, 2, h - 6, shade(main, -0.05));
    R(c, 1, h - 3, w - 2, 1, shade(main, -0.35));
    R(c, 2, h - 2, 1, 2, OUT);
    R(c, w - 3, h - 2, 1, 2, OUT);
  },
  rocking_chair(c) {
    const { w, h, main, pal } = c;
    const t = pal.textile;
    R(c, 2, 0, 2, h - 5, main); // спинка
    R(c, 3, 1, 2, h - 8, t);
    R(c, 2, h - 8, w - 4, 2, main); // сиденье
    R(c, 4, h - 9, w - 7, 1, t);
    R(c, w - 4, h - 11, 2, 3, main); // подлокотник
    R(c, 4, h - 6, 1, 4, main);
    R(c, w - 5, h - 6, 1, 4, main);
    R(c, 1, h - 2, w - 2, 1, main); // полоз
    R(c, 0, h - 3, 1, 1, main);
    R(c, w - 1, h - 3, 1, 1, main);
  },
  tv_stand(c) {
    const { w, h, main } = c;
    R(c, 0, h - 8, w, 8, main);
    R(c, 0, h - 8, w, 1, shade(main, 0.2));
    R(c, 2, h - 6, w / 2 - 3, 4, shade(main, -0.15));
    R(c, w / 2 + 1, h - 6, w / 2 - 3, 4, shade(main, -0.15));
    R(c, w / 2 - 2, h - 10, 4, 2, '#30343a'); // подставка
    R(c, 1, 0, w - 2, h - 10, '#30343a'); // телевизор
    R(c, 2, 1, w - 4, h - 12, DARK_SCREEN);
    R(c, 3, 2, 2, 1, '#3a4a5c');
  },
  tv_old(c) {
    const { w, h, main } = c;
    R(c, 4, 0, 1, 4, '#888'); // антенна
    R(c, w - 5, 1, 1, 3, '#888');
    R(c, 3, 3, w - 6, 1, '#555');
    R(c, 0, 4, w, h - 9, main); // корпус
    R(c, 0, 4, w, 1, shade(main, 0.2));
    R(c, 2, 6, w - 6, h - 13, '#3d463f'); // кинескоп
    R(c, 3, 7, w - 8, h - 15, '#26302a');
    R(c, w - 3, 7, 2, 1, '#c9c2b0'); // ручки
    R(c, w - 3, 9, 2, 1, '#c9c2b0');
    R(c, 1, h - 5, w - 2, 1, shade(main, -0.3)); // ножки
    R(c, 2, h - 4, 1, 4, OUT);
    R(c, w - 3, h - 4, 1, 4, OUT);
    if (c.style === 'soviet') {
      // кружевная салфетка на крышке и фарфоровая статуэтка
      R(c, 1, 3, w - 2, 1, '#f4f0e4');
      for (let x = 1; x < w - 1; x += 2) R(c, x, 4, 1, 1, '#f4f0e4');
      R(c, Math.floor(w / 2) + 1, 0, 2, 3, '#f2efe8');
      R(c, Math.floor(w / 2) + 1, 0, 1, 1, '#4a6aa8');
    }
  },
  bookshelf(c) {
    const { w, h, main, rng } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, shade(main, -0.35));
    const shelves = 4;
    const sh = Math.floor((h - 2) / shelves);
    for (let i = 0; i < shelves; i++) {
      const y = 1 + i * sh;
      R(c, 0, y + sh - 1, w, 1, main);
      let x = 1;
      while (x < w - 2) {
        const bw = rng.int(1, 2);
        const bh = rng.int(sh - 4, sh - 2);
        if (rng.chance(0.12)) {
          x += 2;
          continue;
        }
        R(c, x, y + sh - 1 - bh, bw, bh, rng.pick(BOOK_COLORS));
        x += bw;
      }
    }
  },
  desk(c) {
    const { w, h, main } = c;
    R(c, 4, 0, w - 4, 2, main);
    R(c, 4, 0, w - 4, 1, shade(main, 0.2));
    R(c, w - 7, 2, 6, 6, shade(main, -0.1)); // тумба
    R(c, w - 5, 4, 2, 1, '#d6c38a');
    R(c, 5, 2, 1, h - 2, shade(main, -0.25));
    R(c, w - 7, 8, 1, h - 8, shade(main, -0.25));
    R(c, w - 2, 8, 1, h - 8, shade(main, -0.25));
    // лампа
    R(c, w - 6, -6, 1, 6, '#666');
    R(c, w - 7, -7, 4, 2, c.pal.accent);
    // стул
    R(c, 1, h - 9, 1, 7, '#3a3a42');
    R(c, 1, h - 5, 6, 1, '#3a3a42');
    R(c, 2, h - 4, 1, 4, '#3a3a42');
    R(c, 6, h - 4, 1, 4, '#3a3a42');
  },
  computer_desk(c) {
    const { w, h, main } = c;
    const top = h - 12;
    R(c, 4, top, w - 4, 2, main);
    R(c, 4, top, w - 4, 1, shade(main, 0.2));
    R(c, 5, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 2, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 7, top + 3, 4, 8, '#2b2e35'); // системник
    R(c, w - 6, top + 4, 1, 1, '#5fd36a');
    R(c, 11, 0, 11, 7, '#2b2e35'); // монитор
    R(c, 12, 1, 9, 5, DARK_SCREEN);
    R(c, 15, 7, 3, top - 7, '#2b2e35');
    R(c, 9, top - 1, 6, 1, '#555a62'); // клавиатура
    // кресло
    R(c, 0, h - 11, 2, 8, '#363a45');
    R(c, 0, h - 5, 7, 2, '#363a45');
    R(c, 3, h - 3, 1, 2, '#555');
    R(c, 1, h - 1, 5, 1, '#555');
  },
  dining_table(c) {
    const { w, h, main, pal } = c;
    // стулья
    R(c, 0, h - 11, 1, 11, shade(main, -0.15));
    R(c, 0, h - 5, 5, 1, shade(main, -0.15));
    R(c, 4, h - 4, 1, 4, shade(main, -0.15));
    R(c, w - 1, h - 11, 1, 11, shade(main, -0.15));
    R(c, w - 5, h - 5, 5, 1, shade(main, -0.15));
    R(c, w - 5, h - 4, 1, 4, shade(main, -0.15));
    // стол
    R(c, 6, h - 9, w - 12, 2, main);
    R(c, 6, h - 9, w - 12, 1, shade(main, 0.2));
    R(c, 6, h - 7, w - 12, 1, pal.textile); // скатерть
    R(c, 8, h - 7, 1, 7, shade(main, -0.25));
    R(c, w - 9, h - 7, 1, 7, shade(main, -0.25));
    R(c, w / 2 - 1, h - 11, 2, 2, '#f3f1ea'); // чашка
  },
  kitchen_table(c) {
    const { w, h, main, pal } = c;
    R(c, 0, h - 10, 1, 10, shade(main, -0.15));
    R(c, 0, h - 5, 4, 1, shade(main, -0.15));
    R(c, 3, h - 4, 1, 4, shade(main, -0.15));
    R(c, w - 1, h - 10, 1, 10, shade(main, -0.15));
    R(c, w - 4, h - 5, 4, 1, shade(main, -0.15));
    R(c, w - 4, h - 4, 1, 4, shade(main, -0.15));
    if (c.style === 'soviet') {
      // клеёнка в клетку, свисает краями
      R(c, 0, h - 10, w, 1, '#e8e2d0');
      for (let x = 0; x < w; x += 2) R(c, x, h - 9, 1, 2, x % 4 ? '#e8e2d0' : pal.textile);
      R(c, 0, h - 9, 1, 3, '#e8e2d0');
      R(c, w - 1, h - 9, 1, 3, '#e8e2d0');
    } else {
      R(c, 5, h - 9, w - 10, 2, pal.textile);
      R(c, 5, h - 9, w - 10, 1, shade(pal.textile, 0.25));
    }
    R(c, 7, h - 7, 1, 7, shade(main, -0.25));
    R(c, w - 8, h - 7, 1, 7, shade(main, -0.25));
  },
  stove(c) {
    const { w, h } = c;
    const body = '#e9e6df';
    R(c, 0, 0, w, h, body);
    R(c, 0, 0, w, 2, '#3a3a40');
    R(c, 2, 0, 3, 1, '#5a5a62');
    R(c, w - 5, 0, 3, 1, '#5a5a62');
    R(c, 1, 3, w - 2, 1, '#b8b4aa');
    for (let i = 0; i < 4; i++) R(c, 2 + i * 3, 3, 1, 1, '#333');
    R(c, 2, 5, w - 4, h - 8, '#2d2d33');
    R(c, 3, 6, w - 6, h - 10, '#4a3a2a');
    R(c, 2, 5, w - 4, 1, '#888');
    R(c, 0, h - 1, w, 1, '#b8b4aa');
  },
  kitchen_counter(c) {
    const { w, h, main, pal } = c;
    // верхние шкафчики
    R(c, 0, 0, w, 8, main);
    R(c, w / 2, 1, 1, 6, shade(main, -0.25));
    R(c, w / 2 - 2, 5, 1, 2, '#ddd');
    R(c, w / 2 + 2, 5, 1, 2, '#ddd');
    R(c, 0, 8, w, 1, shade(main, -0.35));
    // фартук
    for (let y = 9; y < h - 13; y += 3) for (let x = (y % 2) * 2; x < w; x += 4) R(c, x, y, 3, 2, mix(WHITE, pal.accent, 0.15));
    // столешница и мойка
    R(c, 0, h - 13, w, 2, '#d9d3c4');
    R(c, 3, h - 13, 7, 1, '#9aa4ad');
    R(c, 6, h - 17, 1, 4, '#9aa4ad');
    R(c, 6, h - 17, 3, 1, '#9aa4ad');
    // нижние шкафы
    R(c, 0, h - 11, w, 11, main);
    R(c, 0, h - 11, w, 1, shade(main, 0.15));
    R(c, w / 2, h - 10, 1, 9, shade(main, -0.25));
    R(c, w / 2 - 2, h - 8, 1, 2, '#ddd');
    R(c, w / 2 + 2, h - 8, 1, 2, '#ddd');
    R(c, 0, h - 1, w, 1, shade(main, -0.4));
    // банки
    R(c, w - 6, h - 16, 2, 3, '#d6a03c');
    R(c, w - 3, h - 15, 2, 2, '#a8433a');
  },
  fridge(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 0, 0, w, 1, shade(main, 0.1));
    R(c, 0, 0, 1, h, shade(main, -0.1));
    R(c, 0, 9, w, 1, shade(main, -0.25));
    R(c, w - 3, 3, 1, 4, '#9aa4ad');
    R(c, w - 3, 12, 1, 6, '#9aa4ad');
    R(c, 3, 13, 3, 3, c.pal.accent); // магнитик/записка
    R(c, 0, h - 1, w, 1, '#444');
  },
  fridge_old(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, 1, main);
    R(c, 0, 1, w, h - 1, main);
    R(c, 0, 1, 1, h - 1, shade(main, -0.12));
    R(c, w - 3, 6, 2, 6, '#c0c4c8');
    R(c, 3, 3, 5, 1, '#c0c4c8'); // «ЗиЛ»
    R(c, 1, h - 1, w - 2, 1, '#555');
    R(c, 2, 12, 2, 2, '#c75c5c');
  },
  wardrobe(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 0, 0, w, 2, shade(main, 0.18));
    R(c, 1, 3, w / 2 - 1, h - 5, shade(main, -0.08));
    R(c, w / 2 + 1, 3, w / 2 - 2, h - 5, shade(main, -0.08));
    R(c, w / 2 - 2, h / 2, 1, 3, '#d6c38a');
    R(c, w / 2 + 1, h / 2, 1, 3, '#d6c38a');
    R(c, 0, h - 2, w, 2, shade(main, -0.35));
  },
  chest(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h - 1, main);
    R(c, 0, 0, w, 1, shade(main, 0.2));
    for (let i = 0; i < 3; i++) {
      const y = 2 + i * 3;
      R(c, 1, y, w - 2, 2, shade(main, -0.1));
      R(c, w / 2 - 1, y, 2, 1, '#d6c38a');
    }
    R(c, 1, h - 1, 1, 1, OUT);
    R(c, w - 2, h - 1, 1, 1, OUT);
    // безделушки
    R(c, 2, -3, 2, 3, c.pal.accent);
    R(c, w - 5, -2, 3, 2, '#e8e2d0');
  },
  nightstand(c) {
    const { w, h, main, pal } = c;
    R(c, 0, h - 6, w, 6, main);
    R(c, 0, h - 6, w, 1, shade(main, 0.2));
    R(c, 1, h - 4, w - 2, 1, shade(main, -0.2));
    R(c, w / 2 - 1, h - 8, 1, 2, '#888');
    R(c, w / 2 - 2, h - 9, 4, 2, pal.accent);
  },
  plant(c) {
    const { w, h, rng } = c;
    const pot = '#b8653a';
    R(c, 1, h - 5, w - 2, 5, pot);
    R(c, 0, h - 5, w, 1, shade(pot, 0.15));
    const greens = ['#4f8a55', '#6aa35a', '#3d7a43'];
    for (let i = 0; i < 14; i++) R(c, rng.int(0, w - 2), rng.int(0, h - 6), 2, 2, rng.pick(greens));
    R(c, w / 2 - 1, h - 9, 1, 4, '#3d7a43');
  },
  plant_big(c) {
    const { w, h, rng } = c;
    R(c, 2, h - 6, w - 4, 6, '#8a5a3a');
    R(c, 1, h - 6, w - 2, 1, '#a8704a');
    R(c, w / 2 - 1, 6, 1, h - 12, '#5b4030');
    const greens = ['#3f7d47', '#56995a', '#2f6a3a', '#6aa35a'];
    for (let i = 0; i < 28; i++) R(c, rng.int(0, w - 3), rng.int(0, h - 10), rng.int(2, 3), 2, rng.pick(greens));
  },
  window_plants(c) {
    const { w, h, pal, rng } = c;
    for (let x = 1; x < w - 3; x += 5) {
      R(c, x, h - 3, 4, 3, '#b8653a');
      R(c, x, h - 6, 4, 3, '#4f8a55');
      if (rng.chance(0.7)) R(c, x + 1, h - 6, 2, 1, mix(pal.accent, '#b06ad0', 0.6));
    }
  },
  floor_lamp(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, 1, shade(main, 0.2));
    R(c, 0, 1, w, 5, main);
    R(c, 1, 6, w - 2, 1, '#ffe7a8');
    R(c, Math.floor(w / 2), 6, 1, h - 7, '#555');
    R(c, 1, h - 1, w - 2, 1, '#444');
  },
  table_lamp(c) {
    // настольная лампа: абажур, ножка, подставка
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, 1, shade(main, 0.2));
    R(c, 0, 1, w, 3, main);
    R(c, 0, 4, w, 1, '#ffe7a8');
    R(c, Math.floor(w / 2), 4, 1, h - 5, '#6a5a4a');
    R(c, 1, h - 1, w - 2, 1, '#5a4a3a');
  },
  rug(c) {
    const { w, h, main, pal } = c;
    R(c, 0, 0, w, h, main);
    for (let x = 1; x < w; x += 3) R(c, x, 0, 1, 1, pal.accent);
    R(c, 0, h - 1, w, 1, shade(main, -0.3));
  },
  wall_carpet(c) {
    const { w, h, main, pal } = c;
    R(c, 0, 0, w, h, shade(main, -0.25));
    R(c, 1, 1, w - 2, h - 2, main);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d % 4 === 0) R(c, x, y, 1, 1, pal.accent);
        else if (d % 4 === 2) R(c, x, y, 1, 1, shade(main, -0.35));
      }
    }
    for (let x = 0; x < w; x += 2) {
      R(c, x, h, 1, 1, shade(main, 0.3));
    }
  },
  picture(c) {
    const { w, h, main, pal } = c;
    R(c, 0, 0, w, h, shade(pal.wood, -0.1));
    R(c, 1, 1, w - 2, h - 2, '#9cc8e6');
    R(c, 1, h - 4, w - 2, 3, mix(main, '#5f9e6e', 0.6));
    R(c, 3, h - 5, 4, 1, mix(main, '#5f9e6e', 0.4));
    R(c, w - 4, 2, 2, 2, '#f2d16b');
  },
  poster(c) {
    const { w, h, main, rng } = c;
    R(c, 0, 0, w, h, '#efe6d0');
    R(c, 1, 1, w - 2, h - 5, main);
    R(c, 2, 3, w - 4, 3, shade(main, 0.35));
    R(c, rng.int(2, w - 4), 2, 2, 2, '#f3f1ea');
    R(c, 1, h - 3, w - 2, 1, '#555');
  },
  wall_clock(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, h, main);
    R(c, 0, 1, w, h - 2, main);
    R(c, 1, 1, w - 2, h - 2, '#f3f1ea');
    R(c, 3, 2, 1, 2, '#222');
    R(c, 3, 3, 2, 1, '#222');
  },
  toilet(c) {
    const { w, h, main } = c;
    // чугунный бачок под потолком, труба, цепочка с ручкой
    R(c, 0, 0, w, 5, '#5a7a6a');
    R(c, 0, 0, w, 1, shade('#5a7a6a', 0.2));
    R(c, w - 3, 5, 1, h - 12, '#8a8a84'); // труба
    for (let y = 5; y < 16; y += 2) R(c, 1, y, 1, 1, '#8a8a84'); // цепочка
    R(c, 0, 16, 3, 2, '#e8e6e0'); // фарфоровая ручка
    // унитаз
    R(c, 1, h - 10, w - 2, 2, '#3a3a3a'); // чёрное сиденье
    R(c, 1, h - 8, w - 2, 3, main);
    R(c, 2, h - 5, w - 4, 5, main);
    R(c, 2, h - 8, w - 4, 1, shade(main, -0.12));
    R(c, 3, h - 1, w - 6, 1, shade(main, -0.25));
  },
  gaming_desk(c) {
    // игровой стол: два монитора, системник с подсветкой, игровое кресло
    const { w, h, main } = c;
    const top = h - 12;
    R(c, 4, top, w - 4, 2, main);
    R(c, 4, top, w - 4, 1, shade(main, 0.2));
    R(c, 5, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 2, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 8, top + 2, 5, 9, '#1e2026'); // системник
    R(c, w - 7, top + 3, 3, 7, '#26303a'); // стеклянный бок
    for (const [mx, mw] of [[9, 9], [18, 9]] as const) {
      R(c, mx, 0, mw, 7, '#1e2026');
      R(c, mx + 1, 1, mw - 2, 5, DARK_SCREEN);
    }
    R(c, 17, 7, 2, top - 7, '#1e2026'); // общая стойка
    R(c, 9, top - 1, 7, 1, '#3a3e48'); // клавиатура
    R(c, 17, top - 1, 2, 1, '#3a3e48'); // мышь
    // игровое кресло
    R(c, 0, h - 14, 3, 11, '#26262c');
    R(c, 0, h - 13, 1, 6, '#c8402e');
    R(c, 0, h - 5, 7, 2, '#26262c');
    R(c, 3, h - 3, 1, 2, '#555');
    R(c, 1, h - 1, 5, 1, '#555');
  },
  laptop_desk(c) {
    // стол: ноутбук и рядом внешний монитор, кружка, лампа
    const { w, h, main } = c;
    const top = h - 12;
    R(c, 4, top, w - 4, 2, main);
    R(c, 4, top, w - 4, 1, shade(main, 0.2));
    R(c, 5, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 2, top + 2, 1, 10, shade(main, -0.25));
    R(c, w - 8, top + 2, 6, 4, shade(main, -0.1)); // ящик
    R(c, w - 6, top + 3, 2, 1, '#d6c38a');
    R(c, 12, 0, 10, 7, '#2e3138'); // монитор
    R(c, 13, 1, 8, 5, DARK_SCREEN);
    R(c, 16, 7, 2, top - 7, '#2e3138');
    R(c, 6, top - 4, 6, 4, '#b8bcc4'); // ноутбук: крышка
    R(c, 7, top - 3, 4, 2, DARK_SCREEN);
    R(c, 5, top - 1, 8, 1, '#9aa0a8');
    R(c, w - 3, top - 3, 2, 3, '#f4f2ec'); // кружка
    // стул
    R(c, 1, h - 9, 1, 7, '#3a3a42');
    R(c, 1, h - 5, 6, 1, '#3a3a42');
    R(c, 2, h - 4, 1, 4, '#3a3a42');
    R(c, 6, h - 4, 1, 4, '#3a3a42');
  },
  digital_piano(c) {
    // электропианино на X-стойке, банкетка
    const { w, h, main } = c;
    R(c, 0, 0, w, 4, main);
    R(c, 0, 0, w, 1, shade(main, 0.25));
    R(c, 2, 1, 3, 1, '#7fd0ff'); // экранчик
    R(c, 0, 4, w, 2, WHITE);
    for (let x = 1; x < w; x += 3) R(c, x, 4, 1, 1, '#111');
    R(c, 3, 6, 1, h - 6, '#2a2a30'); // стойка крест-накрест
    R(c, w - 4, 6, 1, h - 6, '#2a2a30');
    for (let i = 0; i < h - 7; i++) R(c, 3 + Math.round((i * (w - 7)) / (h - 7)), 6 + i, 1, 1, '#3a3a42');
    R(c, 5, h - 2, 3, 1, '#555'); // педаль
  },
  eguitar_amp(c) {
    // комбоусилитель с ручками
    const { h } = c;
    R(c, 0, h - 8, 8, 8, '#26262c');
    R(c, 1, h - 6, 6, 5, '#3a3a42');
    for (let y = h - 6; y < h - 1; y += 2) R(c, 1, y, 6, 1, '#2e2e34');
    R(c, 1, h - 8, 6, 1, '#c8b070');
    R(c, 2, h - 8, 1, 1, '#1a1a1a');
    R(c, 4, h - 8, 1, 1, '#1a1a1a');
    R(c, 9, h - 4, 3, 4, '#2a2a30'); // стойка для гитары (гитару рисует рендер)
  },
  couple_photo(c) {
    // совместное фото в рамке (кто на нём — дорисовывает рендер по жильцам квартиры)
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, '#b8d8e8');
    R(c, 1, h - 4, w - 2, 3, '#7aa86a');
  },
  chessboard(c) {
    const { w, h } = c;
    R(c, 0, h - 1, w, 1, '#6b4a2a');
    for (let x = 0; x < w; x++) R(c, x, h - 1, 1, 1, x % 2 ? '#e8dcc0' : '#4a3020');
    R(c, 1, h - 3, 1, 2, WHITE);
    R(c, 3, h - 2, 1, 1, WHITE);
    R(c, w - 2, h - 3, 1, 2, '#1e1e22');
    R(c, w - 4, h - 2, 1, 1, '#1e1e22');
  },
  shower(c) {
    // душевая кабина: лейка, плитка; матовое стекло — спереди (слой front)
    const { w, h } = c;
    R(c, 1, 2, 1, 6, '#b8bcc4');
    R(c, 1, 2, 4, 1, '#b8bcc4');
    R(c, 4, 3, 3, 1, '#d8dce4'); // лейка
    R(c, 0, h - 2, w, 2, '#e8ecef'); // поддон
    c.g.globalAlpha = 0.45;
    R(c, 0, 0, w, h - 2, '#dfeff6');
    c.g.globalAlpha = 1;
    R(c, 0, 0, w, 1, '#9aa4ad');
    R(c, 0, 0, 1, h - 2, '#9aa4ad');
    R(c, w - 1, 0, 1, h - 2, '#9aa4ad');
    R(c, w - 3, h / 2, 1, 3, '#9aa4ad'); // ручка
  },
  pullup_bar(c) {
    const { w } = c;
    R(c, 0, 0, 2, 3, '#555');
    R(c, w - 2, 0, 2, 3, '#555');
    R(c, 0, 1, w, 1, '#b8bcc4');
  },
  wc_shelf(c) {
    const { w, main } = c;
    R(c, 0, 6, w, 1, main);
    R(c, 1, 2, 3, 4, '#d8d0b8'); // газеты
    R(c, 1, 3, 3, 1, '#8a8478');
    R(c, 5, 1, 2, 5, '#e8c040'); // освежитель
    R(c, 5, 0, 2, 1, '#c8402e');
    R(c, 2, 8, 4, 3, '#f4f2ec'); // рулон на гвоздике
    R(c, 3, 8, 2, 1, '#c8c2b0');
  },
  wall_shelf(c) {
    const { w, h, main, pal, rng } = c;
    R(c, 0, h - 2, w, 2, main);
    let x = 1;
    while (x < w - 2) {
      const kind = rng.int(0, 3);
      if (kind === 0) R(c, x, h - 6, 2, 4, rng.pick(BOOK_COLORS));
      else if (kind === 1) R(c, x, h - 4, 3, 2, pal.accent);
      else if (kind === 2) R(c, x, h - 5, 2, 3, '#e8e2d0');
      x += 3;
    }
  },
  piano(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h - 2, main);
    R(c, 0, 0, w, 1, shade(main, 0.25));
    R(c, 2, 2, w - 4, 6, shade(main, -0.2));
    R(c, 0, 9, w, 2, WHITE); // клавиши
    for (let x = 1; x < w; x += 3) R(c, x, 9, 1, 1, '#111');
    R(c, 1, h - 2, 2, 2, main);
    R(c, w - 3, h - 2, 2, 2, main);
    R(c, 4, -3, 3, 3, '#e8e2d0'); // ноты
  },
  guitar(c) {
    const { h, main } = c;
    R(c, 3, 0, 1, 7, '#3a2a1a');
    R(c, 2, 0, 3, 1, '#3a2a1a');
    R(c, 1, 6, 5, 4, main);
    R(c, 0, 9, 7, 5, main);
    R(c, 3, 10, 1, 1, '#2a1a10');
    R(c, 1, 14, 5, 1, '#555');
    R(c, 3, 15, 1, 1, '#555');
    R(c, 0, h - 1, 7, 1, '#444');
  },
  bathtub(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h - 2, main);
    R(c, 0, 0, w, 1, '#ffffff');
    R(c, 1, 1, w - 2, 2, '#9fd3ef');
    R(c, 0, h - 3, w, 1, shade(main, -0.12));
    R(c, 2, h - 2, 2, 2, '#c9b46a');
    R(c, w - 4, h - 2, 2, 2, '#c9b46a');
    R(c, w - 3, -5, 1, 5, '#9aa4ad');
    R(c, w - 6, -5, 3, 1, '#9aa4ad');
  },
  washbasin(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, 9, '#c9e7f2'); // зеркало
    R(c, 0, 0, w, 1, '#9aa4ad');
    R(c, 2, 1, 1, 3, '#ffffff');
    R(c, 0, 12, w, 3, main);
    R(c, w / 2, 10, 1, 2, '#9aa4ad');
    R(c, w / 2 - 1, 15, 3, h - 15, shade(main, -0.08));
  },
  washing_machine(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 0, 0, w, 2, shade(main, -0.12));
    R(c, w - 3, 0, 2, 1, '#5fa0d0');
    R(c, 3, 4, 6, 6, '#7f8a95');
    R(c, 4, 5, 4, 4, '#a9d4ec');
    R(c, 0, h - 1, w, 1, '#555');
  },
  coat_rack(c) {
    const { w, h, pal } = c;
    R(c, w / 2, 1, 1, h - 2, pal.wood);
    R(c, 1, 2, w - 2, 1, pal.wood);
    R(c, 1, h - 1, w - 2, 1, pal.wood);
    R(c, 0, 3, 3, 10, pal.textile);
    R(c, w - 3, 3, 3, 8, shade(pal.accent, -0.2));
    R(c, w / 2 - 1, 0, 3, 1, '#3d3a36');
  },
  shoe_rack(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 1, main);
    R(c, 0, h - 1, w, 1, main);
    R(c, 0, 0, 1, h, main);
    R(c, w - 1, 0, 1, h, main);
    R(c, 2, h - 3, 3, 2, '#3a2a20');
    R(c, 6, h - 3, 3, 2, '#7a3a3a');
    R(c, 2, 1, 4, 2, '#d8d8d8');
  },
  mirror(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, '#c9e7f2');
    R(c, 2, 2, 1, h - 6, '#ffffff');
    R(c, 3, 3, 1, 2, '#ffffff');
  },
  exercise_mat(c) {
    const { w, h, main } = c;
    R(c, 0, h - 1, w, 1, main);
    R(c, w - 3, h - 2, 3, 2, shade(main, -0.2));
  },
  exercise_bike(c) {
    const { w, h, main } = c;
    R(c, 1, h - 1, w - 2, 1, main);
    R(c, 3, 3, 1, h - 3, main);
    R(c, 1, 2, 5, 2, '#222');
    R(c, 3, h - 6, w - 4, 1, main);
    R(c, w - 3, 2, 1, h - 3, main);
    R(c, w - 5, 1, 4, 1, '#222');
    R(c, 5, h - 6, 4, 4, '#555');
  },
  easel(c) {
    const { w, h, main, pal } = c;
    R(c, 2, 2, w - 4, 11, '#f3f1ea');
    R(c, 3, 4, 4, 3, pal.accent);
    R(c, 5, 8, 4, 3, '#3f6e9e');
    R(c, w / 2, 0, 1, h, main);
    R(c, 1, 13, w - 2, 1, main);
    R(c, 1, h - 6, 1, 6, main);
    R(c, w - 2, h - 6, 1, 6, main);
  },
  sewing_table(c) {
    const { w, h, main } = c;
    R(c, 0, h - 9, w, 2, main);
    R(c, 1, h - 7, 1, 7, shade(main, -0.25));
    R(c, w - 2, h - 7, 1, 7, shade(main, -0.25));
    R(c, 6, h - 14, 8, 2, '#2d2d33');
    R(c, 12, h - 14, 2, 5, '#2d2d33');
    R(c, 6, h - 12, 1, 3, '#2d2d33');
    R(c, 8, h - 13, 2, 1, '#c9a36a');
  },
  aquarium(c) {
    const { w, h, main, rng } = c;
    R(c, 0, h - 8, w, 8, main);
    R(c, 0, h - 8, w, 1, shade(main, 0.2));
    R(c, 0, 0, w, h - 8, '#6aa8c9');
    R(c, 1, 1, w - 2, h - 10, '#4f93b8');
    R(c, 1, h - 11, w - 2, 2, '#d9c48a');
    R(c, 3, h - 15, 1, 4, '#3d7a43');
    R(c, w - 4, h - 14, 1, 3, '#3d7a43');
    R(c, w - 6, h - 12, 3, 1, '#9a948a'); // камешек
    void rng; // рыбы плавают — их рисует рендер (renderer.drawAmbient)
  },
  recliner(c) {
    // кресло-реклайнер: откинутая спинка, выдвинутая подножка
    const { h, main } = c;
    const d = shade(main, -0.2);
    for (let i = 0; i < 9; i++) R(c, i < 5 ? 0 : 1, h - 14 + i, 4, 1, i % 3 ? main : d); // спинка с наклоном
    R(c, 0, h - 15, 3, 2, shade(main, 0.15)); // подголовник
    R(c, 3, h - 7, 9, 3, main); // сиденье
    R(c, 3, h - 7, 9, 1, shade(main, 0.15));
    R(c, 4, h - 9, 7, 2, d); // подлокотник
    R(c, 12, h - 6, 6, 2, main); // подножка
    R(c, 2, h - 4, 12, 3, d);
    R(c, 3, h - 1, 2, 1, '#2a2a2a');
    R(c, 12, h - 1, 2, 1, '#2a2a2a');
  },
  ashtray(c) {
    const { w } = c;
    R(c, 0, 1, w, 1, '#8a8a92');
    R(c, 1, 0, w - 2, 1, '#5a5a62');
    R(c, 1, 0, 1, 1, '#d8d4cc'); // окурок
  },
  game_console(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, 1, 1, '#4fd06a');
  },
  radio(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 0, 0, w, 1, shade(main, 0.2));
    R(c, 1, 2, 4, 4, '#3a2a1a');
    for (let y = 2; y < 6; y += 2) R(c, 1, y, 4, 1, '#6b4a2a');
    R(c, 6, 2, 3, 1, '#e8d8a0');
    R(c, 7, 4, 1, 1, '#ddd');
    R(c, w - 2, -3, 1, 3, '#999');
  },
  crib(c) {
    const { w, h, main, pal } = c;
    R(c, 0, 0, 1, h, main);
    R(c, w - 1, 0, 1, h, main);
    R(c, 0, 0, w, 1, main);
    R(c, 0, h - 5, w, 1, main);
    for (let x = 2; x < w - 1; x += 2) R(c, x, 1, 1, h - 6, shade(main, 0.15));
    R(c, 1, h - 7, w - 2, 2, pal.textile);
  },
  sideboard(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 0, 0, w, 1, shade(main, 0.2));
    R(c, 1, 2, w - 2, 15, '#bcd8e4'); // стекло
    R(c, 1, 9, w - 2, 1, main); // полка
    for (let x = 2; x < w - 2; x += 3) {
      R(c, x, 6, 2, 3, '#f4f1ea'); // чашки
      R(c, x, 14, 2, 3, x % 2 ? '#e8d8a0' : '#f4f1ea');
    }
    R(c, 3, 3, 1, 3, '#ffffff');
    if (c.style === 'soviet') {
      // хрусталь и выставленные тарелки сервиза
      R(c, 2, 11, 2, 3, '#e4f2f8');
      R(c, w - 5, 10, 3, 4, '#dfe9f0');
      R(c, w - 4, 11, 1, 1, '#ffffff');
      R(c, 5, 2, 3, 3, '#f4f1ea');
      R(c, 6, 3, 1, 1, '#c8402e');
      R(c, 1, 0, w - 2, 1, '#f4f0e4'); // салфетка сверху
      R(c, 3, -2, 2, 2, '#c8a040'); // ваза
    }
    R(c, 1, 19, w - 2, 4, shade(main, -0.12));
    R(c, 1, 24, w - 2, 4, shade(main, -0.12));
    R(c, w / 2 - 1, 20, 2, 1, '#d6c38a');
    R(c, w / 2 - 1, 25, 2, 1, '#d6c38a');
    R(c, 1, h - 1, 1, 1, OUT);
    R(c, w - 2, h - 1, 1, 1, OUT);
  },
  macrame(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 1, '#8a6a3a');
    for (let x = 1; x < w - 1; x += 2) {
      const len = h - 2 - Math.abs(x - w / 2);
      R(c, x, 1, 1, len, x % 4 === 1 ? main : '#efe6d0');
    }
  },
  bean_bag(c) {
    const { w, h, main } = c;
    R(c, 2, 0, w - 4, 2, shade(main, 0.15));
    R(c, 1, 2, w - 2, h - 3, main);
    R(c, 0, 4, w, h - 5, main);
    R(c, 3, 3, w - 7, 2, shade(main, -0.15));
    R(c, 1, h - 1, w - 2, 1, shade(main, -0.3));
  },
  // ───────── ремонт
  ladder(c) {
    const { w, h, main } = c;
    for (let y = 0; y < h; y++) {
      const k = y / h;
      R(c, Math.round(w / 2 - 1 - k * (w / 2 - 1)), y, 1, 1, main);
      R(c, Math.round(w / 2 + k * (w / 2 - 1)), y, 1, 1, shade(main, -0.2));
    }
    for (let y = 5; y < h - 2; y += 6) {
      const k = y / h;
      R(c, Math.round(w / 2 - k * (w / 2 - 1)), y, Math.max(2, Math.round(k * (w - 2))), 1, shade(main, -0.1));
    }
    R(c, w / 2 - 2, 0, 4, 1, '#d84a3a');
    R(c, w / 2 + 1, 1, 3, 2, '#f0f0f0'); // валик на верхней ступени
  },
  paint_cans(c) {
    const { h, main } = c;
    R(c, 0, 1, 6, h - 1, '#e8e8e4');
    R(c, 0, 1, 6, 2, main);
    R(c, 7, 2, 6, h - 2, '#d8d8d2');
    R(c, 7, 2, 6, 1, '#7aa0c8');
    R(c, 2, h - 3, 3, 1, main);
    R(c, 9, 0, 1, 2, '#555');
  },
  wallpaper_rolls(c) {
    const { main } = c;
    for (let i = 0; i < 3; i++) {
      const x = i * 4;
      R(c, x, 8 - 3 - (i % 2) * 3, 4, 3, shade(main, i * 0.05));
      R(c, x, 8 - 3 - (i % 2) * 3, 1, 3, shade(main, -0.2));
    }
    R(c, 1, 5, 10, 3, shade(main, 0.1));
  },
  sawhorse(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 2, main);
    R(c, 0, 0, w, 1, shade(main, 0.2));
    for (const x of [3, w - 5]) {
      R(c, x, 2, 2, 2, shade(main, -0.25));
      for (let y = 4; y < h; y++) {
        R(c, x - Math.floor((y - 4) / 3), y, 1, 1, shade(main, -0.3));
        R(c, x + 1 + Math.floor((y - 4) / 3), y, 1, 1, shade(main, -0.3));
      }
    }
    R(c, w / 2 - 3, -2, 6, 2, '#888'); // рулетка
    R(c, w - 9, -1, 4, 1, '#d84a3a');
  },
  covered_sofa(c) {
    const { w, h, main } = c;
    // силуэт дивана, затянутый плёнкой: блики по диагонали и складки снизу
    R(c, 1, 1, w - 2, h - 7, shade(main, -0.12));
    R(c, 0, h - 8, w, 6, main);
    R(c, 0, 3, 4, h - 5, main);
    R(c, w - 4, 3, 4, h - 5, main);
    c.g.fillStyle = 'rgba(228,236,242,0.55)';
    c.g.fillRect(-1, 0, w + 2, h - 1);
    for (let i = 0; i < 6; i++) R(c, 4 + i, 2 + i, 1, 1, 'rgba(255,255,255,0.85)');
    for (let i = 0; i < 5; i++) R(c, w - 12 + i, 3 + i, 1, 1, 'rgba(255,255,255,0.7)');
    for (let x = 0; x < w; x += 3) R(c, x, h - 2 + (x % 2), 2, 1, 'rgba(210,222,232,0.95)');
    R(c, w / 2 - 3, 1, 6, 2, '#c49a62'); // скотч
  },
  toolbox(c) {
    const { w, h, main } = c;
    R(c, 0, 2, w, h - 2, main);
    R(c, 0, 2, w, 1, shade(main, 0.2));
    R(c, 3, 0, w - 6, 1, '#333');
    R(c, 3, 0, 1, 2, '#333');
    R(c, w - 4, 0, 1, 2, '#333');
    R(c, w / 2 - 1, 4, 2, 1, '#ddd');
  },
  bucket(c) {
    const { w, h, main } = c;
    R(c, 0, 2, w, h - 2, main);
    R(c, 1, h - 1, w - 2, 1, shade(main, -0.2));
    R(c, 0, 2, w, 1, '#f4f4f0');
    R(c, 1, 0, w - 2, 1, '#777');
    R(c, w - 3, -3, 1, 5, '#9aa0a8'); // шпатель
    R(c, w - 5, -4, 4, 1, '#9aa0a8');
  },
  cement_bags(c) {
    const { w, h, main } = c;
    R(c, 0, 4, w, h - 4, main);
    R(c, 2, 0, w - 6, 5, shade(main, 0.05));
    R(c, 0, 4, w, 1, shade(main, -0.12));
    R(c, 4, 6, 6, 2, '#5a7aa0');
    R(c, 13, 6, 4, 2, '#5a7aa0');
  },
  work_lamp(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 2, 6, main);
    R(c, 2, 1, w - 4, 4, '#fff6c8');
    R(c, w / 2, 6, 1, h - 10, '#333');
    for (let i = 0; i < 4; i++) {
      R(c, w / 2 - i, h - 4 + i, 1, 1, '#333');
      R(c, w / 2 + i, h - 4 + i, 1, 1, '#333');
    }
  },
  boxes(c) {
    const { w, h, main } = c;
    R(c, 0, 6, w, h - 6, main);
    R(c, 3, 0, w - 7, 7, shade(main, 0.08));
    R(c, 0, 6, w, 1, shade(main, -0.2));
    R(c, w / 2, 6, 1, h - 6, '#e8d8a0');
    R(c, 3, 3, w - 7, 1, '#e8d8a0');
    R(c, 3, h - 5, 5, 2, '#333'); // надпись маркером
  },
  drop_cloth(c) {
    const { w, main } = c;
    R(c, 0, 0, w, 2, main);
    for (let x = 3; x < w; x += 7) R(c, x, 0, 2, 1, '#ffffff');
    R(c, 10, 1, 2, 1, '#9fb8d0');
    R(c, 31, 1, 3, 1, '#9fb8d0');
  },
  // ───────── консьержная
  concierge_desk(c) {
    const { w, h, main } = c;
    const top = h - 12;
    R(c, 6, top, w - 6, 2, main);
    R(c, 6, top, w - 6, 1, shade(main, 0.2));
    R(c, w - 10, top + 2, 9, 10, shade(main, -0.1));
    R(c, w - 8, top + 4, 5, 1, '#d6c38a');
    R(c, w - 8, top + 8, 5, 1, '#d6c38a');
    R(c, 7, top + 2, 1, 10, shade(main, -0.3));
    // монитор камер
    R(c, w - 14, top - 9, 11, 8, '#2e3036');
    R(c, w - 13, top - 8, 4, 3, '#5a7a6a');
    R(c, w - 8, top - 8, 4, 3, '#4a6a7a');
    R(c, w - 13, top - 4, 4, 2, '#4a6a7a');
    R(c, w - 8, top - 4, 4, 2, '#5a7a6a');
    R(c, w - 10, top - 1, 2, 1, '#2e3036');
    // журнал, телефон, лампа
    R(c, 12, top - 1, 7, 1, '#f3f1ea');
    R(c, 12, top - 2, 7, 1, '#3f6e9e');
    R(c, 21, top - 2, 4, 2, '#7a1f2b');
    R(c, 21, top - 3, 4, 1, '#5a1520');
    R(c, 9, top - 8, 1, 7, '#555');
    R(c, 8, top - 9, 4, 2, c.pal.accent);
    // стул
    R(c, 0, h - 13, 2, 9, shade(main, -0.25));
    R(c, 0, h - 5, 8, 1, shade(main, -0.25));
    R(c, 1, h - 4, 1, 4, shade(main, -0.25));
    R(c, 6, h - 4, 1, 4, shade(main, -0.25));
  },
  keys_board(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, shade(main, 0.3));
    for (let y = 2; y < h - 2; y += 4) for (let x = 2; x < w - 2; x += 3) {
      R(c, x, y, 1, 1, '#555');
      if ((x * 7 + y) % 5 !== 0) R(c, x, y + 1, 1, 2, '#d6c38a');
    }
  },
  hotplate(c) {
    const { w, h, main } = c;
    R(c, 0, h - 10, w, 2, main);
    R(c, 1, h - 8, 1, 8, shade(main, -0.25));
    R(c, w - 2, h - 8, 1, 8, shade(main, -0.25));
    R(c, 2, h - 5, w - 4, 1, shade(main, -0.15));
    R(c, 1, h - 13, 10, 3, '#e6e3da'); // плитка
    R(c, 2, h - 13, 3, 1, '#333');
    R(c, 7, h - 13, 3, 1, '#333');
    R(c, 12, h - 15, 5, 5, '#c8402e'); // чайник
    R(c, 11, h - 13, 1, 2, '#c8402e');
    R(c, 13, h - 16, 3, 1, '#333');
  },
  mini_fridge(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 7, '#d8d8d2'); // микроволновка
    R(c, 1, 1, 7, 5, '#3a3d42');
    R(c, 9, 2, 2, 1, '#5fd36a');
    R(c, 0, 7, w, h - 7, main);
    R(c, 0, 7, w, 1, shade(main, -0.1));
    R(c, w - 2, 10, 1, 4, '#9aa4ad');
    R(c, 2, 12, 3, 2, '#e8b040'); // магнит
    R(c, 0, h - 1, w, 1, '#555');
  },
  sink_small(c) {
    const { w, h, main } = c;
    R(c, 2, 0, w - 4, 8, '#c9e7f2'); // зеркальце
    R(c, 2, 0, w - 4, 1, '#9aa4ad');
    R(c, w / 2, 9, 1, 3, '#9aa4ad');
    R(c, w / 2, 9, 3, 1, '#9aa4ad');
    R(c, 0, h - 12, w, 2, '#e8e8e4');
    R(c, 2, h - 12, w - 4, 1, '#b8c0c6');
    R(c, 0, h - 10, w, 10, main);
    R(c, w / 2, h - 9, 1, 8, shade(main, -0.25));
    R(c, 1, h - 1, w - 2, 1, shade(main, -0.35));
    R(c, w - 3, h - 15, 2, 3, '#f0c040'); // губка
  },
  cot(c) {
    const { w, h, main, pal } = c;
    R(c, 0, h - 6, w, 3, pal.wood);
    R(c, 0, h - 9, w, 4, main);
    R(c, 0, h - 9, w, 1, shade(main, 0.2));
    for (let x = 2; x < w - 2; x += 4) R(c, x, h - 8, 2, 2, shade(main, -0.15)); // клетчатый плед
    R(c, w - 7, h - 11, 6, 2, '#fbfaf5');
    R(c, 1, h - 3, 1, 3, shade(pal.wood, -0.3));
    R(c, w - 2, h - 3, 1, 3, shade(pal.wood, -0.3));
  },
  heater(c) {
    const { w, h, main } = c;
    for (let x = 0; x < w; x += 2) R(c, x, 1, 1, h - 3, x % 4 ? main : shade(main, -0.12));
    R(c, 0, h - 2, w, 1, '#777');
    R(c, 1, h - 1, 1, 1, '#555');
    R(c, w - 2, h - 1, 1, 1, '#555');
    R(c, w - 2, 0, 1, 2, '#d84a3a');
  },
  wall_calendar(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 3, main);
    R(c, 0, 3, w, h - 3, '#f3f1ea');
    R(c, 2, 5, w - 4, 3, '#c8402e');
    R(c, 1, 1, 1, 1, '#333');
  },
  small_tv(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h - 1, main);
    R(c, 1, 1, w - 4, h - 3, '#1c2430');
    R(c, w - 2, 2, 1, 1, '#d84a3a');
    R(c, 3, h - 1, w - 6, 1, '#444');
    R(c, 3, -3, 1, 3, '#888');
    R(c, w - 4, -2, 1, 2, '#888');
  },
  // ───────── мелочи быта
  microwave(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 5, h - 2, '#3a3d42');
    R(c, w - 3, 2, 2, 1, '#5fd36a');
    R(c, w - 3, 4, 2, 2, '#aaa');
  },
  coffee_machine(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 3, w - 2, 3, '#55575c');
    R(c, 2, 6, 3, 2, '#f3f1ea');
    R(c, w - 2, 1, 1, 1, '#d84a3a');
  },
  dish_rack(c) {
    const { w, h, main } = c;
    R(c, 0, h - 2, w, 2, main);
    for (let x = 1; x < w - 1; x += 2) R(c, x, h - 6, 1, 4, x % 4 ? '#f3f1ea' : '#cfe0ea');
  },
  spice_shelf(c) {
    const { w, h, main } = c;
    R(c, 0, h - 1, w, 1, main);
    const cols = ['#c8402e', '#e8b040', '#5f9e52', '#f3f1ea', '#7a4a2a'];
    for (let x = 1, i = 0; x < w - 2; x += 3, i++) R(c, x, h - 5, 2, 4, cols[i % cols.length]);
  },
  hanging_plant(c) {
    const { w, h, rng } = c;
    R(c, w / 2, 0, 1, 4, '#8a6a3a');
    R(c, 2, 4, w - 4, 4, '#c49a5a');
    for (let i = 0; i < 12; i++) R(c, rng.int(0, w - 2), rng.int(3, h - 1), 1, rng.int(1, 3), rng.pick(['#4f8a55', '#6aa35a', '#3d7a43']));
  },
  sconce(c) {
    const { w, h, main } = c;
    R(c, 1, 2, w - 2, h - 2, '#777');
    R(c, 0, 0, w, 3, main);
    R(c, 1, 3, w - 2, 1, '#fff2c0');
  },
  family_photos(c) {
    const { main, rng } = c;
    const frames: [number, number, number, number][] = [[0, 1, 5, 7], [6, 0, 6, 5], [13, 2, 5, 6], [6, 6, 5, 3]];
    for (const [x, y, w, h] of frames) {
      R(c, x, y, w, h, main);
      R(c, x + 1, y + 1, w - 2, h - 2, rng.pick(['#c9b8a0', '#a8b8c8', '#d8c8a8']));
      R(c, x + 2, y + 2, 1, 1, '#6a5040');
    }
  },
  umbrella_stand(c) {
    const { w, h, main } = c;
    R(c, 0, h - 7, w, 7, '#5a5a62');
    R(c, 1, 0, 1, h - 6, main);
    R(c, 0, 0, 2, 1, main);
    R(c, 3, 2, 1, h - 8, '#3a3a40');
    R(c, 3, 1, 2, 1, '#3a3a40');
  },
  laundry_rack(c) {
    const { w, h, main } = c;
    R(c, 0, 4, w, 1, '#aaa');
    R(c, 2, 5, 1, h - 5, '#aaa');
    R(c, w - 3, 5, 1, h - 5, '#aaa');
    R(c, 1, 5, 6, 7, main);
    R(c, 8, 5, 5, 5, '#f3f1ea');
    R(c, 14, 5, 5, 8, shade(main, 0.3));
    R(c, 4, 0, 1, 4, '#aaa');
  },
  ironing_board(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w - 2, 2, main);
    R(c, w - 3, 0, 3, 1, main);
    R(c, 4, 2, 1, h - 2, '#999');
    R(c, w - 7, 2, 1, h - 2, '#999');
    R(c, 3, -3, 6, 3, '#e8e8e4'); // утюг
    R(c, 3, -3, 6, 1, '#5a7aa0');
  },
  chair(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 2, main);
    R(c, 0, 0, 1, h - 6, shade(main, -0.15));
    R(c, w - 1, 0, 1, h - 6, shade(main, -0.15));
    R(c, 0, h - 7, w, 2, main);
    R(c, 0, h - 5, 1, 5, shade(main, -0.25));
    R(c, w - 1, h - 5, 1, 5, shade(main, -0.25));
  },
  stool(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, 2, main);
    R(c, 1, 2, 1, h - 2, shade(main, -0.25));
    R(c, w - 2, 2, 1, h - 2, shade(main, -0.25));
    R(c, 1, h - 3, w - 2, 1, shade(main, -0.25));
  },
  round_table(c) {
    const { w, h, main, pal } = c;
    R(c, 0, h - 11, 1, 11, shade(main, -0.15));
    R(c, 0, h - 5, 5, 1, shade(main, -0.15));
    R(c, 4, h - 4, 1, 4, shade(main, -0.15));
    R(c, w - 1, h - 11, 1, 11, shade(main, -0.15));
    R(c, w - 5, h - 5, 5, 1, shade(main, -0.15));
    R(c, w - 5, h - 4, 1, 4, shade(main, -0.15));
    R(c, 7, h - 9, w - 14, 2, main);
    R(c, 6, h - 8, w - 12, 1, pal.textile);
    R(c, w / 2 - 1, h - 7, 2, 7, shade(main, -0.25));
    R(c, w / 2 - 4, h - 1, 8, 1, shade(main, -0.25));
    R(c, w / 2 - 2, h - 12, 4, 3, pal.accent); // ваза
  },
  laptop(c) {
    const { w, h, main } = c;
    R(c, 1, 0, w - 3, h - 1, main);
    R(c, 2, 1, w - 5, h - 3, '#2a3a50');
    R(c, 0, h - 1, w, 1, shade(main, -0.2));
  },
  bookcase_tall(c) {
    // стеллаж от пола до потолка: полки битком, книги стоят и лежат поверх
    const { w, h, main, rng } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, shade(main, -0.35));
    const sh = 9;
    for (let y = 1; y + sh <= h; y += sh) {
      R(c, 0, y + sh - 1, w, 1, main);
      let x = 1;
      while (x < w - 1) {
        if (rng.chance(0.2) && x < w - 5) {
          // стопка лёжа
          for (let k = 0; k < rng.int(2, 3); k++) R(c, x, y + sh - 2 - k, 4, 1, rng.pick(BOOK_COLORS));
          x += 4;
          continue;
        }
        const bw = rng.int(1, 2);
        R(c, x, y + sh - 1 - rng.int(sh - 4, sh - 2), Math.min(bw, w - 1 - x), rng.int(sh - 4, sh - 2), rng.pick(BOOK_COLORS));
        x += bw;
      }
    }
    R(c, 0, 0, w, 1, shade(main, 0.15));
  },
  chalkboard(c) {
    // грифельная доска: формулы, список дел с галочками и нарисованный кот
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 3, '#2f3a33');
    const ch = '#d8dcd4';
    const dim = '#8a948c';
    // формула: ∫ … = …
    R(c, 3, 3, 1, 4, ch);
    R(c, 4, 3, 1, 1, ch);
    R(c, 2, 6, 1, 1, ch);
    R(c, 6, 4, 4, 1, ch);
    R(c, 11, 4, 2, 1, ch);
    R(c, 11, 6, 2, 1, ch);
    R(c, 14, 4, 3, 1, ch);
    R(c, 14, 5, 1, 1, dim);
    // ещё строчка
    R(c, 3, 9, 6, 1, dim);
    R(c, 10, 9, 1, 1, ch);
    R(c, 12, 9, 4, 1, dim);
    // список дел с галочками
    for (let i = 0; i < 3; i++) {
      R(c, 19, 3 + i * 3, 1, 1, i < 2 ? '#a8d8a0' : ch);
      R(c, 21, 3 + i * 3, w - 23 - (i % 2) * 2, 1, dim);
    }
    // кот: уши, мордочка, хвост
    R(c, 4, 12, 1, 1, ch);
    R(c, 7, 12, 1, 1, ch);
    R(c, 4, 13, 4, 3, ch);
    R(c, 5, 14, 1, 1, '#2f3a33');
    R(c, 7, 14, 1, 1, '#2f3a33');
    R(c, 8, 15, 3, 1, ch);
    R(c, 10, 14, 1, 1, ch);
    // мел и тряпка на полочке
    R(c, 1, h - 2, w - 2, 2, shade(main, 0.15));
    R(c, 5, h - 3, 2, 1, '#f4f4f0');
    R(c, w - 8, h - 3, 4, 1, '#9a8a7a');
  },
  tea_set(c) {
    // заварочный чайник и банки с разными чаями
    const { h } = c;
    R(c, 0, h - 5, 4, 4, '#f2efe4');
    R(c, 1, h - 6, 2, 1, '#f2efe4');
    R(c, 4, h - 4, 1, 1, '#f2efe4'); // носик
    R(c, 1, h - 3, 2, 1, '#3a6aa8'); // гжельская полоска
    R(c, 5, h - 6, 2, 5, '#b86a3a');
    R(c, 5, h - 7, 2, 1, '#6a4630');
    R(c, 7, h - 5, 2, 4, '#5a8a5a');
    R(c, 7, h - 6, 2, 1, '#6a4630');
    R(c, 9, h - 4, 1, 3, '#c8a050');
    R(c, 0, h - 1, 10, 1, '#8a7a6a');
  },
  geranium(c) {
    // герань в горшках: красные шапки соцветий
    const { w, h } = c;
    for (let x = 1; x < w - 3; x += 7) {
      R(c, x, h - 3, 5, 3, '#b8653a');
      R(c, x - 1, h - 6, 7, 3, '#3f7a45');
      R(c, x, h - 7, 2, 2, '#d8343a');
      R(c, x + 3, h - 8, 2, 2, '#e8484a');
      R(c, x + 2, h - 7, 1, 1, '#f07070');
    }
  },
  books_stack(c) {
    const { w, rng } = c;
    for (let y = 0; y < 6; y += 2) R(c, rng.int(0, 1), y, w - 1, 2, rng.pick(BOOK_COLORS));
  },
  floor_vase(c) {
    const { w, h, main } = c;
    R(c, 1, h - 9, w - 2, 9, main);
    R(c, 2, h - 11, w - 4, 2, shade(main, -0.15));
    for (let i = 0; i < 5; i++) R(c, 1 + i, h - 11 - (5 - Math.abs(i - 2)) * 2, 1, (5 - Math.abs(i - 2)) * 2, '#b89a6a');
    R(c, 0, 0, 2, 2, '#d8b880');
    R(c, w - 2, 1, 2, 2, '#d8b880');
  },
  bike(c) {
    const { w, h, main } = c;
    for (const cx of [5, w - 6]) {
      R(c, cx - 4, h - 9, 9, 1, '#333');
      R(c, cx - 4, h - 1, 9, 1, '#333');
      R(c, cx - 5, h - 8, 1, 7, '#333');
      R(c, cx + 5, h - 8, 1, 7, '#333');
      R(c, cx, h - 5, 1, 1, '#999');
    }
    R(c, 5, h - 6, w - 12, 1, main);
    R(c, 10, h - 11, 1, 6, main);
    R(c, 8, h - 12, 5, 1, '#222');
    R(c, w - 8, h - 13, 1, 8, main);
    R(c, w - 10, h - 14, 5, 1, '#444');
  },
  cat_bed(c) {
    const { w, h, main } = c;
    R(c, 0, 1, w, h - 1, main);
    R(c, 2, 1, w - 4, 2, shade(main, 0.25));
    R(c, 0, 0, 2, 2, main);
    R(c, w - 2, 0, 2, 2, main);
  },
  old_calendar(c) {
    const { w, h } = c;
    R(c, w / 2, -1, 1, 1, '#555'); // гвоздик
    R(c, 0, 0, w, h, '#f1ead6');
    R(c, 0, 0, w, 1, '#b8ab88');
    // зелёный дракон на картинке
    R(c, 1, 1, w - 2, 8, '#d8c8a0');
    R(c, 3, 3, 6, 3, '#3f8a4a');
    R(c, 8, 2, 2, 2, '#3f8a4a');
    R(c, 9, 2, 1, 1, '#c8402e');
    R(c, 2, 5, 2, 1, '#3f8a4a');
    R(c, 4, 6, 1, 2, '#2f6a3a');
    R(c, 7, 6, 1, 2, '#2f6a3a');
    R(c, 5, 2, 2, 1, '#e8b040'); // гребень
    // «2012» и сетка дней
    R(c, 2, 10, 8, 1, '#c8402e');
    for (let y = 12; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) R(c, x, y, 1, 1, '#8a8478');
  },
  cat_bowls(c) {
    const { main } = c;
    R(c, 0, 1, 5, 2, main);
    R(c, 1, 0, 3, 1, '#8a6a3a'); // корм
    R(c, 6, 1, 5, 2, shade(main, -0.2));
    R(c, 7, 0, 3, 1, '#9fd3ef'); // вода
  },
  cat_tray(c) {
    const { w, h, main } = c;
    R(c, 0, 1, w, h - 1, main);
    R(c, 0, 1, w, 1, shade(main, 0.2));
    R(c, 1, 2, w - 2, 1, '#d8ccb0'); // наполнитель
  },
  cat_tree(c) {
    const { w, h, main } = c;
    R(c, 0, h - 3, w, 3, main); // основание
    R(c, w / 2 - 1, 4, 3, h - 7, '#d8c8a0'); // столбик из каната
    for (let y = 5; y < h - 3; y += 2) R(c, w / 2 - 1, y, 3, 1, '#c4b088');
    R(c, 0, Math.round(h / 2) - 1, w, 2, main); // средняя полка
    R(c, 0, 0, w, 3, main); // верхняя лежанка
    R(c, 1, 0, w - 2, 1, shade(main, 0.15));
    R(c, 1, Math.round(h / 2) + 1, 2, 3, '#e85050'); // мячик на верёвочке
  },
  embroidery(c) {
    const { w, h, main } = c;
    R(c, 0, 0, w, h, main);
    R(c, 1, 1, w - 2, h - 2, '#f4efe0');
    // вышитые цветы крестиком
    for (const [x, y, col] of [[3, 3, '#c8402e'], [6, 4, '#c8402e'], [4, 6, '#3f8a4a'], [7, 7, '#e8b040'], [3, 8, '#3f8a4a']] as const) {
      R(c, x, y, 1, 1, col);
      R(c, x + 1, y + 1, 1, 1, col);
    }
  },
  embroidery_basket(c) {
    const { w, h, main } = c;
    R(c, 0, 2, w, h - 2, main);
    for (let x = 1; x < w; x += 2) R(c, x, 3, 1, h - 3, shade(main, -0.2));
    R(c, 1, 0, 3, 2, '#c8402e'); // клубки ниток
    R(c, 4, 1, 2, 1, '#3f8a4a');
    R(c, 6, -2, 4, 4, '#b8742e'); // пяльцы
    R(c, 7, -1, 2, 2, '#f4efe0');
  },
};

export const FURNITURE_DRAWERS = drawers;

/** Нарисовать экземпляр мебели в мировых координатах */
export function drawFurniture(
  g: CanvasRenderingContext2D,
  inst: FurnitureInstance,
  pal: Palette,
  style: string,
  sprite?: CanvasImageSource,
): void {
  const top = inst.y - inst.h;
  if (sprite) {
    g.save();
    if (inst.flip) {
      g.translate(inst.x + inst.w, top);
      g.scale(-1, 1);
      g.drawImage(sprite, 0, 0);
    } else g.drawImage(sprite, inst.x, top);
    g.restore();
    return;
  }
  const drawer = drawers[inst.def.draw];
  const main = inst.color ?? inst.def.color ?? pal[inst.def.paletteKey];
  const rng = new Rng([hashString(inst.uid), 0x9e3779b9, 7, 13]);
  for (let i = 0; i < 4; i++) rng.next();
  g.save();
  if (inst.flip) {
    g.translate(inst.x + inst.w, top);
    g.scale(-1, 1);
  } else g.translate(inst.x, top);
  if (drawer) drawer({ g, w: inst.w, h: inst.h, main, pal, rng, style });
  else {
    g.fillStyle = main;
    g.fillRect(0, 0, inst.w, inst.h);
  }
  g.restore();
}

/** Где у предмета экран (для «включённого» телевизора/монитора), в локальных координатах */
export function screenRect(draw: string, w: number, h: number): [number, number, number, number] | null {
  switch (draw) {
    case 'tv_stand':
      return [2, 1, w - 4, h - 12];
    case 'tv_old':
      return [3, 7, w - 8, h - 15];
    case 'computer_desk':
      return [12, 1, 9, 5];
    case 'gaming_desk':
      return [10, 1, 7, 5];
    case 'laptop_desk':
      return [13, 1, 8, 5];
    case 'small_tv':
      return [1, 1, w - 4, h - 3];
    case 'concierge_desk':
      return [w - 13, h - 20, 9, 6];
    default:
      return null;
  }
}

/** Все экраны предмета (у игрового стола — два монитора, у стола с ноутбуком — ноутбук и монитор) */
export function screenRects(draw: string, w: number, h: number): [number, number, number, number][] {
  switch (draw) {
    case 'gaming_desk':
      return [[10, 1, 7, 5], [19, 1, 7, 5]];
    case 'laptop_desk':
      return [[13, 1, 8, 5], [7, h - 12 - 3, 4, 2]];
    default: {
      const r = screenRect(draw, w, h);
      return r ? [r] : [];
    }
  }
}
