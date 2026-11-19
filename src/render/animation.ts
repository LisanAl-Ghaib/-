import { hashString } from '../core/rng';
import type { ResidentDef } from '../data/schemas';
import type { ResidentState } from '../sim/state';
import { FRAME, figureOf } from './sprites/character';
import { sceneFor } from './anim/library';
import { personalOf, type Personal } from './anim/personal';
import type { AnimEnv, Beat, Gesture, Micro, Orient, Pose, Scene } from './anim/types';

export type { AnimEnv, Cover, Place, Pose, PropAt, PropKind } from './anim/types';
export { smokePhase, type SmokePhase } from './anim/library';

/**
 * ДВИЖОК ПОЗ (чистая косметика рендера, симуляцию не трогает).
 *
 * Поза = базовая сцена занятия в этом месте (anim/library.ts, одинакова для всех)
 *      + личные добавки (anim/personal.ts, только добавляют)
 *      + общие для всех слои: жест из окна, одевание в прихожей, разговор, мелкие движения.
 *
 * Три уровня движения:
 *  1. Такт сцены меняется каждые несколько игровых минут: откинулся, закинул ногу на ногу,
 *     взял чашку, уткнулся в телефон.
 *  2. Ракурс: лицом, боком (к телевизору, к собеседнику) или спиной (за столом, у плиты).
 *  3. Мелкие движения каждые пару секунд: дышит, моргает, поворачивает голову,
 *     поправляет очки, ёрзает.
 */

export const SIT_FRAMES: Record<Orient, Partial<Record<Gesture, number>>> = {
  front: { rest: FRAME.frontSit, slouch: FRAME.frontSitSlouch, hands: FRAME.frontSitHands, handUp: FRAME.frontSitHandUp, cross: FRAME.frontSitCross },
  side: { rest: FRAME.sit, slouch: FRAME.sitLean, hands: FRAME.sitArm, handUp: FRAME.sitArmUp, cross: FRAME.sitLean },
  back: { rest: FRAME.backSit, slouch: FRAME.backSit, hands: FRAME.backSitWork, handUp: FRAME.backSitWork, cross: FRAME.backSit },
};
export const STAND_FRAMES: Record<Orient, Partial<Record<Gesture, number>>> = {
  front: { stand: FRAME.frontStand, work: FRAME.frontStand, workUp: FRAME.frontWave, phoneStand: FRAME.standHandUp, talk: FRAME.frontTalk, wave: FRAME.frontWave },
  side: { stand: FRAME.stand, work: FRAME.work, workUp: FRAME.workUp, phoneStand: FRAME.standHandUp, talk: FRAME.frontTalk, wave: FRAME.workUp },
  back: { stand: FRAME.backStand, work: FRAME.backWork, workUp: FRAME.backWork, phoneStand: FRAME.backStand, talk: FRAME.backStand, wave: FRAME.backWork },
};
const SIT_G = new Set<Gesture>(['rest', 'slouch', 'hands', 'handUp', 'cross']);
const STAND_G = new Set<Gesture>(['stand', 'work', 'workUp', 'phoneStand', 'talk', 'wave']);

const NOT_IN_TALK = new Set<string>(['phone', 'book', 'paper', 'laptop']);
const SEG_MIN = 5; // такт меняется каждые ~5 игровых минут (≈ 5 секунд)

function mixHash(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** id занятия для библиотеки (у пары — `together:<kind>`) */
export function activityKey(r: ResidentState): string {
  const a = r.action;
  if (!a || a.phase !== 'perform') return '';
  if (a.id === 'together') return `together:${a.data.kind}`;
  // у некоторых занятий есть варианты сцены (на балконе: с чаем, с лейкой, с книгой)
  return typeof a.data.scene === 'string' ? `${a.id}:${a.data.scene}` : a.id;
}

/** Ракурсы, которые есть в базовой сцене (личные добавки не могут их расширить) */
function sceneOrients(s: Scene, base: Orient): Set<Orient> {
  const out = new Set<Orient>([s.orient ?? base]);
  for (const b of s.beats ?? []) out.add(b.o ?? s.orient ?? base);
  return out;
}

/**
 * Такты сцены: база + личные добавки той же позы и тех же ракурсов.
 * Экспортируется для атласа и тестов.
 */
export function mergedBeats(scene: Scene, p: Personal, id: string, place: string | undefined, base: Orient): Beat[] {
  const beats = scene.beats ?? [];
  if (!beats.length) return beats;
  const allowedG = scene.posture === 'sit' ? SIT_G : STAND_G;
  const orients = sceneOrients(scene, base);
  const extra = [...(p.extra[id] ?? []), ...(place ? p.extra[`${id}@${place}`] ?? [] : []), ...(p.extra[`*${scene.posture}`] ?? [])];
  const ok = extra.filter((b) => allowedG.has(b.g) && (!b.alt || allowedG.has(b.alt.g)) && orients.has(b.o ?? scene.orient ?? base));
  return ok.length ? beats.concat(ok) : beats;
}

function pickWeighted(list: Beat[], r: number): Beat {
  let total = 0;
  for (const b of list) total += b.w ?? 1;
  let k = r % total;
  for (const b of list) {
    k -= b.w ?? 1;
    if (k < 0) return b;
  }
  return list[0];
}

/** Поза жильца прямо сейчас */
export function animatePose(r: ResidentState, def: ResidentDef, tGame: number, nowMs: number, env: AnimEnv = {}): Pose {
  const h = hashString(r.id);
  const a = r.action;
  const id = activityKey(r);
  const P = personalOf(def);
  const seg = Math.floor((tGame / 60 + (h % 13)) / SEG_MIN);
  const talking = a?.data.talking === true || r.interaction !== null || !!env.chatter;
  // мелкие движения: окно ~2.6 с, активная часть — первые ~1.1 с; непоседы — чаще
  const per = Math.round(2600 / P.tempo);
  const win = Math.floor((nowMs + (h % per)) / per);
  const inWin = (nowMs + (h % per)) % per;
  const roll = inWin < 1100 ? mixHash(win, h ^ 0x55) % 12 : 99;
  const blink = (nowMs + h * 53) % 3700 < 140;
  const faceTo: 1 | -1 | undefined = env.faceToX !== undefined ? (env.faceToX >= r.x ? 1 : -1) : undefined;
  const breathe = Math.floor((nowMs + h) / 1900) % 2;

  // ── общие слои (одинаковы для всех и для любого занятия)

  // жест: кивнул или помахал кому-то (мастерам из окошка, уходящему из окна)
  const gest = r.gesture && r.gesture.until > tGame ? r.gesture : null;
  if (gest?.kind === 'write' && r.path.length === 0) {
    // записывает в блокнот: блокнот в руке, карандаш бегает
    const look = Math.floor((nowMs + h) / 1500) % 4 === 0; // поднял глаза, подумал
    if (r.pose === 'sit') return { frame: look ? FRAME.sitArmUp : FRAME.sitArm, prop: look ? { kind: 'pencil', at: 'mouth' } : { kind: 'notebook', at: 'hands' }, bob: breathe, blink };
    return { frame: look ? FRAME.workUp : FRAME.work, prop: look ? { kind: 'pencil', at: 'mouth' } : { kind: 'notebook', at: 'fwd' }, facing: r.facing, blink };
  }
  if (gest && gest.kind !== 'write') {
    const toward: 1 | -1 = gest.toX >= r.x ? 1 : -1;
    const k = Math.floor(nowMs / (gest.kind === 'wave' ? 260 : 220)) % 2;
    if (r.pose === 'sit') {
      if (gest.kind === 'wave') return { frame: k ? FRAME.sitArmUp : FRAME.sitArm, facing: toward };
      return { frame: k ? FRAME.sitLean : FRAME.sit, bob: k, facing: toward };
    }
    if (gest.kind === 'wave' && gest.side) return { frame: k ? FRAME.workUp : FRAME.work, facing: toward };
    if (gest.kind === 'wave') return { frame: k ? FRAME.frontWave : FRAME.frontStand };
    return { frame: FRAME.stand, bob: k, facing: toward };
  }
  // в прихожей: надевает куртку, обувается (или раздевается, вернувшись)
  if (r.pose === 'stand' && a?.phase === 'travel' && a.data.dressing && Number(a.data.pauseUntil ?? 0) > tGame) {
    const left = Number(a.data.pauseUntil) - tGame;
    const k = Math.floor(nowMs / 380) % 3;
    if (left < 25) return { frame: FRAME.frontStand, blink }; // готов — поправил воротник
    if (a.data.dressing === 'on' && left > 60) return { frame: k === 2 ? FRAME.work : FRAME.workUp, facing: r.facing }; // снимает куртку с вешалки
    return { frame: k === 0 ? FRAME.frontWave : k === 1 ? FRAME.standHandUp : FRAME.frontStand, bob: k === 2 ? 1 : 0 }; // руки в рукава, шнурки
  }
  if (r.pose === 'stand' && r.path.length > 0) return { frame: FRAME.stand };

  // ── базовая сцена
  const scene = sceneFor(id, env.place, r.pose);
  // мелкое движение из допустимых для сцены + личные
  const pool: Micro[] = [...(scene.micro ?? []), ...P.micro.filter((m) => (scene.micro ?? []).length > 0 || m === 'look')];
  const micro: Micro | null = roll < P.fidget && pool.length ? pool[mixHash(win, h ^ 0x77) % pool.length] : null;

  if (scene.script) {
    const pose = scene.script({ nowMs, tGame, seed: h, seg, micro, blink, breathe, env, figH: figureOf(def.appearance).H, y: r.y, tempo: P.tempo, data: a?.data ?? {}, faceTo });
    if (pose.prop && P.swaps[pose.prop.kind]) pose.prop = { kind: P.swaps[pose.prop.kind]!, at: pose.prop.at };
    return pose;
  }

  const talkOk = scene.talk !== false && talking;

  if (r.pose === 'sit') {
    let base: Orient = env.tableBack ? 'back' : r.front ? 'front' : 'side';
    if (faceTo !== undefined && !env.tableBack) base = 'side';
    if (scene.orient && !env.tableBack && faceTo === undefined) base = scene.orient;
    const all = mergedBeats(scene, P, id, env.place, base);
    // в разговоре не утыкается в телефон и книгу
    let list = talkOk ? all.filter((b) => !b.prop || !NOT_IN_TALK.has(b.prop.kind)) : all;
    if (!list.length) list = all;
    // кино вдвоём: ноутбук у одного, второй — рядом
    if (id === 'together:film' && !a?.data.lead) list = list.filter((x) => x.prop?.kind !== 'laptop');
    const v = pickWeighted(list, mixHash(seg, h));
    let o: Orient = v.o && !env.tableBack ? v.o : base;
    let g: Gesture = v.g;
    if (v.alt && Math.floor((nowMs * P.tempo) / v.alt.ms + h) % 2 === 1) g = v.alt.g;
    // в разговоре — жестикулирует; кто объясняет руками — рисует в воздухе схемы
    if (talkOk) {
      const ph = Math.floor(nowMs / (P.talk.explain ? 600 : 900) + h);
      if (P.talk.explain && ph % 5 < 3) g = ph % 5 === 1 ? 'hands' : 'handUp';
      else if (ph % 4 === 0) g = 'handUp';
    }
    let dx = (mixHash(seg, h ^ 0x33) % 3) - 1; // поёрзал (раз в такт)
    // мелкие движения
    switch (micro) {
      case 'look': o = o === 'front' ? 'side' : 'front'; break; // повернул голову
      case 'hand': case 'glasses': if (o !== 'back') g = 'handUp'; break; // почесал затылок, поправил очки
      case 'beard': if (o !== 'back') g = 'handUp'; break;
      case 'shawl': if (o === 'front') g = 'hands'; break; // запахнула шаль
      case 'slouch': g = 'slouch'; break;
      case 'stretch': if (o !== 'back') { o = 'front'; g = 'handUp'; } break; // потянулся, потёр поясницу
      case 'shift': dx = -dx || 1; break;
    }
    let frame = SIT_FRAMES[o][g] ?? SIT_FRAMES[o].rest!;
    let prop = v.prop;
    if (g !== v.g && !(v.alt && g === v.alt.g)) prop = undefined;
    if (o === 'back') prop = undefined;
    if (prop && P.swaps[prop.kind]) prop = { kind: P.swaps[prop.kind]!, at: prop.at };
    if (frame === FRAME.frontSitCross && prop?.at === 'hands') frame = FRAME.frontSitHands;
    const facing = o === 'side' ? faceTo ?? (micro === 'look' ? (-r.facing as 1 | -1) : undefined) : undefined;
    return { frame, prop, bob: breathe, dx, facing, blink: blink && o !== 'back' };
  }

  if (r.pose === 'lie') return { frame: FRAME.lie, bob: breathe, cover: 'blanketHalf' };

  // стоит
  if (talkOk) {
    // говорит (жестикулирует) и слушает по очереди
    const turn = Math.floor((nowMs + h * 7) / 2600) % 2 === 0; // его очередь говорить
    if (!turn && P.talk.tilt) {
      // слушает, чуть наклонив голову к собеседнику, кивает
      return { frame: FRAME.stand, facing: faceTo, bob: Math.floor((nowMs + h) / 900) % 3 === 0 ? 1 : 0, blink };
    }
    if (turn && P.talk.explain) {
      // объясняет: рисует в воздухе схему — рука то вверх, то в сторону, то к груди
      const k = Math.floor((nowMs + h) / 420) % 4;
      return { frame: [FRAME.frontTalk, FRAME.frontWave, FRAME.standHandUp, FRAME.frontWave][k], blink };
    }
    const g: Gesture = turn && Math.floor(nowMs / 700 + h) % 3 === 0 ? 'talk' : 'stand';
    const o: Orient = micro === 'look' ? 'side' : 'front';
    return { frame: STAND_FRAMES[o][g]!, facing: faceTo, blink };
  }
  const base: Orient = scene.orient ?? (r.front ? 'front' : 'side');
  const v = pickWeighted(mergedBeats(scene, P, id, env.place, base), mixHash(seg, h));
  let o: Orient = v.o ?? base;
  let g: Gesture = v.g;
  if (v.alt && Math.floor((nowMs * P.tempo) / v.alt.ms + h) % 2 === 1) g = v.alt.g;
  let dx = 0;
  switch (micro) {
    case 'turn': o = o === 'back' ? 'side' : 'back'; break; // обернулся
    case 'look': if (o === 'back') o = 'side'; else if (!id) o = o === 'front' ? 'side' : 'front'; break;
    case 'stretch': if (!id || id === 'window' || id === 'idle') g = 'wave'; break; // потянулся
    case 'hand': case 'glasses': case 'beard': case 'shawl': if (!id || id === 'idle' || id === 'window') { o = 'front'; g = 'phoneStand'; } break;
    case 'shift': dx = (win % 2) * 2 - 1; break; // переступил
  }
  const frame = STAND_FRAMES[o][g] ?? STAND_FRAMES[o].stand!;
  let prop = o === 'back' ? undefined : v.prop;
  if (g !== v.g && !(v.alt && g === v.alt.g) && g !== 'phoneStand') prop = undefined;
  if (prop && P.swaps[prop.kind]) prop = { kind: P.swaps[prop.kind]!, at: prop.at };
  return { frame, prop, dx: dx || undefined, blink: blink && o !== 'back' };
}

