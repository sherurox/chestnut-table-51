import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serialQueue.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("createSerialQueue", () => {
  it("runs one task at a time, in order", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    const task = (name: string) => async () => {
      running++;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      running--;
      return name;
    };
    const results = await Promise.all([enqueue(task("a")), enqueue(task("b")), enqueue(task("c"))]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("a failed task doesn't block the next", async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(async () => {
      throw new Error("boom");
    });
    const next = enqueue(async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
