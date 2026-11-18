import { el } from './dom';
import { portrait } from './portrait';
import type { Ui, UiHost } from './ui';

/** Этап 1: простая вкладка «Подробно» — кто выбран и что делает. */
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
      box.append(
        el('div', { class: 'card' },
          portrait(def, 72),
          el('h2', {}, `${def.name.first} ${def.name.last}`),
          el('div', { class: 'sub' }, def.occupation.title),
          el('div', { class: 'now', id: 'now-action' }, '…'),
        ),
      );
    },
    update(box) {
      const id = host.selected;
      const r = id ? host.sim.state.residents[id] : null;
      const now = box.querySelector('#now-action');
      if (now && r) now.textContent = r.action?.label ?? 'думает, чем заняться';
    },
  });
}
