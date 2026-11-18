import { SPEEDS } from '../config';
import { formatDate, hhmm } from '../core/time';
import type { WorldDefs } from '../data/defs';
import type { Simulation } from '../sim/simulation';
import { $, el } from './dom';
import { portrait } from './portrait';

export interface UiHost {
  sim: Simulation;
  defs: WorldDefs;
  speedIndex: number;
  setSpeed(i: number): void;
  selected: string | null;
  focusedApartment: string | null;
  select(id: string | null, opts?: { focus?: boolean }): void;
  focusApartment(id: string | null): void;
  overview(): void;
  newWorld(): void;
}

const SPEED_LABELS = ['⏸', '×1', '×10', '×60'];

export type TabId = 'chronicle' | 'residents' | 'details';

/** Дополнительные «виды» панели регистрируются этапами (хроника, карточки) */
export interface PanelView {
  tab: TabId;
  render(container: HTMLElement): void;
  /** вызывается ~4 раза в секунду, пока вкладка активна */
  update?(container: HTMLElement): void;
}

export class Ui {
  private tab: TabId = 'chronicle';
  private views = new Map<TabId, PanelView>();
  private resRows = new Map<string, { row: HTMLElement; act: HTMLElement }>();

  constructor(private host: UiHost) {
    $('#address').textContent = host.defs.config.address;
    const speed = $('#speed');
    SPEEDS.forEach((_, i) => {
      speed.append(el('button', { 'data-speed': i, title: i === 0 ? 'Пауза (Пробел)' : `Скорость ${SPEED_LABELS[i]} (${i + 1})`, onclick: () => host.setSpeed(i) }, SPEED_LABELS[i]));
    });
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
      b.addEventListener('click', () => this.showTab(b.dataset.tab as TabId));
    });
    $('#btn-overview').addEventListener('click', () => host.overview());
    $('#btn-panel').addEventListener('click', () => $('#panel').classList.toggle('hidden'));
    $('#btn-new').addEventListener('click', () => {
      if (confirm('Начать мир заново? Текущее сохранение будет удалено.')) host.newWorld();
    });
    this.buildResidentList();
    this.refreshSpeed();
  }

  registerView(v: PanelView) {
    this.views.set(v.tab, v);
    if (v.tab === this.tab) this.renderTab();
  }

  showTab(tab: TabId) {
    this.tab = tab;
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll<HTMLElement>('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
    this.renderTab();
  }

  renderTab() {
    const v = this.views.get(this.tab);
    const box = $(`#tab-${this.tab}`);
    if (v) v.render(box);
    else if (this.tab === 'residents') this.buildResidentList();
  }

  refreshSpeed() {
    document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === this.host.speedIndex));
  }

  toast(text: string, ms = 2500) {
    const t = $('#toast');
    t.textContent = text;
    t.style.display = 'block';
    window.setTimeout(() => (t.style.display = 'none'), ms);
  }

  buildResidentList() {
    const box = $('#tab-residents');
    box.innerHTML = '';
    this.resRows.clear();
    const { defs } = this.host;
    const sorted = [...defs.residents].sort((a, b) => {
      const A = defs.layout.aptById.get(a.apartment)!;
      const B = defs.layout.aptById.get(b.apartment)!;
      return B.level - A.level || A.number - B.number;
    });
    if (sorted.length === 0) box.append(el('div', { class: 'empty' }, 'В доме пока никто не живёт.'));
    for (const def of sorted) {
      const apt = defs.layout.aptById.get(def.apartment)!;
      const act = el('div', { class: 'act' }, '');
      const row = el(
        'div',
        { class: 'res-row', onclick: () => this.host.select(def.id, { focus: true }) },
        portrait(def),
        el('div', {}, el('div', { class: 'nm' }, `${def.name.first} ${def.name.last}`), el('div', { class: 'act' }, `кв. ${apt.number}, ${apt.level} этаж · ${def.occupation.title}`), act),
      );
      this.resRows.set(def.id, { row, act });
      box.append(row);
    }
  }

  update() {
    const { sim } = this.host;
    const cal = sim.calendar();
    $('#clock-time').textContent = hhmm(cal.minuteOfDay);
    $('#clock-date').textContent = formatDate(cal);
    for (const [id, { row, act }] of this.resRows) {
      const r = sim.state.residents[id];
      row.classList.toggle('selected', id === this.host.selected);
      act.textContent = r ? `→ ${r.away ? `${r.action?.label ?? 'нет дома'}` : r.action?.label ?? 'думает, чем заняться'}` : '';
    }
    const v = this.views.get(this.tab);
    if (v?.update) v.update($(`#tab-${this.tab}`));
  }
}
