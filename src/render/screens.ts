import { hashString } from '../core/rng';
import { rect } from './pixel';

/**
 * Что показывает экран. Телевизор сам переключает каналы: новости, футбол, мультики,
 * передача о природе, прогноз погоды, концерт, сериал. Между каналами — «снег».
 * Монитор: код, браузер, игра, камеры наблюдения.
 */
export type ScreenKind = 'tv' | 'code' | 'browser' | 'game' | 'cctv' | 'work' | 'web' | 'chat';

const CHANNEL_MIN = 7; // примерно раз в 7 игровых минут кто-то щёлкает пультом
const SESSION_MIN = 45; // за компьютером программа/игра/сайт меняются примерно раз в 45 игровых минут

const CHANNEL_INDEX: Record<string, number> = { news: 0, football: 1, cartoons: 2, nature: 3, weather: 4, concert: 5, series: 6 };

/**
 * Нарисовать экран. Возвращает основной цвет картинки — им экран подсвечивает комнату в темноте.
 */
export function drawScreen(g: CanvasRenderingContext2D, kind: ScreenKind, x: number, y: number, w: number, h: number, tGame: number, nowMs: number, seed: string, channel?: string): string {
  const s = hashString(seed);
  const t = nowMs / 1000;
  const session = Math.floor((tGame / 60 + (s % 37)) / SESSION_MIN);
  const pick = <T,>(list: T[]) => list[(hashString(`${seed}:${session}`) >>> 3) % list.length];
  if (kind === 'tv' && channel === 'series') {
    // сериал: каждый вечер — свой (детектив, больница, семейный, фэнтези…)
    const day = Math.floor(tGame / 86400);
    const ep = SERIES[(hashString(`${seed}:${day}`) + Math.floor(tGame / 3600 / 2)) % SERIES.length];
    return ep(g, x, y, w, h, t);
  }
  if (kind === 'tv' && channel && CHANNEL_INDEX[channel] !== undefined) {
    // постоянный канал: новости идут всегда (иногда — прогноз погоды между выпусками)
    const k = Math.floor(tGame / 60 / 25 + (s % 7)) % 6 === 0 ? 4 : CHANNEL_INDEX[channel];
    return CHANNELS[k](g, x, y, w, h, t);
  }
  if (kind === 'tv') {
    const slot = Math.floor((tGame / 60 + (s % 11)) / CHANNEL_MIN);
    const sinceSwitch = (tGame / 60 + (s % 11)) % CHANNEL_MIN;
    if (sinceSwitch < 0.35) {
      noise(g, x, y, w, h, nowMs);
      return '#b8b8b8';
    }
    const all = [...CHANNELS, ...EXTRA_CHANNELS];
    return all[(slot * 7 + s) % all.length](g, x, y, w, h, t);
  }
  if (kind === 'cctv') return cctv(g, x, y, w, h, t);
  if (kind === 'chat') return CHAT(g, x, y, w, h, t, s);
  if (kind === 'game') return pick(GAMES)(g, x, y, w, h, t, s);
  if (kind === 'work' || kind === 'code') return (kind === 'code' ? WORK[0] : pick(WORK))(g, x, y, w, h, t, s);
  return (kind === 'browser' ? WEB[0] : pick(WEB))(g, x, y, w, h, t, s);
}

type Prog = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, s: number) => string;

// ───────────── работа
const WORK: Prog[] = [
  // код
  (g, x, y, w, h, t, s) => {
    rect(g, x, y, w, h, '#1e2430');
    const scroll = Math.floor(t * 3);
    for (let row = 0; row < h; row += 2) {
      const n = hashString(`${s}:${row + scroll}`);
      const indent = n % 3;
      const len = 2 + (n % Math.max(2, w - 3));
      rect(g, x + indent, y + row, Math.min(len, w - indent), 1, ['#7fc4f0', '#e8b040', '#9ad07a', '#d0d4dc'][n % 4]);
    }
    if (Math.floor(t * 2) % 2) rect(g, x + w - 2, y + h - 2, 1, 1, '#ffffff'); // курсор
    return '#3a5070';
  },
  // таблица: ячейки, одна заполняется
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#f4f6f2');
    rect(g, x, y, w, 1, '#2e7d4a');
    for (let yy = y + 2; yy < y + h; yy += 2) rect(g, x, yy, w, 1, '#c8d0c8');
    for (let xx = x + 2; xx < x + w; xx += 3) rect(g, xx, y + 1, 1, h - 1, '#c8d0c8');
    const c = Math.floor(t * 1.5) % Math.max(1, w - 2);
    rect(g, x + 1 + c, y + 3, 2, 1, '#2e7d4a');
    return '#e8f0e8';
  },
  // созвон: четыре окошка с лицами, говорящий подсвечен
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#202428');
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    const speak = Math.floor(t / 2.5) % 4;
    for (let i = 0; i < 4; i++) {
      const cx = x + (i % 2) * hw;
      const cy = y + Math.floor(i / 2) * hh;
      rect(g, cx, cy, hw - 1, hh, ['#4a5a6a', '#5a4a5a', '#4a5a4a', '#5a5a4a'][i]);
      rect(g, cx + Math.floor(hw / 2) - 1, cy + Math.max(0, hh - 2), 2, 2, ['#e8c0a0', '#c89070', '#f0d0b0', '#a87050'][i]);
      if (i === speak) rect(g, cx, cy + hh - 1, hw - 1, 1, '#4ae070');
    }
    return '#4a5a6a';
  },
  // документ: текст печатается
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#f8f8f4');
    rect(g, x, y, w, 1, '#3a6ab0');
    const n = Math.floor(t * 2) % (w * Math.max(1, Math.floor(h / 2)));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / (w - 2));
      const col = i % (w - 2);
      if (2 + row * 2 >= h) break;
      if ((i * 7) % 5 !== 0) rect(g, x + 1 + col, y + 2 + row * 2, 1, 1, '#555');
    }
    return '#eef0f4';
  },
  // дизайн: холст с фигурами, курсор двигает
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#2a2a30');
    rect(g, x + 1, y + 1, w - 2, h - 2, '#f0eee8');
    const k = Math.floor(t) % 3;
    rect(g, x + 2, y + 2, 2, 2, ['#e85050', '#5080e8', '#e8c040'][k]);
    rect(g, x + w - 4, y + h - 3, 2, 1, '#50b080');
    rect(g, x + 2 + (Math.floor(t * 2) % Math.max(1, w - 4)), y + Math.floor(h / 2), 1, 1, '#111');
    return '#e0dcd4';
  },
];

// ───────────── сайты, видео, соцсети
const WEB: Prog[] = [
  // браузер: статья
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#f4f4f0');
    rect(g, x, y, w, 1, '#5a7aa0');
    const page = Math.floor(t / 6);
    rect(g, x + 1, y + 2, Math.max(1, w - 4), 1, '#333');
    rect(g, x + 1, y + 3 + (page % 2), 3, 2, ['#e8b040', '#7aa05a', '#c84a5a'][page % 3]);
    rect(g, x + 5, y + 3, Math.max(1, w - 6), 1, '#999');
    return '#e8ecf0';
  },
  // видео: тёмный плеер, картинка меняется, полоска прогресса
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#101014');
    const sc = Math.floor(t / 3) % 3;
    rect(g, x + 1, y, w - 2, h - 1, ['#4a7ab0', '#b07a4a', '#6aa06a'][sc]);
    rect(g, x + 2 + (Math.floor(t) % Math.max(1, w - 5)), y + h - 3, 2, 2, '#f0d8b0');
    rect(g, x, y + h - 1, Math.floor(((t % 60) / 60) * w), 1, '#e83a3a');
    return ['#4a7ab0', '#b07a4a', '#6aa06a'][sc];
  },
  // лента: карточки ползут вверх
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#ecedf0');
    const off = Math.floor(t * 2) % 4;
    for (let yy = -off; yy < h; yy += 4) {
      if (yy + 3 <= 0) continue;
      rect(g, x + 1, y + Math.max(0, yy), w - 2, Math.min(3, h - Math.max(0, yy)), '#ffffff');
      if (yy + 1 >= 0 && yy + 1 < h) rect(g, x + 2, y + yy + 1, 2, 1, ['#e8506a', '#5080e8', '#50b080'][((yy + off) / 4 + 9) % 3 | 0]);
    }
    return '#e0e4ec';
  },
  // карта
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#e8e4d0');
    rect(g, x, y + Math.floor(h / 2), w, 1, '#f0d070');
    rect(g, x + Math.floor(w / 3), y, 1, h, '#ffffff');
    rect(g, x + w - 3, y + 1, 2, 2, '#9ad07a');
    rect(g, x + 1 + (Math.floor(t) % Math.max(1, w - 2)), y + Math.floor(h / 2) - 1, 1, 1, '#e83a3a');
    return '#e0dcc8';
  },
  // интернет-магазин: товары плиткой
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#ffffff');
    rect(g, x, y, w, 1, '#f08a3a');
    for (let i = 0; i < 4; i++) rect(g, x + 1 + (i % 2) * Math.floor(w / 2), y + 2 + Math.floor(i / 2) * 2, Math.floor(w / 2) - 2, 1, ['#c84a5a', '#4a7ac8', '#7aa05a', '#e8b040'][(i + Math.floor(t / 4)) % 4]);
    return '#f4f0ec';
  },
];

// ───────────── игры
const GAMES: Prog[] = [
  // платформер
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#2a1a4a');
    rect(g, x, y + h - 1, w, 1, '#3a8a3a');
    const px = Math.floor((t * 4) % w);
    rect(g, x + px, y + h - 3, 2, 2, '#f0c040');
    rect(g, x + ((px + 4) % w), y + 1 + (Math.floor(t * 5) % 2), 1, 1, '#e85050');
    return '#3a2a6a';
  },
  // шутер: коридор, прицел, вспышки
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#3a3428');
    rect(g, x + Math.floor(w / 2) - 2, y + 1, 4, h - 2, '#5a5040');
    const cx = x + Math.floor(w / 2);
    rect(g, cx, y + Math.floor(h / 2), 1, 1, '#ff4040');
    if (Math.floor(t * 6) % 7 === 0) rect(g, x + w - 3, y + h - 3, 2, 2, '#ffe080');
    rect(g, x + w - 3, y + h - 2, 3, 2, '#2a2a2a'); // оружие
    return Math.floor(t * 6) % 7 === 0 ? '#ffe080' : '#5a5040';
  },
  // стратегия: карта клетками, юниты ползут
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#4a7a3a');
    for (let i = 0; i < w; i += 3) rect(g, x + i, y + ((i * 7) % h), 2, 1, '#3a6a9a');
    rect(g, x + (Math.floor(t) % w), y + 1, 1, 1, '#e83a3a');
    rect(g, x + ((Math.floor(t * 0.7) + 3) % w), y + h - 2, 1, 1, '#3a6ae8');
    rect(g, x, y + h - 1, w, 1, '#1a1a1a');
    return '#4a7a3a';
  },
  // гонки: дорога, разметка бежит
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#7ab0e0');
    rect(g, x, y + 2, w, h - 2, '#4a4a50');
    const k = Math.floor(t * 8) % 3;
    for (let yy = y + 2 + k; yy < y + h; yy += 3) rect(g, x + Math.floor(w / 2), yy, 1, 1, '#f0f0f0');
    rect(g, x + Math.floor(w / 2) - 1 + Math.round(Math.sin(t * 2)), y + h - 2, 2, 2, '#e83a3a');
    return '#5a6a80';
  },
  // РПГ: тёмный лес, герой, всплывающий урон
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#1a2a1a');
    for (let i = 0; i < w; i += 3) rect(g, x + i, y + 1, 1, h - 2, '#2a4a2a');
    rect(g, x + 2, y + h - 3, 1, 2, '#e8c0a0');
    rect(g, x + w - 3, y + h - 3, 2, 2, '#9a3aa0');
    if (Math.floor(t * 3) % 4 === 0) rect(g, x + w - 3, y + 1, 1, 1, '#ffe040');
    return '#2a4a3a';
  },
];

// дискорд: тёмная колонка каналов, сообщения ползут
const CHAT: Prog = (g, x, y, w, h, t, s) => {
  rect(g, x, y, w, h, '#2e3138');
  rect(g, x, y, 2, h, '#1e2024');
  const off = Math.floor(t * 1.5);
  for (let row = 0; row < h; row += 2) {
    const n = hashString(`${s}:${row + off}`);
    rect(g, x + 3, y + row, 1, 1, ['#e8506a', '#50b0e8', '#e8c040', '#50e090'][n % 4]);
    rect(g, x + 5, y + row, Math.max(1, (n % Math.max(1, w - 6)) + 1), 1, '#c8ccd4');
  }
  return '#3a3e48';
};

function cctv(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): string {
  // камеры наблюдения: четыре серых квадрата, где иногда кто-то мелькает
  rect(g, x, y, w, h, '#2e3036');
  const hw = Math.floor(w / 2);
  const hh = Math.floor(h / 2);
  for (let i = 0; i < 4; i++) {
    const cx = x + (i % 2) * hw;
    const cy = y + Math.floor(i / 2) * hh;
    rect(g, cx, cy, hw - 1, hh - 1, i % 2 ? '#5a6a64' : '#4e5e6a');
    if (Math.floor(t / 3 + i) % 5 === 0) rect(g, cx + Math.floor((t * 2) % (hw - 1)), cy + hh - 3, 1, 2, '#2a2a2a');
  }
  return '#5a6a64';
}

type Channel = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => string;

const CHANNELS_RAW: ((g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => void)[] = [
  // новости: ведущий на синем фоне, бегущая строка
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#2a4a8a');
    const cx = x + Math.floor(w / 2) - 1;
    rect(g, cx - 1, y + h - 4, 4, 3, '#2a2a34');
    rect(g, cx, y + Math.max(1, h - 6), 2, 2, '#e8c0a0');
    rect(g, cx, y + Math.max(0, h - 7), 2, 1, '#3a2a20');
    rect(g, x, y + h - 1, w, 1, '#c83a3a');
    rect(g, x + Math.floor((t * 6) % w), y + h - 1, 2, 1, '#ffffff');
  },
  // футбол
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#3a8a3a');
    rect(g, x + Math.floor(w / 2), y, 1, h, '#bfe0bf');
    const bx = Math.floor((Math.sin(t * 0.9) * 0.5 + 0.5) * (w - 1));
    rect(g, x + bx, y + Math.floor(h / 2), 1, 1, '#ffffff');
    rect(g, x + ((bx + 2) % w), y + 1, 1, 1, '#e83a3a');
    rect(g, x + ((bx + w - 3) % w), y + h - 2, 1, 1, '#3a6ae8');
  },
  // мультики
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#f0d040');
    const bx = Math.floor((t * 5) % Math.max(1, w - 2));
    const by = Math.floor(Math.abs(Math.sin(t * 3)) * Math.max(1, h - 3));
    rect(g, x + bx, y + h - 2 - by, 2, 2, '#e8506a');
    rect(g, x, y + h - 1, w, 1, '#5aa0e8');
  },
  // природа
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, Math.ceil(h / 2), '#8fc8f0');
    rect(g, x, y + Math.ceil(h / 2), w, Math.floor(h / 2), '#5a9a4a');
    rect(g, x + w - 2, y, 1, 1, '#ffe080');
    rect(g, x + Math.floor((t * 2) % w), y + 1, 1, 1, '#333');
  },
  // прогноз погоды
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#4a8ac8');
    rect(g, x + 1, y + 1, Math.max(1, w - 3), Math.max(1, h - 2), '#7ab060');
    rect(g, x + 2 + (Math.floor(t / 2) % 2), y + 1, 2, 1, '#f4f4f4');
    rect(g, x + Math.max(1, w - 3), y + 1, 1, 1, '#ffd040');
  },
  // концерт
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#1a1428');
    const k = Math.floor(t * 4);
    for (let i = 0; i < w; i += 3) rect(g, x + i, y, 1, h - 1, ['#e850a0', '#50a0e8', '#e8d050'][(i + k) % 3]);
    rect(g, x + Math.floor(w / 2), y + h - 3, 1, 2, '#f0f0f0');
  },
  // сериал: двое в комнате
  (g, x, y, w, h, t) => {
    rect(g, x, y, w, h, '#a87a5a');
    rect(g, x, y + h - 1, w, 1, '#6a4a3a');
    const k = Math.floor(t / 2) % 2;
    rect(g, x + 1, y + h - 4, 2, 3, '#3a3a5a');
    rect(g, x + 1, y + h - 5 - k, 2, 1, '#e8c0a0');
    rect(g, x + w - 3, y + h - 4, 2, 3, '#7a2a3a');
    rect(g, x + w - 3, y + h - 5 - (1 - k), 2, 1, '#e8c0a0');
  },
];

/** Цвет, которым канал подсвечивает комнату */
const CHANNEL_GLOW = ['#2a4a8a', '#3a8a3a', '#f0d040', '#6aa8c8', '#4a8ac8', '#7a3aa0', '#a87a5a'];
const CHANNELS: Channel[] = CHANNELS_RAW.map((f, i) => (g, x, y, w, h, t) => {
  f(g, x, y, w, h, t);
  return CHANNEL_GLOW[i];
});

/** Ещё каналы: кулинарное шоу, викторина, космос, старое кино, клипы */
const EXTRA_CHANNELS: Channel[] = [
  (g, x, y, w, h, t) => {
    // кулинарное шоу: повар у плиты, пар
    rect(g, x, y, w, h, '#e8d8b8');
    rect(g, x, y + h - 2, w, 2, '#8a5a3a');
    rect(g, x + 2, y + h - 5, 2, 3, '#f4f4f4');
    rect(g, x + 2, y + h - 6, 2, 1, '#f4f4f4');
    if (Math.floor(t * 3) % 2) rect(g, x + w - 3, y + 1, 1, 1, '#ffffff');
    rect(g, x + w - 4, y + h - 3, 3, 1, '#3a3a3a');
    return '#e8d8b8';
  },
  (g, x, y, w, h, t) => {
    // викторина: яркая студия, мигающие табло
    rect(g, x, y, w, h, '#3a1a6a');
    for (let i = 0; i < 3; i++) rect(g, x + 1 + i * Math.floor(w / 3), y + h - 3, Math.floor(w / 3) - 1, 2, Math.floor(t * 2 + i) % 3 === 0 ? '#ffd040' : '#5a3aa0');
    rect(g, x + Math.floor(w / 2), y + 1, 1, 1, '#ffffff');
    return '#5a3aa0';
  },
  (g, x, y, w, h, t) => {
    // документальный про космос: звёзды, планета плывёт
    rect(g, x, y, w, h, '#0a0a1a');
    for (let i = 0; i < 4; i++) rect(g, x + ((i * 5 + 2) % w), y + ((i * 3) % h), 1, 1, '#d0d0e0');
    rect(g, x + (Math.floor(t * 0.7) % (w + 3)) - 2, y + Math.floor(h / 2) - 1, 3, 3, '#d08a4a');
    return '#1a1a3a';
  },
  (g, x, y, w, h, t) => {
    // старое чёрно-белое кино с рябью
    rect(g, x, y, w, h, '#8a8a8a');
    rect(g, x + 1, y + h - 4, 2, 3, '#2a2a2a');
    rect(g, x + w - 3, y + h - 4, 2, 3, '#4a4a4a');
    if (Math.floor(t * 8) % 3 === 0) rect(g, x + (Math.floor(t * 13) % w), y, 1, h, '#c8c8c8');
    return '#9a9a9a';
  },
  (g, x, y, w, h, t) => {
    // музыкальный клип: цветные вспышки
    const c = ['#e850a0', '#50e0e8', '#e8e050', '#8050e8'][Math.floor(t * 3) % 4];
    rect(g, x, y, w, h, c);
    rect(g, x + Math.floor(w / 2) - 1, y + h - 4, 2, 3, '#1a1a1a');
    return c;
  },
];

/** Сериалы: каждый вечер свой */
const SERIES: Channel[] = [
  CHANNELS[6],
  (g, x, y, w, h, t) => {
    // детектив: ночная улица, фары, фигура в плаще
    rect(g, x, y, w, h, '#1a2030');
    rect(g, x, y + h - 1, w, 1, '#3a3a40');
    rect(g, x + 1, y + 1, 2, h - 2, '#2a3040');
    if (Math.floor(t / 2) % 3 !== 0) rect(g, x + w - 2, y + h - 2, 1, 1, '#ffe080');
    rect(g, x + Math.floor(w / 2), y + h - 4, 1, 3, '#7a6a4a');
    return '#2a3a5a';
  },
  (g, x, y, w, h, t) => {
    // больница: белые стены, врачи в синем
    rect(g, x, y, w, h, '#e8f0f4');
    rect(g, x + 1, y + h - 4, 2, 3, '#3a7ab0');
    rect(g, x + w - 3, y + h - 4, 2, 3, '#3a7ab0');
    rect(g, x + 1, y + h - 5, 2, 1, '#e8c0a0');
    rect(g, x + w - 3, y + h - 5 - (Math.floor(t / 2) % 2), 2, 1, '#e8c0a0');
    return '#d8e8f0';
  },
  (g, x, y, w, h, t) => {
    // фэнтези: замок, факелы
    rect(g, x, y, w, h, '#2a2440');
    rect(g, x + 1, y + 2, w - 2, h - 2, '#5a5468');
    rect(g, x + 2, y + 1, 1, 1, '#5a5468');
    rect(g, x + w - 3, y + 1, 1, 1, '#5a5468');
    rect(g, x + Math.floor(w / 2), y + 3, 1, 1, Math.floor(t * 5) % 2 ? '#ffa040' : '#ff6020');
    return '#4a3a50';
  },
];

function noise(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, nowMs: number): void {
  const k = Math.floor(nowMs / 60);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const n = hashString(`${xx},${yy},${k}`) % 3;
      rect(g, x + xx, y + yy, 1, 1, n === 0 ? '#e8e8e8' : n === 1 ? '#888' : '#444');
    }
}
