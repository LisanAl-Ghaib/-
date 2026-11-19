import type { Interaction } from '../state';
import type { Simulation } from '../simulation';

/**
 * Триггеры событий:
 *  - daily        — раз в «логические сутки» для каждого жильца (ctx.who)
 *  - hourly       — раз в игровой час для мира
 *  - encounter    — двое встретились в подъезде/во дворе/в лифте (ctx.a, ctx.b, ctx.place)
 *  - conversation — каждые ~25 минут совместного занятия (ctx.a, ctx.b, ctx.interaction)
 *  - household    — раз в час для членов одной семьи, которые дома вместе (ctx.a, ctx.b)
 */
export type Trigger = 'daily' | 'hourly' | 'encounter' | 'conversation' | 'household';

export type PlaceKind = 'stairs' | 'lobby' | 'entrance' | 'yard' | 'bench' | 'elevator' | 'busstop' | 'home' | 'guest' | 'balcony' | 'common';

export interface EventCtx {
  sim: Simulation;
  now: number;
  who?: string;
  a?: string;
  b?: string;
  interaction?: Interaction;
  /** фраза места для хроники: «на лестнице», «во дворе» */
  place?: string;
  placeKind?: PlaceKind;
  /** кто-то из пары спешит (на работу, к автобусу) */
  hurry?: boolean;
}

/**
 * Событие мира. Для взаимоисключающих триггеров (encounter, conversation, household)
 * движок выбирает одно событие по весу weight(); для независимых (daily, hourly)
 * каждое срабатывает с вероятностью chance().
 */
export interface EventDef {
  id: string;
  trigger: Trigger;
  weight?(ctx: EventCtx): number;
  chance?(ctx: EventCtx): number;
  apply(ctx: EventCtx): void;
}
