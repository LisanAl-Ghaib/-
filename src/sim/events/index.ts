import { apologyIntent, birthday, illness } from './defs/daily';
import { convQuarrel, deepTalk, dinnerTogether, gossip, playMusic, talk } from './defs/conversation';
import { avoid, chatEvent, elevatorMeet, greet, quarrelMeet, reconcileMeet } from './defs/encounter';
import { familyChat, familyQuarrel, familyReconcile } from './defs/household';
import { recovery } from './defs/hourly';
import type { EventDef } from './types';

/**
 * Реестр событий. Новое событие = новый EventDef (см. ./types.ts) + строка здесь.
 * Текст для хроники — в src/sim/chronicle/narrator.ts (по kind записи).
 */
export const EVENTS: readonly EventDef[] = [
  // встречи в подъезде и во дворе
  greet, chatEvent, avoid, reconcileMeet, quarrelMeet, elevatorMeet,
  // темы разговоров в гостях и на лавочке
  talk, deepTalk, gossip, convQuarrel, dinnerTogether, playMusic,
  // жизнь семьи
  familyChat, familyQuarrel, familyReconcile,
  // календарь
  birthday, illness, apologyIntent, recovery,
];
