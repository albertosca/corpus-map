import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import { fitBounds, sceneBounds } from "./fit";
import type { Viewport } from "./viewport";

/** Refits after widening by the names; three passes settle every corpus in the gallery (demo/corpora/fit.test.ts). */
export const LABEL_FIT_PASSES = 3;

/**
 * The first view: every territory outline whole, and every name that is
 * active and fits the box whole too (closes the BACKLOG item about names cut
 * at the fitted phone view). A name's box is in screen pixels, so its extent
 * in world units depends on the scale being chosen; each pass widens the
 * shape bounds by the names at the previous pass's scale and refits.
 *
 * The names counted are fixed at the shapes-only fit, the largest scale this
 * function can return: widening only lowers the scale, and a lower scale only
 * deactivates names, so no name becomes active after it was left out. Picking
 * the set again on every pass lets a name whose `activeFromScale` sits near
 * the fitted scale flip in and out, and the result never settles.
 */
export function fitScene(
  spec: MapSpec,
  scene: Pick<Scene, "shapes" | "labels">,
  width: number,
  height: number,
  padding: number,
): Viewport {
  const base = sceneBounds(spec, scene.shapes);
  let viewport = fitBounds(base, width, height, padding);
  const counted = scene.labels.filter(
    (label) => viewport.scale >= label.activeFromScale && label.width <= width && label.height <= height,
  );
  for (let pass = 0; pass < LABEL_FIT_PASSES; pass += 1) {
    let { minX, minY, maxX, maxY } = base;
    for (const label of counted) {
      const halfWidth = label.width / 2 / viewport.scale;
      const halfHeight = label.height / 2 / viewport.scale;
      minX = Math.min(minX, label.anchor[0] - halfWidth);
      maxX = Math.max(maxX, label.anchor[0] + halfWidth);
      minY = Math.min(minY, label.anchor[1] - halfHeight);
      maxY = Math.max(maxY, label.anchor[1] + halfHeight);
    }
    viewport = fitBounds({ minX, minY, maxX, maxY }, width, height, padding);
  }
  return viewport;
}
