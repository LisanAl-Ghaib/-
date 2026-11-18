import { calendar, hhmm } from '../core/time';
import type { ResidentDef } from '../data/schemas';
import { observedLabel } from './observe';
import { publicSpot } from '../sim/social/encounters';
import { el } from './dom';
import { portrait } from './portrait';
import type { UiHost } from './ui';

/**
 * Карточка жильца — только то, что видно со стороны: как зовут, где живёт, что делает,
 * где сейчас и что с ним на твоих глазах случалось. Описание (история, характер, работа,
 * привычки) живёт в данных и управляет поведением, но в интерфейсе его нет:
 * характер узнаётся по поступкам.
 */
function looksAge(n: number): string {
  if (n < 7) return 'малыш';
  if (n < 14) return 'школьник';
  if (n < 20) return 'подросток';
  const r = Math.round(n / 5) * 5;
  return `на вид лет ${r}`;
}

/** Где сейчас жилец — словами */
function whereNow(host: UiHost, id: string): string {
  const r = host.sim.state.residents[id];
  const def = host.defs.residentById.get(id)!;
  if (!r) return '';
  if (r.away) return 'Нет дома';
  const L = host.defs.layout;
  const apt = L.apartmentAt(r.level, r.x);
  if (apt) {
    if (apt.id === def.apartment) return `Дома, ${L.roomAt(apt, r.x).name}`;
    const hostRes = host.defs.residents.find((d) => d.apartment === apt.id);
    return hostRes ? `В гостях (${apt.level === 0 ? 'у консьержки' : `кв. ${apt.number}`})` : 'В чужой квартире';
  }
  const spot = publicSpot(host.sim, r);
  if (spot) return spot.phrase.replace(/^./, (c) => c.toUpperCase());
  return r.level === 0 ? 'На первом этаже' : 'В подъезде';
}

export function renderResidentCard(box: HTMLElement, host: UiHost, id: string): void {
  const def = host.defs.residentById.get(id);
  if (!def) return;
  const apt = host.defs.layout.aptById.get(def.apartment)!;
  const fullName = [def.name.first, def.name.patronymic, def.name.last].filter(Boolean).join(' ');
  const family = familyLine(host, def);
  box.innerHTML = '';
  box.append(
    el('div', { class: 'card' },
      portrait(def, 84),
      el('h2', {}, fullName),
      el('div', { class: 'sub' }, looksAge(host.sim.age(def))),
      el('div', { class: 'sub' }, `живёт: ${apt.level === 0 ? 'комната при дежурке' : `кв. ${apt.number}`}, ${apt.level + 1} этаж`),
      family ? el('div', { class: 'sub' }, family) : null,
      el('div', { style: 'display:flex;gap:4px;margin:6px 0' },
        el('button', { onclick: () => host.select(id, { focus: true }) }, '◎ Следить'),
        el('button', { onclick: () => host.focusApartment(def.apartment) }, '⌂ Квартира'),
      ),
      el('div', { class: 'now' }, el('div', { 'data-k': 'now' }, '…'), el('div', { class: 'moodlet', 'data-k': 'where' }, '')),
      el('h3', {}, 'Что я замечал'),
      el('div', { 'data-k': 'recent' }),
    ),
  );
  updateResidentCard(box, host, id, true);
}

/** С кем живёт — это видно; кем они друг другу приходятся — нет */
function familyLine(host: UiHost, def: ResidentDef): string {
  const others = host.defs.residents.filter((d) => d.apartment === def.apartment && d.id !== def.id).map((d) => d.name.short ?? d.name.first);
  return others.length ? `живёт вместе с: ${others.join(', ')}` : '';
}

let recentStamp = 0;

export function updateResidentCard(box: HTMLElement, host: UiHost, id: string, full = false): void {
  const r = host.sim.state.residents[id];
  const def = host.defs.residentById.get(id);
  if (!r || !def) return;
  const q = (k: string) => box.querySelector<HTMLElement>(`[data-k="${k}"]`);
  const now = q('now');
  if (now) {
    now.textContent = `Сейчас: ${observedLabel(r)}`;
  }
  const where = q('where');
  if (where) where.textContent = whereNow(host, id);
  if (!full && performance.now() - recentStamp < 2000) return;
  recentStamp = performance.now();
  const recent = q('recent');
  if (recent) {
    recent.innerHTML = '';
    const entries = host.sim.state.chronicle.filter((e) => e.actors.includes(id) && e.importance >= 2).slice(-8).reverse();
    if (!entries.length) recent.append(el('div', { class: 'empty' }, 'Пока ничего примечательного.'));
    for (const e of entries) {
      const c = calendar(host.defs.epochMs, e.t);
      recent.append(el('div', { class: 'chron-entry' }, el('span', { class: 't' }, `${c.day}.${String(c.month).padStart(2, '0')} ${hhmm(c.minuteOfDay)}`), e.text));
    }
  }
}
