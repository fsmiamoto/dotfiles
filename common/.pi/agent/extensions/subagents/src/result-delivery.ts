export function createDeferredResultDelivery<T extends { id: string }>() {
  const pending = new Map<string, T>();
  const queued = new Map<string, number>();

  return {
    defer(result: T) {
      pending.set(result.id, result);
    },
    consume(ids: Iterable<string>) {
      for (const id of ids) {
        pending.delete(id);
        // Native Esc can discard a queued message without a delivery event.
        // Explicit subagent_wait still returns the manager's saved result.
        queued.delete(id);
      }
    },
    drain() {
      const results = [...pending.values()];
      pending.clear();
      for (const { id } of results) queued.set(id, (queued.get(id) ?? 0) + 1);
      return results;
    },
    // Draining only queues a follow-up; acknowledge actual message ingestion.
    delivered(id: string) {
      const remaining = (queued.get(id) ?? 0) - 1;
      if (remaining > 0) queued.set(id, remaining);
      else queued.delete(id);
    },
    pendingCount() {
      return pending.size + [...queued.values()].reduce((sum, count) => sum + count, 0);
    },
    clear() {
      pending.clear();
      queued.clear();
    },
  };
}
