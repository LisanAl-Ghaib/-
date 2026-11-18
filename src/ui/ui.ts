import { formatDate, hhmm } from '../core/time';
import type { WorldDefs } from '../data/defs';
import { SEASON_NAME, seasonOf, WEATHER_NAME, windMs } from '../sim/env/weather';
import type { Simulation } from '../sim/simulation';
import { $ } from './dom';

/**
 * Интерфейс без настроек: мир живёт сам, время не ускоряется и не замедляется.
 * Есть только часы, погода, кнопка «весь дом» и хроника.
 */
export interface UiHost {
  sim: Simulation;
  defs: WorldDefs;
  overview(): void;
  /** навести камеру на жильца и следить за ним */
  follow?(id: string): void;
}

export interface PanelView {
  render(container: HTMLElement): void;
  update?(container: HTMLElement): void;
}

export class Ui {
  private view: PanelView | null = null;

  constructor(private host: UiHost) {
    $('#address').textContent = host.defs.config.address;
    $('#btn-overview').addEventListener('click', () => host.overview());
    $('#btn-panel').addEventListener('click', () => $('#panel').classList.toggle('hidden'));
    // на телефоне в альбомной ориентации места мало — хроника скрыта
    if (window.matchMedia('(max-width: 760px) and (orientation: landscape), (max-height: 480px)').matches) $('#panel').classList.add('hidden');
  }

  setView(v: PanelView) {
    this.view = v;
    v.render($('#tab-chronicle'));
  }

  toast(text: string, ms = 2500) {
    const t = $('#toast');
    t.textContent = text;
    t.style.display = 'block';
    window.setTimeout(() => (t.style.display = 'none'), ms);
  }

  update() {
    const { sim } = this.host;
    const cal = sim.calendar();
    $('#clock-time').textContent = hhmm(cal.minuteOfDay);
    $('#clock-date').textContent = formatDate(cal);
    const w = sim.weather;
    const strong = (w.kind === 'rain' || w.kind === 'snow' || w.kind === 'fog') && w.intensity > 0.7;
    const kindName = w.kind === 'rain' && strong ? 'ливень' : w.kind === 'snow' && strong ? 'снегопад' : w.kind === 'fog' && strong ? 'густой туман' : WEATHER_NAME[w.kind];
    const t = Math.round(w.temp);
    const env = $('#env');
    const text = `${SEASON_NAME[seasonOf(cal.month)]} · ${kindName} · ${t > 0 ? '+' : ''}${t}° · ветер ${windMs(w)} м/с`;
    if (env.textContent !== text) env.textContent = text;
    this.view?.update?.($('#tab-chronicle'));
  }
}
