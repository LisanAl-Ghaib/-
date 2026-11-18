import { chronicleView } from './chronicleView';
import type { Ui, UiHost } from './ui';

/** Панель справа (на телефоне — снизу): только хроника дома */
export function installViews(ui: Ui, host: UiHost): void {
  ui.setView(chronicleView(host));
}
