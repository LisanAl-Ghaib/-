import type { WorldDefs } from '../data/defs';
import type { Simulation } from '../sim/simulation';
import { $, el } from './dom';
import { portrait } from './portrait';

/**
 * Стенд «Жильцы дома» у почтовых ящиков на первом этаже — единственное место,
 * где написано, кто в какой квартире живёт и сколько им лет.
 */
function years(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет';
  return `${n} ${w}`;
}

export function openBoard(defs: WorldDefs, sim: Simulation): void {
  const box = $('#board');
  const L = defs.layout;
  const sheet = el('div', { class: 'sheet', onclick: (e: Event) => e.stopPropagation() },
    el('h2', {}, 'ЖИЛЬЦЫ ДОМА'),
    el('div', { class: 'addr' }, defs.config.address),
  );
  for (let level = L.floors; level >= 0; level--) {
    const apts = L.apartments.filter((a) => a.level === level).sort((a, b) => a.number - b.number);
    if (!apts.length) continue;
    sheet.append(el('div', { class: 'floor' }, `${level + 1} этаж`));
    for (const apt of apts) {
      const people = defs.residents.filter((r) => r.apartment === apt.id);
      const label = apt.level === 0 ? 'Дежурка' : `Кв. ${apt.number}`;
      const right = el('div', {});
      if (apt.def?.renovation) right.append(el('span', { class: 'muted' }, 'ремонт'));
      else if (!people.length) right.append(el('span', { class: 'muted' }, 'свободна'));
      for (const p of people) {
        const full = [p.name.last, p.name.first, p.name.patronymic].filter(Boolean).join(' ');
        right.append(el('div', { class: 'who' }, portrait(p, 24), `${full}, ${years(sim.age(p))}`));
      }
      sheet.append(el('div', { class: 'apt' }, el('span', { class: 'no' }, label), right));
    }
  }
  sheet.append(el('button', { class: 'close', onclick: () => closeBoard() }, 'Отойти от стенда'));
  box.innerHTML = '';
  box.append(sheet);
  box.hidden = false;
  box.onclick = () => closeBoard();
}

export function closeBoard(): void {
  $('#board').hidden = true;
}
