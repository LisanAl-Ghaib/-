import { hashString } from '../core/rng';
import { rect } from './pixel';

/**
 * Что показывает экран. Телевизор сам переключает каналы: новости, футбол, мультики,
 * передача о природе, прогноз погоды, концерт, сериал. Между каналами — «снег».
 * Монитор: код, браузер, игра, камеры наблюдения.
 */
export type ScreenKind = 'tv' | 'code' | 'browser' | 'game' | 'cctv';

const CHANNEL_MIN = 7; // примерно раз в 7 игровых минут кто-то щёлкает пультом

export function drawScreen(g: CanvasRenderingContext2D, kind: ScreenKind, x: number, y: number, w: number, h: number, tGame: number, nowMs: number, seed: string): void {
  const s = hashString(seed);
  const t = nowMs / 1000;
  if (kind === 'tv') {
    const slot = Math.floor((tGame / 60 + (s % 11)) / CHANNEL_MIN);
    const sinceSwitch = (tGame / 60 + (s % 11)) % CHANNEL_MIN;
    if (sinceSwitch < 0.35) return noise(g, x, y, w, h, nowMs);
    const ch = (slot * 7 + s) % 7;
    return CHANNELS[ch](g, x, y, w, h, t);
  }
  if (kind === 'code') {
    rect(g, x, y, w, h, '#1e2430');
    const scroll = Math.floor(t * 3);
    for (let row = 0; row < h; row += 2) {
      const n = hashString(`${seed}:${row + scroll}`);
      const indent = n % 3;
      const len = 2 + (n % Math.max(2, w - 3));
      rect(g, x + indent, y + row, Math.min(len, w - indent), 1, ['#7fc4f0', '#e8b040', '#9ad07a', '#d0d4dc'][n % 4]);
    }
    if (Math.floor(t * 2) % 2) rect(g, x + w - 2, y + h - 2, 1, 1, '#ffffff'); // курсор
    return;
  }
  if (kind === 'browser') {
    rect(g, x, y, w, h, '#f4f4f0');
    rect(g, x, y, w, 1, '#5a7aa0');
    const page = Math.floor(t / 6);
    rect(g, x + 1, y + 2, Math.max(1, w - 4), 1, '#333');
    rect(g, x + 1, y + 3 + (page % 2), 3, 2, ['#e8b040', '#7aa05a', '#c84a5a'][page % 3]);
    rect(g, x + 5, y + 3, Math.max(1, w - 6), 1, '#999');
    return;
  }
  if (kind === 'game') {
    rect(g, x, y, w, h, '#2a1a4a');
    rect(g, x, y + h - 1, w, 1, '#3a8a3a');
    const px = Math.floor((t * 4) % w);
    rect(g, x + px, y + h - 3, 2, 2, '#f0c040');
    rect(g, x + ((px + 4) % w), y + 1 + (Math.floor(t * 5) % 2), 1, 1, '#e85050');
    return;
  }
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
}

type Channel = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => void;

const CHANNELS: Channel[] = [
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

function noise(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, nowMs: number): void {
  const k = Math.floor(nowMs / 60);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const n = hashString(`${xx},${yy},${k}`) % 3;
      rect(g, x + xx, y + yy, 1, 1, n === 0 ? '#e8e8e8' : n === 1 ? '#888' : '#444');
    }
}
