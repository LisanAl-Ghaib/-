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

/** Панель квартиры: интерьер, жильцы, что в холодильнике */
export function renderApartmentPanel(box: HTMLElement, host: UiHost, aptId: string): void {
  const apt = host.defs.layout.aptById.get(aptId);
  if (!apt) return;
  box.innerHTML = '';
  const people = host.defs.residents.filter((r) => r.apartment === aptId);
  const card = el('div', { class: 'card' }, el('h2', {}, `Квартира ${apt.number}`), el('div', { class: 'sub' }, `${apt.level} этаж, ${apt.side === 'left' ? 'слева' : 'справа'} от лестницы`));
  if (!apt.def) {
    card.append(
      el('p', {}, 'Квартира пустует: голые стены, лампочка на проводе, пыль на подоконнике.'),
      el('p', { class: 'moodlet' }, `Чтобы кого-то заселить — опишите жильца в чате с Claude; квартира получит id ${aptId}.`),
    );
    box.append(card);
    return;
  }
  const d = apt.def;
  card.append(
    el('p', {}, d.description || ''),
    el('div', { class: 'chips' },
      el('span', { class: 'chip' }, `стиль: ${STYLE[d.style] ?? d.style}`),
      el('span', { class: 'chip' }, WALLPAPER[d.wallpaper] ?? d.wallpaper),
      el('span', { class: 'chip' }, FLOOR[d.flooring] ?? d.flooring),
    ),
    el('div', { class: 'swatches', title: 'палитра квартиры' }, ...Object.values(d.palette).map((c) => el('span', { style: `background:${c}` }))),
    el('h3', {}, people.length > 1 ? 'Живут' : 'Живёт'),
    ...people.map((p) =>
      el('div', { class: 'res-row', onclick: () => host.select(p.id) }, portrait(p), el('div', {}, el('div', { class: 'nm' }, `${p.name.first} ${p.name.last}`), el('div', { class: 'act', 'data-res': p.id }, '…'))),
    ),
    el('h3', {}, 'Комнаты'),
    ...apt.rooms.map((room) =>
      el('p', { class: 'furn-list' }, el('b', {}, room.name), room.furniture.length ? `: ${room.furniture.map((f) => f.def.name.toLowerCase()).join(', ')}` : ': пусто'),
    ),
    el('h3', {}, 'Хозяйство'),
    el('div', { class: 'furn-list', 'data-k': 'stock' }),
  );
  box.append(card);
  updateApartmentPanel(box, host, aptId);
}

export function updateApartmentPanel(box: HTMLElement, host: UiHost, aptId: string): void {
  for (const node of box.querySelectorAll<HTMLElement>('[data-res]')) {
    const r = host.sim.state.residents[node.dataset.res!];
    node.textContent = r ? (r.action?.label ?? 'думает, чем заняться') : '';
  }
  const stock = box.querySelector<HTMLElement>('[data-k="stock"]');
  if (stock) {
    const st = host.sim.aptState(aptId);
    stock.textContent = `Готовой еды: ${st.meals} порц. · продуктов на ${Math.floor(st.groceries)} готовок`;
  }
}
