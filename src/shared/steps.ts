/** Work that can stop between steps: each `yield` ends one step, the return value is the result. */
export type Steps<Result> = Generator<void, Result, void>;

/** Where work stands after `advance`: finished with its result, or with steps left. */
export type Progress<Result> = { done: true; value: Result } | { done: false };

/**
 * Runs up to `count` steps of `steps`, so a caller can hand the main thread
 * back between slices (spec mobile §7), stopping sooner after a step that
 * leaves `overBudget` true. Work whose last step is the last one run reports
 * itself finished on the next call.
 */
export function advance<Result>(
  steps: Steps<Result>,
  count: number,
  overBudget: () => boolean = () => false,
): Progress<Result> {
  for (let step = 0; step < count; step += 1) {
    const outcome = steps.next();
    if (outcome.done) return { done: true, value: outcome.value };
    if (overBudget()) break;
  }
  return { done: false };
}

/** Runs `steps` to the end. */
export function finish<Result>(steps: Steps<Result>): Result {
  for (;;) {
    const outcome = steps.next();
    if (outcome.done) return outcome.value;
  }
}
