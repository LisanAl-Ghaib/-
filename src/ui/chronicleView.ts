import { calendar, formatDateLong, hhmm } from '../core/time';
import type { ChronicleEntry } from '../sim/state';
import { el } from './dom';
import type { PanelView, UiHost } from './ui';

type Filter = 'important' | 'all';

/** Лента «Хроника дома» */
export function chronicleView(host: UiHost): PanelView {
  let filter: Filter = 'important';
  let lastKey = '';
  let listBox: HTMLElement | null = null;

  const passes = (e: ChronicleEntry) => {
    if (filter === 'important') return e.importance >= 2;
    return true;
  };

  const renderList = () => {
    if (!listBox) return;
    const entries = host.sim.state.chronicle.filter(passes).sort((a, b) => b.t - a.t || b.id - a.id).slice(0, 300);
    listBox.innerHTML = '';
    if (!entries.length) {
      listBox.append(
        el('div', { class: 'empty' }, 'Пока тихо. Жизнь только начинается…'),
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
      const row = el('div', { class: `chron-entry imp${e.importance}`, title: e.actors.length ? 'Найти взглядом' : '' }, el('span', { class: 't' }, hhmm(c.minuteOfDay)), e.text);
      if (e.actors.length) {
        row.style.cursor = 'pointer';
        let k = 0;
        row.addEventListener('click', () => host.follow?.(e.actors[k++ % e.actors.length]));
      }
      listBox.append(row);
    }
  };

  return {
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
      box.append(el('div', { class: 'chron-filters' }, btn('important', 'Главное'), btn('all', 'Всё подряд')), listBox);
      lastKey = '';
      renderList();
    },
    update() {
      const ch = host.sim.state.chronicle;
      const key = `${ch.length}:${ch[ch.length - 1]?.id ?? 0}`;
      if (key === lastKey) return;
      lastKey = key;
      renderList();
    },
  };
}
