import { toScreen, type Viewport } from "./viewport";

/** The share of the usable area kept as a margin on each side before the view follows a keyboard selection. */
export const FOLLOW_MARGIN = 0.1;

/**
 * The view after a keyboard selection moved to a world point (spec spatial
 * keys §4): unchanged (the same object) while the point lies inside the
 * usable area shrunk by `FOLLOW_MARGIN` per side, else centred on it in that
 * area at the same scale.
 */
export function followInto(
  viewport: Viewport,
  horizontal: number,
  vertical: number,
  area: { left: number; top: number; width: number; height: number },
): Viewport {
  const [screenHorizontal, screenVertical] = toScreen(viewport, horizontal, vertical);
  const marginHorizontal = area.width * FOLLOW_MARGIN;
  const marginVertical = area.height * FOLLOW_MARGIN;
  const inside =
    screenHorizontal >= area.left + marginHorizontal &&
    screenHorizontal <= area.left + area.width - marginHorizontal &&
    screenVertical >= area.top + marginVertical &&
    screenVertical <= area.top + area.height - marginVertical;
  if (inside) return viewport;
  return {
    ...viewport,
    tx: area.left + area.width / 2 - horizontal * viewport.scale,
    ty: area.top + area.height / 2 - vertical * viewport.scale,
  };
}
