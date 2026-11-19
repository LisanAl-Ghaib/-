import { chronicle } from '../../chronicle/chronicle';
import { gain } from '../../needs';
import { daytime, fitDuration, gv, habit, minutesToLeave, novelty, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

const SOCIAL_BONUS = { homebody: -0.6, balanced: 0.4, outgoing: 1.6 } as const;

/** Насколько погода располагает выйти (1 — отлично, 0 — никак) */
function weather(ctx: AgentCtx): number {
  return ctx.sim.outdoorAppeal(ctx.def);
}

/** Погулять по двору */
export const walkYard: ActionDef = {
  id: 'walk_yard',
  icon: 'leaf',
  plan(ctx) {
    const { r, def, sim } = ctx;
    if (sleepTime(ctx) || !daytime(ctx, 7, 22) || minutesToLeave(ctx) < 60) return null;
    const w = weather(ctx);
    if (w < 0.05) return null;
    const Y = sim.defs.layout.yard;
    const act = def.traits.activity === 'active' ? 1 : def.traits.activity === 'lazy' ? -0.8 : 0;
    const score = (1.4 + habit(ctx, 'walking') * 3.5 + act + SOCIAL_BONUS[def.traits.sociability] + (100 - r.needs.mood) / 30 + (100 - r.needs.social) / 40) * w * novelty(ctx, 'walk_yard', 5 * 3600);
    const x = Math.round(sim.rng.range(Y.x0 + 30, Y.busStop - 34));
    const wk = sim.weather.kind;
    return {
      score,
      target: { level: 0, x },
      duration: fitDuration(ctx, sim.rng.int(15, 45) * (wk === 'rain' ? 0.5 : 1) * 60),
      label: wk === 'rain' ? 'гуляет под зонтом' : wk === 'snow' || sim.weather.snowCover > 0.5 ? 'гуляет по снегу' : wk === 'fog' ? 'бродит в тумане' : 'гуляет во дворе',
      data: { out: true, stroll: true },
    };
  },
  perform(ctx, a, dt) {
    gain(ctx.r, 'mood', 7, dt);
    gain(ctx.r, 'energy', -1, dt);
    // неспешно бродит туда-сюда
    const r = ctx.r;
    if (a.data.stroll && r.interaction === null && r.path.length === 0 && ctx.sim.rng.chance(dt / 240)) {
      const Y = ctx.sim.defs.layout.yard;
      const nx = Math.round(ctx.sim.rng.range(Y.x0 + 24, Y.busStop - 30));
      r.path = [{ k: 'walk', x: nx, y: r.y, level: 0 }];
    }
    if (r.path.length) ctx.sim.advance(r, dt);
  },
};

/** Посидеть на лавочке у подъезда */
export const bench: ActionDef = {
  id: 'bench',
  icon: 'talk',
  plan(ctx) {
    const { r, def, sim } = ctx;
    if (sleepTime(ctx) || !daytime(ctx, 8, 21) || minutesToLeave(ctx) < 60) return null;
    const w = weather(ctx);
    if (w < 0.15) return null;
    const seats = sim.defs.layout.yard.bench.seats;
    const taken = Object.values(sim.state.residents).filter((o) => o.id !== r.id && o.action?.id === 'bench').map((o) => o.action!.target.x);
    const free = seats.filter((x) => !taken.includes(x));
    if (!free.length) return null;
    const company = taken.length > 0 ? 2 : 0;
    const age = sim.age(def);
    const score = (0.8 + habit(ctx, 'bench') * 4 + (age >= 60 ? 1.5 : 0) + company + (100 - r.needs.social) / 35) * w * novelty(ctx, 'bench', 4 * 3600);
    return {
      score,
      target: { level: 0, x: sim.rng.pick(free) },
      duration: fitDuration(ctx, sim.rng.int(25, 70) * 60),
      label: gv(def, 'сидит на лавочке', 'сидит на лавочке'),
      data: { out: true },
    };
  },
  onArrive(ctx) {
    ctx.r.pose = 'sit';
    ctx.r.front = true;
    ctx.r.y = ctx.sim.defs.layout.groundY - 5;
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 5, dt);
    gain(ctx.r, 'energy', 1, dt);
  },
};

/** Выйти покурить к подъезду */
export const smoke: ActionDef = {
  id: 'smoke',
  icon: 'dots',
  plan(ctx) {
    const h = habit(ctx, 'smoking');
    // не спится — можно и ночью спуститься покурить у подъезда
    const r = ctx.r;
    const woke = r.recent.insomnia !== undefined && ctx.now - r.recent.insomnia < 70 * 60;
    if (h <= 0 || (sleepTime(ctx) && !woke) || minutesToLeave(ctx) < 30) return null;
    const L = ctx.sim.defs.layout;
    // курильщик «в окно» тоже ходит к подъезду, но реже и не в непогоду
    const windowToo = ctx.def.traits.tags.some((t) => /в окно/i.test(t)) ? 0.9 : 1;
    const since = ctx.now - Math.max(r.recent.smoke ?? -1e9, r.recent.smoke_window ?? -1e9);
    return {
      // заядлый курильщик выйдет и в непогоду
      score: (1 + h * 5) * novelty(ctx, 'smoke', 2.5 * 3600) * Math.min(1, since / 3600) * Math.max(h > 0.8 ? 0.75 : 0.4, weather(ctx)) * windowToo + (woke ? 3 : 0),
      target: { level: 0, x: L.buildingX1 + 12 + ctx.sim.rng.int(0, 8) },
      duration: ctx.sim.rng.int(6, 10) * 60,
      label: gv(ctx.def, 'курит у подъезда', 'курит у подъезда'),
      data: { out: true },
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 12, dt);
  },
};

/** Пробежка (убегает за кадр) */
export const jog: ActionDef = {
  id: 'jog',
  icon: 'sport',
  plan(ctx) {
    const h = habit(ctx, 'jogging');
    if (h <= 0 || sleepTime(ctx) || !daytime(ctx, 6, 21) || minutesToLeave(ctx) < 90) return null;
    if (ctx.r.needs.energy < 45) return null;
    const morning = ctx.cal.hourOfDay < 9 ? 2 : 0;
    return {
      score: (1 + h * 4 + morning) * weather(ctx) * novelty(ctx, 'jog', 20 * 3600),
      target: { level: 0, x: ctx.sim.defs.layout.yard.offscreenX, away: true },
      duration: ctx.sim.rng.int(30, 50) * 60,
      label: gv(ctx.def, 'убежал на пробежку', 'убежала на пробежку'),
      via: 'walk',
      data: { out: true },
    };
  },
  onArrive(ctx, a) {
    a.label = 'на пробежке';
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 9, dt);
    gain(ctx.r, 'energy', -8, dt);
  },
};

/** Выбраться в город: в парк, к друзьям, в кино */
export const goOut: ActionDef = {
  id: 'go_out',
  icon: 'leaf',
  plan(ctx) {
    const { r, def, sim } = ctx;
    if (sleepTime(ctx) || !daytime(ctx, 10, 20) || minutesToLeave(ctx) < 300) return null;
    if (minutesToBedSafe(ctx) < 150) return null;
    const free = !r.plan?.workday;
    const out = SOCIAL_BONUS[def.traits.sociability] + (def.traits.activity === 'active' ? 1 : 0);
    const score = ((free ? 1.4 : 0.3) + out + (100 - r.needs.social) / 30) * Math.max(0.3, weather(ctx)) * novelty(ctx, 'go_out', 30 * 3600);
    const where = sim.rng.pick(
      def.traits.sociability === 'outgoing'
        ? ['к подруге', 'в кино', 'в кафе с друзьями', 'в парк', 'на рынок']
        : ['в парк', 'в библиотеку', 'прогуляться по району', 'на рынок'],
    );
    return {
      score,
      target: { level: 0, x: sim.defs.layout.yard.offscreenX, away: true },
      duration: sim.rng.int(90, 210) * 60,
      label: `${gv(def, 'ушёл', 'ушла')} ${where.replace('к подруге', def.gender === 'm' ? 'к другу' : 'к подруге')}`,
      via: sim.rng.chance(0.5) ? 'bus' : 'walk',
      data: { out: true },
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 6, dt);
    gain(ctx.r, 'social', 14, dt);
    gain(ctx.r, 'energy', -1, dt);
    gain(ctx.r, 'food', 2, dt);
  },
};

function minutesToBedSafe(ctx: AgentCtx): number {
  const p = ctx.r.plan;
  return p ? (p.bedAt - ctx.now) / 60 : 999;
}

/** Слепить снеговика (если снега много, а настроение хорошее) */
export const snowman: ActionDef = {
  id: 'snowman',
  icon: 'snow',
  plan(ctx) {
    const { sim, def, r } = ctx;
    const w = sim.weather;
    if (sim.state.yard.snowman || w.snowCover < 0.5 || w.temp > 1 || w.temp < -12) return null;
    if (sleepTime(ctx) || !daytime(ctx, 10, 17) || minutesToLeave(ctx) < 90) return null;
    const fun = (def.traits.outlook === 'cheerful' ? 1.5 : 0) + (def.traits.activity === 'active' ? 1.2 : 0) + (sim.age(def) < 40 ? 1 : 0);
    if (fun < 1) return null;
    const Y = sim.defs.layout.yard;
    return {
      score: (1 + fun) * (0.6 + (100 - r.needs.mood) / 120) * novelty(ctx, 'snowman', 3 * 86400),
      target: { level: 0, x: Math.round(sim.rng.range(Y.trees[0] + 14, Y.bench.x - 8)) },
      duration: sim.rng.int(25, 45) * 60,
      label: gv(def, 'лепит снеговика', 'лепит снеговика'),
      data: { out: true },
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 12, dt);
    gain(ctx.r, 'energy', -3, dt);
  },
  onEnd(ctx, _a, interrupted) {
    if (interrupted || ctx.sim.state.yard.snowman) return;
    ctx.sim.state.yard.snowman = { x: Math.round(ctx.r.x + ctx.r.facing * 8), builtAt: ctx.now, by: ctx.r.id };
    chronicle(ctx.sim, 'snowman', [ctx.r.id], 2, { hat: ctx.sim.rng.chance(0.5) });
  },
};
