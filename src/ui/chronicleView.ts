import { calendar, formatDateLong, hhmm } from '../core/time';
import type { ChronicleEntry } from '../sim/state';
import { el } from './dom';
import type { PanelView, UiHost } from './ui';

type Filter = 'important' | 'all' | 'selected';

/** Лента «Хроника дома» */
export function chronicleView(host: UiHost): PanelView {
  let filter: Filter = 'important';
  let lastKey = '';
  let listBox: HTMLElement | null = null;

  const passes = (e: ChronicleEntry) => {
    if (filter === 'important') return e.importance >= 2;
    if (filter === 'selected') return !!host.selected && e.actors.includes(host.selected);
    return true;
  };

  const renderList = () => {
    if (!listBox) return;
    const entries = host.sim.state.chronicle.filter(passes).sort((a, b) => b.t - a.t || b.id - a.id).slice(0, 300);
    listBox.innerHTML = '';
    if (!entries.length) {
      listBox.append(
        el('div', { class: 'empty' }, filter === 'selected' ? (host.selected ? 'С этим жильцом пока ничего не случилось.' : 'Сначала выберите жильца.') : 'Пока тихо. Жизнь только начинается…'),
      );
      return;
    }
    let day = -1;
    for (const e of entries) {
      const c = calendar(host.defs.epochMs, e.t);
      if (c.dayIndex !== day) {
        day = c.dayIndex;
        listBox.append(el('div', { class: 'chron-day' }, formatDateLong(c)));
      }
      const row = el('div', { class: `chron-entry imp${e.importance}`, title: 'Показать участника' }, el('span', { class: 't' }, hhmm(c.minuteOfDay)), e.text);
      if (e.actors.length) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const target = e.actors[0] === host.selected && e.actors[1] ? e.actors[1] : e.actors[0];
          host.select(target, { focus: true });
        });
      }
      listBox.append(row);
    }
  };

  return {
    tab: 'chronicle',
    render(box) {
      box.innerHTML = '';
      const btn = (f: Filter, label: string) =>
        el('button', {
          class: filter === f ? 'active' : '',
          onclick: () => {
            filter = f;
            this.render(box);
          },
        }, label);
      listBox = el('div', {});
      box.append(el('div', { class: 'chron-filters' }, btn('important', 'Главное'), btn('all', 'Всё подряд'), btn('selected', 'Выбранный жилец')), listBox);
      lastKey = '';
      renderList();
    },
    update() {
      const ch = host.sim.state.chronicle;
      const key = `${ch.length}:${ch[ch.length - 1]?.id ?? 0}:${host.selected}`;
      if (key === lastKey) return;
      lastKey = key;
      renderList();
    },
  };
}
