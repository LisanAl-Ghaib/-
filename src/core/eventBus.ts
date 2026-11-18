/** Минимальная типизированная шина событий. */
export class EventBus<E extends { type: string }> {
  private handlers = new Map<string, Set<(e: E) => void>>();
  private any = new Set<(e: E) => void>();

  on<T extends E['type']>(type: T, fn: (e: Extract<E, { type: T }>) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (e: E) => void);
    return () => set!.delete(fn as (e: E) => void);
  }

  onAny(fn: (e: E) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  emit(e: E): void {
    this.handlers.get(e.type)?.forEach((fn) => fn(e));
    this.any.forEach((fn) => fn(e));
  }
}
