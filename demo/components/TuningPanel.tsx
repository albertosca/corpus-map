import type { LodThresholds, Tuning } from "corpus-map";
import type { CSSProperties, ReactElement, RefObject } from "react";
import { useEffect, useId, useState } from "react";
import { DRAWER_MAX_WIDTH } from "./Drawer";
import { WheelCapture } from "./WheelCapture";

export interface TuningPanelProps {
  open: boolean;
  tuning: Tuning;
  onTuningChange: (next: Tuning) => void;
  /** The last `resolveTuning` RangeError message, or `null` while the current draft is valid. */
  tuningError: string | null;
  thresholds: LodThresholds;
  onThresholdsChange: (next: LodThresholds) => void;
  /** The last `resolveThresholds` RangeError message, or `null` while the current draft is valid. */
  thresholdsError: string | null;
  cardSize: { width: number; height: number };
  onCardSizeChange: (next: { width: number; height: number }) => void;
  /** Whether the active corpus is the synthetic one — the size/seed controls only make sense for it. */
  isSynthetic: boolean;
  syntheticSize: number;
  onSyntheticSizeChange: (size: number) => void;
  syntheticSeed: number;
  onSyntheticSeedChange: (seed: number) => void;
  onReset: () => void;
  onClose: () => void;
  /** Focused when the panel closes (Close button or Escape) — the demo's gear button. */
  returnFocusTo: RefObject<HTMLElement | null>;
  /** The map's own container, handed straight to `WheelCapture`. */
  mapContainerRef: RefObject<HTMLElement | null>;
}

/** Neutral colours, reused (not reinvented) from the rest of the demo shell — see `visual restraint`, spec 4 §2. */
export const PANEL_TEXT_COLOR = "#1a1d23";
export const PANEL_MUTED_TEXT_COLOR = "#555b66";
export const PANEL_BACKGROUND_COLOR = "#ffffff";
export const PANEL_ALERT_COLOR = "#8a1f1f";
const PANEL_BORDER_COLOR = "rgba(0,0,0,0.10)";
const CONTROL_BORDER_COLOR = "rgba(0,0,0,0.2)";
const BUTTON_BACKGROUND_COLOR = "rgba(255,255,255,0.92)";

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "90vw",
  maxWidth: DRAWER_MAX_WIDTH,
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
  padding: "16px 18px",
  background: PANEL_BACKGROUND_COLOR,
  borderLeft: `1px solid ${PANEL_BORDER_COLOR}`,
  boxShadow: "-2px 0 10px rgba(0,0,0,0.08)",
  color: PANEL_TEXT_COLOR,
  fontSize: 13,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
};

const iconButtonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 4,
  border: `1px solid ${CONTROL_BORDER_COLOR}`,
  background: BUTTON_BACKGROUND_COLOR,
  color: PANEL_TEXT_COLOR,
  fontSize: 13,
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: PANEL_MUTED_TEXT_COLOR,
};

const alertStyle: CSSProperties = {
  margin: 0,
  padding: "6px 8px",
  borderRadius: 4,
  background: "rgba(138,31,31,0.08)",
  color: PANEL_ALERT_COLOR,
  fontSize: 12,
};

const sectionHeadingStyle: CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: 12,
  fontWeight: 600,
  color: PANEL_MUTED_TEXT_COLOR,
};

const fieldRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 2fr auto",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  marginBottom: 6,
};

const fieldLabelStyle: CSSProperties = {
  color: PANEL_TEXT_COLOR,
};

const rangeInputStyle: CSSProperties = {
  width: "100%",
};

const valueStyle: CSSProperties = {
  minWidth: 48,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const numberInputStyle: CSSProperties = {
  width: 96,
  padding: "3px 6px",
  borderRadius: 4,
  border: `1px solid ${CONTROL_BORDER_COLOR}`,
  color: PANEL_TEXT_COLOR,
  background: PANEL_BACKGROUND_COLOR,
  fontVariantNumeric: "tabular-nums",
};

interface RangeFieldProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

/** Renders `value` with at most 6 significant digits, trimming the float noise a `step` like 0.002 leaves behind. */
function formatFieldValue(value: number): string {
  return Number(value.toPrecision(6)).toString();
}

function RangeField({ id, label, min, max, step, value, onChange }: RangeFieldProps): ReactElement {
  return (
    <div style={fieldRowStyle}>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={rangeInputStyle}
      />
      <output htmlFor={id} style={valueStyle}>
        {formatFieldValue(value)}
      </output>
    </div>
  );
}

interface TuningFieldConfig {
  key: keyof Omit<Tuning, "labelClasses">;
  label: string;
  min: number;
  max: number;
  step: number;
}

/**
 * Min/max/step per field, derived from each field's own validated range
 * (`resolveTuning`'s `validateTuning`, `src/shared/tuning.ts`) and from the
 * map-feel spec's description of what each number does — never guessed.
 * `wheelSensitivity` must stay `> 0` (min just above it); `pinchGain` and
 * `hullPadding` likewise `> 0`; `maxZoomPerEvent` must stay `> 1`;
 * `hysteresis` must stay `< 0.5` (max just under it); `fadeBand` and
 * `hoverRadius` only need `>= 0`.
 */
const TUNING_FIELDS: readonly TuningFieldConfig[] = [
  { key: "wheelSensitivity", label: "Wheel sensitivity", min: 0.0005, max: 0.02, step: 0.0005 },
  { key: "pinchGain", label: "Pinch gain", min: 0.5, max: 20, step: 0.5 },
  { key: "maxZoomPerEvent", label: "Max zoom per event", min: 1.1, max: 4, step: 0.1 },
  { key: "hysteresis", label: "Hysteresis", min: 0, max: 0.49, step: 0.01 },
  { key: "fadeBand", label: "Fade band", min: 0, max: 1, step: 0.05 },
  { key: "hullPadding", label: "Hull padding", min: 0.5, max: 8, step: 0.1 },
  { key: "hoverRadius", label: "Hover radius (px)", min: 0, max: 48, step: 1 },
];

interface ThresholdFieldConfig {
  key: keyof LodThresholds;
  label: string;
}

/** `resolveThresholds`' own valid range is `[0, 64]` (the wheel zoom clamp, `src/lod/lod.ts`'s `MAX_RATIO`). */
const THRESHOLD_FIELDS: readonly ThresholdFieldConfig[] = [
  { key: "midAt", label: "Mid at (x fit scale)" },
  { key: "nearAt", label: "Near at (x fit scale)" },
];

interface CardSizeFieldConfig {
  key: "width" | "height";
  label: string;
  min: number;
  max: number;
  step: number;
}

const CARD_SIZE_FIELDS: readonly CardSizeFieldConfig[] = [
  { key: "width", label: "Card width (px)", min: 60, max: 320, step: 10 },
  { key: "height", label: "Card height (px)", min: 24, max: 160, step: 4 },
];

const SYNTHETIC_SIZE_MIN = 1000;
const SYNTHETIC_SIZE_MAX = 10000;
const SYNTHETIC_SIZE_STEP = 1000;

/**
 * The hidden tuning panel (showcase Task 7, spec 4 §2 "Tuning panel
 * (hidden)"): one range input per `Tuning` field, the two `thresholds`,
 * `cardSize`, and — for the synthetic corpus — its size and seed. Every
 * value passes through the library's own `resolveTuning`/`resolveThresholds`
 * before reaching the map (`App.tsx` does that and hands this component the
 * result, plus a RangeError message when the current draft does not
 * resolve); this component only renders the controls and forwards raw
 * input.
 *
 * Placement rule (spec 4 §2's own open choice): the panel shares the right
 * side with the selected-item drawer, mutually exclusive with it —
 * `App.tsx` closes the drawer when the panel opens and closes the panel
 * when a node is selected, so the two are never mounted together. That
 * means each has its own uncontested Escape listener (no "which one is
 * topmost" question ever arises) and the panel inherits the drawer's
 * already-reviewed narrow-viewport fallback (`Drawer.tsx`'s own doc
 * comment): at widths too narrow for `ZoomControls` to shift clear of it,
 * the panel is allowed to cover the zoom controls, the indicator and the
 * minimap the same way the drawer already is, reversibly, with one tap on
 * Close, Escape, or `t` again.
 */
export function TuningPanel({
  open,
  tuning,
  onTuningChange,
  tuningError,
  thresholds,
  onThresholdsChange,
  thresholdsError,
  cardSize,
  onCardSizeChange,
  isSynthetic,
  syntheticSize,
  onSyntheticSizeChange,
  syntheticSeed,
  onSyntheticSeedChange,
  onReset,
  onClose,
  returnFocusTo,
  mapContainerRef,
}: TuningPanelProps): ReactElement | null {
  const titleId = useId();
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      returnFocusTo.current?.focus();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, returnFocusTo]);

  if (!open) return null;

  const handleClose = () => {
    returnFocusTo.current?.focus();
    onClose();
  };

  const handleCopyJson = () => {
    const payload = JSON.stringify({ tuning, thresholds, cardSize }, null, 2);
    navigator.clipboard.writeText(payload).then(
      () => setCopyMessage("Copied to clipboard."),
      () => setCopyMessage("Could not copy to clipboard."),
    );
  };

  // No NaN guard here: a `type="number"` input sanitises any value that
  // does not parse as a float to an empty string (both in real browsers
  // and in jsdom), so `e.target.value` is always either that empty string
  // or a string `Number()` parses cleanly -- `Number("")` is `0`, never
  // `NaN`. A guard against a case this input can never actually produce
  // would be untestable except by faking the event, which is exactly the
  // "defensive test for something that can't happen" this project avoids.
  const handleSeedChange = (raw: string) => {
    onSyntheticSeedChange(Number(raw));
  };

  return (
    <aside
      data-tuning-panel
      data-floating-control
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={panelStyle}
    >
      <div style={headerRowStyle}>
        <h2 id={titleId} style={titleStyle}>
          Tuning
        </h2>
        <button type="button" onClick={handleClose} style={iconButtonStyle}>
          Close
        </button>
      </div>

      <div style={actionsRowStyle}>
        <button type="button" onClick={onReset} style={iconButtonStyle}>
          Reset
        </button>
        <button type="button" onClick={handleCopyJson} style={iconButtonStyle}>
          Copy as JSON
        </button>
      </div>
      {copyMessage ? (
        <p role="status" style={statusStyle}>
          {copyMessage}
        </p>
      ) : null}

      {tuningError ? (
        <p role="alert" style={alertStyle}>
          {tuningError}
        </p>
      ) : null}
      <section aria-label="Tuning">
        <p style={sectionHeadingStyle}>Tuning</p>
        {TUNING_FIELDS.map((field) => (
          <RangeField
            key={field.key}
            id={`tuning-${field.key}`}
            label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
            value={tuning[field.key]}
            onChange={(value) => onTuningChange({ ...tuning, [field.key]: value })}
          />
        ))}
        <RangeField
          id="tuning-label-classes-large"
          label="Label class: large"
          min={0}
          max={1}
          step={0.05}
          value={tuning.labelClasses.large}
          onChange={(value) => onTuningChange({ ...tuning, labelClasses: { ...tuning.labelClasses, large: value } })}
        />
        <RangeField
          id="tuning-label-classes-medium"
          label="Label class: medium"
          min={0}
          max={1}
          step={0.05}
          value={tuning.labelClasses.medium}
          onChange={(value) => onTuningChange({ ...tuning, labelClasses: { ...tuning.labelClasses, medium: value } })}
        />
      </section>

      {thresholdsError ? (
        <p role="alert" style={alertStyle}>
          {thresholdsError}
        </p>
      ) : null}
      <section aria-label="Thresholds">
        <p style={sectionHeadingStyle}>Thresholds</p>
        {THRESHOLD_FIELDS.map((field) => (
          <RangeField
            key={field.key}
            id={`thresholds-${field.key}`}
            label={field.label}
            min={0}
            max={64}
            step={0.5}
            value={thresholds[field.key]}
            onChange={(value) => onThresholdsChange({ ...thresholds, [field.key]: value })}
          />
        ))}
      </section>

      <section aria-label="Card size">
        <p style={sectionHeadingStyle}>Card size</p>
        {CARD_SIZE_FIELDS.map((field) => (
          <RangeField
            key={field.key}
            id={`card-size-${field.key}`}
            label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
            value={cardSize[field.key]}
            onChange={(value) => onCardSizeChange({ ...cardSize, [field.key]: value })}
          />
        ))}
      </section>

      {isSynthetic ? (
        <section aria-label="Synthetic corpus">
          <p style={sectionHeadingStyle}>Synthetic corpus</p>
          <RangeField
            id="synthetic-size"
            label="Synthetic size"
            min={SYNTHETIC_SIZE_MIN}
            max={SYNTHETIC_SIZE_MAX}
            step={SYNTHETIC_SIZE_STEP}
            value={syntheticSize}
            onChange={onSyntheticSizeChange}
          />
          <div style={fieldRowStyle}>
            <label htmlFor="synthetic-seed" style={fieldLabelStyle}>
              Seed
            </label>
            <input
              id="synthetic-seed"
              type="number"
              step={1}
              value={syntheticSeed}
              onChange={(e) => handleSeedChange(e.target.value)}
              style={numberInputStyle}
            />
            <span />
          </div>
        </section>
      ) : null}

      <section aria-label="Wheel capture">
        <WheelCapture containerRef={mapContainerRef} />
      </section>
    </aside>
  );
}
