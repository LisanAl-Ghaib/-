import { renderApartmentPanel, updateApartmentPanel } from './apartmentPanel';
import { chronicleView } from './chronicleView';
import { el } from './dom';
import { renderResidentCard, updateResidentCard } from './residentCard';
import type { Ui, UiHost } from './ui';

/** Панели справа: хроника и «Подробно» (карточка жильца или квартиры) */
export function installViews(ui: Ui, host: UiHost): void {
  ui.registerView(chronicleView(host));
  let shown: string | null = null;
  ui.registerView({
    tab: 'details',
    render(box) {
      if (host.selected) {
        shown = `r:${host.selected}`;
        renderResidentCard(box, host, host.selected);
      } else if (host.focusedApartment) {
        shown = `a:${host.focusedApartment}`;
        renderApartmentPanel(box, host, host.focusedApartment);
      } else {
        shown = null;
        box.innerHTML = '';
        box.append(el('div', { class: 'empty' }, 'Кликните по жильцу, чтобы открыть его карточку, или по квартире — чтобы заглянуть внутрь.'));
      }
    },
    update(box) {
      const want = host.selected ? `r:${host.selected}` : host.focusedApartment ? `a:${host.focusedApartment}` : null;
      if (want !== shown) return this.render(box);
      if (host.selected) updateResidentCard(box, host, host.selected);
      else if (host.focusedApartment) updateApartmentPanel(box, host, host.focusedApartment);
    },
  });
}
