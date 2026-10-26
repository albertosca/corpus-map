import type { LodThresholds, Tuning } from "corpus-map";
import { DEFAULT_THRESHOLDS, DEFAULT_TUNING } from "corpus-map";

export interface CardSize {
  width: number;
  height: number;
}

/**
 * What a gallery entry may set on top of the library defaults (spec slice G
 * §3). Only the fields that differ belong here; the tuning panel's "Copy
 * settings" produces exactly this shape.
 */
export interface DisplaySettings {
  tuning?: Partial<Omit<Tuning, "labelClasses">> & { labelClasses?: Partial<Tuning["labelClasses"]> };
  thresholds?: Partial<LodThresholds>;
  cardSize?: CardSize;
}

/** The values a corpus is shown with, before `resolveTuning`/`resolveThresholds` validate them. */
export interface DisplayValues {
  tuning: Tuning;
  thresholds: LodThresholds;
  cardSize: CardSize;
}

/** The entry's settings over the library defaults; the card size is the entry's own, else the computed one. */
export function resolveDisplay(display: DisplaySettings | undefined, computedCardSize: CardSize): DisplayValues {
  const { labelClasses, ...tuning } = display?.tuning ?? {};
  return {
    tuning: { ...DEFAULT_TUNING, ...tuning, labelClasses: { ...DEFAULT_TUNING.labelClasses, ...labelClasses } },
    thresholds: { ...DEFAULT_THRESHOLDS, ...display?.thresholds },
    cardSize: display?.cardSize ?? computedCardSize,
  };
}

function changedFields<Value extends object>(values: Value, defaults: Value): Partial<Value> {
  const changed: Partial<Value> = {};
  for (const key of Object.keys(defaults) as Array<keyof Value>) {
    if (values[key] !== defaults[key]) changed[key] = values[key];
  }
  return changed;
}

/** The inverse of `resolveDisplay`: only what differs from the defaults and the computed card size, empty groups left out. */
export function displayDifferences(values: DisplayValues, computedCardSize: CardSize): DisplaySettings {
  const { labelClasses: _labelClasses, ...tuning } = changedFields(values.tuning, DEFAULT_TUNING);
  const labelClasses = changedFields(values.tuning.labelClasses, DEFAULT_TUNING.labelClasses);
  const tuningDifferences = Object.keys(labelClasses).length > 0 ? { ...tuning, labelClasses } : tuning;
  const thresholds = changedFields(values.thresholds, DEFAULT_THRESHOLDS);
  const sameCardSize =
    values.cardSize.width === computedCardSize.width && values.cardSize.height === computedCardSize.height;
  return {
    ...(Object.keys(tuningDifferences).length > 0 ? { tuning: tuningDifferences } : {}),
    ...(Object.keys(thresholds).length > 0 ? { thresholds } : {}),
    ...(sameCardSize ? {} : { cardSize: values.cardSize }),
  };
}
