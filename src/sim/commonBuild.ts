import type { ApartmentModel } from '../world/layout';
import { fitDuration, gv, minutesToBed, minutesToLeave, novelty, sleepTime } from './ai/helpers';
import type { ActionDef } from './ai/types';
import { chronicle } from './chronicle/chronicle';
import { gain } from './needs';
import { goodTalk } from './social/social';
import type { CommonBuild, ResidentState } from './state';
import type { Simulation } from './simulation';

/**
 * Жильцы сами обустраивают комнату отдыха в подвале (квартира с `common: true`).
 * Сначала там хлам и голый бетон. Кто-нибудь предлагает: «давайте сделаем комнату для всех»,
 * и дальше по вечерам и в выходные жильцы спускаются поработать — кто сколько может:
 *   0 — выносят хлам, 1 — красят стены, 2 — стелют пол, 3 — проводят свет и гирлянду,
 *   4 — сносят из квартир мебель (каждый заход — свой человек и своя вещь: книжник — шкаф,
 *       шахматист — столик, кто любит готовить — стол с сервизом…), 5 — готово: можно сидеть.
 * Вдвоём-втроём работа идёт быстрее, а в субботу днём бывает настоящий субботник.
 * Что принесли — видно сразу (мебель с `buildSet` появляется по заходам), этапы видны в отрисовке
 * подвала (`drawApartment` → `CommonBuildView`).
 */

/** сколько человеко-часов на этап */
export const BUILD_HOURS = [9, 10, 8, 3];
export const STAGE_FURNISH = 4;
export const STAGE_DONE = 5;

const STAGE_LABEL = ['выносит хлам из подвала', 'красит стены в подвале', 'стелет пол в подвале', 'проводит свет в подвале'];
const STAGE_SCENE = ['clear', 'walls', 'floor', 'light'];

function roomOf(sim: Simulation): ApartmentModel | null {
  return sim.defs.layout.commonRoom;
}

/** заходы мебели: номер → подпись и главный предмет */
function furnishSets(apt: ApartmentModel): { set: number; label: string; draw: string }[] {
  const out = new Map<number, { set: number; label: string; draw: string }>();
  apt.def?.rooms.forEach((room, ri) =>
    room.furniture.forEach((fp) => {
      if (fp.buildSet === undefined) return;
      const cur = out.get(fp.buildSet);
      const draw = apt.rooms[ri].allFurniture.find((f) => f.buildSet === fp.buildSet && f.x === apt.rooms[ri].x0 + fp.x)?.def.draw ?? fp.item;
      if (!cur) out.set(fp.buildSet, { set: fp.buildSet, label: fp.buildLabel ?? fp.item, draw });
      else if (fp.buildLabel) out.set(fp.buildSet, { ...cur, label: fp.buildLabel, draw });
    }),
  );
  return [...out.values()].sort((a, b) => a.set - b.set);
}

export function buildState(sim: Simulation): CommonBuild | null {
  return roomOf(sim) ? sim.state.commonBuild ?? null : null;
}

/** готова ли комната отдыха (можно сидеть) */
export function commonRoomReady(sim: Simulation): boolean {
  const b = buildState(sim);
  return !!b && b.stage >= STAGE_DONE;
}

/** При загрузке: состояние стройки и какие вещи уже принесли */
export function syncCommonBuild(sim: Simulation): void {
  const room = roomOf(sim);
  if (!room) return;
  sim.state.commonBuild ??= { stage: 0, progress: 0, sets: 0, started: null, done: null, nextBy: null, nextPicked: 0, lastBy: null, helpers: [] };
  sim.state.commonBuild.helpers ??= [];
  applyFurniture(sim);
}

function applyFurniture(sim: Simulation): void {
  const b = sim.state.commonBuild!;
  sim.defs.layout.setRevealedSets(b.stage >= STAGE_DONE ? Infinity : b.stage < STAGE_FURNISH ? 0 : b.sets);
}

/** Каждый шаг: кто-то предлагает начать; выбор того, кто принесёт следующую вещь */
export function updateCommonBuild(sim: Simulation): void {
  const room = roomOf(sim);
  const b = sim.state.commonBuild;
  if (!room || !b || b.stage >= STAGE_DONE) return;
  const cal = sim.calendar();
  if (b.started === null) {
    if (cal.hourOfDay < 9 || cal.hourOfDay >= 20) return;
    const who = initiator(sim);
    if (!who) return;
    b.started = sim.time;
    chronicle(sim, 'common.build.idea', [who], 3, {});
    return;
  }
  if (b.stage === STAGE_FURNISH && (!b.nextBy || !sim.state.residents[b.nextBy] || sim.time - b.nextPicked > 1.5 * 86400)) pickContributor(sim, b);
}

/** кто предложит: тот, кто «знает всех», «рад помочь», самый общительный */
function initiator(sim: Simulation): string | null {
  let best: { id: string; w: number } | null = null;
  for (const d of sim.defs.residents) {
    const r = sim.state.residents[d.id];
    if (!r || r.away) continue;
    const t = d.traits.tags.join(' ');
    const w = (/знает всех/i.test(t) ? 3 : 0) + (/рад помочь/i.test(t) ? 2 : 0) + { homebody: 0, balanced: 1, outgoing: 2 }[d.traits.sociability] + sim.rng.next();
    if (!best || w > best.w) best = { id: d.id, w };
  }
  return best?.id ?? null;
}

/** Кто принесёт следующий заход: книжник — шкаф, шахматист — столик, хозяйственный — стол и сервиз… */
function pickContributor(sim: Simulation, b: CommonBuild): void {
  const room = roomOf(sim)!;
  const next = furnishSets(room)[b.sets];
  if (!next) return;
  const want = /bookshelf|book/.test(next.draw)
    ? 'reading'
    : /chess|kitchen_table/.test(next.draw)
      ? 'chess'
      : /dining|tea|sink|counter|fridge|microwave/.test(next.draw)
        ? 'cooking'
        : /plant/.test(next.draw)
          ? 'plants'
          : /radio|chest|clock/.test(next.draw)
            ? 'tv'
            : null;
  let best: { id: string; w: number } | null = null;
  for (const d of sim.defs.residents) {
    if (!sim.state.residents[d.id]) continue;
    const h = want ? d.habits.find((x) => x.kind === want)?.strength ?? 0 : 0.3;
    const w = h + sim.rng.next() * 0.5 - (d.id === b.lastBy ? 0.6 : 0);
    if (!best || w > best.w) best = { id: d.id, w };
  }
  b.nextBy = best?.id ?? null;
  b.nextPicked = sim.time;
}

function others(sim: Simulation, id: string): ResidentState[] {
  return Object.values(sim.state.residents).filter((r) => r.id !== id && !r.away && r.action?.id === 'build_common' && r.action.phase === 'perform' && r.action.data.stage !== 'bring');
}

export const buildCommon: ActionDef = {
  id: 'build_common',
  icon: 'broom',
  plan(ctx) {
    const { sim, r, def, cal } = ctx;
    const room = roomOf(sim);
    const b = sim.state.commonBuild;
    if (!room || !b || b.started === null || b.stage >= STAGE_DONE || r.sick) return null;
    if (sleepTime(ctx) || minutesToLeave(ctx) < 80 || minutesToBed(ctx) < 60) return null;
    const h = cal.hourOfDay;
    const weekend = cal.weekday >= 6;
    if (h < (weekend ? 10 : 17) || h >= (weekend ? 19 : 21.5)) return null;
    const x = room.x0 + 14 + Math.floor(sim.rng.next() * (room.x1 - room.x0 - 28));
    // мебель: несёт тот, на кого пал выбор (из своей квартиры — коробкой или «в охапку»)
    if (b.stage === STAGE_FURNISH) {
      if (b.nextBy !== r.id) return null;
      const set = furnishSets(room)[b.sets];
      if (!set) return null;
      return {
        score: 6 * novelty(ctx, 'build_common', 6 * 3600),
        target: { level: room.level, x },
        duration: fitDuration(ctx, sim.rng.int(20, 40) * 60),
        label: `несёт в подвал ${set.label}`,
        data: { stage: 'bring', scene: 'build_common:bring' },
      };
    }
    const there = others(sim, r.id).length;
    const tags = def.traits.tags.join(' ');
    const act = { lazy: -0.6, normal: 0.4, active: 1.3 }[def.traits.activity];
    const soc = { homebody: -0.3, balanced: 0.3, outgoing: 0.8 }[def.traits.sociability];
    const saturday = cal.weekday === 6 && h >= 11 && h < 15;
    const score =
      (2.2 + act + soc + there * 1.6 + (saturday ? 4 : 0) + (/рад помочь|аккуратн/i.test(tags) ? 0.8 : 0) + (100 - r.needs.social) / 40) *
      novelty(ctx, 'build_common', 20 * 3600);
    return {
      score: Math.max(0, score),
      target: { level: room.level, x },
      duration: fitDuration(ctx, sim.rng.int(40, 100) * 60),
      label: STAGE_LABEL[b.stage],
      data: { stage: STAGE_SCENE[b.stage], scene: `build_common:${STAGE_SCENE[b.stage]}` },
    };
  },
  onStart(ctx, a) {
    if (a.data.stage === 'bring') ctx.r.carrying = 'box';
  },
  onArrive(ctx, a) {
    const sim = ctx.sim;
    const b = sim.state.commonBuild!;
    if (!b.helpers!.includes(ctx.r.id)) b.helpers!.push(ctx.r.id);
    if (a.data.stage === 'bring') {
      ctx.r.carrying = null;
      const room = roomOf(sim)!;
      const set = furnishSets(room)[b.sets];
      if (b.stage !== STAGE_FURNISH || !set || b.nextBy !== ctx.r.id) return true;
      b.sets++;
      b.lastBy = ctx.r.id;
      b.nextBy = null;
      chronicle(sim, 'common.build.bring', [ctx.r.id], 2, { what: set.label, v: sim.rng.int(0, 3) });
      a.label = gv(ctx.def, 'расставляет принесённое в подвале', 'расставляет принесённое в подвале');
      if (b.sets >= furnishSets(room).length) finish(sim, b);
      applyFurniture(sim);
      return true;
    }
    // работают вместе — разговаривают за делом
    a.label = STAGE_LABEL[b.stage] ?? a.label;
    const mates = others(sim, ctx.r.id);
    for (const o of mates) goodTalk(sim, ctx.r.id, o.id, 15);
    const day = sim.calendar().dayIndex;
    if (mates.length >= 2 && !sim.state.flags[`subbotnik:${day}`]) {
      sim.state.flags[`subbotnik:${day}`] = sim.time;
      chronicle(sim, 'common.build.together', [ctx.r.id, ...mates.map((m) => m.id)].slice(0, 5), 2, { stage: b.stage, saturday: sim.calendar().weekday === 6 });
    } else if (!sim.state.flags[`cbwork:${day}`]) {
      sim.state.flags[`cbwork:${day}`] = sim.time;
      chronicle(sim, 'common.build.work', [ctx.r.id, ...mates.map((m) => m.id)].slice(0, 3), 1, { stage: b.stage });
    }
    return true;
  },
  perform(ctx, a, dt) {
    const sim = ctx.sim;
    const b = sim.state.commonBuild!;
    gain(ctx.r, 'mood', 3, dt);
    gain(ctx.r, 'energy', -2, dt);
    if (a.data.stage === 'bring' || b.stage >= STAGE_FURNISH) return;
    if (STAGE_SCENE[b.stage] !== a.data.stage) {
      // этап сменился, пока работали — дальше делают следующее
      a.data.stage = STAGE_SCENE[b.stage];
      a.data.scene = `build_common:${a.data.stage}`;
      a.label = STAGE_LABEL[b.stage];
    }
    const company = others(sim, ctx.r.id).length;
    gain(ctx.r, 'social', company ? 10 : 0, dt);
    // каждый работающий двигает дело; вместе спорится чуть быстрее
    b.progress += (dt / 3600 / BUILD_HOURS[b.stage]) * (1 + 0.15 * company);
    if (b.progress >= 1) {
      chronicle(sim, 'common.build.stage', [ctx.r.id], 2, { stage: b.stage });
      b.stage++;
      b.progress = 0;
      if (b.stage === STAGE_FURNISH) pickContributor(sim, b);
      applyFurniture(sim);
    }
  },
};

function finish(sim: Simulation, b: CommonBuild): void {
  b.stage = STAGE_DONE;
  b.done = sim.time;
  b.nextBy = null;
  // кто помогал и до сих пор живёт в доме
  const helpers = (b.helpers ?? []).filter((id) => sim.state.residents[id]).slice(0, 6);
  chronicle(sim, 'common.build.done', helpers, 3, {});
}
