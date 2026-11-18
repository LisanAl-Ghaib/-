import { addMoodlet, gain } from '../../needs';
import { aptState, daytime, fitDuration, gv, habit, homeSlot, householdIds, MEAL_WORD, mealDue, minutesToLeave, sleepTime, urgency } from '../helpers';
import type { ActionDef } from '../types';

/** Поесть готовой еды */
export const eat: ActionDef = {
  id: 'eat',
  icon: 'food',
  plan(ctx) {
    const { r } = ctx;
    if (sleepTime(ctx)) return null;
    const st = aptState(ctx);
    if (st.meals < 1) return null;
    const due = mealDue(ctx, 60 * 60);
    const hungry = urgency(r.needs.food, 75);
    if (!due && r.needs.food > 60) return null;
    const spot = homeSlot(ctx, 'eat', ['kitchen', 'living', 'studio']) ?? homeSlot(ctx, 'sit');
    if (!spot) return null;
    const quick = due === 'breakfast' || minutesToLeave(ctx) < 40;
    return {
      score: hungry * 1.3 + (due ? 6 : 0),
      target: spot.target,
      duration: ctx.sim.rng.int(quick ? 8 : 15, quick ? 14 : 30) * 60,
      label: due ? MEAL_WORD[due].eat : 'перекусывает',
      data: { meal: due },
      interruptible: false,
    };
  },
  onArrive(ctx, a) {
    // пока шёл — еду могли съесть
    if (aptState(ctx).meals < 1) return false;
    aptState(ctx).meals -= 1;
    a.data.ate = true;
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'food', 160, dt);
    gain(ctx.r, 'mood', 3, dt);
  },
  onEnd(ctx, a) {
    const meal = a.data.meal;
    if (meal === 'breakfast' || meal === 'lunch' || meal === 'dinner') ctx.r.today[meal] = true;
    if (!a.data.ate) return;
    if (ctx.r.needs.food > 85) addMoodlet(ctx, 'fed', 'Сытно поел(а)', 3, 3);
  },
};

/** Приготовить еду (на всю семью) */
export const cook: ActionDef = {
  id: 'cook',
  icon: 'cook',
  plan(ctx) {
    const { r, sim } = ctx;
    if (sleepTime(ctx)) return null;
    const st = aptState(ctx);
    const people = householdIds(ctx).length;
    if (st.groceries < 1 || st.meals >= people) return null;
    const soon = mealDue(ctx, 45 * 60);
    const love = habit(ctx, 'cooking');
    const hungry = urgency(r.needs.food, 70);
    if (!soon && hungry < 2) {
      // любители готовить иногда возятся на кухне просто так (пироги!)
      if (love < 0.6 || !daytime(ctx, 10, 20) || st.meals > 0 || r.sick) return null;
    }
    const spot = homeSlot(ctx, 'cook', ['kitchen', 'studio']);
    if (!spot) return null;
    const meal = soon ?? 'dinner';
    const quick = meal === 'breakfast' || minutesToLeave(ctx) < 70;
    const baking = !soon && hungry < 2;
    const dur = baking ? sim.rng.int(60, 100) : quick ? sim.rng.int(8, 15) : sim.rng.int(25, 45) + Math.round(love * 25);
    return {
      score: (hungry * 0.9 + (soon ? 6 : 0) + (baking ? 2.5 * love : 0)) * (0.75 + love * 0.6),
      target: spot.target,
      duration: fitDuration(ctx, dur * 60),
      label: baking ? 'печёт пирог' : MEAL_WORD[meal].cook,
      data: { baking, portions: people + (love > 0.5 ? 1 : 0) + (baking ? 3 : 0) },
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 1 + habit(ctx, 'cooking') * 6, dt);
  },
  onEnd(ctx, a, interrupted) {
    if (interrupted && ctx.now - a.performStart < 5 * 60) return;
    const st = aptState(ctx);
    st.groceries = Math.max(0, st.groceries - (a.data.baking ? 1.5 : 1));
    st.meals += Number(a.data.portions ?? 2);
    if (habit(ctx, 'cooking') > 0.5) addMoodlet(ctx, 'cooked', 'Приготовил(а) что-то вкусное', 5, 5);
    ctx.sim.emit({ type: 'cooked', t: ctx.now, residentId: ctx.r.id, baking: !!a.data.baking, portions: Number(a.data.portions ?? 2) });
  },
};

/** Перехватить что-нибудь из холодильника */
export const snack: ActionDef = {
  id: 'snack',
  icon: 'food',
  plan(ctx) {
    const { r } = ctx;
    if (sleepTime(ctx) || r.needs.food > 35) return null;
    const st = aptState(ctx);
    if (st.meals >= 1 || st.groceries < 0.3) return null;
    const spot = homeSlot(ctx, 'fridge');
    if (!spot) return null;
    return {
      score: urgency(r.needs.food, 50) * 0.8,
      target: spot.target,
      duration: 6 * 60,
      label: gv(ctx.def, 'жуёт бутерброд у холодильника', 'жуёт бутерброд у холодильника'),
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'food', 220, dt);
  },
  onEnd(ctx) {
    const st = aptState(ctx);
    st.groceries = Math.max(0, st.groceries - 0.3);
  },
};

/** Сходить в магазин */
export const shopping: ActionDef = {
  id: 'shopping',
  icon: 'bag',
  plan(ctx) {
    const { r } = ctx;
    const st = aptState(ctx);
    if (st.groceries >= 2 || !daytime(ctx, 8, 21) || sleepTime(ctx)) return null;
    if (minutesToLeave(ctx) < 90) return null;
    // кто-то из семьи уже пошёл
    for (const id of householdIds(ctx)) if (id !== r.id && ctx.sim.state.residents[id]?.action?.id === 'shopping') return null;
    return {
      score: (st.groceries < 1 ? 7 : 3.5) + urgency(r.needs.food) * 0.3,
      target: { level: 0, x: ctx.sim.defs.layout.yard.offscreenX, away: true },
      duration: ctx.sim.rng.int(30, 60) * 60,
      label: gv(ctx.def, 'ушёл в магазин', 'ушла в магазин'),
      via: 'walk',
      data: { out: true },
    };
  },
  onArrive(ctx, a) {
    a.label = gv(ctx.def, 'в магазине', 'в магазине');
  },
  onEnd(ctx, _a, interrupted) {
    if (interrupted) return;
    aptState(ctx).groceries += 6;
    ctx.sim.emit({ type: 'shopped', t: ctx.now, residentId: ctx.r.id });
  },
};
