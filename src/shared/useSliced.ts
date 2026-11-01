import { useEffect, useState } from "react";
import { advance, type Progress, type Steps } from "./steps";

/** Work started by `startSlices`: its steps, the slice size, and how its first slice ended. */
export interface Sliced<Result> {
  steps: Steps<Result>;
  stepsPerSlice: number;
  first: Progress<Result>;
}

/** What `Work` returns when it finishes. */
export type ResultOf<Work> = Work extends Sliced<infer Result> ? Result : never;

/** Work that finished, with the `Sliced` it came from (so a caller can tell whose result it is). */
export interface Finished<Work> {
  sliced: Work;
  value: ResultOf<Work>;
}

/**
 * Runs the first `stepsPerSlice` steps of `steps` now. Call it inside a
 * `useMemo`, so the first slice runs during the render that needs it.
 */
export function startSlices<Result>(steps: Steps<Result>, stepsPerSlice: number): Sliced<Result> {
  return { steps, stepsPerSlice, first: advance(steps, stepsPerSlice) };
}

/**
 * Milliseconds a slice after the first may run before it hands the main
 * thread back, whatever its step count: steps differ in cost (one scene step
 * colours every territory), and a task over 50 ms counts against total
 * blocking time (spec mobile §7).
 */
export const SLICE_BUDGET_MILLISECONDS = 16;

/**
 * The latest finished work (spec mobile §7): `sliced` itself when its first
 * slice finished it, otherwise the work that finished last, while the rest
 * of `sliced` runs one slice per task (at most `stepsPerSlice` steps and
 * `SLICE_BUDGET_MILLISECONDS` by `now`), so no slice holds the main thread
 * long. Null until some work has finished. Work replaced before it finished
 * is dropped. The first slice has no time budget, so whether work finishes
 * during the render never depends on the machine.
 */
export function useSliced<Work extends Sliced<unknown>>(
  sliced: Work,
  now: () => number = () => performance.now(),
): Finished<Work> | null {
  const [finished, setFinished] = useState<Finished<Work> | null>(null);
  const [clock] = useState(() => now);

  useEffect(() => {
    if (sliced.first.done) return;
    const slice = () => {
      const start = clock();
      const progress = advance(sliced.steps, sliced.stepsPerSlice, () => clock() - start >= SLICE_BUDGET_MILLISECONDS);
      if (progress.done) setFinished({ sliced, value: progress.value as ResultOf<Work> });
      else timer = setTimeout(slice, 0);
    };
    let timer = setTimeout(slice, 0);
    return () => clearTimeout(timer);
  }, [sliced, clock]);

  return sliced.first.done ? { sliced, value: sliced.first.value as ResultOf<Work> } : finished;
}
