import { describe, expect, it } from "vitest";
import { advance, finish } from "./steps";

function* counting(total: number): Generator<void, number, void> {
  for (let step = 0; step < total; step += 1) yield;
  return total;
}

describe("advance", () => {
  it("runs at most the given number of steps and reports the work unfinished", () => {
    let ran = 0;
    function* tallied(): Generator<void, number, void> {
      for (let step = 0; step < 5; step += 1) {
        ran += 1;
        yield;
      }
      return 5;
    }
    const steps = tallied();
    expect(advance(steps, 3)).toEqual({ done: false });
    expect(ran).toBe(3);
    expect(advance(steps, 3)).toEqual({ done: true, value: 5 });
    expect(ran).toBe(5);
  });

  it("finishes work that ends within the steps given", () => {
    expect(advance(counting(2), 3)).toEqual({ done: true, value: 2 });
    expect(advance(counting(3), 3)).toEqual({ done: false });
    expect(advance(counting(0), 1)).toEqual({ done: true, value: 0 });
  });

  it("stops at the end of the first step that leaves it over budget", () => {
    let ran = 0;
    const steps = counting(10);
    const progress = advance(steps, 8, () => {
      ran += 1;
      return ran >= 2;
    });
    expect(progress).toEqual({ done: false });
    expect(ran).toBe(2);
    expect(advance(steps, 9)).toEqual({ done: true, value: 10 });
  });
});

describe("finish", () => {
  it("runs the work to its end", () => expect(finish(counting(1000))).toBe(1000));
});
