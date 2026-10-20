import { DENSE_NAME_ALPHA, type Presentation } from "../shared/presentation";
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import type { PlacedLabel } from "./placement";

/** The canvas's CSS size; a name larger than it is never drawn. */
export interface LabelBox {
  width: number;
  height: number;
  /** Absent means guided. */
  presentation?: Presentation | undefined;
}

/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached, except a name whose measured box is wider or taller
 * than the canvas: it could never be read whole anywhere on screen (a long
 * name on a phone-width view appears once the box is large enough).
 * Where a name sits never enters the decision, so pan and zoom cannot make
 * a name pop out: a name that fits slides off the edge, clipped by the
 * canvas, and a position-dependent skip would break map-feel metric 7.
 * In dense, large names keep full emphasis and the medium and small ones are
 * drawn at `DENSE_NAME_ALPHA`, after the large ones.
 */
export function paintLabels(surface: Surface, scene: Scene, viewport: Viewport, theme: Theme, box: LabelBox): void {
  const drawn = scene.labels.filter(
    (label) => viewport.scale >= label.activeFromScale && label.width <= box.width && label.height <= box.height,
  );
  const draw = (label: PlacedLabel) => {
    const [horizontal, vertical] = toScreen(viewport, label.anchor[0], label.anchor[1]);
    surface.text(label.name, horizontal, vertical, theme.territoryLabel, theme.territoryFonts[label.labelClass]);
  };
  if (box.presentation !== "dense") {
    for (const label of drawn) draw(label);
    return;
  }
  // Dense: large names keep full emphasis; the rest step back (spec slice D §4).
  const muted = drawn.filter((label) => label.labelClass !== "large");
  for (const label of drawn) if (label.labelClass === "large") draw(label);
  if (muted.length === 0) return;
  surface.globalAlpha(DENSE_NAME_ALPHA);
  for (const label of muted) draw(label);
  surface.globalAlpha(1);
}
