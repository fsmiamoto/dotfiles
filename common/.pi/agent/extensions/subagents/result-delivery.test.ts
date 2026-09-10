import assert from "node:assert/strict";
import test from "node:test";
import { createDeferredResultDelivery } from "./src/result-delivery.ts";

test("a result consumed by a later wait is not delivered", () => {
  const delivery = createDeferredResultDelivery<{
    id: string;
    output: string;
  }>();

  delivery.defer({ id: "sa-1", output: "done" });
  delivery.consume(["sa-1"]);

  assert.deepEqual(delivery.drain(), []);
});

test("unconsumed results are delivered once in settlement order", () => {
  const delivery = createDeferredResultDelivery<{ id: string }>();
  const first = { id: "sa-1" };
  const second = { id: "sa-2" };

  delivery.defer(first);
  delivery.defer(second);

  assert.deepEqual(delivery.drain(), [first, second]);
  assert.deepEqual(delivery.drain(), []);
});

test("handoff waits for queued reports to enter the next model turn", () => {
  const delivery = createDeferredResultDelivery<{ id: string }>();
  delivery.defer({ id: "sa-1" });
  assert.equal(delivery.pendingCount(), 1);
  delivery.drain();
  assert.equal(delivery.pendingCount(), 1);
  delivery.delivered("sa-1");
  assert.equal(delivery.pendingCount(), 0);

  delivery.defer({ id: "sa-2" });
  delivery.consume(["sa-2"]);
  assert.equal(delivery.pendingCount(), 0);
  delivery.defer({ id: "sa-3" });
  delivery.drain();
  delivery.clear();
  assert.equal(delivery.pendingCount(), 0);
});

test("each queued report must be ingested before handoff", () => {
  const delivery = createDeferredResultDelivery<{ id: string }>();
  delivery.defer({ id: "sa-1" });
  delivery.defer({ id: "sa-2" });
  delivery.drain();
  delivery.delivered("sa-1");
  assert.equal(delivery.pendingCount(), 1);
  delivery.delivered("sa-2");
  assert.equal(delivery.pendingCount(), 0);
});

test("explicit wait recovers a queued report discarded by native Esc", () => {
  const delivery = createDeferredResultDelivery<{ id: string }>();
  delivery.defer({ id: "sa-1" });
  delivery.defer({ id: "sa-2" });
  delivery.drain();
  delivery.delivered("sa-1");
  // Esc clears the second follow-up, so no message_start acknowledges it.
  assert.equal(delivery.pendingCount(), 1);
  delivery.consume(["sa-2"]);
  assert.equal(delivery.pendingCount(), 0, "subagent_wait clears the handoff latch");
  delivery.delivered("sa-2");
  assert.equal(delivery.pendingCount(), 0, "late acknowledgments are harmless");
});

test("acknowledgments track each child and repeated settlements", () => {
  const delivery = createDeferredResultDelivery<{ id: string }>();
  delivery.defer({ id: "sa-1" }); delivery.drain();
  delivery.defer({ id: "sa-1" }); delivery.drain();
  delivery.defer({ id: "sa-2" }); delivery.drain();
  delivery.delivered("unknown");
  assert.equal(delivery.pendingCount(), 3);
  delivery.delivered("sa-1");
  assert.equal(delivery.pendingCount(), 2);
  delivery.consume(["sa-1"]);
  assert.equal(delivery.pendingCount(), 1, "wait never consumes another child's report");
  delivery.delivered("sa-2");
  assert.equal(delivery.pendingCount(), 0);
});
