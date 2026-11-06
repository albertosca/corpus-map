import type { Scene } from "../shared/scene";
import type { FreeArea } from "../shared/insets";
import type { MapSpec } from "../shared/spec";
import { fitBounds, sceneBounds } from "./fit";
import type { Viewport } from "./viewport";

/** Refits after widening by the names; three passes settle every corpus in the gallery (demo/corpora/fit.test.ts). */
export const LABEL_FIT_PASSES = 3;

/**
 * The first view: every territory outline whole, and every name that is
 * active at the fit (group names when the scene has groups and the fit is far) and fits the box
 * whole too (closes the BACKLOG item about names cut
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
  scene: Pick<Scene, "shapes" | "labels" | "groupLabels">,
  width: number,
  height: number,
  padding: number,
  options: { groupNames: boolean } = { groupNames: true },
  area?: FreeArea,
): Viewport {
  // The area a consumer overlay leaves free (spec fit-insets): scale and centre come from it, the names are tested against it.
  const box = area ?? { left: 0, top: 0, width, height };
  const base = sceneBounds(spec, scene.shapes);
  let viewport = fitBounds(base, box.width, box.height, padding);
  // With groups, a far fitted view (ratio 1, below `groupNamesUntil`) shows
  // group names, not territory names: those are the ones to keep whole. A
  // fitted view that is already mid (`midAt <= 1`) shows territory names.
  const names = options.groupNames && scene.groupLabels.length > 0 ? scene.groupLabels : scene.labels;
  const counted = names.filter(
    (label) => viewport.scale >= label.activeFromScale && label.width <= box.width && label.height <= box.height,
  );
  for (let pass = 0; pass < LABEL_FIT_PASSES; pass += 1) {
    let left = base.minX;
    let top = base.minY;
    let right = base.maxX;
    let bottom = base.maxY;
    for (const label of counted) {
      const halfWidth = label.width / 2 / viewport.scale;
      const halfHeight = label.height / 2 / viewport.scale;
      left = Math.min(left, label.anchor[0] - halfWidth);
      right = Math.max(right, label.anchor[0] + halfWidth);
      top = Math.min(top, label.anchor[1] - halfHeight);
      bottom = Math.max(bottom, label.anchor[1] + halfHeight);
    }
    viewport = fitBounds({ minX: left, minY: top, maxX: right, maxY: bottom }, box.width, box.height, padding);
  }
  return area === undefined ? viewport : { ...viewport, tx: viewport.tx + box.left, ty: viewport.ty + box.top };
}
