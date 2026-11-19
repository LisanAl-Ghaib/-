import type { HabitKind, RoomType } from '../../../data/schemas';
import { gain } from '../../needs';
import { fitDuration, gv, habit, homeSlot, minutesToBed, minutesToLeave, novelty, randomRoom, roomOfType, roomPoint, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

interface LeisureSpec {
  id: string;
  icon: string;
  /** тип слота мебели; null — где угодно в квартире */
  use: string | null;
  rooms?: RoomType[];
  habit?: HabitKind;
  /** без привычки не делает вовсе */
  requiresHabit?: boolean;
  /** или можно и без привычки, если есть условие (книги дома) */
  orIf?: (ctx: AgentCtx) => boolean;
  base: number;
  label: (ctx: AgentCtx) => string;
  rates: { mood?: number; social?: number; energy?: number };
  minutes: [number, number];
  cooldown: number; // секунд
  bonus?: (ctx: AgentCtx) => number;
  /** нужен ли телевизор в той же комнате */
  needsTv?: boolean;
}

function leisure(s: LeisureSpec): ActionDef {
  return {
    id: s.id,
    icon: s.icon,
    plan(ctx) {
      const { r } = ctx;
      if (sleepTime(ctx) || minutesToLeave(ctx) < 25) return null;
      const h = s.habit ? habit(ctx, s.habit) : 0;
      if (s.requiresHabit && h <= 0 && !s.orIf?.(ctx)) return null;
      let target;
      if (s.use) {
        let spot = homeSlot(ctx, s.use, s.rooms);
        if (spot && s.needsTv) {
          const room = ctx.home.rooms[spot.slot.roomIndex];
          if (!room.furniture.some((f) => f.def.draw.includes('tv'))) {
            // поищем место у телевизора
            spot = null;
            for (const room2 of ctx.home.rooms) {
              if (!room2.furniture.some((f) => f.def.draw.includes('tv'))) continue;
              const sl = ctx.sim.findSlot(ctx.home, s.use, r.id, room2.index);
              if (sl && sl.roomIndex === room2.index) spot = { target: { level: ctx.home.level, x: sl.x, slot: sl.key }, slot: sl };
            }
          }
        }
        if (!spot) return null;
        target = spot.target;
      } else {
        const room = (s.rooms && roomOfType(ctx.home, ...s.rooms)) ?? randomRoom(ctx, ctx.home);
        target = roomPoint(ctx, room);
      }
      const score = (s.base + (100 - r.needs.mood) / 22 + h * 3.2 + (s.bonus?.(ctx) ?? 0)) * novelty(ctx, s.id, s.cooldown);
      return {
        score,
        target,
        duration: fitDuration(ctx, ctx.sim.rng.int(s.minutes[0], s.minutes[1]) * 60),
        label: s.label(ctx),
      };
    },
    perform(ctx, _a, dt) {
      if (s.rates.mood) gain(ctx.r, 'mood', s.rates.mood, dt);
      if (s.rates.social) gain(ctx.r, 'social', s.rates.social, dt);
      if (s.rates.energy) gain(ctx.r, 'energy', s.rates.energy, dt);
    },
  };
}

const evening = (ctx: AgentCtx) => (ctx.cal.hourOfDay >= 19 ? 1.5 : 0);
const beforeBed = (ctx: AgentCtx) => (minutesToBed(ctx) < 90 ? 2 : 0);

export const watchTv = leisure({
  id: 'watch_tv', icon: 'tv', use: 'tv', rooms: ['living', 'studio', 'bedroom', 'kitchen'], habit: 'tv', needsTv: true,
  base: 1.6, label: () => 'смотрит телевизор', rates: { mood: 7, energy: 0.6 }, minutes: [30, 90], cooldown: 3 * 3600, bonus: evening,
});

export const read = leisure({
  // читают те, кто любит читать, а почитать может любой, у кого дома есть книги
  id: 'read', icon: 'book', use: 'read', rooms: ['living', 'bedroom', 'study', 'studio'], habit: 'reading', requiresHabit: true, orIf: hasBooks,
  base: 1.4, label: () => 'читает', rates: { mood: 6 }, minutes: [25, 80], cooldown: 3 * 3600, bonus: beforeBed,
});

const musicBase = leisure({
  id: 'music', icon: 'music', use: 'music', habit: 'music', requiresHabit: true,
  base: 1.2, label: () => 'музицирует',
  rates: { mood: 9 }, minutes: [20, 60], cooldown: 5 * 3600,
});

/** Музыка: на чём играет — видно по инструменту, к которому подошёл */
export const music: ActionDef = {
  ...musicBase,
  onArrive(ctx, a) {
    const slot = a.target.slot ? ctx.sim.slotIndex.get(a.target.slot) : undefined;
    const f = slot ? ctx.home.rooms[slot.roomIndex].furniture.find((x) => x.uid === slot.furnitureUid) : undefined;
    a.label = f?.def.draw === 'eguitar_amp' ? 'играет на электрогитаре' : f?.def.draw === 'guitar' ? 'играет на гитаре' : 'играет на пианино';
    return true;
  },
};

export const gaming = leisure({
  id: 'gaming', icon: 'game', use: 'gaming', habit: 'gaming', requiresHabit: true,
  base: 1.3,
  label: (ctx) => (online(ctx) && ctx.sim.rng.chance(0.6) ? 'играет по сети с друзьями' : 'играет в компьютерные игры'),
  rates: { mood: 8, energy: -0.8 }, minutes: [40, 120], cooldown: 4 * 3600,
  bonus: (ctx) => {
    const h = ctx.cal.hourOfDay;
    // ночь напролёт за игрой (до четырёх утра)
    if (ctx.r.plan?.allNighter && (h >= 22 || h < 4)) return 14;
    return h >= 21 || h < 3 ? 2 : 0;
  },
});

/** Общается онлайн (дискорд): переписка, созвоны, совместные игры */
export function online(ctx: AgentCtx): boolean {
  return ctx.def.traits.tags.some((t) => /дискорд|онлайн/i.test(t));
}

/** Шахматы: один — разбирает партию, вдвоём — играют (совместное — в couple.ts) */
export const chess: ActionDef = {
  id: 'chess',
  icon: 'dots',
  plan(ctx) {
    if (sleepTime(ctx) || minutesToLeave(ctx) < 25) return null;
    const h = habit(ctx, 'chess');
    if (h <= 0) return null;
    const room = ctx.home.rooms.find((rm) => rm.furniture.some((f) => f.def.draw === 'chessboard'));
    if (!room) return null;
    const sl = ctx.sim.findSlot(ctx.home, 'eat', ctx.r.id, room.index) ?? ctx.sim.findSlot(ctx.home, 'sit', ctx.r.id, room.index);
    if (!sl || sl.roomIndex !== room.index) return null;
    return {
      score: (1.2 + h * 3.2 + (100 - ctx.r.needs.mood) / 25) * novelty(ctx, 'chess', 4 * 3600),
      target: { level: ctx.home.level, x: sl.x, slot: sl.key },
      duration: fitDuration(ctx, ctx.sim.rng.int(25, 70) * 60),
      label: 'разбирает шахматную партию',
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 6, dt);
  },
};

export const computer = leisure({
  id: 'computer', icon: 'game', use: 'work', habit: 'computer', requiresHabit: true,
  base: 1, label: (ctx) => (online(ctx) ? ctx.sim.rng.pick(['переписывается в дискорде', 'созванивается с друзьями онлайн', 'сидит в интернете']) : 'сидит в интернете'), rates: { mood: 4, social: 2 }, minutes: [20, 70], cooldown: 3 * 3600,
});

export const crafts = leisure({
  id: 'crafts', icon: 'gift', use: 'crafts', habit: 'crafts', requiresHabit: true,
  base: 1.2, label: (ctx) => gv(ctx.def, 'мастерит', 'рукодельничает'), rates: { mood: 8 }, minutes: [30, 90], cooldown: 4 * 3600,
});

export const plants = leisure({
  id: 'plants', icon: 'plant', use: 'plants', habit: 'plants',
  base: 0.6, label: () => 'поливает цветы', rates: { mood: 10 }, minutes: [5, 12], cooldown: 10 * 3600,
  bonus: (ctx) => (ctx.cal.hourOfDay < 11 ? 2 : 0),
});

export const fitness = leisure({
  id: 'fitness', icon: 'sport', use: 'exercise', habit: 'fitness', requiresHabit: true,
  base: 1, label: () => 'занимается спортом', rates: { mood: 8, energy: -6 }, minutes: [20, 45], cooldown: 12 * 3600,
  bonus: (ctx) => (ctx.r.needs.energy > 60 ? 1.5 : -3),
});

export const phone = leisure({
  id: 'phone', icon: 'phone', use: 'sit', rooms: ['living', 'kitchen', 'bedroom', 'studio'], habit: 'phone',
  base: 0.6, label: () => 'болтает по телефону', rates: { mood: 4, social: 18 }, minutes: [10, 45], cooldown: 4 * 3600,
  bonus: (ctx) => (ctx.cal.hourOfDay < 9 || ctx.cal.hourOfDay >= 22.5 ? -50 : (100 - ctx.r.needs.social) / 18),
});
// звонить можно только тем, с кем созваниваются (contacts с phone)
const phoneBase = phone.plan;
phone.plan = (ctx) => (ctx.def.contacts.some((c) => c.phone) ? phoneBase(ctx) : null);

export const lookOutside = leisure({
  id: 'window', icon: 'dots', use: 'look', habit: 'plants',
  base: 0.9, label: () => 'смотрит в окно', rates: { mood: 3 }, minutes: [5, 15], cooldown: 3 * 3600,
});

export const chores = leisure({
  id: 'chores', icon: 'wash', use: null,
  base: 1.6, label: (ctx) => ctx.sim.rng.pick(['наводит порядок', 'протирает пыль', 'разбирает вещи', 'моет пол', 'складывает бельё']),
  rates: { mood: 1.5, energy: -1.5 }, minutes: [15, 40], cooldown: 6 * 3600,
  bonus: (ctx) => (ctx.def.traits.tags.some((t) => /аккурат|педант|чистопл/i.test(t)) ? 2 : 0),
});

/** Бездельничает: ходит по квартире, присаживается */
export const idle: ActionDef = {
  id: 'idle',
  plan(ctx) {
    const { sim, home, r } = ctx;
    if (sleepTime(ctx)) return null;
    const cur = sim.defs.layout.roomAt(home, r.away ? home.x0 : r.x);
    const room = randomRoom(ctx, home, cur.index);
    const seat = sim.rng.chance(0.6) ? sim.findSlot(home, 'sit', r.id, room.index) : undefined;
    const inRoom = seat && seat.roomIndex === room.index;
    return {
      score: 1.1 * novelty(ctx, 'idle', 1800),
      target: inRoom ? { level: home.level, x: seat.x, slot: seat.key } : roomPoint(ctx, room),
      duration: fitDuration(ctx, sim.rng.int(10, 35) * 60),
      label: inRoom ? `отдыхает (${room.name})` : gv(ctx.def, 'бродит по квартире', 'бродит по квартире'),
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'energy', 1.5, dt);
  },
};

/** Чай или кофе — короткая передышка с чашкой */
export const tea = leisure({
  id: 'tea', icon: 'dots', use: 'eat', rooms: ['kitchen', 'living', 'studio', 'study'],
  base: 1.3,
  label: (ctx) => (ctx.home.rooms.some((r) => r.furniture.some((f) => f.def.draw === 'coffee_machine')) ? 'пьёт кофе' : 'пьёт чай'),
  rates: { mood: 5, energy: 4 }, minutes: [8, 20], cooldown: 3 * 3600,
  bonus: (ctx) => {
    const h = ctx.cal.hourOfDay;
    // любители кофе по утрам: первым делом — чашка
    if (h >= 6 && h < 11 && ctx.def.traits.tags.some((t) => /кофе/i.test(t)) && ctx.now - (ctx.r.recent.tea ?? -1e9) > 5 * 3600) return 6;
    return (h >= 7 && h < 10) || (h >= 15.5 && h < 17.5) ? 1.8 : 0;
  },
});

/** Дома есть книги: стеллаж, стопка, полка с книгами */
export function hasBooks(ctx: AgentCtx): boolean {
  return ctx.home.rooms.some((r) => r.furniture.some((f) => f.def.draw === 'bookshelf' || f.def.draw === 'books_stack' || f.def.draw === 'wall_shelf'));
}
