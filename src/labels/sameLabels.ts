import type { PlacedLabel } from "./placement";

/** Whether two placements would seed item labels identically (a palette change rebuilds the scene, not its names). */
export function sameLabels(first: readonly PlacedLabel[], second: readonly PlacedLabel[]): boolean {
  return (
    first.length === second.length &&
    first.every((label, index) => {
      const other = second[index] as PlacedLabel;
      return (
        label.id === other.id &&
        label.anchor[0] === other.anchor[0] &&
        label.anchor[1] === other.anchor[1] &&
        label.width === other.width &&
        label.height === other.height &&
        label.activeFromScale === other.activeFromScale
      );
    })
  );
}
