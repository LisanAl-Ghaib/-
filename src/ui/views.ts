import { calendar, hhmm } from '../core/time';
import type { ResidentState } from '../sim/state';
import { bar, el } from './dom';
import { portrait } from './portrait';
import type { Ui, UiHost } from './ui';

const NEED_LABELS: [keyof ResidentState['needs'], string][] = [
  ['energy', 'Энергия'],
  ['food', 'Сытость'],
  ['social', 'Общение'],
  ['mood', 'Настроение'],
];

/** Вкладка «Подробно»: потребности и распорядок выбранного жильца. */
export function installViews(ui: Ui, host: UiHost): void {
  ui.registerView({
    tab: 'chronicle',
    render(box) {
      box.innerHTML = '';
      box.append(el('div', { class: 'empty' }, 'Хроника дома появится на этапе 3.'));
    },
  });
  ui.registerView({
    tab: 'details',
    render(box) {
      box.innerHTML = '';
      const id = host.selected;
      const def = id ? host.defs.residentById.get(id) : null;
      if (!def) {
        box.append(el('div', { class: 'empty' }, 'Кликните по жильцу или квартире.'));
        return;
      }
      const needs = el('div', { id: 'needs' });
      box.append(
        el('div', { class: 'card' },
          portrait(def, 72),
          el('h2', {}, `${def.name.first} ${def.name.last}`),
          el('div', { class: 'sub' }, `${host.sim.age(def)} лет · ${def.occupation.title}`),
          el('div', { class: 'now', id: 'now-action' }, '…'),
          el('h3', {}, 'Потребности'),
          needs,
          el('h3', {}, 'Распорядок на сегодня'),
          el('div', { id: 'plan', class: 'furn-list' }),
          el('div', { id: 'moodlets' }),
        ),
      );
    },
    update(box) {
      const id = host.selected;
      const r = id ? host.sim.state.residents[id] : null;
      if (!r) return;
      const now = box.querySelector('#now-action');
      if (now) now.textContent = r.action?.label ?? 'думает, чем заняться';
      const needs = box.querySelector('#needs');
      if (needs) {
        needs.innerHTML = '';
        for (const [k, label] of NEED_LABELS) {
          needs.append(el('div', { class: 'need' }, el('span', {}, label), bar(r.needs[k]), el('span', {}, String(Math.round(r.needs[k])))));
        }
      }
      const plan = box.querySelector('#plan');
      if (plan && r.plan) {
        const t = (abs: number | null) => (abs === null ? '—' : hhmm(calendar(host.defs.epochMs, abs).minuteOfDay));
        const p = r.plan;
        const st = host.sim.aptState(host.defs.residentById.get(r.id)!.apartment);
        plan.innerHTML = '';
        plan.append(
          el('div', {}, `Подъём ${t(p.wakeAt)} · отбой ${t(p.bedAt)}`),
          el('div', {}, p.workday && p.workStartAt !== null ? `Работа ${t(p.workStartAt)}–${t(p.workEndAt)}${p.leaveAt !== null && p.leaveAt !== p.workStartAt ? `, выход в ${t(p.leaveAt)}` : ''}` : 'Сегодня не работает'),
          el('div', {}, `Завтрак ~${t(p.breakfastAt)} · обед ~${t(p.lunchAt)} · ужин ~${t(p.dinnerAt)}`),
          el('div', {}, `Дома: еды ${st.meals} порц., продуктов ${st.groceries.toFixed(1)}`),
        );
      }
      const ml = box.querySelector('#moodlets');
      if (ml) {
        ml.innerHTML = '';
        for (const m of r.moodlets) {
          ml.append(el('div', { class: 'moodlet' }, el('b', { class: m.value >= 0 ? 'pos' : 'neg' }, `${m.value > 0 ? '+' : ''}${m.value}`), ` ${m.label}`));
        }
      }
    },
  });
}
