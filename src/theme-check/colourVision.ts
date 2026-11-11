import type { Rgba } from "../labels/contrast";

/**
 * Colour-vision simulation (Machado, Oliveira and Fernandes 2009, severity
 * 1.0, applied in linear RGB) and the CIEDE2000 colour difference, for
 * metric 17, shipped in the opt-in `corpus-map/theme-check` entry; the core never simulates vision.
 */
export type VisionMode = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

const MACHADO: Record<Exclude<VisionMode, "normal">, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function toLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return 255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055);
}

export function simulate(colour: Rgba, mode: VisionMode): Rgba {
  if (mode === "normal") return colour;
  const linear = [toLinear(colour[0]), toLinear(colour[1]), toLinear(colour[2])];
  const [first, second, third] = MACHADO[mode].map((row) =>
    fromLinear((row[0] ?? 0) * (linear[0] ?? 0) + (row[1] ?? 0) * (linear[1] ?? 0) + (row[2] ?? 0) * (linear[2] ?? 0)),
  ) as [number, number, number];
  return [first, second, third, colour[3]];
}

function lab(colour: Rgba): [number, number, number] {
  const red = toLinear(colour[0]);
  const green = toLinear(colour[1]);
  const blue = toLinear(colour[2]);
  const pivot = (value: number) => (value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116);
  const pivotedFirstTristimulus = pivot((0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047);
  const pivotedLuminance = pivot(0.2126 * red + 0.7152 * green + 0.0722 * blue);
  const pivotedThirdTristimulus = pivot((0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883);
  return [
    116 * pivotedLuminance - 16,
    500 * (pivotedFirstTristimulus - pivotedLuminance),
    200 * (pivotedLuminance - pivotedThirdTristimulus),
  ];
}

export function ciede2000(first: Rgba, second: Rgba): number {
  const [lightness1, greenRed1, blueYellow1] = lab(first);
  const [lightness2, greenRed2, blueYellow2] = lab(second);
  const radians = Math.PI / 180;
  const chromaMean = (Math.hypot(greenRed1, blueYellow1) + Math.hypot(greenRed2, blueYellow2)) / 2;
  const correction = 0.5 * (1 - Math.sqrt(chromaMean ** 7 / (chromaMean ** 7 + 25 ** 7)));
  const adjusted1 = greenRed1 * (1 + correction);
  const adjusted2 = greenRed2 * (1 + correction);
  const chroma1 = Math.hypot(adjusted1, blueYellow1);
  const chroma2 = Math.hypot(adjusted2, blueYellow2);
  const hueOf = (blueYellow: number, greenRed: number) => {
    if (blueYellow === 0 && greenRed === 0) return 0;
    const angle = Math.atan2(blueYellow, greenRed) / radians;
    return angle >= 0 ? angle : angle + 360;
  };
  const hue1 = hueOf(blueYellow1, adjusted1);
  const hue2 = hueOf(blueYellow2, adjusted2);
  const deltaLightness = lightness2 - lightness1;
  const deltaChroma = chroma2 - chroma1;
  let deltaHueAngle = 0;
  if (chroma1 * chroma2 !== 0) {
    deltaHueAngle = hue2 - hue1;
    if (deltaHueAngle > 180) deltaHueAngle -= 360;
    else if (deltaHueAngle < -180) deltaHueAngle += 360;
  }
  const deltaHue = 2 * Math.sqrt(chroma1 * chroma2) * Math.sin((deltaHueAngle * radians) / 2);
  const lightnessMean = (lightness1 + lightness2) / 2;
  const chromaMeanAdjusted = (chroma1 + chroma2) / 2;
  let hueMean = hue1 + hue2;
  if (chroma1 * chroma2 !== 0) {
    if (Math.abs(hue1 - hue2) <= 180) hueMean = (hue1 + hue2) / 2;
    else hueMean = hue1 + hue2 < 360 ? (hue1 + hue2 + 360) / 2 : (hue1 + hue2 - 360) / 2;
  }
  const weighting =
    1 -
    0.17 * Math.cos((hueMean - 30) * radians) +
    0.24 * Math.cos(2 * hueMean * radians) +
    0.32 * Math.cos((3 * hueMean + 6) * radians) -
    0.2 * Math.cos((4 * hueMean - 63) * radians);
  const rotationAngle = 30 * Math.exp(-(((hueMean - 275) / 25) ** 2));
  const rotationChroma = 2 * Math.sqrt(chromaMeanAdjusted ** 7 / (chromaMeanAdjusted ** 7 + 25 ** 7));
  const scaleLightness = 1 + (0.015 * (lightnessMean - 50) ** 2) / Math.sqrt(20 + (lightnessMean - 50) ** 2);
  const scaleChroma = 1 + 0.045 * chromaMeanAdjusted;
  const scaleHue = 1 + 0.015 * chromaMeanAdjusted * weighting;
  const rotation = -Math.sin(2 * rotationAngle * radians) * rotationChroma;
  return Math.sqrt(
    (deltaLightness / scaleLightness) ** 2 +
      (deltaChroma / scaleChroma) ** 2 +
      (deltaHue / scaleHue) ** 2 +
      rotation * (deltaChroma / scaleChroma) * (deltaHue / scaleHue),
  );
}
