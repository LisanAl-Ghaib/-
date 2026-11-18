import { calendar, hhmm } from '../core/time';
import type { ResidentDef } from '../data/schemas';
import { FAMILY_KINDS } from '../data/defs';
import { RELATION_WORDS } from '../sim/social/relations';
import { publicSpot } from '../sim/social/encounters';
import { el } from './dom';
import { portrait } from './portrait';
import type { UiHost } from './ui';

/**
 * Карточка жильца — только то, что видно со стороны: кто это, что сейчас делает,
 * где находится, что с ним случалось. Потребности, характер и настроение
 * у жильца есть, но в интерфейсе их нет: о них можно догадаться по поведению.
 */
const OCCUPATION: Record<string, string> = {
  office: 'работает в офисе', shift: 'работает сменами', remote: 'работает из дома', freelance: 'работает на себя',
  student: 'учится', school: 'ходит в школу', retired: 'на пенсии', unemployed: 'без работы', homemaker: 'ведёт хозяйство',
  onsite: 'работает здесь, в доме',
};

function years(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет';
  return `${n} ${w}`;
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
      el('div', { class: 'sub' }, `${years(host.sim.age(def))} · ${def.occupation.title}`),
      el('div', { class: 'sub' }, `${apt.level === 0 ? 'комната консьержки' : `кв. ${apt.number}`}, ${apt.level + 1} этаж · ${OCCUPATION[def.occupation.kind]}${def.occupation.workplace && def.occupation.kind !== 'onsite' ? ` — ${def.occupation.workplace}` : ''}`),
      family ? el('div', { class: 'sub' }, family) : null,
      el('div', { style: 'display:flex;gap:4px;margin:6px 0' },
        el('button', { onclick: () => host.select(id, { focus: true }) }, '◎ Следить'),
        el('button', { onclick: () => host.focusApartment(def.apartment) }, '⌂ Квартира'),
      ),
      el('div', { class: 'now' }, el('div', { 'data-k': 'now' }, '…'), el('div', { class: 'moodlet', 'data-k': 'where' }, '')),
      el('h3', {}, 'История'),
      el('p', {}, def.backstory || '—'),
      el('h3', {}, 'Что с ним было недавно'.replace('ним', def.gender === 'f' ? 'ней' : 'ним')),
      el('div', { 'data-k': 'recent' }),
    ),
  );
  updateResidentCard(box, host, id, true);
}

function familyLine(host: UiHost, def: ResidentDef): string {
  const parts = def.relationships
    .filter((r) => FAMILY_KINDS.has(r.kind))
    .map((r) => {
      const o = host.defs.residentById.get(r.with);
      if (!o) return '';
      return `${RELATION_WORDS[r.kind]?.[o.gender] ?? r.kind} — ${o.name.short ?? o.name.first}`;
    })
    .filter(Boolean);
  return parts.length ? `Семья: ${parts.join(', ')}` : '';
}

let recentStamp = 0;

export function updateResidentCard(box: HTMLElement, host: UiHost, id: string, full = false): void {
  const r = host.sim.state.residents[id];
  const def = host.defs.residentById.get(id);
  if (!r || !def) return;
  const q = (k: string) => box.querySelector<HTMLElement>(`[data-k="${k}"]`);
  const now = q('now');
  if (now) {
    const sick = r.sick && r.sick.until > host.sim.time ? (def.gender === 'f' ? ' · приболела' : ' · приболел') : '';
    now.textContent = `Сейчас: ${r.action?.label ?? 'думает, чем заняться'}${sick}`;
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
