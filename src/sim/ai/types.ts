import type { CalendarInfo } from '../../core/time';
import type { ResidentDef } from '../../data/schemas';
import type { Target } from '../../world/navigation';
import type { ApartmentModel } from '../../world/layout';
import type { ActiveAction, ResidentState } from '../state';
import type { Simulation } from '../simulation';

export interface AgentCtx {
  sim: Simulation;
  r: ResidentState;
  def: ResidentDef;
  cal: CalendarInfo;
  home: ApartmentModel;
  now: number;
}

export interface ActionPlan {
  score: number;
  target: Target;
  /** длительность выполнения на месте, игровых секунд */
  duration: number;
  label: string;
  data?: ActiveAction['data'];
  interruptible?: boolean;
}

/**
 * Действие жильца (utility AI).
 * plan() оценивает полезность действия для жильца прямо сейчас.
 */
export interface ActionDef {
  id: string;
  /** значок над головой во время выполнения */
  icon?: string;
  plan(ctx: AgentCtx): ActionPlan | null;
  /** вызывается при прибытии на место; false — отменить действие */
  onArrive?(ctx: AgentCtx, a: ActiveAction): boolean | void;
  /** каждый тик во время выполнения */
  perform?(ctx: AgentCtx, a: ActiveAction, dt: number): void;
  /** досрочное (или отложенное) завершение */
  shouldEnd?(ctx: AgentCtx, a: ActiveAction): boolean;
  onEnd?(ctx: AgentCtx, a: ActiveAction, interrupted: boolean): void;
  /** насколько ценно продолжать (для прерываний); по умолчанию — исходная оценка */
  continueScore?(ctx: AgentCtx, a: ActiveAction): number;
}
