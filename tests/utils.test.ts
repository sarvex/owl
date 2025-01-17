import { batched, EventBus } from "../src/utils";
import { nextMicroTick } from "./helpers";

describe("event bus behaviour", () => {
  test("can subscribe and be notified", () => {
    const bus = new EventBus();
    let notified = false;
    bus.addEventListener("event", () => {
      notified = true;
    });
    expect(notified).toBe(false);
    bus.trigger("event");
    expect(notified).toBe(true);
  });

  test("can unsubscribe", () => {
    const bus = new EventBus();
    let n = 0;
    let cb = () => n++;
    bus.addEventListener("event", cb);
    expect(n).toBe(0);
    bus.trigger("event");
    expect(n).toBe(1);
    bus.removeEventListener("event", cb);
    expect(n).toBe(1);
    bus.trigger("event");
    expect(n).toBe(1);
  });

  test("arguments are properly propagated", () => {
    expect.assertions(1);
    const bus = new EventBus();
    bus.addEventListener("event", (ev: any) => expect(ev.detail).toBe("hello world"));
    bus.trigger("event", "hello world");
  });
});

describe("batched", () => {
  test("callback is called only once after operations", async () => {
    let n = 0;
    let fn = batched(() => n++);

    expect(n).toBe(0);
    fn();
    fn();
    expect(n).toBe(0);

    await nextMicroTick();
    expect(n).toBe(1);
    await nextMicroTick();
    expect(n).toBe(1);
  });
});
