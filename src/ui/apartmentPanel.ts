import { el } from './dom';
import { portrait } from './portrait';
import type { UiHost } from './ui';

const STYLE: Record<string, string> = {
  soviet: 'советская классика', scandi: 'скандинавский', loft: 'лофт', boho: 'бохо', classic: 'классика',
  minimal: 'минимализм', student: 'студенческая', cozy: 'уютная', retro: 'ретро',
};
const WALLPAPER: Record<string, string> = {
  plain: 'однотонные стены', stripes: 'обои в полоску', dots: 'обои в горошек', diamonds: 'обои с ромбами', brick: 'кирпич',
  tiles: 'плитка', damask: 'обои с вензелями', panels: 'панели', flowers: 'обои в цветочек',
};
const FLOOR: Record<string, string> = {
  parquet: 'паркет', boards: 'доски', linoleum: 'линолеум', tiles: 'плитка', carpet: 'ковролин', concrete: 'бетон', herringbone: 'паркет «ёлочкой»',
};

/** Панель квартиры: интерьер, жильцы и то, что в ней видно прямо сейчас */
export function renderApartmentPanel(box: HTMLElement, host: UiHost, aptId: string): void {
  const apt = host.defs.layout.aptById.get(aptId);
  if (!apt) return;
  box.innerHTML = '';
  const people = host.defs.residents.filter((r) => r.apartment === aptId);
  const card = el('div', { class: 'card' }, el('h2', {}, apt.level === 0 ? 'Комната консьержки' : `Квартира ${apt.number}`), el('div', { class: 'sub' }, apt.level === 0 ? '1 этаж, у входа в подъезд' : `${apt.level + 1} этаж, ${apt.side === 'left' ? 'слева' : 'справа'} от лестницы`));
  if (!apt.def) {
    card.append(
      el('p', {}, 'Квартира пустует: голые стены, лампочка на проводе, пыль на подоконнике.'),
      el('p', { class: 'moodlet' }, 'Чтобы кого-то заселить, опишите жильца в чате с Claude.'),
    );
    box.append(card);
    return;
  }
  const d = apt.def;
  card.append(
    el('p', {}, d.description || ''),
    el('div', { class: 'chips' },
      d.renovation ? el('span', { class: 'chip warn' }, 'идёт ремонт') : el('span', { class: 'chip' }, `стиль: ${STYLE[d.style] ?? d.style}`),
      d.renovation ? null : el('span', { class: 'chip' }, WALLPAPER[d.wallpaper] ?? d.wallpaper),
      d.renovation ? null : el('span', { class: 'chip' }, FLOOR[d.flooring] ?? d.flooring),
    ),
    el('h3', {}, 'Что видно сейчас'),
    el('div', { class: 'furn-list', 'data-k': 'seen' }),
    ...(people.length ? [el('h3', {}, people.length > 1 ? 'Живут' : 'Живёт')] : []),
    ...people.map((p) =>
      el('div', { class: 'res-row', onclick: () => host.select(p.id) }, portrait(p), el('div', {}, el('div', { class: 'nm' }, `${p.name.first} ${p.name.last}`), el('div', { class: 'act', 'data-res': p.id }, '…'))),
    ),
    el('h3', {}, 'Комнаты'),
    ...apt.rooms.map((room) =>
      el('p', { class: 'furn-list' }, el('b', {}, room.name), room.furniture.length ? `: ${room.furniture.map((f) => f.def.name.toLowerCase()).join(', ')}` : ': пусто'),
    ),
  );
  box.append(card);
  updateApartmentPanel(box, host, aptId);
}

/** Наблюдения: что можно заметить в квартире, заглянув в разрез */
function observations(host: UiHost, aptId: string): string[] {
  const apt = host.defs.layout.aptById.get(aptId)!;
  const out: string[] = [];
  const cal = host.sim.calendar();
  if (apt.def?.renovation) {
    const h = cal.hourOfDay;
    const working = cal.weekday <= 6 && h >= 9 && h < 18 && !(h >= 13 && h < 14);
    out.push(working ? 'Работают мастера: один красит стену со стремянки, другой возится у козел.' : h >= 13 && h < 14 && cal.weekday <= 6 ? 'У мастеров обед — инструменты брошены где попало.' : 'Тихо. Пахнет краской, на полу плёнка и мешки со смесью.');
    return out;
  }
  const st = host.sim.state.apartments[aptId];
  const home = Object.values(host.sim.state.residents).filter((r) => !r.away && r.level === apt.level && r.x >= apt.x0 && r.x < apt.x1);
  if (!home.length) out.push('Никого нет дома.');
  const sleeping = home.filter((r) => r.action?.id === 'sleep' && r.action.phase === 'perform');
  if (sleeping.length && sleeping.length === home.length) out.push('Все спят, свет погашен.');
  const cooking = home.some((r) => r.action?.id === 'cook' && r.action.phase === 'perform');
  if (cooking) out.push('На плите что-то булькает.');
  const tv = home.some((r) => r.action?.id === 'watch_tv' && r.action.phase === 'perform');
  if (tv) out.push('Работает телевизор.');
  if (st) {
    if (st.dishes >= 4) out.push('На кухне гора немытой посуды.');
    else if (st.dishes >= 1) out.push('В раковине пара тарелок.');
    if (st.unmade.length) out.push('Кровать не заправлена.');
    if (st.bags) out.push('В прихожей пакеты из магазина.');
    if (st.trash >= 2.5) out.push('У двери набитый мешок с мусором.');
    else if (st.trash >= 1) out.push('У двери пакет с мусором.');
  }
  if (!out.length) out.push('Всё на своих местах.');
  return out;
}

export function updateApartmentPanel(box: HTMLElement, host: UiHost, aptId: string): void {
  for (const node of box.querySelectorAll<HTMLElement>('[data-res]')) {
    const r = host.sim.state.residents[node.dataset.res!];
    node.textContent = r ? (r.action?.label ?? 'думает, чем заняться') : '';
  }
  const seen = box.querySelector<HTMLElement>('[data-k="seen"]');
  if (seen) {
    const text = observations(host, aptId).join(' ');
    if (seen.textContent !== text) seen.textContent = text;
  }
}
