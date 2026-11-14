import { describe, expect, it } from "vitest";
import { mapWithLimit } from "../src/utils/concurrency.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithLimit", () => {
  it("returns the results in the order of the items", async () => {
    const results = await mapWithLimit([30, 10, 20], 2, async (ms) => {
      await wait(ms);
      return ms * 2;
    });

    expect(results).toEqual([60, 20, 40]);
  });

  it("runs at most `limit` items at a time", async () => {
    let running = 0;
    let most = 0;

    await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running++;
      most = Math.max(most, running);
      await wait(10);
      running--;
    });

    expect(most).toBe(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithLimit([], 3, async () => 1)).toEqual([]);
  });

  it("starts no new item after a failure, and fails only when nothing is running", async () => {
    const started: number[] = [];
    let running = 0;

    const result = mapWithLimit(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      3,
      async (n) => {
        started.push(n);
        running++;
        try {
          // Item 0 fails at once; the others take a while
          if (n === 0) throw new Error("item 0 failed");
          await wait(30);
        } finally {
          running--;
        }
      },
    );

    await expect(result).rejects.toThrow("item 0 failed");
    // Only the first three had started; the two still running finished
    // before the error was passed on
    expect(started).toEqual([0, 1, 2]);
    expect(running).toBe(0);
    await wait(80);
    expect(started).toEqual([0, 1, 2]);
  });
});
