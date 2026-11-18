import type { ActionDef } from '../types';
import { goYard, sleep, wander } from './basic';

/**
 * Реестр действий. Чтобы добавить действие — создай ActionDef и допиши сюда.
 * Порядок не важен: выбор делается по оценке полезности.
 */
export const ACTIONS: readonly ActionDef[] = [sleep, wander, goYard];
