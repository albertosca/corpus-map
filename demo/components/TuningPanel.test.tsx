import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_THRESHOLDS, DEFAULT_TUNING } from "corpus-map";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { token } from "../tokens";
import {
  PANEL_ALERT_COLOR,
  PANEL_BACKGROUND_COLOR,
  PANEL_MUTED_TEXT_COLOR,
  PANEL_TEXT_COLOR,
  TuningPanel,
  type TuningPanelProps,
} from "./TuningPanel";

const DEFAULT_CARD_SIZE = { width: 160, height: 56 };

function renderPanel(overrides: Partial<TuningPanelProps> = {}) {
  const returnFocusTo = createRef<HTMLButtonElement>();
  const mapContainerReference = createRef<HTMLDivElement>();
  const onTuningChange = vi.fn();
  const onThresholdsChange = vi.fn();
  const onCardSizeChange = vi.fn();
  const onSyntheticSizeChange = vi.fn();
  const onSyntheticSeedChange = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();

  const panelProperties: TuningPanelProps = {
    open: true,
    corpusLabel: "Synthetic corpus",
    tuning: DEFAULT_TUNING,
    appliedTuning: DEFAULT_TUNING,
    onTuningChange,
    tuningError: null,
    thresholds: DEFAULT_THRESHOLDS,
    appliedThresholds: DEFAULT_THRESHOLDS,
    onThresholdsChange,
    thresholdsError: null,
    cardSize: DEFAULT_CARD_SIZE,
    computedCardSize: DEFAULT_CARD_SIZE,
    onCardSizeChange,
    isSynthetic: true,
    syntheticSize: 5000,
    onSyntheticSizeChange,
    syntheticSeed: 1,
    onSyntheticSeedChange,
    onReset,
    onClose,
    returnFocusTo,
    mapContainerRef: mapContainerReference,
    ...overrides,
  };

  const rendered = render(
    <>
      <button type="button" ref={returnFocusTo}>
        gear stand-in
      </button>
      <TuningPanel {...panelProperties} />
    </>,
  );
  return {
    ...rendered,
    returnFocusTo,
    mapContainerReference,
    onTuningChange,
    onThresholdsChange,
    onCardSizeChange,
    onSyntheticSizeChange,
    onSyntheticSeedChange,
    onReset,
    onClose,
  };
}

describe("TuningPanel (showcase Task 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing while closed", () => {
    const { container } = renderPanel({ open: false });
    expect(container.querySelectorAll("[data-tuning-panel]")).toHaveLength(0);
  });

  it("shows one range input per Tuning field, with its current value, plus the thresholds and card size", () => {
    renderPanel();
    // A sample of Tuning's own fields (not every one, to avoid a brittle enumeration).
    expect(screen.getByLabelText(/Wheel sensitivity/)).toHaveProperty("value", String(DEFAULT_TUNING.wheelSensitivity));
    expect(screen.getByLabelText(/Pinch gain/)).toHaveProperty("value", String(DEFAULT_TUNING.pinchGain));
    expect(screen.getByLabelText(/Hover radius/)).toHaveProperty("value", String(DEFAULT_TUNING.hoverRadius));
    expect(screen.getByLabelText(/Label class: large/)).toHaveProperty(
      "value",
      String(DEFAULT_TUNING.labelClasses.large),
    );
    expect(screen.getByLabelText(/Label class: medium/)).toHaveProperty(
      "value",
      String(DEFAULT_TUNING.labelClasses.medium),
    );
    expect(screen.getByLabelText(/Mid at/)).toHaveProperty("value", String(DEFAULT_THRESHOLDS.midAt));
    expect(screen.getByLabelText(/Near at/)).toHaveProperty("value", String(DEFAULT_THRESHOLDS.nearAt));
    expect(screen.getByLabelText(/Card width/)).toHaveProperty("value", "160");
    expect(screen.getByLabelText(/Card height/)).toHaveProperty("value", "56");
  });

  it("changing the pinchGain slider calls onTuningChange with every other field unchanged", () => {
    const { onTuningChange } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Pinch gain/), { target: { value: "12" } });
    expect(onTuningChange).toHaveBeenCalledWith({ ...DEFAULT_TUNING, pinchGain: 12 });
  });

  it("shows the synthetic size and seed controls only for the synthetic corpus", () => {
    renderPanel({ isSynthetic: false });
    expect(screen.queryByLabelText(/Synthetic size/)).toBeNull();
    expect(screen.queryByLabelText(/Seed/)).toBeNull();
  });

  it("the seed field is a number input; changing it calls onSyntheticSeedChange", () => {
    const { onSyntheticSeedChange } = renderPanel();
    const seedInput = screen.getByLabelText(/Seed/);
    expect(seedInput.tagName).toBe("INPUT");
    expect(seedInput.getAttribute("type")).toBe("number");
    fireEvent.change(seedInput, { target: { value: "42" } });
    expect(onSyntheticSeedChange).toHaveBeenCalledWith(42);
  });

  it("changing the card width/height sliders calls onCardSizeChange with the other field unchanged", () => {
    const { onCardSizeChange } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Card width/), { target: { value: "200" } });
    expect(onCardSizeChange).toHaveBeenCalledWith({ ...DEFAULT_CARD_SIZE, width: 200 });

    fireEvent.change(screen.getByLabelText(/Card height/), { target: { value: "80" } });
    expect(onCardSizeChange).toHaveBeenCalledWith({ ...DEFAULT_CARD_SIZE, height: 80 });
  });

  it("clearing the seed field calls onSyntheticSeedChange with 0 (a number input sanitises an invalid value to empty, never NaN)", () => {
    const { onSyntheticSeedChange } = renderPanel();
    const seedInput = screen.getByLabelText(/Seed/);
    fireEvent.change(seedInput, { target: { value: "" } });
    expect(onSyntheticSeedChange).toHaveBeenCalledWith(0);
  });

  it("changing the synthetic size slider calls onSyntheticSizeChange", () => {
    const { onSyntheticSizeChange } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Synthetic size/), { target: { value: "8000" } });
    expect(onSyntheticSizeChange).toHaveBeenCalledWith(8000);
  });

  it("shows the tuning RangeError with role=alert; the thresholds error is separate", () => {
    renderPanel({ tuningError: "tuning.pinchGain must be a finite number > 0, got -1" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("tuning.pinchGain must be a finite number > 0, got -1");
  });

  it("shows the thresholds RangeError with role=alert", () => {
    renderPanel({ thresholdsError: "thresholds.midAt (10) must be <= thresholds.nearAt (6)" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("thresholds.midAt (10) must be <= thresholds.nearAt (6)");
  });

  it("clicking Reset calls onReset", () => {
    const { onReset } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Copy settings copies an empty display when the values are the defaults and the computed card size", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({ isSynthetic: false });

    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({ display: {} });
    await screen.findByText("Copied to clipboard.");
  });

  it("Copy settings copies only the fields that differ, the card size against the computed one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({
      isSynthetic: false,
      tuning: { ...DEFAULT_TUNING, pinchGain: 9 },
      appliedTuning: { ...DEFAULT_TUNING, pinchGain: 9 },
      thresholds: { ...DEFAULT_THRESHOLDS, nearAt: 4 },
      appliedThresholds: { ...DEFAULT_THRESHOLDS, nearAt: 4 },
      cardSize: { width: 180, height: 56 },
      computedCardSize: { width: 150, height: 56 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({
      display: { tuning: { pinchGain: 9 }, thresholds: { nearAt: 4 }, cardSize: { width: 180, height: 56 } },
    });
  });

  it("Copy settings copies the last valid values, not a draft in error, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({
      isSynthetic: false,
      tuning: { ...DEFAULT_TUNING, labelClasses: { large: 0.2, medium: 0.9 } },
      tuningError: "tuning.labelClasses.medium (0.9) must be <= tuning.labelClasses.large (0.2)",
      appliedTuning: { ...DEFAULT_TUNING, pinchGain: 9 },
      thresholds: { midAt: 10, nearAt: 6 },
      thresholdsError: "thresholds.midAt (10) must be <= thresholds.nearAt (6)",
      appliedThresholds: DEFAULT_THRESHOLDS,
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({ display: { tuning: { pinchGain: 9 } } });
    await screen.findByText("Copied the last valid values; the draft in error was left out.");
  });

  it("Copy settings includes the synthetic corpus's size and seed, and only on that corpus", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { unmount } = renderPanel({ syntheticSize: 7000, syntheticSeed: 42 });

    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({
      display: {},
      synthetic: { size: 7000, seed: 42 },
    });
    unmount();

    renderPanel({ isSynthetic: false, syntheticSize: 7000, syntheticSeed: 42 });
    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(JSON.parse(writeText.mock.calls[1]?.[0] as string)).toEqual({ display: {} });
  });

  it("shows a message instead of throwing when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel();

    expect(() => fireEvent.click(screen.getByRole("button", { name: "Copy settings" }))).not.toThrow();
    await screen.findByText("Could not copy to clipboard.");
  });

  it("shows a message instead of throwing when there is no clipboard at all", async () => {
    Object.assign(navigator, { clipboard: undefined });
    renderPanel();

    expect(() => fireEvent.click(screen.getByRole("button", { name: "Copy settings" }))).not.toThrow();
    await screen.findByText("Could not copy to clipboard.");
  });

  it("names the corpus it edits under its title", () => {
    renderPanel({ corpusLabel: "Chemical elements" });
    expect(screen.getByText("Editing: Chemical elements")).not.toBeNull();
  });

  it("closing (Close button) returns focus to the element named by returnFocusTo", () => {
    const { returnFocusTo, onClose } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("Escape closes the panel and returns focus", () => {
    const { returnFocusTo, onClose } = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("Escape does nothing once the panel has closed (no listener left registered)", () => {
    const { onClose, rerender } = renderPanel();
    rerender(
      <TuningPanel
        open={false}
        corpusLabel="Synthetic corpus"
        tuning={DEFAULT_TUNING}
        appliedTuning={DEFAULT_TUNING}
        onTuningChange={vi.fn()}
        tuningError={null}
        thresholds={DEFAULT_THRESHOLDS}
        appliedThresholds={DEFAULT_THRESHOLDS}
        onThresholdsChange={vi.fn()}
        thresholdsError={null}
        cardSize={DEFAULT_CARD_SIZE}
        computedCardSize={DEFAULT_CARD_SIZE}
        onCardSizeChange={vi.fn()}
        isSynthetic
        syntheticSize={5000}
        onSyntheticSizeChange={vi.fn()}
        syntheticSeed={1}
        onSyntheticSeedChange={vi.fn()}
        onReset={vi.fn()}
        onClose={onClose}
        returnFocusTo={createRef()}
        mapContainerRef={createRef()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the wheel capture table inside the panel", () => {
    renderPanel();
    expect(screen.getByRole("table")).not.toBeNull();
    expect(screen.getByText("Wheel capture")).not.toBeNull();
  });

  describe("visual restraint", () => {
    it("every colour the panel uses is a demo token, whose contrast demo/tokens.test.ts checks in both schemes", () => {
      expect(PANEL_TEXT_COLOR).toBe(token("text"));
      expect(PANEL_MUTED_TEXT_COLOR).toBe(token("textMuted"));
      expect(PANEL_BACKGROUND_COLOR).toBe(token("surfaceSolid"));
      expect(PANEL_ALERT_COLOR).toBe(token("danger"));
    });

    it("no label reads in ALL CAPS and no arrow glyph is used", () => {
      renderPanel({ tuningError: "tuning.pinchGain must be a finite number > 0, got -1" });
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/→/);
      // Every alphabetic run of 3+ letters must not be entirely uppercase
      // (the visual-restraint spec: "no ALL-CAPS labels").
      const shouting = text.match(/\b[A-Z]{3,}\b/g) ?? [];
      expect(shouting).toEqual([]);
    });
  });
});
