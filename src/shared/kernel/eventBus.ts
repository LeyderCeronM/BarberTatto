type Handler<T> = (payload: T) => void | Promise<void>;

/**
 * Bus de eventos en proceso. Es el único canal por el que un módulo reacciona
 * a lo que pasa en otro sin importarlo (booking -> notifications).
 */
export class EventBus<E extends Record<string, unknown>> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const list = (this.handlers[type] ??= []);
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  async emit<K extends keyof E>(type: K, payload: E[K]): Promise<void> {
    for (const h of this.handlers[type] ?? []) await h(payload);
  }
}
